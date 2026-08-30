# Convenciones — Backend TelecomBoliviaNet

Esto no es un ideal: es dónde va cada cosa **hoy**, y las reglas que ya se
rompieron alguna vez y costaron un fallo. Cada una tiene detrás un incidente
concreto; donde lo hay, está el número.

## Dónde va cada cosa

| Necesito… | Va en… |
|---|---|
| Caso de uso que MODIFICA estado | `Application/<Módulo>/Commands/XxxCommand.cs` (MediatR) |
| Caso de uso de solo LECTURA | `Application/<Módulo>/Queries/XxxQuery.cs` (MediatR) |
| Regla de negocio pura, sin base de datos | `Domain/Services/` — estático, se prueba sin un solo doble |
| Consulta con `Include`/`JOIN` | Método con **nombre de negocio** en `I<Agregado>Repository` |
| Mapeo entidad → DTO | `Application/<Módulo>/<Módulo>Mapper.cs`, estático |
| Integración externa (HTTP, correo) | `Infrastructure/Services/`, tras una interfaz en `Application/Interfaces/` |
| Tarea periódica | `Infrastructure/Jobs/`, **siempre** con `JobLease.TryRunExclusiveAsync` |

`Application/Services/` está **congelado**: no se añaden clases nuevas ahí. Las que
quedan se van moviendo a Commands/Queries a medida que se tocan.

## Reglas duras

1. **Ninguna clase de Application supera 250 líneas.** Hoy quedan dos por encima
   y están argumentadas en el plan; no se suman más.
2. **Ningún constructor supera 6 dependencias DE NEGOCIO.** Si hace falta la
   séptima, la clase está haciendo dos cosas.

   *De negocio* significa: sin contar `AuditService`, `ILogger<T>`, `IUnitOfWork`
   ni `IConfiguration`. Contarlas todas mide lo que no es — la auditoría la
   inyectan 57 clases y el registro 35, y ninguna de las dos dice nada sobre si
   la clase hace demasiado. Con el contador corregido
   (`scripts/analisis/colaboradores.py`) las clases por encima del techo pasan de
   16 a **6**.

   Y no, esas transversales **no** se pueden mover al pipeline: el contenido de
   cada asiento de auditoría es propio del caso de uso (*"Crédito aplicado:
   factura F-2026-0012 Bs.150.00"*), y la mitad de esas clases ni siquiera son
   handlers de MediatR. Un `AuditBehavior` genérico solo sabría escribir el nombre
   del comando, que es peor que lo que hay. Está razonado en el análisis, E-02.
3. **Ninguna función supera 50 líneas.**
4. **Una regla de negocio se escribe una vez.** Es la que más veces se ha roto en
   este proyecto: prorrateo, días laborables (cuatro copias), ventana de anulación,
   semáforo de SLA, "está vencida" (cuatro copias). Todas eran correctas por
   separado y ninguna estaba atada a las otras. Si una regla no cabe en una sola
   forma —una decide en memoria y otra se traduce a SQL— van juntas en la misma
   clase y **un test las ata** (ver `OverduePolicy` y `OverduePolicyTests`).
5. **Todo handler con más de una escritura usa `IUnitOfWork`**, o lleva escrito por
   qué no le hace falta.
6. **Un comentario explica POR QUÉ.** El historial va a git. Si narra código que ya
   no está, se borra.
7. **Nunca `dotnet ef migrations add/remove --no-build`**: borra la migración
   equivocada. Antes de cualquier comando `ef`, copia de `Migrations/`.
8. **Las migraciones se escriben a mano** (ADR-004). El guardia es
   `SchemaParityTests`.
9. **Todo en inglés** en entidades, DTOs y contrato de API. Las columnas de base de
   datos siguen en español con `HasColumnName` (ADR-003). *Pendiente: ver el estado
   real en `PLAN_MEJORA_TECNICA_2026-08.md`, fase 6.*

## Autorización: el `[Authorize]` del método NO reemplaza al de la clase

Se exigen **los dos** (D-25). Una clase `AdminOrTecnico` con un método marcado
`AllRoles` da `AdminOrTecnico ∩ AllRoles = AdminOrTecnico`: el atributo del método
no amplía nada, aunque lo parezca.

Por eso:

- **Toda acción declara su propia política.** Ninguna hereda la de la clase en
  silencio, para que ampliar el piso de un controlador no abra endpoints que nadie
  revisó.
- La política de la clase es un **piso**, no la respuesta. Para saber quién entra
  de verdad hay que mirar las dos.

## Repositorios

- Las consultas se piden por **nombre de negocio**, no componiendo `IQueryable`
  desde Application (ADR-001).
- Un repositorio que devuelve entidades **para modificarlas** no lleva
  `AsNoTracking()`. Con él, el job corre entero, no guarda nada y reporta éxito
  (fijado en `OverdueBatchIntegrationTests`).
- Todo recorrido que crece con la cartera va **por tramos**. Y si el trabajo
  produce un aviso por cliente, se pagina **por cliente**: un tramo que parta a
  alguien le manda dos avisos por la misma deuda.

## Fechas y horas

- `TimeOnly` llega hasta las **23:59**: `new TimeOnly(24, 0)` lanza excepción, y
  `AddMinutes` **da la vuelta al reloj** sin avisar (D-21). Para franjas horarias
  se calcula en minutos desde medianoche.
- La hora local de Bolivia es UTC−4 y no tiene horario de verano, pero eso no
  autoriza a restar cuatro a mano: se usa la configuración de zona horaria.

## Tests

- Un test que fija un **resultado que le importa a alguien** vale más que tres que
  fijan la forma interna. D-21 se arregló dos veces y siguió roto porque las dos
  primeras pasadas probaban la entidad; lo encontró el test que preguntaba "¿la
  agenda sigue ofreciendo citas?".
- **Traducción a SQL se prueba contra PostgreSQL**, no con LINQ a objetos: un
  `GroupBy` con conteos condicionales no se comprueba en memoria.
- Cuando un filtro se mueve de un servicio al repositorio, el doble del
  repositorio **aplica la regla real**; si devuelve una lista fija, el test se
  convierte en una cáscara que comprueba su propio doble.

## Secretos

- Ningún fichero versionado lleva credenciales: `appsettings.Production.json` va
  vacío y todo entra por variables de entorno (D-07).
- Los valores por defecto de `docker-compose.yml` son para levantar el sistema en
  local. Un despliegue que no defina `DB_PASSWORD` se queda con una contraseña
  publicada en este repositorio.
- Ver **Supuestos de seguridad** en el `README.md`.
