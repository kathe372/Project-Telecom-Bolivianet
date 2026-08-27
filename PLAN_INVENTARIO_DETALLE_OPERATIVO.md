# Inventario — detalle operativo: qué se registra y cómo

**Fecha:** 2026-08-26
**Complementa:** `PLAN_INVENTARIO_FUNCIONAL_2026-08.md` (qué funcionalidades y por qué)
**Este documento responde:** qué campos exactos se registran, en qué pantalla, quién lo hace y qué pasa después.

---

## 1. Catálogo maestro — lo que se configura una vez

### 1.1 Categorías de artículo

Pantalla: `/inventario/categorias` · Rol: **Admin**

Define qué se controla y con qué reglas. Se carga una vez y casi no se toca.

| Campo | Tipo | Obligatorio | Ejemplo |
|---|---|:-:|---|
| Nombre | texto (80) | ✅ | `ONU Huawei HG8310M` |
| Código | texto (20), único | ✅ | `ONU-HW-8310` |
| Tipo de control | `Serializado` \| `Consumible` | ✅ | `Serializado` |
| Unidad de medida | `Unidad` \| `Metro` \| `Rollo` | ✅ | `Unidad` |
| Stock mínimo | entero | ✅ | `10` |
| Requiere MAC | booleano | — | `Sí` |
| Activa | booleano | ✅ | `Sí` |
| Notas | texto largo | — | `Compatible con OLT ZTE` |

**La decisión clave es "Tipo de control", y no se puede cambiar después** de que la categoría tenga movimientos: convertir un consumible en serializado exigiría inventar seriales para lo ya registrado. La pantalla lo bloquea con un aviso claro.

**Carga inicial sugerida** para este ISP:

| Código | Nombre | Control | Unidad | Mínimo |
|---|---|---|---|---|
| `ONU-HW-8310` | ONU Huawei HG8310M | Serializado | Unidad | 10 |
| `ONU-ZTE-F601` | ONU ZTE F601 | Serializado | Unidad | 10 |
| `ROUTER-TPL-WR840` | Router TP-Link WR840N | Serializado | Unidad | 5 |
| `DECO-TV` | Decodificador TV Cable | Serializado | Unidad | 5 |
| `CABLE-DROP` | Cable drop fibra 1 hilo | Consumible | Metro | 2000 |
| `CONECTOR-SC-APC` | Conector rápido SC/APC | Consumible | Unidad | 100 |
| `PATCHCORD-SC-2M` | Patch cord SC/APC 2 m | Consumible | Unidad | 30 |
| `ROSETA` | Roseta óptica | Consumible | Unidad | 50 |
| `PRECINTO` | Precinto de seguridad | Consumible | Unidad | 200 |

### 1.2 Ubicaciones

Pantalla: `/inventario/ubicaciones` · Rol: **Admin**

| Campo | Tipo | Obligatorio | Ejemplo |
|---|---|:-:|---|
| Nombre | texto (80) | ✅ | `Mochila — Juan Pérez` |
| Tipo | enum (abajo) | ✅ | `MochilaTecnico` |
| Usuario asignado | FK a `UserSystem` | solo si es mochila | `Juan Pérez (Tecnico)` |
| Activa | booleano | ✅ | `Sí` |

Los cinco tipos, y qué significan:

| Tipo | Qué es | Cuántas |
|---|---|---|
| `AlmacenCentral` | El depósito de la empresa | 1 o más |
| `MochilaTecnico` | Lo que un técnico lleva encima | 1 por técnico |
| `Cliente` | Instalado en casa de un cliente | virtual, 1 por cliente |
| `Taller` | Equipo retirado en evaluación o reparación | 1 |
| `Baja` | Dado de baja definitiva (destino final) | 1 |

> Las ubicaciones de tipo `Cliente` **no se crean a mano**: el sistema las resuelve por el `ClientId` del equipo. Se listan como tipo para que el kardex tenga un destino con nombre.

**Automatismo:** al crear un usuario con rol `Tecnico`, se crea su mochila automáticamente. Al desactivarlo, si su mochila no está vacía, se bloquea la desactivación y se pide devolver el material primero.

### 1.3 Proveedores

Pantalla: `/inventario/proveedores` · Rol: **Admin**

Mínimo indispensable, sin llegar a gestión de compras: `Nombre`, `NIT`, `Contacto`, `Teléfono`, `Activo`.

---

## 2. Cómo entran las cosas al sistema

### 2.1 Recepción de compra — el único movimiento que crea existencias

Pantalla: `/inventario/recepciones/nueva` · Rol: **Admin, Operador**

**Cabecera:**

| Campo | Obligatorio | Ejemplo |
|---|:-:|---|
| Proveedor | ✅ | `Importadora Andina SRL` |
| N.º de factura | ✅ | `F-00012345` |
| Fecha de compra | ✅ | `2026-08-20` |
| Ubicación de destino | ✅ | `Almacén Central` |
| Observaciones | — | `Lote de reposición trimestral` |

**Líneas de detalle** — se agregan una por categoría:

*Si la categoría es **consumible**:*

| Campo | Ejemplo |
|---|---|
| Categoría | `CABLE-DROP` |
| Cantidad | `3000` (metros) |
| Costo unitario | `2.80` *(opcional en la v1)* |

*Si la categoría es **serializada**, hay que registrar cada unidad:*

| Campo | Obligatorio | Ejemplo |
|---|:-:|---|
| Serial | ✅ (único global) | `HWTC9A2F41B7` |
| MAC | si la categoría lo exige | `48:57:02:9A:2F:41` |
| Modelo | ✅ | `HG8310M` |
| Meses de garantía | — | `12` |
| Costo unitario | — | `185.00` |

Tres formas de cargar los seriales, de más rápida a más lenta:

1. **Escaneo con la cámara** — se escanea uno tras otro; cada lectura añade una fila. La forma normal de hacerlo con 50 ONUs.
2. **Pegado masivo** — un cuadro de texto donde se pegan seriales, uno por línea, desde el Excel del proveedor. El sistema los valida todos y muestra cuáles ya existen antes de guardar.
3. **A mano** — para una o dos unidades.

**Validaciones antes de confirmar:**
- Serial duplicado dentro de la misma recepción → error de línea
- Serial que ya existe en la base → error, con enlace a la ficha del equipo existente
- MAC duplicada → advertencia (no error: hay equipos reacondicionados)
- Cantidad ≤ 0 → error

**Al confirmar** se genera un movimiento `Compra` por línea, se crean los `EquipmentItem` en estado `EnAlmacen`, y se suma el stock de los consumibles. **La recepción no se puede editar después**: un error se corrige con un `Ajuste`.

### 2.2 Importación inicial por CSV

Pantalla: `/inventario/importar` · Rol: **Admin**

Para cargar lo que ya existe el día que arranca el módulo. Dos archivos.

**Equipos serializados** (`equipos.csv`):

```csv
categoria_codigo,serial,mac,modelo,estado,ubicacion,tbn_cliente,fecha_compra
ONU-HW-8310,HWTC9A2F41B7,48:57:02:9A:2F:41,HG8310M,Instalado,,TBN-0357,2025-03-10
ONU-HW-8310,HWTC9A2F41C2,48:57:02:9A:2F:4C,HG8310M,EnAlmacen,Almacén Central,,2025-03-10
ONU-ZTE-F601,ZTEG1188AA02,,F601,Instalado,,TBN-0412,2024-11-02
```

**Consumibles** (`stock.csv`):

```csv
categoria_codigo,ubicacion,cantidad
CABLE-DROP,Almacén Central,1850
CABLE-DROP,Mochila — Juan Pérez,120
CONECTOR-SC-APC,Almacén Central,340
```

El importador funciona en dos pasos: **primero valida y muestra un informe** (cuántas filas están bien, cuáles fallan y por qué, qué códigos TBN no existen, qué seriales están repetidos), y **solo entonces** ofrece el botón de importar. Nunca importa a medias: o entran todas las filas válidas en una transacción, o no entra ninguna.

Todos los movimientos generados llevan tipo `Ajuste` con motivo `CARGA_INICIAL`, para que el kardex distinga desde el primer día lo que es inventario histórico de lo que es operación real.

> **Advertencia honesta:** esto es lo que más trabajo cuesta y no es trabajo de programación. Alguien tiene que ir al almacén a contar, y recorrer las instalaciones existentes para saber qué ONU tiene cada cliente. Sin eso, el módulo arranca mintiendo.

---

## 3. Los movimientos — la tabla que lo explica todo

Todo lo que pasa en el inventario es uno de estos siete movimientos. No hay más.

| Tipo | Quién lo hace | Origen → Destino | Se dispara | Campos propios |
|---|---|---|---|---|
| `Compra` | Admin, Operador | (nada) → Almacén | Manual, al recibir | Proveedor, factura, costo |
| `Traspaso` | Admin, Operador → acepta Técnico | Almacén ↔ Mochila | Manual, en 2 pasos | Aceptado por, fecha de aceptación |
| `Consumo` | Sistema | Mochila → Cliente | **Automático** al cerrar instalación | `InstallationId` |
| `Devolucion` | Técnico | Mochila → Almacén, o Cliente → Taller | Manual (sobrante) o al recuperar equipo | `TicketId` si viene de recolección |
| `Merma` | Admin | Cualquiera → Baja | Manual | Motivo **obligatorio** |
| `Ajuste` | **Solo Admin** | Cualquiera | Manual o carga inicial | Motivo **obligatorio**, cantidad ± |
| `Baja` | Admin | Cualquiera → Baja | Manual | Motivo **obligatorio** |

**Campos comunes a todos**, sin excepción:

```
Id, Tipo, Fecha (UTC), UsuarioId, UsuarioNombre
CategoriaId, EquipmentItemId?, Cantidad
UbicacionOrigenId?, UbicacionDestinoId?
InstallationId?, TicketId?, ClientId?    ← trazabilidad al hecho de negocio
Motivo?, CostoUnitario?
```

**Ninguna fila del kardex se edita ni se borra jamás.** Un error se corrige con un `Ajuste` que apunta al movimiento equivocado en su motivo. Esa disciplina es lo que hace que el kardex sirva como evidencia; sin ella es una lista de números.

---

## 4. Los flujos completos, paso a paso

### Flujo A — Cargar la mochila de un técnico

**Paso 1 — El almacén envía.** Operador entra a `/inventario/traspasos/nuevo`:

```
Origen:  Almacén Central
Destino: Mochila — Juan Pérez
Líneas:
  · ONU-HW-8310    → 3 unidades → escanea o elige: HWTC9A2F41B7, ...41C2, ...41D9
  · CABLE-DROP     → 200 metros
  · CONECTOR-SC-APC → 10 unidades
```

Al confirmar, el material pasa a estado **`EnTransito`**. No está en el almacén ni en la mochila: está en el limbo, y eso es a propósito.

**Paso 2 — El técnico acepta.** A Juan le llega una notificación interna (campanita). Entra a `/mi-mochila`, ve el traspaso pendiente y tiene tres opciones:

- **Aceptar todo** → el material entra en su mochila
- **Aceptar con diferencias** → declara que recibió 180 metros y no 200; se genera el traspaso por 180 y **una alerta al Admin por la diferencia**
- **Rechazar** → el material vuelve al almacén

**Por qué en dos pasos:** sin la aceptación, el día que falte material la conversación es "yo nunca recibí eso" contra "yo te lo di", y no hay forma de resolverla. Con la aceptación, hay una fila con fecha y autor.

**Si nadie acepta en 24 h**, alerta al Admin y el material sigue en tránsito (no vuelve solo: volver solo escondería el problema).

### Flujo B — Agendar una instalación (reserva)

Ocurre **sin que nadie del inventario haga nada**. Al crear la instalación, el sistema:

1. Ya reserva un puerto NAP (esto existe hoy)
2. **Nuevo:** reserva 1 unidad de la categoría de ONU que corresponda al plan, y los metros estimados de drop
3. La reserva vence con el mismo TTL que la del puerto

**Si no hay stock:** la instalación **se agenda igual**, pero con una advertencia visible en la pantalla y una alerta al Admin. No se bloquea el agendamiento — perder una venta por un problema de almacén sería peor que la falta de stock. Lo que sí hace es avisar a tiempo para reponer.

### Flujo C — Cerrar la instalación (el flujo más importante)

Pantalla: el `CompleteModal` que ya existe, modificado.

**Hoy:**

```
Serial ONU:      [ campo de texto libre, placeholder "HWTC12345678" ]
Metros de drop:  [ campo numérico libre ]
```

Nadie valida nada. Se puede escribir `asdf` y el sistema lo acepta.

**Con inventario:**

```
┌─ Equipo instalado ────────────────────────────────────┐
│ Reservado para esta instalación:                      │
│   ● HWTC9A2F41B7 — ONU Huawei HG8310M    [Reservada]  │
│   ○ Otro equipo de mi mochila…            [▾]         │
│   ○ [ 📷 Escanear ]                                    │
└────────────────────────────────────────────────────────┘

┌─ Material consumido ──────────────────────────────────┐
│ Cable drop:        [  45 ] m    (tienes 200 m)        │
│ Conector SC/APC:   [   2 ] u    (tienes 10 u)         │
│ Roseta:            [   1 ] u    (tienes 4 u)          │
└────────────────────────────────────────────────────────┘

[ Checklist existente: ONU encendida, señal, velocidad, conformidad ]
[ Fotos existentes: hasta 3 ]
```

**Qué valida antes de aceptar:**

| Situación | Respuesta del sistema |
|---|---|
| El serial escaneado no existe en el inventario | Error: *"Ese equipo no está registrado. Regístralo en una recepción de compra o pide un ajuste."* |
| El equipo está en la mochila de **otro** técnico | Error, indicando de quién es |
| El equipo ya figura instalado en otro cliente | Error, con enlace a ese cliente |
| Se declaran 60 m y en la mochila hay 40 | Error: *"No puedes consumir más de lo que llevas. Pide un ajuste al Admin."* |
| Se usó un equipo distinto al reservado | **Se permite**, se libera la reserva original y se consume el usado |

**Al confirmar**, dentro de la **misma transacción** que ya cierra la instalación y resuelve el ticket:

1. El equipo pasa a `Instalado`, ubicación = ese cliente
2. Movimiento `Consumo` del equipo, con `InstallationId` y `ClientId`
3. Movimiento `Consumo` por cada consumible
4. Se libera la reserva
5. `NapPort` queda apuntando al equipo real (FK, no texto)
6. Se propaga el serial al cliente → **arregla el bug D-09**

O pasa todo, o no pasa nada.

### Flujo D — Fin de jornada: devolver sobrante

Pantalla `/mi-mochila` · Rol: **Tecnico**

El técnico ve lo que lleva y devuelve lo que no va a usar. Genera un `Devolucion` de Mochila → Almacén. Sin este paso la mochila crece indefinidamente y el stock del almacén miente.

**Recordatorio automático:** si la mochila de un técnico lleva más de N días sin movimiento y tiene material, alerta.

### Flujo E — Cambio de equipo por avería

Desde el ticket, al registrar la visita:

```
┌─ Cambio de equipo ────────────────────────────────────┐
│ Equipo retirado:  HWTC9A2F41B7  (el que está instalado)│
│ Estado en que vuelve:  ○ Funcional                     │
│                        ● Dañado                        │
│                        ○ No recuperado                 │
│ Diagnóstico: [ No enciende, puerto PON quemado       ] │
│                                                        │
│ Equipo instalado: [ 📷 Escanear ] HWTC9A2F41D9        │
└────────────────────────────────────────────────────────┘
```

Genera dos movimientos ligados al mismo `TicketId`: `Devolucion` (Cliente → Taller) y `Consumo` (Mochila → Cliente). Si vuelve como `Dañado` y está en garantía, el sistema lo marca como **candidato a RMA** y avisa.

Si se elige `No recuperado`, **no se genera devolución** — el equipo queda marcado como perdido, con su motivo, y aparece en el reporte de pérdidas.

### Flujo F — Baja de cliente y recuperación del equipo

**Paso 1 — Se da de baja al cliente.** El sistema busca **en el inventario** (no en el campo de texto `OnuSerialNumber`) qué equipos tiene ese cliente. Si hay alguno, crea el ticket `RecoleccionEquipo` que ya existe hoy, ahora con el detalle real:

> *Recolección: 1× ONU Huawei HG8310M (S/N HWTC9A2F41B7) del cliente TBN-0357.*

**Este es el cambio que cierra la fuga.** Hoy el ticket depende de un campo que el flujo de instalación nunca rellena, así que un cliente instalado normalmente se da de baja **sin generar ticket**.

**Paso 2 — El técnico va y recupera.** Al resolver el ticket, botón **"Registrar equipo recuperado"**:

```
HWTC9A2F41B7 — ONU Huawei HG8310M
  ● Recuperado, funcional      → vuelve al Almacén
  ○ Recuperado, dañado         → va al Taller
  ○ No recuperado              → motivo obligatorio
```

**Paso 3 — Si nadie lo resuelve** en el plazo (`OnuCollectionDeadlineHours`, que ya existe), alerta al Admin y el equipo aparece en el reporte de **equipos no devueltos**.

### Flujo G — Ajuste por conteo físico

Pantalla `/inventario/ajustes` · Rol: **Solo Admin**

```
Ubicación:  Almacén Central
Categoría:  CABLE-DROP
Sistema dice:  1850 m
Conteo real:  [ 1780 ] m
Diferencia:    −70 m
Motivo (obligatorio): [ Conteo físico mensual — merma de puntas ]
```

El ajuste es la única operación que puede hacer cuadrar el inventario con una mentira. Por eso es exclusiva de Admin, exige motivo, y **cada ajuste queda en auditoría y en un reporte propio**. Si alguien ajusta todos los meses el mismo artículo, eso se ve.

---

## 5. Las pantallas, una por una

### 5.1 `/inventario` — Panel de stock

Tarjetas arriba: `Equipos en almacén` · `Equipos instalados` · `Equipos en taller` · `Categorías bajo mínimo`

Tabla principal, agrupable por categoría o por ubicación:

| Categoría | Almacén | Mochilas | Instalado | Taller | Total | Mínimo | Estado |
|---|--:|--:|--:|--:|--:|--:|:-:|
| ONU Huawei HG8310M | 12 | 5 | 143 | 3 | 163 | 10 | 🟢 |
| ONU ZTE F601 | 4 | 2 | 88 | 1 | 95 | 10 | 🔴 |
| Cable drop (m) | 1780 | 340 | — | — | 2120 | 2000 | 🟡 |

Filtros: categoría, ubicación, solo bajo mínimo. Botón de exportar.

### 5.2 `/inventario/equipos` — Buscador de equipos

Buscador único que acepta **serial, MAC, código TBN o nombre de cliente**. Filtros por categoría, estado y ubicación.

| Serial | Categoría | Estado | Ubicación / Cliente | Desde | Garantía |
|---|---|---|---|---|---|
| `HWTC9A2F41B7` | ONU HG8310M | 🔵 Instalado | TBN-0357 — María Quispe | 2026-03-14 | vence 2027-03-10 |
| `HWTC9A2F41C2` | ONU HG8310M | 🟢 En almacén | Almacén Central | 2026-08-20 | vigente |
| `ZTEG1188AA02` | ONU F601 | 🟠 En taller | Taller | 2026-08-11 | **vencida** |

### 5.3 Ficha de trazabilidad — la pantalla que justifica el módulo

Al abrir un equipo:

```
HWTC9A2F41B7 · ONU Huawei HG8310M
MAC 48:57:02:9A:2F:41 · Comprado 2026-03-10 a Importadora Andina (Bs. 185,00)
Garantía hasta 2027-03-10 · Estado actual: Instalado en TBN-0357

  2026-03-10  Compra          Factura F-00012298      → Almacén Central   [Admin]
  2026-03-12  Traspaso        Aceptado por Juan P.    → Mochila Juan      [Operador]
  2026-03-14  Consumo         Instalación #4471       → TBN-0357          [Juan P.]
  2026-07-02  Devolución      Ticket #TBN-T-0912      → Taller  (dañado)  [Ana R.]
  2026-07-08  Ajuste          Reparado, funcional     → Almacén Central   [Admin]
  2026-08-14  Traspaso        Aceptado por Ana R.     → Mochila Ana       [Operador]
  2026-08-15  Consumo         Instalación #5102       → TBN-0357          [Ana R.]
```

Esto es lo que hoy no existe de ninguna forma, ni siquiera en papel.

### 5.4 `/inventario/movimientos` — Kardex

Todos los movimientos, filtrables por rango de fechas, tipo, categoría, ubicación, usuario, cliente. Columnas: fecha, tipo, categoría, serial, cantidad, origen, destino, referencia (instalación/ticket), usuario, motivo. Exportable a Excel y PDF con el membrete de la empresa.

### 5.5 `/mi-mochila` — Vista del técnico

Pensada para el móvil, porque ahí se usa.

- **Traspasos pendientes de aceptar** (con badge)
- **Lo que llevo**: equipos serializados listados por serial + consumibles con cantidad
- **Botón "Devolver sobrante"**
- **Consumido hoy**: para que el técnico verifique su propia jornada

### 5.6 Pestaña "Equipos" en la ficha del cliente

Octava pestaña, junto a las siete que ya hay (Info, Facturación, Tickets, Mensajes, Plan, Adjuntos, Historial):

| Equipo | Serial | Instalado el | Instalación | Estado |
|---|---|---|---|---|
| ONU Huawei HG8310M | `HWTC9A2F41B7` | 2026-08-15 | #5102 | Activo |
| Decodificador TV | `DECO-00871` | 2026-08-15 | #5102 | Activo |

Con historial de equipos anteriores plegado abajo.

---

## 6. Alertas: cuándo salta cada una

Todas por `InternalAlert` + SignalR → la campanita que ya existe. **Ninguna por WhatsApp**: ese canal es del cliente y el inventario no tiene nada que decirle.

| Alerta | Cuándo | Para quién |
|---|---|---|
| Stock bajo mínimo | Job diario, y al instante tras un consumo que cruza el umbral | Admin, Operador |
| Sin stock para instalación agendada | Al agendar sin existencias | Admin |
| Traspaso sin aceptar | 24 h después de enviarlo | Admin |
| Traspaso aceptado con diferencias | Al aceptar | Admin |
| Equipo no devuelto | Al vencer el plazo de recolección | Admin |
| Serial duplicado | Al intentar registrarlo | quien lo intenta |
| Mochila inactiva con material | Job diario, N días sin movimiento | Admin, el técnico |
| Equipo dañado en garantía | Al marcarlo dañado | Admin |

---

## 7. Reportes

Todos con `ExportService` (Excel y PDF, con membrete):

| Reporte | Columnas | Para qué |
|---|---|---|
| **Kardex** | Todos los movimientos del rango | Auditoría y control |
| **Stock actual** | Categoría, ubicación, cantidad, mínimo, diferencia | Reposición |
| **Consumo por técnico** | Técnico, categoría, cantidad, n.º instalaciones, promedio por instalación | **Detecta desviaciones**: si un técnico gasta 80 m de media y otro 45, hay algo que mirar |
| **Consumo por instalación** | Instalación, cliente, equipo, materiales | Costo real del alta |
| **Equipos no devueltos** | Cliente, equipo, fecha de baja, días transcurridos | Recuperación de activos |
| **Merma y ajustes** | Fecha, artículo, cantidad, motivo, autor | Control del control |
| **Garantías por vencer** | Equipo, cliente, fecha de vencimiento | Reclamar a tiempo |

El de **consumo por técnico** es el que más se va a usar en la práctica, aunque no lo parezca al diseñarlo.

---

## 8. Endpoints

Siguiendo la convención de `CoverageAdminController` (`api/<módulo>` + política por acción):

```
GET    /api/inventory/categories                 AdminOrOperador
POST   /api/inventory/categories                 AdminOnly
GET    /api/inventory/locations                  AdminOrOperador
GET    /api/inventory/stock                      AdminOrOperador
GET    /api/inventory/items?q=&status=&location= AdminOrOperadorOrTecnico
GET    /api/inventory/items/{id}/history         AdminOrOperadorOrTecnico
POST   /api/inventory/receipts                   AdminOrOperador
POST   /api/inventory/transfers                  AdminOrOperador
POST   /api/inventory/transfers/{id}/accept      AdminOrOperadorOrTecnico
POST   /api/inventory/transfers/{id}/reject      AdminOrOperadorOrTecnico
GET    /api/inventory/my-bag                     AdminOrOperadorOrTecnico
POST   /api/inventory/returns                    AdminOrOperadorOrTecnico
POST   /api/inventory/adjustments                AdminOnly
GET    /api/inventory/movements                  AdminOrOperador
GET    /api/inventory/reports/{tipo}             AdminOrOperador
POST   /api/inventory/import/validate            AdminOnly
POST   /api/inventory/import/commit              AdminOnly
```

---

## 9. Qué queda en auditoría

Con `AuditService`, que ya se usa en todos los comandos. Módulo `Inventario`:

| Acción | Cuándo |
|---|---|
| `INVENTORY_RECEIPT` | Recepción de compra |
| `INVENTORY_TRANSFER_SENT` / `_ACCEPTED` / `_REJECTED` | Traspasos |
| `INVENTORY_CONSUMED` | Consumo en instalación |
| `INVENTORY_RETURNED` | Devolución o recuperación |
| `INVENTORY_ADJUSTED` | **Ajuste manual — el que más importa** |
| `INVENTORY_WRITEOFF` | Merma o baja |
| `INVENTORY_IMPORT` | Carga inicial |

El kardex ya es un registro inmutable, así que la auditoría no lo duplica: registra **quién usó el panel**, no qué pasó con el stock. Son dos preguntas distintas.

---

## 10. Resumen para decidir

Lo que se podrá **registrar**: categorías, ubicaciones, proveedores, compras con factura, equipos con serial/MAC/garantía, stock de consumibles, traspasos con aceptación, consumos automáticos, devoluciones, retiros por avería, recuperaciones tras baja, mermas, bajas y ajustes justificados.

Lo que se podrá **consultar**: dónde está cada equipo, qué lleva cada técnico, cuánto queda de cada cosa, la vida completa de un serial, cuánto material gasta cada técnico, qué equipos no volvieron y qué garantías están por vencer.

Lo que se **automatiza sin que nadie toque nada**: la reserva al agendar, el consumo al cerrar la instalación, el ticket de recolección al dar de baja, y todas las alertas.

Lo que **sigue siendo trabajo humano**: contar el almacén la primera vez, escanear los seriales, y aceptar los traspasos.
