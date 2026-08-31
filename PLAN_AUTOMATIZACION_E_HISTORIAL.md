# Automatización del ciclo de servicio + historial de activaciones

**Fecha:** 2026-08-27
**Origen:** el usuario confirma que la regla de "reactivación manual" existía **por no haber integración con la red**, y pide automatizar eso y lo equivalente, además de registrar fechas de activación y desactivación.
**Corrige:** la sección 3.6 C1 de `PLAN_MIKROTIK_COMERCIAL.md`

---

## 1. Se revierte C1: la reactivación vuelve a ser automática

La regla de 2026-07-07 —*"al saldar la deuda NO se reactiva automáticamente; se genera una alerta para que el admin apruebe"*— **no era una política comercial: era una restricción técnica disfrazada de política.**

Reactivar exigía que una persona abriera Winbox de todas formas. Pedir aprobación no añadía criterio, solo formalizaba lo inevitable.

Con integración, esa razón desaparece:

```
Network:AutoReconnectOnPayment = true    ← nuevo valor por defecto
```

**El flag se mantiene** (§4.3), pero apuntando al otro lado: existe para poder *desactivar* la automatización si algún día hace falta, no para tener que activarla.

Y el comentario de `SuggestReactivationOnDebtClearedHandler` hay que reescribirlo. Si se deja, el próximo que lo lea —incluido tú dentro de un año— creerá que la decisión sigue vigente.

---

## 2. Todo lo que era manual por la misma razón

Revisado el código buscando el mismo patrón: decisiones que exigen intervención humana **solo porque alguien tenía que ir al router**.

| # | Decisión | Hoy | Con integración | ¿Automatizar? |
|---|---|---|---|:-:|
| 1 | Reactivar al saldar la deuda | Alerta al Admin | `RESTORE` | ✅ **Sí** |
| 2 | Cortar por mora | `AutoSuspendClientJob` marca estado; el corte lo hace una persona | `CUT` | ✅ **Sí**, con guardas |
| 3 | Crear la cuenta al instalar | Manual en Winbox | `PROVISION` | ✅ **Sí** |
| 4 | Deshabilitar al dar de baja | Manual | `CUT` definitivo | ✅ **Sí** |
| 5 | **Aprobar un upgrade de plan** | Aprobación manual | `CHANGE_PROFILE` inmediato | ✅ **Sí**, si está al día |
| 6 | **Aprobar un downgrade** | Aprobación manual | `CHANGE_PROFILE` a fin de mes | ❌ **No — dejar manual** |
| 7 | Reconectar por promesa de pago | No existe | `RESTORE` con vencimiento | ✅ **Sí**, con límites |
| 8 | Reiniciar la sesión de un cliente | Manual en Winbox | `KICK` | ✅ **Sí**, desde el bot |

### Por qué el downgrade se queda manual

Es el único de la lista donde la intervención humana **añade valor real**, no fricción.

Un cliente que baja de 80 a 30 Mb es un cliente que se está yendo a medias. Es la oportunidad natural de llamarlo, entender por qué y ofrecerle algo. Automatizar la aprobación convierte una señal de retención en un trámite silencioso.

El upgrade es lo contrario: el cliente quiere pagar más. Hacerle esperar la aprobación de alguien es puro rozamiento — y además retrasa el momento en que empieza a facturarse más caro.

> La regla queda: **automatizar lo que solo era una limitación técnica; conservar lo que es una decisión de negocio.** La aprobación del downgrade es lo segundo. La de la reactivación era lo primero.

---

## 3. El historial de servicio

### 3.1 El problema: hoy los datos se destruyen

`Client.Reactivate()` hace esto:

```csharp
Status      = ClientStatus.Activo;
SuspendedAt = null;          // ← borra la fecha de suspensión
```

**Cada reactivación destruye el registro de la suspensión anterior.** Solo sobrevive la suspensión *en curso*, y solo mientras dure.

Consecuencia: hoy es **imposible** responder preguntas elementales.

- ¿Cuántos días estuvo sin servicio este cliente el mes pasado?
- ¿Cuántas veces se le ha cortado en el año?
- ¿Cuánto tardamos en reconectarlo después de que pagó?
- ¿Desde cuándo es cliente activo, si tuvo una baja y volvió?

No es que las consultas sean difíciles: **los datos nunca existieron**.

Queda un rastro en `AuditLog` (`AUTO_SUSPEND`, `CLIENT_REACTIVATED`, `CLIENT_CANCELLED`), pero es texto para auditoría, no un modelo consultable. No sirve para prorratear una factura ni para un reporte.

### 3.2 La entidad

```
ServiceStatusEvent          Append-only. Nunca se edita ni se borra.

  · ClientId
  · EventType     ACTIVACION | SUSPENSION | REACTIVACION | BAJA | CAMBIO_PLAN
  · OccurredAt    UTC
  · Reason        MORA | SOLICITUD_CLIENTE | AVERIA | MANUAL |
                  PROMESA_VENCIDA | INSTALACION | MIGRACION
  · TriggeredBy   SISTEMA | usuario
  · UserId?
  · PreviousStatus / NewStatus
  · NetworkConfirmedAt?      ← cuándo lo confirmó el router
  · NetworkCommandId?        ← trazabilidad al comando
  · Notes
```

**`NetworkConfirmedAt` es el campo que más importa** y solo tiene sentido con integración: distingue *"el sistema lo marcó"* de *"la red lo ejecutó"*. Con él se puede medir la latencia real del corte y de la reconexión, y detectar los casos donde el estado cambió pero la red nunca se enteró — que es exactamente el fallo silencioso que este módulo existe para eliminar.

`Client.SuspendedAt` y `CancelledAt` **se conservan** como caché del estado actual (los usan tres queries). Lo que cambia es que dejan de ser la única fuente.

### 3.3 Qué desbloquea

| Capacidad | Por qué importa |
|---|---|
| **Días sin servicio por período** | Prorrateo de facturación. Cobrar el mes completo a quien estuvo cortado 12 días es una fuente de reclamos, y hoy no hay forma de calcularlo |
| **Nº de cortes por cliente** | Scoring de morosidad recurrente: quién se corta todos los meses |
| **Tiempo medio de reconexión tras pago** | El KPI que mide si el módulo cumple. Objetivo: menos de 60 s |
| **Disponibilidad por cliente, zona y caja** | Reportes de servicio, y respaldo ante reclamos |
| **Antigüedad real del cliente** | Hoy `InstallationDate` no distingue una baja con retorno de una continuidad |
| **Defensa ante disputas** | *"me cortaron cuando ya había pagado"* pasa a tener respuesta con hora y comando |
| **Ingresos en riesgo** | Cuántos días-cliente se pierden por mora al mes |

### 3.4 La reconstrucción del pasado

El historial arranca vacío, pero se puede sembrar parcialmente. Por orden de fiabilidad:

1. **`AuditLog`** — tiene `AUTO_SUSPEND`, `CLIENT_REACTIVATED`, `CLIENT_CANCELLED` con `CreatedAt`, `EntityId` y autor. Es la mejor fuente y reconstruye eventos reales con fecha exacta.
2. **`Client.SuspendedAt`** — para los que están suspendidos ahora mismo.
3. **`Client.InstallationDate`** — como `ACTIVACION` inicial de cada cliente.
4. **`last-logged-out` de cada secret** — da la última desconexión real por cliente. No es un evento de negocio, pero acota fechas donde falte todo lo demás.

Todo lo sembrado se marca con `Reason = MIGRACION`, para que nadie confunda un evento reconstruido con uno observado.

> Lo que no se puede recuperar: las suspensiones anteriores a la última de cada cliente que no dejaran rastro en `AuditLog`. Se pierden. Cuanto antes exista la tabla, menos se pierde — **es un argumento para adelantar esta pieza**, incluso antes que el resto del módulo de red: la entidad y su escritura no dependen de MikroTik en absoluto.

---

## 4. Las reglas de automatización, con sus guardas

Automatizar sin guardas es cómo se cortan clientes que sí pagaron.

### 4.1 Reconexión automática al pagar

```
DISPARA:  PaymentRegisteredEvent  (ya existe, PaymentCreditService:220)
SI:       · el cliente está Suspendido
          · no le queda ninguna factura impaga   (ya lo calcula el handler)
          · Network:AutoReconnectOnPayment = true
ENTONCES: · encolar RESTORE en cada router donde tenga cuenta
          · al confirmar: Client.Reactivate() + ServiceStatusEvent(REACTIVACION, MORA)
          · NotifType.REACTIVACION  (ya existe)
SI FALLA: alerta al Admin y el cliente queda Suspendido — nunca "activo" sin red
```

**Nota importante:** el pago se registra a veces manualmente por un operador. Si se registra un pago por error y se reconecta solo, revertirlo exige otro comando. Por eso la anulación de pago (`PAGO_ANULADO`, que ya existe) tiene que encolar el `CUT` correspondiente. Sin eso, un pago anulado deja al cliente conectado gratis.

### 4.2 Corte automático por mora

```
DISPARA:  AutoSuspendClientJob (ya existe, con JobLease y catch-up)
GUARDAS:  · aviso T-24h enviado y confirmado
          · el cliente no está en la lista de protegidos
          · dentro de la ventana horaria (no de noche ni fin de semana)
          · no se superó el tope de cortes por hora
          · el sistema está armado
          · gracia de 24 h tras un pago reciente  (ya existe en el job)
ENTONCES: · encolar CUT en todos sus routers
          · al confirmar TODOS: Client.Suspend() + ServiceStatusEvent(SUSPENSION, MORA)
```

**El estado no cambia hasta que la red confirma.** Si un router falla, el cliente queda en `CUT_PARCIAL` y se alerta: con 88 clientes duplicados, ese caso llega.

### 4.3 Los interruptores

Todo automatismo tiene su flag en `SystemConfig`, y todos vienen activados salvo el maestro:

```
Network:Armed                      false  ← maestro. Nada se ejecuta hasta armarlo
Network:AutoReconnectOnPayment     true
Network:AutoCutOnOverdue           true
Network:AutoProvisionOnInstall     true
Network:AutoApproveUpgrade         true
Network:AutoApproveDowngrade       false ← deliberado (§2)
Network:MaxCutsPerHour             20
Network:CutWindowStart / End       09:00 / 18:00
Network:PaymentPromiseMaxDays      3
Network:PaymentPromisePerYear      3
```

`Network:Armed=false` es la red de seguridad: se puede desplegar todo, verificar en simulación durante días, y armar cuando el log demuestre que hace lo correcto.

---

## 5. Encaje en las fases

Dos cambios sobre `PLAN_MIKROTIK_COMERCIAL.md` §9:

**`ServiceStatusEvent` se adelanta a M1.** No depende de MikroTik: es una entidad, una migración, escrituras en los cinco puntos donde hoy cambia el estado, y el sembrado desde `AuditLog`. **Media semana, riesgo bajo, y empieza a acumular historia desde el día uno.** Cada semana que se retrase es historia que no se recupera.

**La automatización va a M9-M10**, detrás de los flags, y se arma cliente por cliente como el resto.

| Fase | Añadido |
|---|---|
| **M1** | `ServiceStatusEvent` + escrituras + sembrado desde `AuditLog` |
| **M7** | Historial de servicio en la ficha del cliente; días sin servicio |
| **M9** | Automatismos tras los flags, en simulación |
| **M10** | Armado gradual |
| **M11** | Promesa de pago |
| **M12** | Aprovisionamiento automático + auto-aprobación de upgrades |
| **M13** | Reportes: días sin servicio, cortes por cliente, latencia de reconexión |

---

## 6. Lo que hay que decidir

| # | Pregunta | Por qué |
|---|---|---|
| 1 | ¿El downgrade sigue con aprobación manual? | Recomiendo que sí — es retención, no trámite |
| 2 | ¿La auto-aprobación de upgrades exige estar al día? | Recomiendo que sí |
| 3 | ¿Se prorratea la factura por días sin servicio? | El historial lo hace posible; es decisión comercial |
| 4 | ¿Cuántos días de promesa de pago y cuántas al año? | Propongo 3 días, 3 veces al año |
| 5 | ¿Ventana horaria de corte? | Propongo 09:00–18:00 en días hábiles |
| 6 | ¿Quién entra en la lista de protegidos? | Cámaras, alarmas, institucionales, convenios |
