# Módulo de Red — plan completo a nivel comercial

**Fecha:** 2026-08-27
**Sustituye y amplía:** `PLAN_INTEGRACION_MIKROTIK.md`
**Referencias de mercado:** Mikrowisp, WISPHub, Splynx, ISPCube, Sonar, UISP
**Base de datos reales:** 575 secrets, 2 routers, 476 clientes (ver `PLAN_RED_ANALISIS_EXPORTS.md`)

---

## 1. Qué hace el software comercial del sector

Los sistemas de gestión para ISP (Mikrowisp y WISPHub son los dominantes en Bolivia, Perú y Ecuador; Splynx e ISPCube en el cono sur; Sonar y UISP en el mercado anglosajón) convergen en el mismo conjunto de capacidades. Esta es la vara con la que hay que medir el módulo:

| Bloque | Capacidad estándar del mercado | ¿Lo tiene TBN hoy? |
|---|---|:-:|
| **Aprovisionamiento** | Crear la cuenta en el router al activar el cliente, sin pasar por Winbox | ❌ manual |
| | Asignar velocidad según el plan contratado | ❌ manual |
| | Dar de baja la cuenta al cancelar | ❌ manual |
| **Cobranza técnica** | Corte automático por vencimiento | ❌ **el corte lo hace una persona** |
| | Reconexión automática al pagar | ❌ |
| | Jardín vallado con aviso de deuda | ❌ |
| | **Promesa de pago / reconexión de emergencia** | ❌ |
| **Monitoreo** | Estado en línea/caído por cliente | ❌ |
| | Consumo de datos por cliente | ❌ |
| | Gráficas de tráfico | ❌ |
| | Salud de los routers (CPU, memoria, disco) | ❌ |
| | Detección de caída masiva | ❌ |
| **Red** | Gestión de pools de IP y su ocupación | ❌ |
| | Amarre de cuenta a equipo (MAC) | ❌ **caller-id vacío en los 575** |
| | Respaldo automático de configuración | ❌ |
| **Autogestión** | Portal/bot: estado, deuda, pago, reconexión | 🟡 parcial (bot sin datos de red) |
| **Facturación** | Ciclos, mora, recibos | ✅ **ya existe y es sólido** |
| **CRM / Tickets / SLA** | | ✅ **ya existe** |
| **Cobertura / NAP** | | ✅ **ya existe, con PostGIS** |

**La lectura honesta:** el sistema tiene la mitad comercial (facturación, CRM, tickets, cobertura, bot) mejor resuelta que muchos productos del mercado. Lo que le falta es **toda la mitad de red**. Este módulo cierra esa brecha.

---

## 2. La decisión de fondo: API o RADIUS

Es la bifurcación arquitectónica del proyecto y conviene decidirla a conciencia, porque condiciona todo lo demás.

### Cómo lo resuelve cada uno

**Vía API** (manipular `/ppp secret` directamente, lo que planteé hasta ahora). Es lo que hacen Mikrowisp y WISPHub, y lo que domina en ISPs de este tamaño en la región.

**Vía RADIUS** (el router deja de guardar cuentas y consulta a un servidor central en cada autenticación). Es lo que hacen Splynx y Sonar, y lo estándar por encima de unos pocos miles de clientes.

| | API sobre `/ppp secret` | RADIUS |
|---|---|---|
| Fuente de verdad | El router (el sistema sincroniza) | **La base de datos** |
| Los 88 duplicados | Hay que gestionarlos: fan-out a cada router | **Desaparecen por diseño** |
| Corte | Cambiar perfil + expulsar sesión | CoA / Disconnect-Message, instantáneo |
| Consumo de datos | Hay que leerlo por barrido | **Gratis** (accounting nativo) |
| Si el servidor cae | Todo sigue funcionando; los comandos esperan | **Nadie nuevo puede autenticarse** |
| Migración | Aditiva, cliente por cliente, reversible | **Día D para 476 clientes** |
| Complejidad | Media | Alta |

### Recomendación

**Empezar por API. Dejar RADIUS como evolución posible, no como meta obligada.**

Los motivos:

1. **El riesgo de migración es asimétrico.** Con API, si algo sale mal, se afecta a un cliente. Con RADIUS mal configurado, nadie puede conectarse a nada. Con un solo desarrollador y una red en producción, esa asimetría decide.
2. **La disponibilidad se vuelve crítica.** Un RADIUS en un VPS de 5 USD convierte ese VPS en infraestructura crítica del ISP. Habría que duplicarlo.
3. **A 476 clientes, la API es suficiente.** Los productos que dominan este segmento en la región usan API precisamente por eso.
4. **No cierra la puerta.** El modelo de datos que propongo (`ClientNetworkAccount` con perfil y estado por router) es exactamente el que necesitaría un RADIUS después. Si algún día se migra, el trabajo de conciliación ya está hecho.

> **Cuándo reconsiderarlo:** si se superan los ~1500 clientes, si aparecen más de 4-5 routers, o si el consumo de datos por cliente pasa a ser un requisito de facturación. Entonces RADIUS deja de ser opcional.

---

## 3. Catálogo de funcionalidades

Prioridad: **MVP** (sin esto no hay módulo) · **V1** (nivel comercial) · **V2** (diferencial).

### 3.1 Aprovisionamiento — crear y mantener la cuenta en la red

| # | Funcionalidad | Prio |
|---|---|:-:|
| A1 | **Alta automática del secret** al completar la instalación: nombre derivado del TBN y la caja (`0478D@gpon`), contraseña **aleatoria** (no `wilnetcom`+código), perfil según el plan | **V1** |
| A2 | Alta manual desde el panel, con validación de nombre libre en todos los routers | MVP |
| A3 | **Cambio de perfil al cambiar de plan** — inmediato en subidas, diferido a fin de mes en bajadas (regla de negocio ya vigente) | **V1** |
| A4 | Baja de la cuenta al cancelar al cliente (deshabilitar, nunca borrar) | MVP |
| A5 | Elegir router y pool al dar de alta, según la zona y la ocupación | V1 |
| A6 | Regenerar contraseña de un cliente | V1 |

> **A1 es el que más trabajo manual elimina.** Hoy alguien abre Winbox y crea el secret a mano por cada instalación, con una contraseña predecible. Automatizarlo quita un paso, quita errores de tipeo y de paso arregla el esquema de contraseñas.

### 3.2 Cobranza técnica — el corazón del módulo

| # | Funcionalidad | Prio |
|---|---|:-:|
| B1 | **Corte automático** por deuda vencida, enganchado a `AutoSuspendClientJob` | MVP |
| B2 | **Reconexión automática al pagar**, en menos de un minuto, a cualquier hora | **MVP** |
| B3 | Corte y reconexión manual desde el panel, con motivo | MVP |
| B4 | **Jardín vallado**: el cortado ve una página de aviso con su deuda y el QR | **V1** |
| B5 | **Promesa de pago**: el cliente pide N días por el bot, se reconecta con fecha límite y se vuelve a cortar solo al vencer | **V1** |
| B6 | Aviso previo T-24h antes del corte, por WhatsApp | MVP |
| B7 | Corte y reconexión **masivos por zona o caja**, con confirmación | V1 |
| B8 | Lista de **clientes protegidos** que nunca se cortan automáticamente | MVP |
| B9 | **Degradación en lugar de corte**: bajar a 1 Mb en vez de cortar del todo | V2 |

> **B5 (promesa de pago) es estándar en el mercado LatAm y aquí encaja de forma natural**: el chatbot ya gestiona deuda y pagos. El cliente escribe "págame el viernes", el bot le concede 3 días, el sistema reconecta y programa el corte. Reduce llamadas y evita cortes a quien iba a pagar.

### 3.3 Monitoreo

| # | Funcionalidad | Prio |
|---|---|:-:|
| C1 | **Estado en línea/caído** por cliente, con IP, MAC y tiempo conectado | MVP |
| C2 | **Detección de caída masiva por caja** → alerta y supresión de tickets duplicados | **V1** |
| C3 | Consumo de datos por cliente (subida/bajada, por período) | V1 |
| C4 | Gráficas de tráfico por cliente | V2 |
| C5 | **Salud de routers**: CPU, memoria, disco, uptime, temperatura | **V1** |
| C6 | Historial de conexiones y desconexiones por cliente | V1 |
| C7 | Ocupación de pools de IP | V1 |
| C8 | Reporte de disponibilidad por cliente y por caja | V2 |
| C9 | FUP: degradar tras superar una cuota mensual | V2 |

> **C5 no es un adorno.** CALVARIO tiene **68,9 MiB libres de 128 MiB de disco**. Un router que se queda sin espacio deja de registrar y puede fallar al actualizar. Nadie lo está vigilando hoy.

### 3.4 Red y seguridad

| # | Funcionalidad | Prio |
|---|---|:-:|
| D1 | **Amarre de cuenta a equipo** (`caller-id` = MAC) por lotes | **V1** |
| D2 | Alerta cuando la MAC conectada no es la registrada | V1 |
| D3 | **Respaldo automático de la configuración** de cada router, con historial | **V1** |
| D4 | Inventario de cuentas intocables (cámaras, alarmas, pruebas, plazas libres) | MVP |
| D5 | **Reconciliación**: comparar sistema contra red y reportar desviaciones | MVP |
| D6 | Auditoría completa de toda operación con estado antes y después | MVP |

> **D3 sale casi gratis** (`/system backup save` + `/export` por el mismo canal del agente) y es de las cosas que más se agradecen el día que un router falla. Ningún ISP debería no tenerlo.

### 3.5 Autogestión — el bot

| # | Funcionalidad | Prio |
|---|---|:-:|
| E1 | `get_connection_status` — "veo tu equipo conectado desde hace 3 días" | MVP |
| E2 | Aviso de avería masiva en vez de abrir ticket duplicado | V1 |
| E3 | Confirmación de reconexión tras el pago | MVP |
| E4 | Solicitar promesa de pago (B5) | V1 |
| E5 | Consultar consumo del mes | V2 |
| E6 | **Reinicio remoto de la sesión** — el "apaga y enciende" sin llamar a nadie | V1 |

> **E6 resuelve por sí solo una fracción notable de los tickets de "no tengo internet".** Expulsar la sesión PPPoE fuerza la reconexión y arregla los casos de sesión colgada. Es una operación que ya está en la lista blanca del agente.

---

## 3.6 Verificación contra el código real (2026-08-27)

Revisado archivo por archivo tras la pregunta "¿el plan va en base al código actual?". Resultado: la arquitectura se sostiene, pero hay **una contradicción de negocio** y tres simplificaciones.

### 🔴 C1 — La reconexión automática al pagar CONTRADICE una regla vigente

`SuggestReactivationOnDebtClearedHandler` lo dice explícitamente:

> *"Regla de negocio (2026-07-07): al saldar la deuda de un cliente suspendido **NO se reactiva automáticamente**; se genera una solicitud/alerta para que el admin apruebe la reactivación con el flujo existente (botón Reactivar)."*

Mi plan presentaba la reconexión automática como "el mayor retorno del proyecto" **sin notar que va contra una decisión deliberada y documentada**.

**Corrección:** B2 deja de ser automático por defecto. Se implementa como política configurable:

```
Network:AutoReconnectOnPayment   = false   ← por defecto, conserva la regla actual
                                   true    ← reconexión inmediata, decisión del negocio
```

Con `false`, el flujo actual se mantiene intacto (alerta al Admin, botón Reactivar) pero el botón **ahora sí corta y reconecta de verdad** en el router en vez de solo cambiar un estado. Ya es una mejora sustancial sin tocar la política.

> Es posible que la regla se estableciera **porque** reactivar exigía que alguien fuera a Winbox de todos modos. Si es así, automatizarlo la vuelve revisable. Pero eso lo decide el negocio, no el plan.

### 🟢 C2 — El punto de enganche del pago ya existe, y es mejor de lo que describí

No hay que construir nada: `PaymentCreditService:220` ya publica `PaymentRegisteredEvent`, y `SuggestReactivationOnDebtClearedHandler` ya calcula exactamente la condición que hace falta:

```csharp
if (client is null || client.Status != ClientStatus.Suspendido) return;
if (client.Invoices.Any(i => i.IsUnpaid)) return;   // aún debe
```

Encolar el `RESTORE` son **tres líneas dentro de ese handler**, detrás del flag de C1. No es fontanería nueva.

### 🟢 C3 — La notificación de reactivación ya existe

`ReactivateClientCommand` ya publica `NotifType.REACTIVACION` con nombre y plan. El `SERVICIO_REACTIVADO` que propuse es redundante.

**Corrección:** se añaden **3 tipos**, no 4: `AVISO_CORTE_24H`, `CORTE_APLICADO`, `PROMESA_POR_VENCER`.

### 🟢 C4 — Las alertas internas encajan tal cual

`IInternalAlertService.CreateForRoleAsync(role, type, title, message, link)` existe con esa firma exacta. Todas las alertas de §7 se implementan sin tocar la interfaz.

### 🟢 C5 — La autenticación del agente ya tiene patrón establecido

No hay que inventar un esquema. El chatbot se autentica con **usuario de sistema + JWT**: `AuthTokenService` hace login contra `/api/auth/login` con `SISTEMA_BOT_EMAIL`/`SISTEMA_BOT_PASSWORD`, cachea el token 8 h y vuelve a autenticarse al recibir 401.

**Corrección:** el agente copia ese patrón con su propio usuario de sistema y un rol acotado. Nada de tokens estáticos nuevos.

### 🟢 C6 — El enganche del cambio de plan está localizado

`ApplyScheduledPlanChangesJob:123` (`cambio.Client.ChangePlan(cambio.NewPlanId)`) es el punto exacto donde encolar `CHANGE_PROFILE`. El job ya corre bajo `JobLease` y con catch-up diario.

### Lo que quedó confirmado sin cambios

`NotifOutbox` + worker Python como patrón del agente · `JobLease` con advisory locks · `SecretEncryptionService` (AES-256) para credenciales de routers · `INotifPublisher.PublishAsync(tipo, clienteId, telefono, dict)` · `IBoxReservationService` y sus tres puntos de llamada · la transacción de `CompleteInstallationHandler` · las cinco políticas de autorización · migraciones a mano (ADR-004) · el grupo "Red" del sidebar.

---

## 4. Integraciones con lo que ya existe

| Módulo actual | Qué le aporta el módulo de red | Qué le pide |
|---|---|---|
| **Facturación** | Corte y reconexión reales, no solo un cambio de estado | Estado de deuda, evento "deuda saldada" |
| **Pagos** | Reconexión en menos de un minuto | Evento de pago confirmado |
| **Clientes** | Badge en línea/caído, historial de conexión, equipo y MAC | `Status`, `PlanId`, `TbnCode` |
| **Instalaciones** | Alta automática del secret al cerrar la instalación | Plan, caja, cliente |
| **Cobertura / NAP** | Cliente↔caja para 417 clientes desde el nombre del secret; mapa coloreado por estado real | `DistributionBox` |
| **Tickets / SLA** | Estado de red en el triaje; supresión de duplicados en avería | Tipos de ticket |
| **Inventario** (planeado) | MAC de 426 equipos ya conectados, para sembrar sin trabajo de campo | Serial y MAC por equipo |
| **Chatbot** | Datos reales en vez de suposiciones | Tools nuevas |
| **Notificaciones** | 4 tipos nuevos | Outbox y plantillas |
| **Dashboard** | Clientes en línea, cortados, routers caídos, cajas con incidencia | — |

### 4.1 El círculo que se cierra

```
Cliente no paga
   └─▶ AutoSuspendClientJob marca Suspendido
        └─▶ encola CUT en todos sus routers
             └─▶ agente cambia perfil a MOROSO y expulsa la sesión
                  └─▶ el cliente abre el navegador y ve el aviso con su QR
                       └─▶ paga por el bot
                            └─▶ PaymentService detecta deuda saldada
                                 └─▶ encola RESTORE
                                      └─▶ agente devuelve el perfil original
                                           └─▶ el bot confirma: "listo, ya tienes servicio"
```

**Hoy, de esta cadena, funcionan dos pasos.** El resto es una persona con Winbox, o no ocurre.

---

## 5. Modelo de datos

```
NetworkDevice            Router
  Name · Host · ApiPort · Username · PasswordEnc(AES) · RouterOsVersion
  Model · CutProfileName · CoverageZoneId? · IsActive
  LastSeenAt · LastError · CpuLoad · FreeMemoryMb · FreeDiskMb · Uptime

NetworkProfile           Catálogo real por router
  NetworkDeviceId · Name · SpeedMbDown · SpeedMbUp · PoolName
  PlanId? · IsCutProfile · IsActive

NetworkPool              Pools de IP y su ocupación
  NetworkDeviceId · Name · RangeFrom · RangeTo · Total · InUse

ClientNetworkAccount     Dónde vive el cliente en la red
  ClientId · NetworkDeviceId · SecretName · BoxLetter
  CurrentProfile · RestoreProfile · IsDisabledOnRouter
  BoundMac? · LastSyncAt
  UNIQUE(NetworkDeviceId, SecretName)

NetworkCommandOutbox     Cola de intenciones
  Type: PROVISION|CUT|RESTORE|CHANGE_PROFILE|BIND_MAC|KICK|BACKUP|SYNC
  ClientId? · NetworkDeviceId · SecretName · IdempotencyKey(único)
  PreviousState jsonb · Payload jsonb
  Status · Attempts · LeasedUntil · NextAttemptAt · Result jsonb
  CreatedBy · CreatedAt · ProcessedAt

ClientLinkStatus         Estado en vivo
  ClientId · NetworkDeviceId · IsOnline · IpAddress · MacAddress
  UptimeSeconds · BytesIn · BytesOut · LastSeenOnlineAt

NetworkSessionLog        Historial de sesiones
  ClientId · StartedAt · EndedAt · BytesIn · BytesOut · IpAddress · Reason

PaymentPromise           Promesa de pago (B5)
  ClientId · GrantedAt · ExpiresAt · GrantedBy(bot|panel) · Honored?

NetworkConfigBackup      Respaldos
  NetworkDeviceId · TakenAt · SizeBytes · StoragePath · Checksum

NetworkIncident          Avería masiva detectada
  BoxLetter? · NetworkDeviceId? · DetectedAt · ResolvedAt
  AffectedCount · Status · TicketId?
```

---

## 6. Pantallas

**Grupo "Red" del sidebar** (hoy solo tiene Cobertura):

| Ruta | Contenido | Roles |
|---|---|---|
| `/red/estado` | Panel general: clientes en línea/caídos, routers, incidencias abiertas, cortados | Admin, Operador |
| `/red/routers` | Los 3 routers: salud, versión, disco, uptime, último contacto, respaldos | Admin |
| `/red/comandos` | Cola: pendientes, en curso, fallidos. Reintentar, cancelar, **interruptor de emergencia** | Admin |
| `/red/cuentas` | Las 575 cuentas: cliente, secret, router, perfil, estado. Desviaciones resaltadas | Admin, Operador |
| `/red/incidencias` | Averías masivas por caja, con los clientes afectados | Admin, Operador, Tecnico |
| `/red/pools` | Ocupación de los pools de IP | Admin |

**En pantallas existentes:**

- **Ficha del cliente** — pestaña "Red": estado en vivo, IP, MAC, tiempo conectado, perfil, caja, historial de conexiones, consumo del mes. Botones: **cortar**, **reconectar**, **reiniciar sesión**, **conceder promesa de pago**.
- **Mapa de cobertura** — clientes coloreados por estado real de conexión; las cajas con incidencia en rojo.
- **Dashboard** — tarjetas de en línea / cortados / routers caídos.
- **Ticket** — el estado de red del cliente visible al abrirlo, sin salir de la pantalla.

---

## 7. Notificaciones

Cuatro tipos nuevos en `NotifType` (enum + `NotifConfig` + plantilla + migración; el notifier no cambia):

| Tipo | Cuándo |
|---|---|
| `AVISO_CORTE_24H` | 24 h antes del corte automático |
| `CORTE_APLICADO` | Al confirmarse el corte |
| `SERVICIO_REACTIVADO` | Al confirmarse la reconexión |
| `PROMESA_POR_VENCER` | 12 h antes de que expire la promesa de pago |

**Las alertas internas** (router caído, disco lleno, avería masiva, tope de cortes superado, agente sin latido, traspaso de desviaciones) van por `InternalAlert` + SignalR. Nunca por WhatsApp: ese canal es del cliente.

---

## 8. Seguridad y operación

### 8.1 Lo que hay que arreglar, detectado en el análisis

| Hallazgo | Acción | Fase |
|---|---|---|
| `caller-id` vacío en los 575 | Amarre de MAC por lotes (D1) | V1 |
| Contraseñas `wilnetcom`+código | Contraseñas aleatorias en altas nuevas (A1); las viejas se regeneran gradualmente | V1 |
| Panel web en **HTTP sin cifrar**, puerto 7904 | Restringir por IP al tocar el firewall | M5 |
| WinBox abierto a Internet | Restringir a las IPs de administración | M5 |
| Cuentas de prueba activas (`prueba/prueba`, `54321`) | Desactivar | M5 |
| Un solo usuario para todos los routers | Usuario propio del agente, por router, permisos mínimos | M5 |
| Perfil huérfano `*4` con 16 referencias | Limpiar | M2 |
| **Los `.txt` del export siguen en el router** | **Borrarlos: contienen todas las contraseñas PPPoE en claro** | **ya** |

> **Eso último, hoy.** Los archivos `secrets-CALVARIO.txt` y `secrets-IEF.txt` quedaron en `Files` de cada router con las contraseñas legibles. En WinBox: **Files** → seleccionarlos → **Remove**.

### 8.2 Salvaguardas del automatismo

1. **Modo simulación por defecto** (`Network:Armed=false`)
2. **Tope de cortes por hora**, superarlo detiene la cola y alerta
3. **Ventana horaria**: no cortar de noche ni en fin de semana
4. **Solo operaciones reversibles**: nunca `remove`
5. **Idempotencia leyendo el estado real** antes de actuar
6. **Doble lista de intocables**: backend y agente
7. **El estado del cliente cambia solo tras confirmación del router**
8. **La reconciliación reporta, nunca corrige sola**
9. **Interruptor de emergencia** en el panel
10. **Lista blanca de 8 operaciones** en el agente; nada de comandos arbitrarios

### 8.3 Observabilidad

- Latido del agente cada 60 s; alerta a los 5 min de silencio
- Métricas: comandos por estado, latencia por router, tasa de error, cortes y reconexiones del día
- Log estructurado con el `IdempotencyKey` como hilo conductor
- `/red/comandos` como panel de operación en vivo

---

## 9. Fases

| Fase | Contenido | Dur. | Riesgo | Entrega valor |
|---|---|---|---|---|
| **M0** | Tercer router, VPS, borrar los `.txt` del router | 2 d | — | — |
| **M1** | Entidades, migración, repos, panel de routers | 1 sem | bajo | — |
| **M2** | Conciliación de los 476, siembra de cuentas y cajas, limpieza | 3 d | medio | Inventario de red real |
| **M3** | Outbox + endpoints del agente + autenticación | 1 sem | bajo | — |
| **M4** | Agente: lista blanca, `librouteros`, resiliencia, VPS | 2 sem | medio | — |
| **M5** | Preparar routers: usuario, certificado, API, perfil MOROSO, firewall, higiene | 2 d | **alto** | Seguridad mejorada |
| **M6** | **Solo lectura en producción**: barrido, estado en vivo, salud de routers, reconciliación, respaldos | 1 sem | bajo | 🟢 **Alto** |
| **M7** | Panel de red, badge en ficha, mapa, dashboard, avería masiva | 1.5 sem | bajo | 🟢 **Alto** |
| **M8** | Bot: estado de conexión, aviso de avería, reinicio de sesión | 0.5 sem | bajo | 🟢 Alto |
| **M9** | CUT/RESTORE en simulación + enganche con jobs y pagos + notificaciones | 1.5 sem | medio | — |
| **M10** | **Armado gradual**: 5 → 20 → 50 → todos | 2 sem | **alto** | 🟢 **El objetivo** |
| **M11** | Jardín vallado + promesa de pago | 1 sem | medio | 🟢 Alto |
| **M12** | Aprovisionamiento automático (A1, A3) | 1 sem | medio | 🟢 Alto |
| **M13** | Amarre de MAC + consumo de datos + pools | 1 sem | medio | medio |
| | **Total** | **~13-15 sem** | | |

### El orden importa más que la duración

**M6, M7 y M8 entregan valor real sin cortar a nadie.** Tres semanas de trabajo, riesgo bajo, y ya tienes: estado en vivo de 476 clientes, salud de los routers, detección de avería masiva, respaldos automáticos, el bot respondiendo con datos reales y el informe de desviaciones entre lo que dice el sistema y lo que dice la red.

**Si el proyecto se detuviera en M8, habría valido la pena.** Trátalo como hito con entrega propia, no como escalón hacia el corte.

**M10 no es encender un flag.** Es cortar 5 clientes con alguien mirando la pantalla, verificar que el estado quedó coherente y que la reconexión funciona, y ampliar. La primera vez que el sistema corte a quien sí pagó, la confianza del negocio se pierde y no vuelve.

---

## 10. Criterios de aceptación

**Del corte:** se aplica en todos los routers donde exista el secret · la sesión activa se expulsa · el perfil anterior queda guardado · el cliente no figura cortado hasta que el router confirma · repetirlo no hace nada · un cliente protegido nunca se corta.

**De la reconexión:** menos de 60 s desde el pago confirmado · vuelve al perfil **exacto** anterior · funciona a cualquier hora · si el perfil no existe, no adivina: alerta.

**Del barrido:** completo cada 5 min por router · si un router no responde, los demás siguen · las desviaciones se reportan sin corregirse.

**Del agente:** no ejecuta nada fuera de la lista blanca · si muere a media faena, el comando se recupera al vencer el lease · su silencio genera alerta en 5 min.

---

## 11. Lo que sigue abierto

| # | Qué | Quién decide |
|---|---|---|
| 1 | El tercer router | tú — exportar |
| 2 | Conciliación real de los 476 | tú — `railway login` |
| 3 | ¿La caja es la letra sola o letra+número (`H2`, `A7`)? | tú |
| 4 | ¿Los 88 duplicados son redundancia o basura? | tú |
| 5 | Clientes en perfiles de 5M y 40M sin plan comercial | negocio |
| 6 | Plazos de aviso previo que exige la ATT | negocio / legal |
| 7 | ¿Degradar a 1 Mb en vez de cortar (B9)? | negocio |
| 8 | ¿Cuántos días de promesa de pago y con qué límite? | negocio |
| 9 | Actualizar CALVARIO (v6.45.9, de 2020) | **proyecto aparte** |
