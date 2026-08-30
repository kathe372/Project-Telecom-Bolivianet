# ADR-003 — Migración a inglés con doble campo, y por qué las columnas se quedan

**Fecha:** 2026-08-29
**Estado:** Aceptado · **no implementado** (fase 6 del plan, sin empezar)
**Contexto:** Fase 6 del `PLAN_MEJORA_TECNICA_2026-08.md`

---

## Contexto

El backend mezcla los dos idiomas dentro de la misma clase. No es una molestia
estética: obliga a recordar en qué idioma está cada campo antes de escribir una
consulta, y ha producido errores reales de nombre.

La decisión de pasar todo a inglés se tomó el 2026-08-20 e incluye **el contrato de
la API**, no solo el código interno. Eso es lo que la vuelve cara.

### El radio de impacto medido

| Capa | Alcance | Quién se rompe |
|---|---|---|
| Entidades C# | 12 clases | nadie fuera del backend (no se serializan) |
| DTOs | 12 archivos, ~160 campos | **frontend (57 archivos) + chatbot (26)** |
| Columnas de base de datos | ~40 en español | **el notifier Python lee por SQL directo (7 archivos)** |

Unos **90 archivos fuera del backend**. Esto no es un refactor: es una migración de
contrato entre cuatro servicios que se despliegan por separado.

## Decisión

**1. Transición con doble campo, no cambio de golpe.**

Durante la transición la API sirve **los dos nombres a la vez**. Los DTOs exponen el
campo en inglés como propiedad real y el español como propiedad calculada marcada
`[Obsolete]`.

```
Etapa 1  Entidades en inglés; columnas intactas vía HasColumnName. Invisible fuera.
Etapa 2  DTOs con ambos nombres. La API acepta y devuelve los dos.
Etapa 3  Frontend y chatbot migran POR SEPARADO, a su ritmo.
Etapa 4  Se eliminan los campos en español de los DTOs.
```

La razón de fondo: los cuatro servicios **no se despliegan a la vez**. Cualquier
esquema que exija que lo hagan convierte un renombrado en una ventana de caída.
Con doble campo, si el frontend se queda a medias no pasa nada.

**2. Las columnas de base de datos NO se renombran.**

`HasColumnName` ya da nombres en inglés en todo el código C#. Renombrar las columnas
obligaría a cambiar el notifier Python **en el mismo despliegue** —lee con SQL
directo— y durante unos minutos convivirían el backend nuevo y el notifier viejo.

El beneficio es exclusivamente estético y el riesgo es una pérdida de notificaciones
a clientes reales. No compensa.

## Consecuencias

- Durante las etapas 2 y 3, cada DTO tocado carga propiedades duplicadas. Es deuda
  **con fecha de caducidad**: la etapa 4 la retira, y el `[Obsolete]` la hace visible
  en cada compilación mientras exista.
- Hay que probar que `System.Text.Json` serializa las propiedades calculadas —lo hace,
  pero el contrato de tres servicios no se apoya en un "debería"—. La etapa 2 no se
  da por terminada sin un test que compruebe el **JSON literal**.
- El código C# y las columnas de la base quedan en idiomas distintos, para siempre.
  Es el precio elegido a cambio de no tocar el notifier. Queda escrito aquí para que
  quien lo vea dentro de un año no lo tome por un descuido.

## Estado real

**Nada de esto está implementado.** El plan estima 3–4 semanas y las etapas 3 y 4
exigen desplegar frontend y chatbot y dejarlos correr una semana en producción.

Mientras la fase 6 no empiece, la regla 9 de `CONVENCIONES.md` describe el destino,
no el presente: el código sigue mezclando los dos idiomas.
