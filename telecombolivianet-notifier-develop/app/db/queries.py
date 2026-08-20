
FETCH_PENDING_BATCH = """
    SELECT
        o."Id"            AS id,
        o."Tipo"          AS tipo,
        o."ClienteId"     AS cliente_id,
        o."PhoneNumber"   AS phone_number,
        o."Intentos"      AS intentos,
        o."EnviarDesde"   AS enviar_desde,
        o."ContextoJson"  AS contexto_json,
        o."ReferenciaId"  AS referencia_id
    FROM "NotifOutbox" o
    WHERE o."EstadoFinal" IS NULL
      AND o."Publicado" = FALSE
      AND o."EnviarDesde" <= NOW()
      AND (o."ProximoIntento" IS NULL OR o."ProximoIntento" <= NOW())
    ORDER BY o."EnviarDesde" ASC
    LIMIT $1
    FOR UPDATE SKIP LOCKED
"""

MARK_TAKEN = """
    UPDATE "NotifOutbox"
    SET "Publicado" = TRUE
    WHERE "Id" = $1
"""

FINALIZE_OK = """
    UPDATE "NotifOutbox"
    SET
        "EstadoFinal"  = 'ENVIADO',
        "Publicado"    = TRUE,
        "Intentos"     = $2,
        "ProcesadoAt"  = NOW()
    WHERE "Id" = $1
"""

FINALIZE_FAILED = """
    UPDATE "NotifOutbox"
    SET
        "EstadoFinal"  = 'FALLIDO',
        "Publicado"    = TRUE,
        "Intentos"     = $2,
        "ProcesadoAt"  = NOW()
    WHERE "Id" = $1
"""

RETRY_WITH_BACKOFF = """
    UPDATE "NotifOutbox"
    SET
        "Publicado"      = FALSE,
        "Intentos"       = $2,
        "ProximoIntento" = NOW() + ($3 || ' seconds')::interval
    WHERE "Id" = $1
"""

FETCH_CONFIG = """
    SELECT
        "Tipo"             AS tipo,
        "Activo"           AS activo,
        "DelaySegundos"    AS delay_segundos,
        "HoraInicio"       AS hora_inicio,
        "HoraFin"          AS hora_fin,
        "Inmediato"        AS inmediato,
        "DiasAntes"        AS dias_antes
    FROM "NotifConfigs"
    WHERE "Tipo" = $1
"""

FETCH_ALL_CONFIGS = """
    SELECT
        "Tipo"             AS tipo,
        "Activo"           AS activo,
        "DelaySegundos"    AS delay_segundos,
        "HoraInicio"       AS hora_inicio,
        "HoraFin"          AS hora_fin,
        "Inmediato"        AS inmediato,
        "DiasAntes"        AS dias_antes
    FROM "NotifConfigs"
    ORDER BY "Tipo"
"""

FETCH_PLANTILLA = """
    SELECT
        "Id"               AS id,
        "Texto"            AS texto,
        "HsmStatus"        AS hsm_status,
        "MetaTemplateName" AS meta_template_name,
        "MetaLanguageCode" AS meta_language_code,
        "MetaParamOrder"   AS meta_param_order
    FROM "NotifPlantillas"
    WHERE "Tipo" = $1 AND "Activa" = TRUE
    LIMIT 1
"""

INSERT_LOG = """
    INSERT INTO "NotifLogs"
        ("Id", "OutboxId", "ClienteId", "Tipo", "PhoneNumber", "Mensaje",
         "Estado", "IntentoNum", "ErrorDetalle", "RegistradoAt")
    VALUES
        (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8, NOW())
"""

FETCH_INVOICES_DUE_IN_DAYS = """
    SELECT
        i."Id"          AS invoice_id,
        i."ClientId"    AS cliente_id,
        i."Amount"      AS amount,
        i."DueDate"     AS due_date,
        i."Year"        AS year,
        i."Month"       AS month,
        i."Type"        AS type,
        c."PhoneMain"   AS phone_number,
        c."FullName"    AS nombre,
        p."Name"        AS plan_name
    FROM "Invoices" i
    JOIN "Clients"  c ON c."Id" = i."ClientId"
    LEFT JOIN "Plans" p ON p."Id" = c."PlanId"
    WHERE i."Status" = 'Pendiente'
      AND c."IsDeleted" = FALSE
      AND DATE(i."DueDate" AT TIME ZONE 'America/La_Paz') = $1::date
"""

COUNT_PENDING_MONTHS = """
    SELECT COUNT(*) AS total
    FROM "Invoices"
    WHERE "ClientId" = $1
      AND "Status" IN ('Pendiente', 'Vencida')
      AND "Type" = 'Mensualidad'
"""

EXISTS_REMINDER_LOG = """
    SELECT 1
    FROM "NotifLogs" l
    JOIN "NotifOutbox" o ON o."Id" = l."OutboxId"
    WHERE l."ClienteId"    = $1
      AND l."Tipo"         = $2
      AND o."ReferenciaId" = $3
      AND l."Estado" NOT IN ('FALLIDO')
    LIMIT 1
"""

INSERT_OUTBOX = """
    INSERT INTO "NotifOutbox"
        ("Id", "Tipo", "ClienteId", "PhoneNumber", "Publicado", "Intentos",
         "EnviarDesde", "EstadoFinal", "CreadoAt", "ContextoJson", "ReferenciaId")
    VALUES
        (gen_random_uuid(), $1, $2, $3, FALSE, 0,
         NOW() + ($4 || ' seconds')::interval, NULL, NOW(), $5::jsonb, $6)
"""

INSERT_OUTBOX_SAFE = """
    INSERT INTO "NotifOutbox"
        ("Id", "Tipo", "ClienteId", "PhoneNumber", "Publicado", "Intentos",
         "EnviarDesde", "EstadoFinal", "CreadoAt", "ContextoJson", "ReferenciaId")
    VALUES
        (gen_random_uuid(), $1, $2, $3, FALSE, 0,
         NOW() + ($4 || ' seconds')::interval, NULL, NOW(), $5::jsonb, $6)
    ON CONFLICT ("ClienteId", "Tipo", "ReferenciaId") WHERE "EstadoFinal" IS NULL
    DO NOTHING
    RETURNING "Id"
"""

FETCH_LAST_JOB_RUN = """
    SELECT "LastRun" AS last_run
    FROM "NotifJobLog"
    WHERE "JobName" = $1
"""

UPSERT_JOB_RUN = """
    INSERT INTO "NotifJobLog" ("JobName", "LastRun")
    VALUES ($1, $2::date)
    ON CONFLICT ("JobName") DO UPDATE SET "LastRun" = EXCLUDED."LastRun"
"""

REMINDER_ADVISORY_LOCK_KEY = 20250101
ADVISORY_LOCK_REMINDER   = f"SELECT pg_try_advisory_xact_lock({REMINDER_ADVISORY_LOCK_KEY})"
ADVISORY_UNLOCK_REMINDER = f"SELECT pg_advisory_unlock({REMINDER_ADVISORY_LOCK_KEY})"


CLAIM_BATCH = """
    UPDATE "NotifOutbox"
    SET "Publicado" = TRUE
    WHERE "Id" = ANY($1)
"""

RETURN_TO_POOL = """
    UPDATE "NotifOutbox"
    SET "Publicado"      = FALSE,
        "ProximoIntento" = NOW() + ($2 || ' seconds')::interval
    WHERE "Id" = $1
"""

RELEASE_BATCH = """
    UPDATE "NotifOutbox"
    SET "Publicado" = FALSE
    WHERE "Id" = ANY($1)
      AND "EstadoFinal" IS NULL
"""

FETCH_ACTIVE_REMINDER_TYPES = """
    SELECT DISTINCT "Tipo" AS tipo
    FROM "NotifConfigs"
    WHERE "Tipo" LIKE 'RECORDATORIO_%'
      AND "Activo" = TRUE
    ORDER BY "Tipo"
"""

COUNT_OUTBOX_PENDING = """
    SELECT COUNT(*) FROM "NotifOutbox" WHERE "EstadoFinal" IS NULL
"""


FETCH_CLIENT_CONTEXT = """
    SELECT
        c."Id"          AS cliente_id,
        c."FullName"    AS nombre_completo,
        c."Zone"        AS zona,
        c."PhoneMain"   AS phone,
        p."Name"        AS plan_name
    FROM "Clients" c
    LEFT JOIN "Plans" p ON p."Id" = c."PlanId"
    WHERE c."Id" = $1
      AND c."IsDeleted" = FALSE
"""

FETCH_INVOICES_FOR_CONTEXT = """
    SELECT
        i."Id"          AS invoice_id,
        i."Amount"      AS amount,
        i."AmountPaid"  AS amount_paid,
        i."DueDate"     AS due_date,
        i."Year"        AS year,
        i."Month"       AS month,
        i."Type"        AS type,
        i."Status"      AS status
    FROM "Invoices" i
    WHERE i."ClientId" = $1
      AND i."IsDeleted" = FALSE
      AND i."Status" IN ('Pendiente', 'Vencida', 'ParcialmentePagada')
    ORDER BY i."DueDate" ASC
"""

FETCH_CLIENT_QR = """
    SELECT
        q."ImageUrl"    AS image_url,
        q."ExpiresAt"   AS expires_at
    FROM "ClientQrs" q
    WHERE q."ClientId" = $1
      AND q."IsActive"  = TRUE
      AND (q."ExpiresAt" IS NULL OR q."ExpiresAt" > NOW())
    ORDER BY q."UploadedAt" DESC
    LIMIT 1
"""

FETCH_SYSTEM_CONFIG_BULK = """
    SELECT "Key" AS key, "Value" AS value
    FROM "SystemConfigs"
    WHERE "Key" IN ('ISP:NombreEmpresa', 'ISP:PortalPagoUrl', 'ISP:BackendUrl', 'ISP:FechaCorte')
"""
