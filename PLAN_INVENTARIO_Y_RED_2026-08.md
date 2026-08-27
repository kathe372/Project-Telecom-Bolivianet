# Análisis de viabilidad — Módulo de Inventario + Integración MikroTik

**Fecha:** 2026-08-26
**Alcance:** los 4 servicios (backend C#, frontend React, chatbot NestJS, notifier Python)
**Modalidad:** un solo desarrollador, sistema en producción en Railway
**Estado:** análisis — nada implementado

---

## 0. Veredicto en una tabla

| Pieza | ¿Viable? | Dificultad | Bloqueante real |
|---|---|---|---|
| **Inventario** (equipos serializados + consumibles + kardex) | Sí, sin reservas | **Media-baja** | Ninguno. El 80 % del andamiaje ya existe. |
| **Corte/reconexión automáticos en MikroTik** | Sí | **Media** en código, **alta** en infraestructura | **Conectividad Railway → router.** No es un problema de programación. |
| **Escaneo de red** (quién está online, tráfico, vecinos) | Sí | **Media** | El mismo canal. Una vez resuelto, es barato. |
| **Estado óptico de la ONU** (potencia, alarmas) | Depende del hardware | **Alta** | Eso **no vive en el MikroTik**, vive en la OLT. Integración aparte. |

La conclusión corta: **el inventario es un módulo CRUD-con-ledger bien acotado que este código ya sabe hacer.** Lo de MikroTik es viable y tiene un valor enorme (reconexión instantánea al pagar), pero el trabajo difícil no es hablar RouterOS — es decidir **por dónde llega el backend al router**, y blindar que un bug no tumbe la red de todos los clientes a la vez.

---

## 1. Qué encontré en el código (estado actual)

### 1.1 Tamaño y forma

| Servicio | Archivos | Líneas | Stack |
|---|---|---|---|
| Backend | 463 `.cs` (src) + 102 de test | ~36 600 | .NET 8, Clean Architecture, CQRS con MediatR, EF Core + PostGIS |
| Chatbot | 279 `.ts` | ~32 500 | NestJS 10, TypeORM, pgvector, Redis, Gemini |
| Frontend | 221 `.ts/.tsx` | ~28 000 | React + Vite + Tailwind, rutas lazy con guardas por rol |
| Notifier | 26 `.py` | ~1 800 | Python asyncio, asyncpg, worker de outbox |

Migraciones: **66**, escritas a mano (ver `docs/adr/ADR-004`).

### 1.2 Lo que YA existe y sirve de cimiento

Esto es lo importante: no se parte de cero en casi nada.

**Patrón outbox + worker desacoplado.** `NotifOutbox` (tabla) + `app/jobs/outbox_worker.py` (Python) ya implementan "el backend encola una intención, otro proceso la ejecuta contra un sistema externo, con reintentos, backoff, circuit breaker y dead-letter". **Ese es exactamente el patrón que necesita el corte en MikroTik.** No hay que inventarlo; hay que clonarlo.

**Exclusión mutua entre réplicas.** `JobLease` (advisory locks de PostgreSQL, ADR-002) ya resuelve "dos instancias no deben ejecutar el mismo job". Un job que corta servicio es justo donde eso importa.

**Cifrado de secretos en BD.** `SecretEncryptionService` (AES-256, clave en `SecretEncryption__Key`) ya cifra tokens en `SystemConfig`. Las credenciales de cada router entran ahí sin trabajo nuevo.

**Modelo de capacidad con reserva.** `DistributionBox` + `NapPort` + `PortReservation` + `ExpirePortReservationsJob` ya implementan reservar → ocupar → liberar con TTL. **El mismo patrón, calcado, sirve para reservar un equipo del almacén cuando se agenda una instalación.**

**Ganchos de consumo ya escritos pero muertos.** `Installation.EquipoOnuSerial` y `Installation.MetrosDrop` ya capturan el serial del equipo instalado y los metros de drop gastados. Hoy son texto suelto que nadie usa. **Con inventario, esos dos campos se convierten en el evento de consumo de stock.** Es el punto de integración más limpio de todo el plan.

**Alertas internas.** `InternalAlert` + `AlertsController` + `AdminHub` (SignalR) + `NotificationBell` en el frontend. Ya hay un canal para "stock bajo" o "router inalcanzable" sin tocar WhatsApp.

**Auditoría, soft-delete, concurrencia optimista.** `AuditLog` en todos los comandos, `IsDeleted/DeletedAt/DeletedById`, y `Client.Xmin` como token de concurrencia. Un ledger de inventario necesita las tres cosas.

**Exportación.** `ExportService` + ClosedXML + QuestPDF, con membrete de empresa. El kardex y el reporte de stock salen casi gratis.

**Autorización.** Cuatro roles (`Admin`, `Operador`, `Tecnico`, `SocioLectura`) y cinco políticas ya declaradas en `JwtConfiguration.cs`.

### 1.3 Lo que NO existe

- **Cero rastro de inventario.** Ni entidad, ni tabla, ni endpoint. Busqué `inventario|stock|almacen|serial` en los 4 servicios: solo aparece `Installation.EquipoOnuSerial`, `Client.OnuSerialNumber` y `NapPort.OnuSerial`.
- **Cero rastro de red activa.** Ni `mikrotik`, ni `routeros`, ni `pppoe`, ni `snmp`, ni `radius` en ningún servicio. El único vínculo con el equipamiento real es `Client.WinboxNumber`: un `string` de 50 caracteres, obligatorio, único, validado solo por longitud. **Nadie lo usa para nada más que buscar clientes.**
- **El corte hoy es solo un cambio de estado.** `AutoSuspendClientJob` marca `Client.Status = Suspendido`, manda un WhatsApp y escribe auditoría. **El corte físico lo hace una persona a mano en Winbox.** Ese es el hueco que este proyecto quiere cerrar.

### 1.4 El serial de la ONU está en tres sitios y no manda ninguno

```
Client.OnuSerialNumber       ← string?, sin unicidad
Installation.EquipoOnuSerial ← string?, evidencia de cierre
NapPort.OnuSerial            ← string?, read-model del puerto
```

Tres columnas de texto libre para el mismo dato físico, sin FK entre ellas, sin restricción de unicidad. **Hoy nada impide registrar la misma ONU en dos clientes.** El inventario resuelve esto: el equipo pasa a ser una fila con identidad, y las tres columnas se convierten en referencias a ella.

---

## 2. PARTE A — Módulo de Inventario

> **Ampliado el 2026-08-26 en [`PLAN_INVENTARIO_FUNCIONAL_2026-08.md`](PLAN_INVENTARIO_FUNCIONAL_2026-08.md):** catálogo de funcionalidades por prioridad, reglas de negocio, matriz de permisos, integración archivo por archivo y orden de construcción revisado. Esa ampliación corrige dos estimaciones de aquí (I3 baja a 3 días porque el enganche de reserva ya está pre-trazado; el total sube a 6-7 semanas al incorporar la carga inicial y el escaneo de códigos).

### 2.1 Qué significa "inventario" en un ISP de fibra

No es un solo problema, son tres con reglas distintas:

| Tipo | Ejemplos | Regla | Se cuenta por |
|---|---|---|---|
| **Serializado** | ONU/ONT, router, deco TV, antena | Cada unidad tiene identidad y ciclo de vida propio | Unidad |
| **Consumible** | Cable drop, conectores SC/APC, patch cords, precintos | No tiene identidad, solo cantidad | Metros / unidades |
| **Ubicación** | Almacén central, mochila del técnico, casa del cliente, RMA/taller, baja | El stock siempre está *en algún sitio* | — |

Y el corazón: **el kardex**, un ledger inmutable de movimientos. Nunca se edita un stock: se inserta un movimiento y el stock es la suma. Es lo mismo que ya hace `CreditMovement` para el saldo del cliente — hay precedente en la casa.

### 2.2 Modelo de datos propuesto

```
InventoryCategory     Categoría (ONU, Router, Cable, Conector…)
  · Serializado: bool   ← decide si exige serial o solo cantidad
  · UnidadMedida        ← unidad | metro
  · StockMinimo         ← dispara InternalAlert

InventoryLocation     Almacén central | Mochila de técnico | Cliente | RMA | Baja
  · Tipo: enum
  · UserId?             ← si es la mochila de un técnico

EquipmentItem         UNA unidad serializada (la ONU física)
  · CategoryId, SerialNumber (ÚNICO), MacAddress?, Modelo, Marca
  · Estado: EnAlmacen | Asignado | Instalado | Retirado | EnReparacion | Baja
  · LocationId, ClientId?, InstallationId?
  · CostoCompra?, FechaCompra?, Garantia?
  · Xmin                ← concurrencia optimista, como Client

StockLevel            Saldo de consumibles por (CategoryId, LocationId)
  · Cantidad (decimal, permite metros), Xmin

InventoryMovement     KARDEX — inmutable, nunca se actualiza
  · Tipo: Compra | Traspaso | Consumo | Devolucion | Merma | Ajuste | Baja
  · CategoryId, EquipmentItemId?, Cantidad
  · LocationFromId?, LocationToId?
  · InstallationId?, TicketId?, ClientId?   ← trazabilidad al hecho de negocio
  · CostoUnitario?, UserId, CreatedAt, Motivo

EquipmentReservation  Equipo reservado para una instalación agendada
  · EquipmentItemId | (CategoryId + Cantidad), InstallationId
  · ExpiresAt           ← copia literal de PortReservation
```

### 2.3 Dónde se engancha con lo que ya hay

Este es el punto que hace el módulo barato: **no hay que inventar los eventos, ya ocurren.**

| Evento existente | Dónde está | Qué dispara en inventario |
|---|---|---|
| Se agenda una instalación | `CreateInstallationCommand` | Reserva 1 ONU + N metros de drop (TTL, como `PortReservation`) |
| Técnico cierra la instalación | `CompleteInstallationCommand` + `EquipoOnuSerial`/`MetrosDrop` | **Consumo**: la ONU pasa a `Instalado` en la ubicación del cliente; se descuentan los metros |
| Se cancela / `NoRealizada` | `CancelInstallationCommand` | Libera la reserva (`ExpirePortReservationsJob` como plantilla) |
| Se completa contra otra caja | `CompleteInstallationWithBoxCommand` | Ya existe "liberar reserva vieja, ocupar en la nueva" — se replica tal cual |
| Ticket de cambio de equipo | `SupportTicket` + `TicketVisit` | Retiro de la ONU vieja → `EnReparacion`; alta de la nueva |
| Baja de cliente | `CancelClientCommand` | Equipo queda `Retirado` pendiente de recuperar → **alerta de equipo no devuelto** |
| Stock bajo mínimo | job nuevo | `InternalAlert` + SignalR → campanita del frontend |

Y **`NapPort.OnuSerial` deja de ser texto y pasa a ser `EquipmentItemId`**, con lo que el mapa de cobertura muestra qué equipo concreto hay en cada puerto.

### 2.4 Frontend

El sidebar ya tiene el grupo **"Red"** con una sola entrada (Cobertura). Ahí entran:

- `/inventario` — stock por ubicación, con filtros y alertas de mínimos
- `/inventario/equipos` — buscador por serial/MAC/cliente, ficha con historial completo
- `/inventario/movimientos` — kardex, exportable con `ExportService`
- `/inventario/traspasos` — cargar la mochila de un técnico

Y dos inserciones en páginas existentes:
- **Ficha del cliente** (`ClientProfilePage`): pestaña "Equipos" con lo instalado y su historial.
- **Cierre de instalación**: el campo de serial pasa de texto libre a **selector validado contra el stock reservado**. Aquí es donde el módulo deja de ser burocracia y empieza a evitar errores.

### 2.5 Dificultad y esfuerzo

**Media-baja.** No hay ni una pieza técnicamente novedosa: CQRS + repositorios + un ledger + pantallas, todo con patrones que este repo ya ejecuta bien. Lo único con filo son las **carreras de concurrencia** (dos técnicos reclamando la última ONU), y para eso ya está el precedente de `Xmin` y del `FOR UPDATE` usado en las reservas de puerto.

| Fase | Contenido | Estimación (parcial, 1 dev) |
|---|---|---|
| I1 | Entidades + migración a mano + repos + tests de dominio | 1 semana |
| I2 | Comandos/queries + controlador + validadores | 1–1.5 semanas |
| I3 | Enganche con instalaciones (reserva + consumo) — **la parte con riesgo** | 1 semana |
| I4 | Frontend (4 páginas + 2 inserciones) | 1.5 semanas |
| I5 | Kardex exportable + alertas de mínimos + job | 0.5–1 semana |
| **Total** | | **5–6 semanas a tiempo parcial** |

**Riesgo principal: la carga inicial.** Todo ISP en marcha tiene equipos ya instalados sin registrar. Hace falta un importador CSV y aceptar que el inventario arranca con un conteo físico hecho a mano. Eso no es código, es trabajo de campo, y suele ser lo que mata estos módulos.

---

## 3. PARTE B — Integración MikroTik

### 3.1 El bloqueante real no es RouterOS, es la ruta de red

El backend corre en **Railway** (nube pública, IP de salida no fija). El MikroTik está **en la red de la empresa** (oficina o sala de equipos — ver Anexo B). Para que el backend le hable hay cuatro caminos, y tres son malos:

| Opción | Cómo | Veredicto |
|---|---|---|
| **1. Exponer la API del router a Internet** | Abrir 8728/8729/443 en el router con IP pública | **No.** Es exponer el corazón de la red del ISP a Internet, y Railway no da IP de salida fija para restringir por origen. |
| **2. VPN desde el contenedor** | WireGuard/IPsec dentro del contenedor de Railway | **No viable.** Requiere `NET_ADMIN` y módulo de kernel; Railway no lo permite. |
| **3. Agente on-prem con outbox** ⭐ | Un servicio pequeño en cualquier equipo siempre encendido de la red del ISP, que **solo hace peticiones salientes HTTPS** al backend, pide comandos pendientes, los ejecuta contra el router y reporta el resultado | **Recomendado.** Cero puertos abiertos hacia adentro. Es el patrón de Zabbix proxy / runner autohospedado de GitHub / Cloudflare Tunnel. |
| **4. Malla tipo Tailscale** | Meter el backend y el router en una red overlay | Funciona, pero añade dependencia de un tercero y **igual necesita un dispositivo on-prem**. Si vas a tener el dispositivo, la opción 3 es más simple y más auditable. |

**El punto clave para este proyecto:** la opción 3 **no es arquitectura nueva**. Es exactamente lo que ya hace el notifier Python: leer una tabla outbox, ejecutar contra un sistema externo, reintentar con backoff, abrir circuit breaker, mandar a dead-letter. El agente de red es *el mismo programa con otro destino*. Ese precedente es lo que baja esto de "proyecto de infraestructura" a "otra iteración de un patrón conocido".

### 3.2 Arquitectura propuesta

```
┌────────────────────────── Railway (nube) ───────────────────────────┐
│                                                                     │
│  AutoSuspendClientJob ──┐                                           │
│  PaymentService ────────┼──▶  NetworkCommandOutbox  (tabla nueva)   │
│  Panel admin ───────────┘         · Tipo: CORTAR|RECONECTAR|…       │
│                                   · ClientId, RouterId              │
│  NetworkAgentController           · IdempotencyKey                  │
│   GET  /api/net-agent/commands    · Estado, Intentos, Resultado     │
│   POST /api/net-agent/results                                       │
│   POST /api/net-agent/telemetry   ◀── autenticado con token propio  │
└─────────────────────────────────────────────────────────────────────┘
                    ▲  solo HTTPS SALIENTE (443)
                    │  ningún puerto abierto hacia adentro
┌───────────────────┴────────────── red del ISP ──────────────────────┐
│  tbn-netagent  (mini-PC / VM)                                       │
│   · poll cada 10-15 s de comandos pendientes                        │
│   · traduce INTENCIÓN → comando RouterOS (lista blanca)             │
│   · barrido periódico: sesiones activas, ARP, tráfico               │
│   · reporta resultado + telemetría                                  │
│                      │                                              │
│                      ▼  API RouterOS (REST v7 o binario 8728)       │
│              MikroTik  (usuario dedicado, grupo de permisos mínimo) │
└─────────────────────────────────────────────────────────────────────┘
```

**Detalle que importa:** el backend envía **intenciones** (`CORTAR cliente X`), nunca comandos crudos de RouterOS. El agente tiene una **lista blanca** de operaciones permitidas. Así, aunque alguien comprometa el backend o la base de datos, no puede ejecutar comandos arbitrarios en el router del ISP. Esa frontera es la diferencia entre una integración y un agujero.

### 3.3 Cómo se corta — **PPPoE (confirmado 2026-08-26)**

El provisioning es **PPPoE con `/ppp secret`**. Ese es el mejor de los escenarios posibles: limpio, reversible y sin borrar nada.

**Mecanismo de corte:**

```
1. /ppp secret  →  cambiar el `profile` del cliente de "PLAN-20M" a "MOROSO"
2. /ppp active  →  eliminar la sesión activa (fuerza la reconexión inmediata)
3. El cliente reconecta solo, en segundos, ya bajo el profile MOROSO
```

El profile `MOROSO` se define **una sola vez, a mano, en el router**: pool de IPs propio y una regla de firewall que redirige todo el HTTP a una página de aviso. El sistema nunca crea ni modifica profiles — solo asigna uno de los que ya existen. Esa restricción es deliberada: reduce lo que un bug puede romper.

**Mecanismo de reconexión:** devolver el `profile` original + eliminar la sesión activa. El cliente vuelve en segundos.

> **Consecuencia de diseño:** hay que guardar el profile original **antes** de cortar. Si se pierde, la reconexión no sabe a qué plan volver. Va en la fila del outbox (`PreviousState`), no solo en el log — un log se rota, una fila no.

**Recomendación fuerte:** que el profile `MOROSO` no sea "sin internet" sino un **jardín vallado** que redirija a una página *"tu servicio está suspendido por falta de pago — paga aquí"* con el QR de la empresa. Un cliente cortado que ve una página explicativa no genera un ticket; uno que ve "sin internet" sí. Y de paso el chatbot deja de recibir *"no tengo internet"* de gente que en realidad está morosa.

**Ventaja añadida del PPPoE para el escaneo de red:** `/ppp active` da la lista exacta de quién está conectado ahora mismo, con IP, uptime y bytes transferidos, sin necesidad de barrer ARP ni leases. El punto 1 de la sección 3.5 se vuelve casi gratis.

### 3.4 Lo que este proyecto gana de verdad: reconexión instantánea

Hoy, según las reglas de negocio vigentes, **la reactivación es por solicitud manual tras saldar la deuda**. Eso significa que un cliente que paga a las 22:00 se queda sin internet hasta que un humano lo reactive.

Con MikroTik conectado, `PaymentService` encola `RECONECTAR` en cuanto la deuda queda saldada y el cliente vuelve a tener servicio **en menos de un minuto, a cualquier hora**. El chatbot ya tiene el flujo de pago y el QR; solo hay que añadirle la frase *"listo, tu servicio se está reactivando"* y un tool `get_connection_status` para confirmarlo.

**Ese es el mayor retorno de toda esta propuesta**, por encima del corte automático: el corte le ahorra trabajo a la empresa, la reconexión instantánea le quita fricción al cliente y elimina una categoría entera de tickets.

### 3.5 Escaneo de red: qué es viable y qué no

"Escaneo de red" son cuatro cosas distintas con costes muy distintos:

| Qué | Cómo | Valor | Dificultad |
|---|---|---|---|
| **1. Quién está online ahora** | `/ppp active` + `/ip/arp` + `/ip/dhcp-server/lease`, barrido cada 2-5 min | **Altísimo.** Convierte el triaje de tickets de adivinanza en dato. El bot puede decir "veo tu equipo conectado desde hace 3 días" o "confirmo que estás caído". | **Baja** |
| **2. Tráfico por cliente** | Contadores de `/queue simple` o de interfaz | Medio. Reportes de consumo, detección de abuso. | **Baja-media** |
| **3. Vecinos / topología** | `/ip/neighbor`, ARP de la red de gestión | Medio. Descubre switches y APs no documentados → alimenta el inventario. | **Media** |
| **4. Salud óptica de la ONU** | **SNMP/telnet contra la OLT, no contra el MikroTik** | Alto para soporte (potencia de recepción, alarmas) | **Alta.** Depende del fabricante de la OLT, cada uno con su MIB. |

Lo importante que hay que decir claro: **el MikroTik no sabe nada de la fibra.** Sabe si hay una sesión PPPoE viva, no si la potencia óptica del cliente cayó a -30 dBm. Si el objetivo es diagnóstico de fibra, la integración que hace falta es con la **OLT**, y eso es un proyecto aparte con su propio riesgo.

Un derivado casi gratis del punto 1: **detección de caída masiva.** Si 40 clientes de la misma caja NAP se caen en 5 minutos, eso no son 40 tickets, es una avería de troncal. El sistema ya tiene el vínculo cliente→`DistributionBox`, así que agrupar por caja es inmediato → `InternalAlert` a Admin y el chatbot deja de abrir tickets duplicados durante la ventana de incidencia.

### 3.6 Riesgos y salvaguardas

Este es el primer componente del sistema **capaz de dejar sin internet a toda la cartera de clientes a la vez**. Merece un trato distinto al resto del código.

| Riesgo | Salvaguarda |
|---|---|
| Bug en el bucle → corte masivo | **Tope duro por corrida** (p. ej. máx. 20 cortes/hora) + `InternalAlert` obligatoria al superarlo |
| Despliegue nuevo con lógica rota | **Modo simulación por defecto.** Un flag en `SystemConfig` (`Network:Armed`) que arranca en `false`: el agente registra lo que *habría* hecho, sin tocar el router. Se arma a mano tras revisar el log. |
| Comando irreversible | **Nunca borrar, solo deshabilitar / cambiar de profile.** Toda operación tiene su inversa. |
| Reintento duplicado | `IdempotencyKey` por comando; el agente debe ser idempotente (aplicar dos veces "cortar" = cortar una vez) |
| Router inalcanzable | Circuit breaker (ya existe uno en el notifier) + `InternalAlert` + **el estado del cliente NO se marca como cortado hasta que el agente confirme** |
| Deriva entre BD y router | **Job de reconciliación** que compara `Client.Status` contra el estado real y **reporta**, no corrige a ciegas |
| Credenciales comprometidas | Usuario RouterOS dedicado con grupo de permisos mínimo (no `full`), credenciales por router cifradas con `SecretEncryptionService`, y la lista blanca del agente como última barrera |
| Corte indebido | Auditoría completa con estado antes/después, y **ventana horaria**: no cortar de noche ni en fin de semana, cuando nadie puede atender el reclamo |

**Nota regulatoria:** en Bolivia la ATT regula la suspensión de servicios de telecomunicaciones, con requisitos de aviso previo. Automatizar el corte hace que se ejecute *siempre*, sin el filtro humano que hoy absorbe las excepciones. Conviene verificar los plazos de notificación antes de armar el sistema, y que `AVISO_CORTE_24H` sea obligatorio, no opcional.

### 3.7 Dificultad y esfuerzo

| Fase | Contenido | Estimación (parcial, 1 dev) |
|---|---|---|
| N0 | **Descubrimiento**: confirmar versión de RouterOS, modelo de provisioning, qué contiene `WinboxNumber`, y conseguir un router de laboratorio (CHR en una VM es gratis) | 3-5 días |
| N1 | Entidades `NetworkDevice` + `NetworkCommandOutbox` + `ClientLinkStatus` + migración | 0.5 semana |
| N2 | `NetworkAgentController` (3 endpoints) + autenticación del agente + comandos de encolado | 1 semana |
| N3 | **Agente `tbn-netagent`**: poll, lista blanca, cliente RouterOS, reintentos, telemetría | 1.5-2 semanas |
| N4 | Enganche: `AutoSuspendClientJob` → encolar corte; `PaymentService` → encolar reconexión | 0.5 semana |
| N5 | Barrido de estado (online/offline) + panel "Estado de red" + detección de caída masiva | 1.5 semanas |
| N6 | Frontend: routers, cola de comandos, badge de conexión en la ficha del cliente | 1 semana |
| N7 | Chatbot: tool `get_connection_status` + flujo de reconexión tras pago | 0.5 semana |
| N8 | Notifier: `AVISO_CORTE_24H`, `CORTE_APLICADO`, `SERVICIO_REACTIVADO` | 0.5 semana |
| **Total** | | **7-9 semanas a tiempo parcial** |

Más el coste no-software: un equipo siempre encendido en la red del ISP, UPS, y alguien que lo mantenga encendido. Si ese equipo se apaga, los cortes se encolan y no pasa nada grave (el outbox aguanta), pero **la reconexión tras pago también se para** — y esa sí es visible para el cliente. Vigilar el latido del agente es parte del alcance, no un extra.

### 3.8 Sobre la librería RouterOS

| Vía | Cuándo | Coste |
|---|---|---|
| **REST API** (`/rest/...`, HTTPS) | **RouterOS v7.1+** | Cero dependencias: `HttpClient` y ya. **Preferible.** |
| **API binaria** (8728 / 8729 con TLS) | RouterOS v6 | Necesita `tik4net` (MIT, madura) o ~300 líneas de protocolo a mano |
| SSH + parseo de texto | Nunca si se puede evitar | Frágil, se rompe con cada cambio de formato |

Si el agente se escribe en Python en vez de C#, `librouteros` cubre ambos casos y el agente comparte forma con el notifier que ya existe. **Esa es probablemente la mejor decisión**: un cuarto servicio Python pequeño, hermano del notifier, en vez de un quinto stack.

---

## 4. Cómo queda todo integrado

| Servicio | Inventario | Red / MikroTik |
|---|---|---|
| **Backend** | Contexto `Inventory`: 6 entidades, repos, CQRS, controlador, job de mínimos, kardex exportable | Contexto `Network`: outbox de comandos, endpoints del agente, telemetría, job de reconciliación; `AutoSuspendClientJob` y `PaymentService` pasan a encolar |
| **Frontend** | Grupo "Red": 4 páginas + pestaña de equipos en la ficha del cliente + selector de serial al cerrar instalación | Panel de routers, cola de comandos con su estado, badge online/offline en la ficha, mapa de cobertura coloreado por estado real |
| **Chatbot** | (opcional) el técnico consulta stock por WhatsApp | `get_connection_status` — respuesta con dato real; supresión de tickets durante avería masiva; confirmación de reconexión tras pago |
| **Notifier** | — | 3 tipos nuevos: `AVISO_CORTE_24H`, `CORTE_APLICADO`, `SERVICIO_REACTIVADO` (solo enum + `NotifConfig` + plantilla + migración) |
| **Nuevo** | — | `tbn-netagent`: servicio on-prem, hermano del notifier |

**Alertas internas** (stock bajo, router caído, caída masiva, tope de cortes superado) van todas por `InternalAlert` + SignalR → la campanita que ya existe. **No por WhatsApp.** Ese canal es del cliente.

---

## 5. Orden recomendado

```
FASE 1  Inventario completo                         5-6 semanas   ← empezar por aquí
FASE 2  N0: descubrimiento de red + lab CHR         1 semana      ← puede solaparse con la 1
FASE 3  Agente + corte/reconexión (modo simulación) 4-5 semanas
FASE 4  Armado en producción, gradual               2 semanas     ← 10 clientes, luego 50, luego todos
FASE 5  Escaneo de estado + caída masiva            2 semanas
FASE 6  (opcional) OLT / salud óptica               3-4 semanas, riesgo alto
```

**Por qué el inventario primero:** no tiene bloqueantes de infraestructura, no puede tumbar la red, y **produce el dato que la fase de red necesita** (qué equipo tiene cada cliente, con qué MAC). Además, mientras se construye, se puede ir haciendo el descubrimiento del punto N0 en paralelo, que es trabajo de campo y no de teclado.

**Por qué el armado gradual:** la fase 4 no es "encender el flag". Es cortar 10 clientes a mano-supervisado, revisar que el estado quedó coherente, y ampliar. La primera vez que el sistema corte a alguien que sí había pagado, la confianza del negocio se pierde de golpe.

---

## 6. El conflicto con el `PLAN_MEJORA_TECNICA_2026-08.md`

Hay que decirlo porque afecta a las estimaciones de arriba: existe un plan de refactor en curso de **13-17 semanas** (fases F0-F9), con F4 a medio camino (sacar EF Core de la capa Application — los commits recientes van por "39 → 34 archivos"). Este análisis suma **12-15 semanas más**. No caben las dos cosas a la vez con un solo desarrollador.

Dos consecuencias prácticas, ambas evitables si se decide ahora:

1. **F4 (DIP: sacar EF de Application).** Los módulos nuevos deben escribirse **ya en el estilo destino** — interfaces de repositorio en Domain, cero `AppDbContext` en Application. Si se escriben al estilo viejo, F4 tendrá que refactorizarlos después: trabajo pagado dos veces.

2. **F6 (migración a inglés en los 4 servicios).** Es la fase más cara del plan y la que toca tres repos. **Todo lo nuevo debería nacer en inglés** (`InventoryItem`, no `ArticuloInventario`). Escribir 12 semanas de código nuevo en español es añadirle carga a la fase más cara del otro plan.

Ninguna de las dos cuesta nada hoy. Las dos cuestan semanas si se descubren en tres meses.

---

## 7. Estado de las decisiones

| # | Pregunta | Estado |
|---|---|---|
| 1 | ¿Cómo están provisionados los clientes? | ✅ **PPPoE con `/ppp secret`** (2026-08-26) |
| 2 | ¿Qué contiene `Client.WinboxNumber`? | ⬜ Pendiente — ver Anexo A, paso 2 |
| 3 | ¿Versión de RouterOS y cuántos routers? | ⬜ Pendiente — ver Anexo A, paso 1 |
| 4 | ¿Dónde corre el agente? | ⬜ Pendiente — ver Anexo B |
| 5 | Inventario: ¿con costes o sin costes? | ⬜ Pendiente — decisión de negocio, no técnica |

Sobre la 5: llevar costo unitario y valorización convierte el módulo en contabilidad y añade ~1 semana. Sin costes es puro control físico (dónde está cada equipo, cuánto queda de cada cosa). **Para la primera versión, sin costes.** Añadirlos después es aditivo: el kardex ya guarda `CostoUnitario` nullable desde el día uno, solo hay que empezar a rellenarlo.

---

## Anexo A — Guía de descubrimiento (fase N0)

Todo esto se responde en 20 minutos con Winbox abierto. No hace falta tocar nada: son comandos de solo lectura.

### Paso 1 — Versión de RouterOS y modelo

En Winbox, abrir **New Terminal** y escribir:

```
/system resource print
```

Interesa la línea `version:`. Si empieza por **7**, hay REST API y el agente no necesita ninguna librería: `HttpClient` contra `https://<router>/rest/ppp/secret` y listo. Si empieza por **6**, hace falta la API binaria (`librouteros` en Python o `tik4net` en C#).

También sale `board-name:` — sirve para saber si el modelo aguantaría correr el agente dentro del propio router (ver Anexo B).

**Cuántos routers:** si todos los clientes PPPoE terminan en un solo equipo, es un router. Se verifica con:

```
/ppp active print count-only
```

Si ese número se parece al total de clientes activos del sistema, es un router único. Si es una fracción, hay varios y el modelo necesita `NetworkDevice` con enrutado por zona.

### Paso 2 — Qué es realmente `WinboxNumber`

Esta es la clave del proyecto entero. En el terminal:

```
/ppp secret print
```

Sale la lista de secrets con su `name`, `profile` y `service`. Ahora hay que **comparar contra la base de datos**. Tomar 5 clientes cualquiera del panel, mirar su campo Winbox, y buscar ese valor en la columna `name` de la lista.

Tres resultados posibles:

| Lo que ves | Qué significa | Trabajo que implica |
|---|---|---|
| El valor de `WinboxNumber` **coincide exactamente** con un `name` de secret | Correspondencia directa | **Ninguno.** El campo se usa tal cual como clave. Ideal. |
| Coincide pero con formato distinto (`TBN-0357` vs `tbn0357`, mayúsculas, guiones) | Correspondencia con normalización | **Bajo.** Una función de normalización y un test. |
| No se parece a nada de la lista | El campo es un número administrativo sin relación con la red | **Alto.** Hace falta una columna nueva (`PppoeSecretName`) y **conciliar cliente por cliente a mano.** Con la cartera actual eso son días de trabajo, no horas. |

> Si sale el tercer caso, conviene saberlo **ahora** y no después de escribir el agente. Es la diferencia entre 7 semanas y 9-10.

Para exportar la lista completa y compararla cómodamente contra la base:

```
/ppp secret print detail file=secrets
```

Eso deja un `secrets.txt` en **Files** del router, descargable con Winbox. Con ese archivo puedo escribir yo el script de conciliación contra la tabla `Clients` y decirte exactamente cuántos casan y cuántos no.

### Paso 3 — Qué profiles existen

```
/ppp profile print
```

Sirve para dos cosas: ver si ya hay algo tipo "MOROSO"/"CORTADO" (muchos ISPs ya lo tienen aunque lo apliquen a mano), y confirmar que cada plan comercial del sistema tiene su profile correspondiente. Si un cliente del plan de 20 Mb tiene profile `default`, el mapeo plan↔profile no existe y hay que construirlo.

### Paso 4 — Usuario dedicado para el agente

Esto sí es una escritura, y es la única que hace falta antes de empezar:

```
/user group add name=tbn-agent policy=read,write,api,test
/user add name=tbn-agent group=tbn-agent password=<generada>
```

Nótese lo que **no** lleva: `full`, `policy=password`, `ftp`, `sniff`. El agente puede leer y modificar secrets, no puede cambiar contraseñas de administrador ni reconfigurar el router. Esa credencial va cifrada en la base con `SecretEncryptionService`.

---

## Anexo B — Dónde corre el agente (aclaración)

Cuando el documento dice "NOC" no se refiere a una sala de operaciones con pantallas. Se refiere, en su versión mínima, a **cualquier computadora que esté siempre encendida y en la misma red que el MikroTik**. Puede ser la PC de la oficina, un mini-PC de 300 Bs, o una Raspberry Pi.

Los requisitos reales son tres:

1. **Que alcance al router** (misma LAN, o ruta hasta él).
2. **Que tenga salida a Internet** (solo saliente, puerto 443 — no hay que abrir nada).
3. **Que esté encendida.** Si se apaga, los cortes se encolan y esperan sin problema, pero **la reconexión tras pago también se para** — y esa sí la nota el cliente. Por eso conviene un UPS, aunque sea pequeño.

Tres opciones, de más simple a menos:

| Dónde | Ventaja | Inconveniente |
|---|---|---|
| **Mini-PC / Raspberry Pi dedicada** | Lo más simple de administrar y depurar. Un servicio `systemd` y ya. | Un equipo más que mantener encendido |
| **Dentro del propio MikroTik** (RouterOS v7 + paquete `container`) | Cero hardware nuevo, cero punto de fallo extra | Solo en modelos con ARM/ARM64 y RAM suficiente (hAP ax², RB5009, CCR2004…). Depurar dentro del router es incómodo. **Verificar con el `board-name` del paso 1.** |
| **La PC de la oficina** | Cero coste | Si alguien la apaga al irse, la reconexión tras pago deja de funcionar esa noche — justo cuando más se usa |

**Recomendación:** empezar en la PC de la oficina o en una VM para la fase de desarrollo y simulación (donde no importa que se caiga), y pasar a un mini-PC con UPS antes de armar el sistema en producción.

**Si no hay ninguna de las tres opciones disponible:** la Parte B queda documentada y sin implementar, y se hace solo el inventario. Ese es un resultado perfectamente razonable — el inventario tiene valor propio y no depende de nada de esto.
