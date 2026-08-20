-- =============================================================================
--  DIAGNÓSTICO DEL RAG — TelecomBoliviaNet chatbot          (FASE 0.1, 2026-08-06)
-- =============================================================================
--  Script de SOLO LECTURA. No modifica nada. Seguro de correr en producción.
--
--  Uso:
--    psql "$DATABASE_URL_CHATBOT" -f database/diagnostico-rag.sql
--    (o pegarlo en el editor SQL de Railway sobre la base del CHATBOT,
--     no la del backend — son bases distintas)
--
--  Qué responde, en orden:
--    1. ¿Hay documentos y están realmente vectorizados?
--    2. ¿Qué índice vectorial hay y sirve para este volumen?
--    3. ¿Cuál es el estado de la caché semántica?
--    4. ¿El umbral de similitud (0.75) está descartando respuestas buenas?
-- =============================================================================


-- ─── 1. Documentos e integridad de la vectorización ──────────────────────────
--  A mirar:
--   · chunks_sin_vector > 0  → documento a medio indexar (ver R6: la indexación
--     es fire-and-forget, un reinicio a mitad la deja trunca y nadie reintenta).
--     Se corrige re-subiendo el documento desde el panel.
--   · chunk_count (declarado) != chunks_reales → el contador quedó desfasado.
--   · indexing_error no nulo → falló la vectorización; el texto del error dice
--     la causa (cuota de Gemini, API key, índice único faltante).
--   · indexed_at nulo con chunks_reales > 0 → quedó a medias.
SELECT
    d.title,
    d.category,
    d.is_active                                   AS activo,
    d.char_count                                  AS caracteres,
    d.chunk_count                                 AS chunks_declarados,
    COUNT(c.id)                                   AS chunks_reales,
    COUNT(c.embedding)                            AS chunks_con_vector,
    COUNT(c.id) - COUNT(c.embedding)              AS chunks_sin_vector,
    d.indexed_at,
    d.indexing_error
FROM knowledge_documents d
LEFT JOIN knowledge_chunks c ON c.document_id = d.id
GROUP BY d.id, d.title, d.category, d.is_active, d.char_count,
         d.chunk_count, d.indexed_at, d.indexing_error
ORDER BY d.created_at DESC;


-- ─── 1b. Totales de la base de conocimiento ──────────────────────────────────
--  El número que decide la estrategia de indexado:
--   · < 10 000 chunks buscables → NO hace falta índice vectorial. El escaneo
--     exacto tarda milisegundos y da 100 % de recall.
--   · > 10 000 → conviene HNSW (ya es lo que crea ensureVectorIndexes()).
SELECT
    COUNT(*)                                           AS chunks_totales,
    COUNT(*) FILTER (WHERE c.embedding IS NOT NULL)     AS con_vector,
    COUNT(*) FILTER (WHERE d.is_active)                 AS en_documentos_activos,
    COUNT(*) FILTER (WHERE d.is_active AND c.embedding IS NOT NULL)
                                                        AS realmente_buscables
FROM knowledge_chunks c
JOIN knowledge_documents d ON d.id = c.document_id;


-- ─── 2. Índices vectoriales presentes ────────────────────────────────────────
--  A mirar:
--   · amname = 'ivfflat'  → PROBLEMA (motivo de la FASE 0.2). Con
--     ivfflat.probes=1 (el default de pgvector) y lists=100, cada búsqueda
--     escanea ~1 % de los vectores: el bot dice "no encontré información"
--     para preguntas que SÍ están en la base. Además, si el índice se creó
--     sobre una tabla vacía, sus centroides nunca se re-entrenaron.
--   · amname = 'hnsw'     → correcto (lo deja ensureVectorIndexes()).
--   · sin filas           → sin índice: búsqueda exacta, recall 100 %.
--     Correcto para este volumen.
SELECT
    t.relname                          AS tabla,
    c.relname                          AS indice,
    am.amname                          AS metodo,
    c.reloptions                       AS opciones,
    pg_size_pretty(pg_relation_size(c.oid)) AS tamano
FROM pg_class c
JOIN pg_index i  ON i.indexrelid = c.oid
JOIN pg_class t  ON t.oid        = i.indrelid
JOIN pg_am    am ON am.oid       = c.relam
WHERE t.relname IN ('knowledge_chunks', 'semantic_cache')
ORDER BY t.relname, c.relname;

-- Valor efectivo de ivfflat.probes en esta sesión (el default de pgvector es 1).
-- Solo relevante si el bloque anterior mostró un índice ivfflat.
SHOW ivfflat.probes;

-- Versión de pgvector: HNSW requiere >= 0.5.0.
SELECT extname, extversion FROM pg_extension WHERE extname = 'vector';


-- ─── 2b. ¿El índice se USA de verdad? (la pregunta que decide todo) ──────────
--  Tener un índice malo NO implica sufrirlo: con pocas filas el planificador
--  prefiere un Seq Scan, que es exacto y completo. Este EXPLAIN lo resuelve:
--
--   · "Seq Scan on knowledge_chunks"  → el índice NO se usa. La recuperación
--     es EXACTA (recall 100 %). El índice solo ocupa espacio. Sin problema
--     hoy, pero empezará a usarse al crecer la tabla — y ahí sí, un IVFFLAT
--     con probes=1 degradaría el recall en silencio.
--   · "Index Scan using idx_chunks_embedding" → el índice SÍ se usa. Si es
--     ivfflat con probes=1, se está escaneando una fracción de los vectores
--     y hay resultados incompletos AHORA.
CREATE TEMP TABLE IF NOT EXISTS probe AS
    SELECT embedding AS v FROM knowledge_chunks WHERE embedding IS NOT NULL LIMIT 1;

EXPLAIN (ANALYZE, BUFFERS, COSTS OFF)
SELECT kc.id, 1 - (kc.embedding <=> (SELECT v FROM probe)) AS similarity
FROM knowledge_chunks kc
JOIN knowledge_documents kd ON kd.id = kc.document_id
WHERE kd.is_active = true
  AND kc.embedding IS NOT NULL
  AND 1 - (kc.embedding <=> (SELECT v FROM probe)) >= 0.50
ORDER BY kc.embedding <=> (SELECT v FROM probe)
LIMIT 3;

-- ¿Cuántos chunks pasan el umbral? Si pasan TODOS, el umbral no filtra nada y
-- la consulta es en la práctica "los 3 más cercanos" sin piso de calidad.
SELECT COUNT(*) AS chunks_sobre_umbral,
       ROUND(MAX(1 - (embedding <=> (SELECT v FROM probe)))::numeric, 4) AS mejor,
       ROUND(MIN(1 - (embedding <=> (SELECT v FROM probe)))::numeric, 4) AS peor
FROM knowledge_chunks
WHERE embedding IS NOT NULL
  AND 1 - (embedding <=> (SELECT v FROM probe)) >= 0.50;


-- ─── 3. Caché semántica ──────────────────────────────────────────────────────
--  A mirar:
--   · vigentes altas con hits bajos → la caché no está aportando (umbral 0.92
--     demasiado estricto, o poco tráfico repetido).
--   · entradas muy viejas vigentes → recordar R3: desactivar un documento NO
--     invalida la caché; una respuesta equivocada puede vivir hasta 7 días.
SELECT
    COUNT(*)                                             AS entradas,
    COUNT(*) FILTER (WHERE expires_at > NOW())           AS vigentes,
    COUNT(*) FILTER (WHERE expires_at <= NOW())          AS expiradas,
    COALESCE(SUM(hit_count), 0)                          AS hits_totales,
    ROUND(AVG(hit_count)::numeric, 2)                    AS hits_promedio,
    MIN(created_at)                                      AS mas_antigua,
    MAX(created_at)                                      AS mas_reciente
FROM semantic_cache;

-- Las 10 respuestas cacheadas más reutilizadas (qué pregunta la gente de verdad).
SELECT
    LEFT(query_text, 90) AS pregunta,
    hit_count            AS hits,
    expires_at
FROM semantic_cache
WHERE expires_at > NOW()
ORDER BY hit_count DESC
LIMIT 10;


-- ─── 4. ¿El umbral 0.75 es el correcto? ──────────────────────────────────────
--  Esto NO se puede responder solo con SQL: hace falta el vector de una
--  pregunta real. El camino barato es el log `rag_miss` que se agrega en la
--  FASE 2.3, que registra el mejor `similarity` de cada consulta que no
--  devolvió nada.
--
--  Mientras tanto, esta consulta da una referencia útil: qué tan parecidos son
--  los chunks ENTRE SÍ. Si un par de chunks de temas distintos ya supera 0.75,
--  el umbral es demasiado permisivo; si ni los del mismo documento llegan a
--  0.75, es demasiado estricto para este corpus.
SELECT
    LEFT(a.content, 60)                              AS chunk_a,
    LEFT(b.content, 60)                              AS chunk_b,
    (a.document_id = b.document_id)                  AS mismo_documento,
    ROUND((1 - (a.embedding <=> b.embedding))::numeric, 4) AS similitud
FROM knowledge_chunks a
JOIN knowledge_chunks b ON b.id > a.id
WHERE a.embedding IS NOT NULL AND b.embedding IS NOT NULL
ORDER BY a.embedding <=> b.embedding
LIMIT 15;


-- ─── 5. Actividad reciente del bot (contexto para interpretar lo anterior) ────
--  Si `search_knowledge_base` casi no aparece en el top de herramientas, el
--  RAG no se está usando y el problema puede estar en el prompt, no en la base.
SELECT
    tool                AS herramienta,
    COUNT(*)::int       AS veces
FROM bot_events, jsonb_array_elements_text(tools_called) AS tool
WHERE created_at >= NOW() - INTERVAL '30 days'
GROUP BY tool
ORDER BY veces DESC;
