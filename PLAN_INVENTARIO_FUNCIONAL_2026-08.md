# Inventario — especificación funcional e integración

**Fecha:** 2026-08-26
**Complementa:** `PLAN_INVENTARIO_Y_RED_2026-08.md` (sección 2)
**Se detalla en:** [`PLAN_INVENTARIO_DETALLE_OPERATIVO.md`](PLAN_INVENTARIO_DETALLE_OPERATIVO.md) — campos exactos, pantallas, flujos paso a paso y endpoints
**Estado:** análisis — nada implementado

---

## 1. El encuadre: qué preguntas debe responder

Un módulo de inventario no se diseña listando pantallas CRUD. Se diseña listando las preguntas que hoy nadie puede responder. Estas son las de este ISP, y **todas salen del código que ya existe**:

| Pregunta | Hoy | Por qué importa |
|---|---|---|
| ¿Dónde está la ONU con serial X? | Imposible. El serial vive en 3 columnas de texto libre que ya divergen (**D-09**) | Es el activo más caro que se mueve |
| ¿Cuántas ONUs me quedan para instalar esta semana? | Se cuenta a ojo en el almacén | Determina cuántas instalaciones se pueden agendar |
| ¿Qué lleva encima el técnico Juan ahora mismo? | Nadie lo sabe | Es la fuga de material más común en un ISP |
| Di de baja a un cliente hace 3 meses, ¿me devolvieron el equipo? | **El ticket de recolección se crea, pero nada registra el retorno** | Equipos que se pierden sin que nadie lo note |
| ¿Cuánto cable drop gasté este mes? | `Installation.MetrosDrop` se guarda y nadie lo lee | Compras y presupuesto |
| Esta ONU falló, ¿está en garantía? | No hay fecha de compra ni proveedor | Dinero que se deja de reclamar |
| ¿Esta ONU ya estuvo instalada en otro cliente? | Imposible saberlo | Equipos reacondicionados sin trazabilidad |

**El módulo se justifica solo con la cuarta y la séptima.** Las demás son gestión; esas dos son pérdida de activos.

---

## 2. Lo que encontré al bajar al detalle

Tres hallazgos que cambian el diseño respecto al primer análisis.

### 2.1 La interfaz de reserva ya existe, y sus tres puntos de enganche también

`IBoxReservationService` tiene exactamente dos métodos:

```csharp
Task<BoxReservation?> TryReserveAsync(double lat, double lng, Guid installationId, CancellationToken ct);
Task ReleaseAsync(Installation installation, CancellationToken ct);
```

Y está inyectada en **los tres puntos exactos del ciclo de vida** donde el inventario necesita engancharse:

| Archivo | Línea | Llamada |
|---|---|---|
| `CreateInstallationCommand.cs` | 82 | `TryReserveAsync(...)` al agendar |
| `CancelInstallationCommand.cs` | 83 | `ReleaseAsync(...)` al cancelar |
| `MarkInstallationNoShowCommand.cs` | 54 | `ReleaseAsync(...)` al marcar no-realizada |

**Un `IEquipmentReservationService` con la misma forma se inyecta en los mismos tres constructores y se llama en las mismas tres líneas.** No hay que buscar dónde meter el gancho: ya está trazado, probado y con TTL resuelto (`ExpirePortReservationsJob`).

Esto baja la fase I3 —la que marqué como "la parte con riesgo"— de una semana a unos tres días.

### 2.2 El cierre de instalación ya es transaccional

`CompleteInstallationHandler` ya envuelve tres escrituras (caja, instalación, ticket) en una transacción explícita de `IUnitOfWork`, con un comentario que explica por qué:

> *"Antes cada una confirmaba por su cuenta: si fallaba la tercera, el puerto quedaba consumido y la instalación completada, pero el ticket abierto PARA SIEMPRE."*

El consumo de inventario entra como **cuarta escritura dentro de esa misma transacción**. O se descuenta el stock y se cierra la instalación, o no pasa ninguna de las dos. Sin ese `BeginTransactionAsync` ya construido, esta sería la parte más delicada del módulo.

### 2.3 El ciclo de recuperación de equipos está construido a medias

`CancelClientCommand.cs:64-88` ya hace esto al dar de baja a un cliente:

```csharp
if (!string.IsNullOrWhiteSpace(client.OnuSerialNumber))
{
    // crea SupportTicket { Type = TicketType.RecoleccionEquipo, ... }
    // con DueDate = ahora + OnuCollectionDeadlineHours
}
```

`TicketType.RecoleccionEquipo` existe en el enum, tiene color en el dashboard, etiqueta en el frontend y traducción en el chatbot. **La empresa ya piensa en recolectar equipos.**

Pero el ciclo tiene dos agujeros:

1. **Nunca se cierra.** Cuando el técnico recupera la ONU, resuelve el ticket. Nada registra que el equipo volvió, ni dónde está ahora, ni en qué estado.
2. **Depende de un campo que casi nunca está lleno.** El `if` lee `client.OnuSerialNumber`, que **solo se escribe a mano** en `RegisterClientCommand:118` y `UpdateClientCommand:94`. El flujo de instalación escribe `Installation.EquipoOnuSerial` y **no lo propaga** — está documentado como bug **D-09** y congelado en un test de caracterización (`El_serial_de_la_ONU_NO_se_copia_al_cliente`).

**Resultado combinado: un cliente instalado por el flujo normal se da de baja sin que se genere ticket de recolección.** El equipo se queda en su casa y el sistema nunca lo menciona. Esto no es una funcionalidad que falte, es una fuga activa.

El inventario lo cierra por construcción: el equipo tiene una `LocationId` que apunta al cliente, y la baja genera el ticket a partir de *eso*, no de un campo de texto que puede estar vacío.

---

## 3. Funcionalidades, por prioridad

### 3.1 Imprescindibles (sin esto no es un inventario)

**F1 · Catálogo de categorías.** Definir qué se controla y cómo: ONU, router, deco, cable drop, conectores. Cada categoría declara si es **serializada** (identidad por unidad) o **consumible** (solo cantidad), su unidad de medida y su stock mínimo.

**F2 · Ubicaciones.** Almacén central, mochila de cada técnico, casa del cliente, taller/RMA, baja. La mochila del técnico se vincula a un `UserSystem` con rol `Tecnico`. Toda existencia está siempre en exactamente una ubicación — no hay stock "en el aire".

**F3 · Alta de equipos serializados.** Registro individual: serial (**único, restricción en base de datos**), MAC, modelo, marca, fecha de compra, proveedor, garantía. Uno a uno o por lote.

**F4 · Recepción de compras.** Entrada de mercadería contra proveedor y número de factura. Es el único movimiento que crea existencias de la nada; todo lo demás las mueve.

**F5 · Kardex (ledger inmutable).** Cada movimiento es una fila que no se edita ni se borra nunca. El stock es la suma, no un contador que alguien actualiza. Tipos: `Compra`, `Traspaso`, `Consumo`, `Devolución`, `Merma`, `Ajuste`, `Baja`.

> Precedente en casa: `CreditMovement` ya hace exactamente esto para el saldo del cliente. Mismo patrón, misma disciplina.

**F6 · Traspaso con confirmación en dos pasos.** El almacén *envía*, el técnico *acepta*. Entre ambos, el material está `EnTransito`. Sin esto aparece el "yo nunca recibí eso" y el kardex deja de ser evidencia. Con un TTL: si nadie acepta en N horas, alerta al Admin.

**F7 · Consumo automático al cerrar instalación.** El evento ya existe (§2.2). El serial deja de ser texto libre y pasa a ser selección validada.

**F8 · Devolución de sobrante.** Al final de la jornada, el técnico devuelve lo que no usó. Sin este movimiento, la mochila crece indefinidamente y el stock del almacén miente.

**F9 · Ficha de trazabilidad de un serial.** Toda la vida del equipo en una línea de tiempo: comprado → almacén → mochila de Juan → instalado en cliente TBN-0357 → retirado → RMA → reinstalado en TBN-0412. **Esta es la pantalla que justifica el módulo ante cualquiera.**

### 3.2 Importantes (el módulo funciona sin ellas, pero mal)

**F10 · Reserva de equipo al agendar.** Se reserva la ONU y los metros estimados al crear la instalación; se consume al cerrarla; se libera al cancelar. Enganche ya trazado (§2.1). Evita agendar 8 instalaciones con 5 ONUs en stock.

**F11 · Retiro y reemplazo por ticket.** Un `SupportTicket` de avería donde se cambia el equipo: la ONU vieja pasa a `EnReparacion`, la nueva a `Instalado`. Ambos movimientos ligados al `TicketId`.

**F12 · Cierre del ciclo de recolección.** El ticket `RecoleccionEquipo` (que ya se crea) gana un botón "equipo recuperado" que registra el movimiento de retorno y su estado (funcional / dañado / no recuperado). Y el ticket pasa a generarse desde el inventario, no desde `client.OnuSerialNumber`.

**F13 · Alertas internas.** Por `InternalAlert` + SignalR → la campanita que ya existe. Nunca por WhatsApp: ese canal es del cliente.
- Stock bajo mínimo, por categoría y ubicación
- Equipo no devuelto pasado el plazo de recolección
- Serial duplicado detectado al dar de alta
- Traspaso sin aceptar tras N horas
- Técnico con la mochila cargada por encima de lo razonable

**F14 · Lectura de código de barras / QR con la cámara.** El técnico escanea el serial en vez de tipearlo. Un serial de ONU tiene 12-16 caracteres alfanuméricos y **transcribirlo a mano garantiza errores** — que en un inventario serializado no son un error de dedo, son un equipo fantasma. El frontend ya es React y ya maneja subida de fotos desde el móvil en `CompleteModal`.

**F15 · Reportes exportables.** Con `ExportService` + ClosedXML/QuestPDF, que ya llevan el membrete de la empresa: kardex por rango, stock actual por ubicación, consumo por técnico, consumo por instalación, merma del periodo.

**F16 · Importación inicial por CSV.** El inventario no arranca vacío: arranca con lo que ya está instalado y en el almacén. Sin importador, la carga inicial se hace a mano y el módulo muere antes de nacer.

### 3.3 Opcionales (evaluar después de la v1)

**F17 · Costos y valorización.** Costo unitario, costo promedio, valor del stock, costo real por instalación. Convierte el módulo en contabilidad y añade ~1 semana. **Recomiendo dejarlo fuera de la v1** pero guardar `CostoUnitario` nullable en el kardex desde el día uno: así activarlo después es aditivo, no una migración de datos.

**F18 · Conteo físico / inventario cíclico.** Toma de inventario contra una ubicación, con generación de ajustes justificados. Necesario a partir de cierto volumen, no en la v1.

**F19 · Gestión de RMA con proveedor.** Seguimiento de lo enviado a garantía y lo recibido de vuelta.

**F20 · Consulta de stock desde el chatbot.** Que el técnico pregunte por WhatsApp "¿queda ONU ZTE?". Suena bien, pero el técnico ya tiene el panel en el móvil. **Bajo valor real** — lo dejo anotado para no volver a discutirlo.

---

## 4. Reglas de negocio duras

Estas no son preferencias; si alguna se rompe, el inventario deja de ser confiable y la gente vuelve al cuaderno.

1. **El serial es único a nivel de base de datos.** Índice único, no validación en el servidor. Es la restricción que arregla D-09 de raíz.
2. **El kardex nunca se edita ni se borra.** Un error se corrige con un movimiento de `Ajuste` que lleva motivo obligatorio y autor. Nada de soft-delete aquí: el ledger es la evidencia.
3. **Todo movimiento tiene autor, fecha y motivo.** El motivo es obligatorio en `Ajuste`, `Merma` y `Baja`.
4. **Un equipo está en exactamente una ubicación.** Nunca en dos, nunca en ninguna.
5. **El stock nunca queda negativo.** Si el técnico declara 60 metros y en su mochila hay 40, la operación falla y pide un ajuste explícito. Fallar es correcto: un stock negativo silencioso es peor que un error visible.
6. **El consumo es atómico con el cierre de la instalación.** Dentro de la transacción que ya existe (§2.2).
7. **Los movimientos automáticos llevan la referencia al hecho de negocio** (`InstallationId`, `TicketId`, `ClientId`). Sin eso, el kardex es una lista de números sin historia.
8. **Concurrencia optimista en el saldo de consumibles.** Con `Xmin`, como ya hace `Client`. Dos técnicos descontando de la misma ubicación a la vez es el caso normal, no el raro.

---

## 5. Integración, punto por punto

### 5.1 Backend — dónde toca el código existente

| # | Archivo | Qué se añade | Riesgo |
|---|---|---|---|
| 1 | `CreateInstallationCommand.cs:82` | Junto a `_boxReservation.TryReserveAsync`, un `_equipReservation.TryReserveAsync` | Bajo — patrón calcado |
| 2 | `CancelInstallationCommand.cs:83` | `_equipReservation.ReleaseAsync` | Bajo |
| 3 | `MarkInstallationNoShowCommand.cs:54` | `_equipReservation.ReleaseAsync` | Bajo |
| 4 | `CompleteInstallationHandler` | Consumo dentro de la transacción existente | **Medio** — es el corazón del módulo |
| 5 | `CompleteInstallationWithBoxCommand` | Mismo consumo (segunda ruta de cierre) | Medio — **fácil de olvidar**: hay dos caminos para cerrar una instalación |
| 6 | `CancelClientCommand.cs:64` | El ticket de recolección se genera desde el inventario, no desde `OnuSerialNumber` | Bajo, y **arregla D-09** |
| 7 | Cierre de ticket `RecoleccionEquipo` | Movimiento de retorno del equipo | Bajo |
| 8 | Cierre de ticket de avería con cambio de equipo | Retiro + alta | Medio |
| 9 | `NapPort.OnuSerial` | Pasa de `string?` a `EquipmentItemId` (FK) | **Medio-alto** — hay datos en producción; migración con backfill |
| 10 | `DependencyInjection.cs` | ~10 registros nuevos + 1 `AddHostedService` | Bajo |
| 11 | Migración escrita a mano | 6 tablas nuevas + FK en `NapPorts` (ver ADR-004) | Medio |

**El punto 5 es la trampa.** Hay dos comandos que completan una instalación (`CompleteInstallationCommand` y `CompleteInstallationWithBoxCommand`). Si el consumo se engancha solo en el primero, el inventario se descuadra silenciosamente cada vez que el técnico instala en una caja distinta a la reservada. Merece un test de integración explícito por cada ruta.

**El punto 9 es el único con riesgo real de datos.** Hay `NapPorts` en producción con seriales en texto. La migración tiene que crear los `EquipmentItem` correspondientes a partir de esos textos, y decidir qué hacer con los que estén vacíos, duplicados o mal escritos. Es trabajo de conciliación, igual que el de `WinboxNumber` en la parte de red.

### 5.2 Frontend

**Páginas nuevas** (en el grupo "Red" del sidebar, que hoy tiene una sola entrada):

| Ruta | Contenido | Roles |
|---|---|---|
| `/inventario` | Stock por ubicación, alertas de mínimos | Admin, Operador |
| `/inventario/equipos` | Buscador por serial/MAC/cliente + ficha de trazabilidad (F9) | Admin, Operador, Tecnico |
| `/inventario/movimientos` | Kardex filtrable y exportable | Admin, SocioLectura |
| `/inventario/traspasos` | Enviar y aceptar material (F6) | Admin, Operador, Tecnico |
| `/mi-mochila` | Lo que el técnico lleva encima; devolver sobrante | Tecnico |

**Modificaciones a lo existente:**

- **`CompleteModal.tsx:118-127`** — el input de texto libre `Serial ONU` (con placeholder `HWTC12345678`) pasa a **selector sobre el equipo reservado**, con botón de escaneo. Y `Metros de drop` valida contra el stock de la mochila. Este es el cambio de UI de mayor impacto de todo el módulo: es donde hoy entra la basura al sistema.
- **`ClientProfilePage`** — pestaña "Equipos" junto a las que ya hay: qué tiene instalado, desde cuándo, con enlace a la trazabilidad.
- **`InfoTab.tsx:38`** — el campo "Serie ONU" deja de ser texto suelto y enlaza al equipo real.
- **Dashboard** — tarjeta de stock crítico.
- **Ticket de recolección** — botón "equipo recuperado" con estado del equipo.

### 5.3 Notifier y chatbot

**Notifier: no toca nada.** Todas las alertas de inventario son internas (`InternalAlert` + SignalR). El notifier es el canal hacia el cliente y el inventario no tiene nada que decirle al cliente.

**Chatbot: nada en la v1.** F20 (consultar stock por WhatsApp) tiene poco valor porque el técnico ya lleva el panel en el móvil. La única integración con sentido es indirecta y llega más tarde: si un ticket de avería termina en cambio de equipo, el bot puede informar del estado del reemplazo.

### 5.4 Puente con el módulo de red (MikroTik)

El inventario guarda la **MAC** de cada equipo. El módulo de red obtiene, de `/ppp active`, la MAC de la sesión conectada. Cruzarlas da dos cosas que ninguno de los dos módulos puede dar por separado:

- **Detectar equipo cambiado sin registrar**: la MAC conectada no es la del equipo que el sistema cree que está instalado.
- **Detectar equipo "perdido" que sigue conectado**: un equipo dado por no recuperado que sigue activo en la red — es decir, alguien usando servicio con un equipo de la empresa.

Es una razón más para hacer el inventario **antes** que la parte de red: produce el dato (la MAC) que hace útil el escaneo.

---

## 6. Permisos por rol

Los cuatro roles y las cinco políticas ya existen (`JwtConfiguration.cs:76-80`), así que esto es configuración, no código nuevo.

| Acción | Admin | Operador | Tecnico | SocioLectura |
|---|:-:|:-:|:-:|:-:|
| Ver stock global | ✅ | ✅ | ❌ | ✅ |
| Ver su propia mochila | ✅ | ✅ | ✅ | ❌ |
| Recibir compras | ✅ | ✅ | ❌ | ❌ |
| Enviar traspaso | ✅ | ✅ | ❌ | ❌ |
| Aceptar traspaso | ✅ | ✅ | ✅ (el suyo) | ❌ |
| Consumir al cerrar instalación | ✅ | ❌ | ✅ | ❌ |
| Devolver sobrante | ✅ | ✅ | ✅ | ❌ |
| **Ajuste / Merma / Baja** | ✅ | ❌ | ❌ | ❌ |
| Ver kardex completo | ✅ | ✅ | ❌ | ✅ |
| Exportar reportes | ✅ | ✅ | ❌ | ✅ |

**El ajuste manual es solo de Admin, a propósito.** Es la única operación que puede hacer cuadrar el inventario con una mentira. Si la puede hacer cualquiera, el kardex deja de ser evidencia de nada.

---

## 7. Lo que este módulo NO debe hacer

Delimitarlo ahora evita que crezca sin control:

- **No es un ERP.** Sin órdenes de compra, sin cuentas por pagar, sin gestión de proveedores más allá de un nombre en la recepción.
- **No es contabilidad.** La valorización (F17) queda fuera de la v1.
- **No es un WMS.** Sin pasillos, estanterías ni posiciones. Las ubicaciones son cinco tipos, no un mapa del almacén.
- **No genera seriales.** Los seriales vienen de fábrica; el sistema los registra, no los inventa.
- **No gestiona activos fijos de la empresa** (vehículos, herramientas, computadoras). Solo lo que entra en la red del cliente.
- **No reemplaza el conteo físico.** Lo facilita (F18) y lo compara, pero alguien tiene que ir a contar.

---

## 8. Orden de construcción

Reordenado respecto al plan original, ahora que sé que el enganche de reserva está pre-trazado:

| Fase | Contenido | Estimación |
|---|---|---|
| **I1** | Entidades + migración a mano + índice único de serial + repos + tests de dominio | 1 sem |
| **I2** | Kardex + movimientos manuales (compra, traspaso, ajuste) + controlador + validadores | 1–1.5 sem |
| **I3** | **Importador CSV + carga inicial real** | 0.5 sem + trabajo de campo |
| **I4** | Consumo automático al cerrar instalación — **las dos rutas** | 3 días |
| **I5** | Reserva al agendar (calcando `IBoxReservationService`) | 3 días |
| **I6** | Ciclo de recolección + retiro por ticket + arreglo de D-09 | 0.5 sem |
| **I7** | Frontend: 5 páginas + `CompleteModal` + pestaña en ficha de cliente | 1.5–2 sem |
| **I8** | Alertas, reportes exportables, escaneo de código de barras | 1 sem |
| **Total** | | **6–7 semanas parciales** |

**I3 va tercero, no último, y es deliberado.** La carga inicial es lo que mata estos módulos: si se deja para el final, se llega con el código terminado y sin datos, y el sistema nunca entra en uso. Metiéndola en cuanto existe el kardex, todo lo que se construya después se prueba contra datos reales.

**I4 antes que I5** porque el consumo aporta valor por sí solo (arregla el serial basura), mientras que la reserva sin consumo no sirve de nada.

> **Recordatorio de coordinación:** escribir todo esto **en inglés** y **sin EF Core en la capa Application** (destinos de F6 y F4 del `PLAN_MEJORA_TECNICA_2026-08.md`). Son 6-7 semanas de código nuevo; hacerlo al estilo viejo es pagarlo dos veces.
