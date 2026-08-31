# Plan de integración MikroTik — corte, reconexión y estado de red

**Fecha:** 2026-08-27
**Base:** `PLAN_RED_ANALISIS_EXPORTS.md` (575 secrets reales analizados)
**Estado:** plan de implementación — listo para ejecutar
**Modalidad:** un desarrollador, sistema en producción

---

## 0. Decisiones cerradas

Todo esto ya no se discute; está confirmado con datos o por el usuario.

| Decisión | Valor | Origen |
|---|---|---|
| Provisioning | PPPoE con `/ppp secret` | confirmado |
| Mecanismo de corte | Cambio de `profile` a `MOROSO` + expulsión de sesión | diseño |
| Protocolo | **API binaria** (8729/TLS) — no REST | flota mixta v6.45.9 y v7.6 |
| Dónde corre el agente | **VPS con IP fija**, ~5 USD/mes | los routers tienen IP pública |
| Lenguaje del agente | **Python** — hermano del notifier, con `librouteros` | reusa patrón y experiencia |
| Nº de routers | 2 confirmados (CALVARIO, IEF) + 1 pendiente | exports |
| Alcance del corte | **Todos los routers donde exista el secret** | 88 clientes duplicados |
| Identificador del cliente | El número del secret (`0457D` → 457 → `TBN-0457`) | 476 números únicos |
| **La letra = la caja** | `0457D` → caja D | **confirmado por el usuario** |
| Perfil ↔ plan | Mapeo explícito por router, nunca deducido | 4 perfiles distintos para 30 Mb |

---

## 1. Arquitectura

```
┌──────────────────── Railway ─────────────────────┐
│                                                  │
│  AutoSuspendClientJob ─┐                         │
│  PaymentService ───────┼─▶ NetworkCommandOutbox  │
│  Panel admin ──────────┘                         │
│                                                  │
│  NetworkAgentController                          │
│    GET  /api/net-agent/commands    ◀── token     │
│    POST /api/net-agent/results         propio    │
│    POST /api/net-agent/telemetry                 │
│                                                  │
│  NetworkReconciliationJob (compara y reporta)    │
└──────────────────────────────────────────────────┘
                    ▲
                    │  HTTPS saliente. Ningún puerto abierto.
                    │
┌───────────────────┴──── VPS (IP fija) ───────────┐
│  tbn-netagent (Python)                           │
│   · poll de comandos cada 10 s                   │
│   · traduce INTENCIÓN → operación de lista blanca│
│   · barrido de secrets + sesiones cada 5 min     │
│   · circuit breaker por router                   │
└──────────────────────────────────────────────────┘
        │ API binaria 8729 (TLS)
        ├──▶ CALVARIO  200.58.84.212   v6.45.9  452 secrets
        ├──▶ IEF       200.58.82.113   v7.6     123 secrets
        └──▶ (tercero) 181.115.154.138  ?        ?

   Firewall de cada router: 8729 solo desde la IP del VPS.
```

**El principio que gobierna todo:** el backend envía **intenciones** (`CORTAR cliente X`). El agente las traduce a operaciones de una **lista blanca cerrada**. Nunca viaja un comando de RouterOS por la red. Si alguien compromete el backend o la base, no puede ejecutar nada arbitrario en la red del ISP.

---

## 2. Modelo de datos

### 2.1 Entidades nuevas (backend)

```
NetworkDevice                 Un router
  · Name              "CALVARIO"
  · Host              "200.58.84.212"      · ApiPort  8729
  · Username / PasswordEnc                 ← cifrado con SecretEncryptionService
  · RouterOsVersion   "6.45.9"             · Model  "CCR1009-7G-1C-1S+"
  · CutProfileName    "MOROSO"             ← el perfil de corte EN ESTE router
  · IsActive · LastSeenAt · LastError

NetworkProfile                Catálogo real de perfiles, por router
  · NetworkDeviceId · Name  "plan-30MX-IP20"
  · SpeedMb  30     · PoolName "pool-PPPoE-IP20"
  · PlanId?                              ← mapeo al plan comercial (nullable)
  · IsCutProfile: bool

ClientNetworkAccount          Dónde vive cada cliente en la red
  · ClientId · NetworkDeviceId
  · SecretName        "0457D@gpon"        ← nombre COMPLETO y exacto
  · CurrentProfile    "plan-30MX-IP20"
  · RestoreProfile    "plan-30MX-IP20"    ← a dónde volver al reconectar
  · BoxLetter         "D"                 ← la caja (§2.2)
  · IsDisabledOnRouter · LastSyncAt
  UNIQUE (NetworkDeviceId, SecretName)

  → Un cliente puede tener VARIAS filas: una por router. Los 88 duplicados.

NetworkCommandOutbox          La cola de intenciones
  · Type: CUT | RESTORE | BIND_MAC | SYNC_ONE
  · ClientId · NetworkDeviceId · SecretName
  · IdempotencyKey (único)
  · PreviousState  jsonb      ← el perfil original, ANTES de tocar nada
  · Payload        jsonb
  · Status: PENDING | LEASED | DONE | FAILED | SKIPPED
  · Attempts · LeasedUntil · NextAttemptAt
  · Result jsonb · CreatedAt · ProcessedAt · CreatedBy

ClientLinkStatus              Estado en vivo (read-model del barrido)
  · ClientId · NetworkDeviceId
  · IsOnline · IpAddress · MacAddress · Uptime
  · LastSeenOnlineAt · UpdatedAt
```

### 2.2 La caja: lo que se gana con la letra confirmada

**417 de 476 clientes traen la caja en el nombre del secret.** El sistema ya tiene `DistributionBox`, así que esto se aprovecha en tres direcciones:

1. **Sembrar `DistributionBox`** con las cajas A–J que aún no existan como registro.
2. **Ligar cliente → caja** para los 417, sin trabajo de campo. Hoy esa relación solo existe para los que pasaron por el flujo de instalación nuevo.
3. **Verificar**: cuando la caja que dice el secret y la que dice la instalación no coinciden, hay un dato malo en algún lado. Sale gratis y encuentra errores reales.

Con eso, la **detección de avería masiva** (§7.2) funciona desde el primer día: si 12 clientes de la caja `D` se caen a la vez, no son 12 tickets, es un problema de troncal en esa caja.

> **Matiz a resolver en la Fase 2:** algunos comentarios llevan más detalle que la letra sola — `0228H2P3` (¿caja H2, puerto 3?), `0141A7`, `0155-F3`. Si el identificador real de caja es letra+número, hay 10 grupos con varias cajas cada uno. El script de conciliación extrae esos sufijos y te enseña el catálogo completo para que lo confirmes antes de sembrar nada.

**Los 147 sin letra** (los números 1–142, los más antiguos) se quedan sin caja hasta que alguien lo resuelva a mano o pasen por una visita técnica.

---

## 3. El agente

### 3.1 Lista blanca de operaciones

El agente **solo sabe hacer estas cinco cosas**. No hay una función genérica de "ejecutar comando".

| Operación | RouterOS | Usada por |
|---|---|---|
| `read_secrets()` | `/ppp/secret/print` | barrido |
| `read_active()` | `/ppp/active/print` | barrido |
| `set_profile(secret, profile)` | `/ppp/secret/set` | CUT / RESTORE |
| `kick_session(secret)` | `/ppp/active/remove` | CUT / RESTORE |
| `set_caller_id(secret, mac)` | `/ppp/secret/set` | BIND_MAC |

**Prohibido por construcción:** `add`, `remove` de secrets, cualquier `/system`, `/user`, `/ip firewall`, `/interface`. Si un comando del backend pide algo fuera de la lista, el agente lo rechaza y alerta.

### 3.2 Las cuentas intocables

Antes de tocar nada, el agente comprueba una lista de exclusión que se evalúa **en el agente, no solo en el backend**:

```
· Cualquier secret sin @gpon        → camara1/2/3, alarma10, casaDelia,
                                       prueba, 54321, 12345, 123456, DIEGO
· Comentario que contenga "libre"   → las 21 plazas de reserva
· Secret sin ClientNetworkAccount   → todo lo que el sistema no reconoce
· Secret en la lista negra manual   → configurable en el panel
```

Doble barrera a propósito: si un fallo del backend encolara un corte contra `camara1`, el agente lo rechaza igual.

### 3.3 El ciclo

```python
while True:
    cmds = backend.get_commands(agent_id)        # HTTPS saliente
    for c in cmds:
        if not permitido(c):                     # lista blanca + intocables
            backend.report(c, SKIPPED, motivo); continue
        estado = router.read_secret(c.secret)    # estado ACTUAL, siempre
        if ya_esta_como_se_pide(estado, c):      # idempotencia real
            backend.report(c, DONE, 'no-op'); continue
        if MODO_SIMULACION:
            backend.report(c, SKIPPED, 'dry-run: habría hecho X'); continue
        aplicar(c)
        backend.report(c, DONE, estado_antes=estado)
    if toca_barrido():
        backend.telemetry(router.read_secrets(), router.read_active())
    sleep(10)
```

**La idempotencia no se basa en un flag, se basa en leer el estado real antes de actuar.** Aplicar "cortar" dos veces sobre un cliente ya cortado es un no-op, no un segundo corte.

### 3.4 Resiliencia

Se calca del notifier, que ya lleva esto en producción:

- **Circuit breaker por router** — si CALVARIO no responde 5 veces, se abre el circuito 60 s y se alerta. IEF sigue funcionando.
- **Backoff exponencial** por comando, con tope de intentos.
- **Dead-letter**: tras N fallos, el comando queda `FAILED` con su error y genera `InternalAlert`.
- **Lease con TTL** en la cola: si el agente muere a media faena, el comando vuelve a estar disponible al vencer el lease.
- **Heartbeat**: si el agente lleva más de 5 minutos sin aparecer, alerta. Sin esto, la reconexión tras pago se para en silencio.

---

## 4. Los comandos, en detalle

### 4.1 CUT — cortar el servicio

**Precondiciones (todas, o no se ejecuta):**
- El cliente tiene `ClientNetworkAccount` en este router
- No está en la lista de intocables
- El sistema lo tiene como `Suspendido`
- No se ha superado el tope horario de cortes
- El modo está armado

**Ejecución, por cada router donde exista el secret:**

```
1. Leer el secret → guardar profile actual en PreviousState
2. Si ya está en el perfil de corte → no-op, DONE
3. set_profile(secret, "MOROSO")
4. kick_session(secret)          ← sin esto sigue navegando hasta que se caiga solo
5. Reportar: perfil anterior, perfil nuevo, si había sesión activa
```

**El corte se considera exitoso solo cuando TODOS los routers confirman.** Si uno falla, el cliente queda en `CUT_PARCIAL` y se alerta: es el escenario de los 88 duplicados, y es la diferencia entre cortar y creer que cortaste.

### 4.2 RESTORE — reconectar

Idéntico a la inversa, y **la operación más importante del proyecto**:

```
1. Leer RestoreProfile de ClientNetworkAccount
2. set_profile(secret, RestoreProfile)     ← el original EXACTO, no el del plan
3. kick_session(secret)                    ← fuerza reconexión inmediata
```

Se dispara **automáticamente desde `PaymentService`** en cuanto la deuda queda saldada. El cliente que paga a las 22:00 tiene internet en menos de un minuto, sin que nadie intervenga.

> **Regla dura:** si `RestoreProfile` está vacío o apunta a un perfil que ya no existe en ese router, **no se restaura a ciegas**: se alerta y se pide intervención. Poner "el perfil que le toca por su plan" movería al cliente de subred.

### 4.3 BIND_MAC — atar la cuenta al equipo

Rellena `caller-id` con la MAC que el propio cliente lleva usando. Cierra el agujero de las contraseñas predecibles sin tocar ninguna contraseña.

**No se ejecuta en masa el primer día.** Se aplica por lotes, empezando por clientes con sesión estable de semanas, y solo cuando se ha visto la misma MAC en varios barridos seguidos. Si el cliente cambia de equipo, hay que liberar el binding — por eso se engancha al inventario: un cambio de ONU registrado dispara la actualización del `caller-id`.

### 4.4 SYNC — el barrido

Cada 5 minutos, por router: leer todos los secrets y todas las sesiones activas, y mandarlo al backend, que actualiza `ClientLinkStatus` y detecta desviaciones.

**Es de solo lectura y no depende del modo armado.** Se puede tener el barrido funcionando semanas antes de habilitar el primer corte — y conviene: da visibilidad sin riesgo, y valida la conciliación contra la realidad.

---

## 5. Preparación de los routers

Una vez por router. **Esto sí modifica configuración**, así que va con calma y fuera de horario.

```
# 1 · Usuario del agente, permisos mínimos
/user group add name=tbn-agent policy=read,write,api,test
/user add name=tbn-agent group=tbn-agent password=<distinta por router>

# 2 · Certificado (no hay ninguno: api-ssl no puede activarse sin él)
/certificate add name=api-cert common-name=<host> key-size=2048 days-valid=3650
/certificate sign api-cert

# 3 · API sobre TLS, solo desde el VPS
/ip service set api-ssl certificate=api-cert address=<IP_VPS> disabled=no
/ip service set api disabled=yes        # el 8728 en claro se queda cerrado

# 4 · El perfil de corte — NO existe hoy, hay que crearlo
/ip pool add name=pool-moroso ranges=10.255.255.10-10.255.255.250
/ppp profile add name=MOROSO local-address=10.255.255.1 \
    remote-address=pool-moroso rate-limit="1M/1M" dns-server=10.255.255.1
```

Y de paso, ya que se toca el firewall (§8.3): restringir `www` (hoy en HTTP sin cifrar, puerto 7904) y `winbox` a las IPs desde las que se administra.

> **El sistema nunca crea ni modifica perfiles.** Solo asigna uno de los que existen. Es lo que acota el daño posible de un fallo.

**El jardín vallado** —que quien esté cortado vea "tu servicio está suspendido, paga aquí" con el QR— es una regla de firewall en el perfil MOROSO. Vale la pena: un cliente cortado que ve una página no abre ticket; uno que ve "sin internet", sí.

---

## 6. Enganche con el backend existente

| Punto | Archivo | Qué cambia |
|---|---|---|
| Suspensión automática | `AutoSuspendClientJob` | Tras `client.Suspend()`, encolar `CUT` por cada `ClientNetworkAccount` |
| Suspensión manual | `SuspendClientCommand` | Igual |
| Reactivación | `ReactivateClientCommand` | Encolar `RESTORE` |
| **Pago que salda la deuda** | `PaymentService` / `SuggestReactivationOnDebtClearedHandler` | **Encolar `RESTORE` automático** — el mayor retorno del proyecto |
| Baja de cliente | `CancelClientCommand` | `CUT` definitivo + marcar la cuenta |
| Cambio de plan aplicado | `ApplyScheduledPlanChangesJob` | Cambiar `RestoreProfile` al perfil del nuevo plan |

**Regla de oro: nada de esto llama al router.** Todos encolan en `NetworkCommandOutbox` y siguen. Si el router está caído, el cliente no queda a medias: el comando espera.

**El estado del cliente no cambia hasta que el agente confirma.** Marcar `Suspendido` antes de que el corte ocurra crearía la mentira que este módulo existe para eliminar.

---

## 7. Lo que se puede leer sin cortar nada

### 7.1 Estado de conexión en vivo

De `/ppp/active`: quién está online, con qué IP, MAC y desde cuándo. Ya se comprobó que **las 426 sesiones activas reportan MAC**.

- **Ficha del cliente**: badge 🟢 en línea / 🔴 caído, con "desde hace 4 semanas"
- **Chatbot**: tool `get_connection_status` — deja de adivinar. *"Veo tu equipo conectado desde hace 3 días"* o *"confirmo que estás caído"*
- **Triaje de tickets**: el técnico sabe si el cliente está caído antes de llamarlo

### 7.2 Avería masiva por caja

Con la letra = caja, esto sale casi gratis: si N clientes de la misma caja se caen en menos de X minutos, **no son N tickets, es una avería de troncal**.

- `InternalAlert` a Admin con la caja y los clientes afectados
- El chatbot **suprime la creación de tickets duplicados** durante la ventana de incidencia y responde "sabemos del problema en tu zona, estamos trabajando"

Esto por sí solo justifica el barrido, sin necesidad de cortar a nadie.

### 7.3 Desviaciones que se detectan solas

El `NetworkReconciliationJob` compara sistema vs router y **reporta, nunca corrige a ciegas**:

| Desviación | Qué significa |
|---|---|
| Activo en el sistema, deshabilitado en el router | Alguien cortó a mano y no se registró |
| Suspendido en el sistema, con perfil normal | El corte no se aplicó |
| Secret en el router sin cliente | Cliente no registrado, o cuenta olvidada |
| Cliente sin secret | No tiene servicio configurado |
| Caja del secret ≠ caja de la instalación | Dato malo en alguno de los dos |
| MAC conectada ≠ MAC del inventario | Equipo cambiado sin registrar |

---

## 8. Salvaguardas

Este es el primer componente capaz de dejar sin internet a toda la cartera a la vez.

| # | Salvaguarda | Detalle |
|---|---|---|
| 1 | **Modo simulación por defecto** | `Network:Armed=false`. El agente registra lo que *habría* hecho. Se arma a mano tras revisar el log |
| 2 | **Tope por hora** | Máx. 20 cortes/hora. Superarlo detiene la cola y alerta |
| 3 | **Ventana horaria** | No cortar de noche ni fines de semana: nadie puede atender el reclamo |
| 4 | **Solo operaciones reversibles** | Nunca `remove`. Cambiar de perfil siempre tiene inversa |
| 5 | **Idempotencia por lectura** | Se lee el estado real antes de actuar |
| 6 | **Doble lista de intocables** | En backend y en agente |
| 7 | **Estado tras confirmación** | El cliente no figura cortado hasta que el router lo confirma |
| 8 | **Reconciliación que reporta** | Nunca corrige automáticamente |
| 9 | **Auditoría completa** | `AuditLog` con perfil antes/después, router y autor |
| 10 | **Interruptor de emergencia** | Un botón en el panel que vacía la cola y desarma el sistema |

**Nota regulatoria:** la ATT regula la suspensión de servicios en Bolivia, con requisitos de aviso previo. Automatizar el corte hace que ocurra *siempre*, sin el filtro humano que hoy absorbe las excepciones. Verificar los plazos antes de armar, y que `AVISO_CORTE_24H` sea obligatorio, no opcional.

---

## 9. Fases

| Fase | Contenido | Duración | Riesgo |
|---|---|---|---|
| **M0** | Tercer router + VPS contratado + `railway login` para la conciliación | 2 días | — |
| **M1** | Entidades + migración a mano + repos + panel de routers | 1 sem | bajo |
| **M2** | **Conciliación**: 476 clientes ↔ secrets, siembra de `ClientNetworkAccount` y de las cajas | 3 días | medio (datos) |
| **M3** | `NetworkCommandOutbox` + `NetworkAgentController` + autenticación del agente | 1 sem | bajo |
| **M4** | **Agente**: lista blanca, `librouteros`, resiliencia, empaquetado en el VPS | 2 sem | medio |
| **M5** | Preparación de los routers (usuario, certificado, API, perfil MOROSO, firewall) | 2 días | **alto — toca producción** |
| **M6** | **Solo barrido**, en producción. Sin cortes. Valida la conciliación contra la realidad | 1 sem | bajo |
| **M7** | Panel: estado de red, cola de comandos, badge en la ficha, avería masiva | 1.5 sem | bajo |
| **M8** | CUT/RESTORE en simulación + enganche con jobs y pagos | 1 sem | medio |
| **M9** | **Armado gradual**: 5 clientes → 20 → 50 → todos | 2 sem | **alto** |
| **M10** | Chatbot (`get_connection_status`, reconexión) + notificaciones | 0.5 sem | bajo |
| **M11** | BIND_MAC por lotes | 0.5 sem | medio |
| | **Total** | **~9-11 semanas parciales** | |

**M6 es la fase que más devuelve por lo que cuesta.** Solo lectura, cero riesgo, y ya entrega: estado en vivo en la ficha, detección de avería masiva, el tool del chatbot y el informe de desviaciones. Si el proyecto se parara ahí, habría valido la pena.

**M9 no es "encender el flag".** Es cortar 5 clientes con alguien mirando, verificar que el estado quedó coherente y que la reconexión funciona, y ampliar. La primera vez que el sistema corte a alguien que sí había pagado, la confianza del negocio se pierde de golpe y no vuelve.

---

## 10. Pruebas

| Nivel | Qué |
|---|---|
| **Unitarias** | Lista blanca rechaza lo no permitido · intocables · idempotencia · mapeo de perfiles · fan-out multi-router |
| **Integración** | Outbox: lease, reintentos, dead-letter · reconciliación con desviaciones sembradas |
| **Contra un CHR** | Un RouterOS CHR en el VPS (gratis, x86) con secrets de mentira: corte, reconexión, kick, barrido, router caído a media faena |
| **Caracterización** | Congelar el comportamiento actual de `AutoSuspendClientJob` antes de tocarlo |

**El CHR no es opcional.** Es la diferencia entre probar contra la red real de 476 clientes y probar contra una copia desechable.

---

## 11. Lo que sigue abierto

| # | Qué | Cómo se cierra |
|---|---|---|
| 1 | **El tercer router** | Los mismos comandos de export |
| 2 | **Conciliación real de los 476** | `railway login` y ejecuto el script |
| 3 | **¿La caja es la letra sola o letra+número?** | Sale del catálogo de sufijos en M2 |
| 4 | **¿Por qué 88 duplicados?** | Redundancia o restos de migración: decide si hay que mantenerlos sincronizados |
| 5 | **Clientes en 5M y 40M** | Perfiles sin plan comercial en el sistema. Decisión de negocio |
| 6 | **Plazos de aviso de la ATT** | Verificar antes de armar |
| 7 | **¿Actualizar CALVARIO?** | v6.45.9 es de 2020. Conviene, pero **como proyecto aparte** |
