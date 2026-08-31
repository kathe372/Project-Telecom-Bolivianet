# Análisis de los exports reales — 575 secrets, 2 routers

**Fecha:** 2026-08-27
**Fuente:** exports de `/ppp secret`, `/ppp profile`, `/ppp active`, `/ip service`, `/system resource`
**Sustituye a:** las inferencias de `PLAN_RED_HALLAZGOS_MIKROTIK.md` §3 y §4 (ahora hay datos)
**Contraseñas:** eliminadas antes de leer nada. 1150 ocurrencias redactadas; los archivos limpios están en `mikrotik-export/limpio/`.

---

## 0. Los números

| | CALVARIO | IEF | Total |
|---|--:|--:|--:|
| Modelo | CCR1009-7G-1C-1S+ | RB4011iGS+ | |
| RouterOS | **6.45.9** (long-term, 2020) | **7.6** (stable, 2022) | |
| Uptime | 24 semanas | 6 semanas | |
| Secrets | 452 | 123 | **575** |
| Deshabilitados | 45 | 5 | **50** |
| Sesiones activas ahora | 312 | 114 | **426** |
| Perfiles reales | 9 | 4 | |

**Clientes distintos: 476.** (575 filas − 11 cuentas que no son clientes − 88 duplicados entre routers.)

---

## 1. Los cinco hallazgos que cambian el diseño

### 1.1 🔴 88 clientes existen en LOS DOS routers a la vez

No son clientes distintos con el mismo número: es **la misma cuenta duplicada**, con nombre idéntico y comentario idéntico.

```
006E@gpon   CALVARIO   ;;; 06///DELCARPIO ALVAREZ OWALDO (1A0029)
006E@gpon   IEF        ;;; 06///DELCARPIO ALVAREZ OWALDO (1A0029)
```

Son 88 cuentas, 176 filas. Puede ser redundancia deliberada (que el cliente autentique en cualquiera de los dos nodos) o restos de una migración que no se limpió.

**Consecuencia directa e ineludible:** un corte que solo toque un router **no corta**. El cliente se reconecta por el otro. El sistema tiene que:

1. Saber en **qué routers** existe el secret de cada cliente
2. Aplicar el corte **en todos ellos**
3. Considerar el corte exitoso solo cuando **todos** confirmen

Esto no es un detalle de implementación: es un requisito que, de no verse ahora, habría producido cortes que fallan en silencio para el 18 % de la cartera. Y el fallo sería invisible — el sistema diría "cortado" y el cliente seguiría navegando.

### 1.2 🔴 No existe perfil de corte, y los cortes actuales son bajas definitivas

**No hay ningún perfil tipo `MOROSO` en ninguno de los dos routers.** El catálogo completo son perfiles comerciales más los dos del sistema.

Y los 50 secrets deshabilitados no son cortes por mora: **la mediana de tiempo sin conectar es de 281 días**, frente a 24 días en los habilitados. Hay comentarios explícitos como `JOSE ARAMAYO RIPALDA corte definitivo`.

**Lectura:** hoy no existe una disciplina de corte por impago. Se deshabilita el secret cuando alguien se da de baja para siempre, y poco más. La mora se gestiona de otra forma, o no se gestiona.

Eso **refuerza el proyecto** en vez de debilitarlo: no hay que reemplazar un proceso que funciona, hay que crear uno que no existe. Pero cambia lo que se promete: esto no es "automatizar lo que hace el operador", es **introducir una capacidad nueva**, y por tanto necesita más acompañamiento y un arranque más gradual.

### 1.3 🔴 El perfil NO se deduce del plan: identifica la SUBRED, no la velocidad

Confirmado con datos. En CALVARIO hay **cuatro perfiles distintos para 30 Mb**:

| Perfil | Velocidad | Pool | Red |
|---|---|---|---|
| `plan-30MX-IP20` | 30M/30M | pool-PPPoE-IP20 | 192.168.20.x |
| `plan-30MX-IP30` | 30M/30M | pool-PPPoE-IP30 | 192.168.30.x |
| `plan-30MXX-IP20` | 30M/30M | pool-pppoe-IP20MXX | 172.16.20.x |
| `plan-30MXX-IP30` | 30M/30M | pool-PPPoE-IP30MXX | 172.16.30.x |

Lo que los diferencia es **en qué subred cae el cliente**, no lo que paga. Es una decisión de reparto de carga, no comercial.

Y el mismo nombre significa cosas distintas según el router: `plan-80MX` usa `172.16.80.1` en CALVARIO y `172.17.80.1` en IEF.

**Dos reglas que salen de aquí:**

1. **Al cortar hay que guardar el perfil exacto** y restaurar ese mismo. Poner "el que le tocaría por su plan" movería al cliente de subred y rompería lo que dependa de ella.
2. La tabla de mapeo es **(router, perfil) → plan**, nunca perfil → plan.

**Además, hay velocidades sin plan correspondiente en el sistema:** existen perfiles de **5M y 40M**, mientras que los planes registrados son Cobre 30, Plata 50 y Oro 80. Hay clientes en tarifas heredadas que el sistema no contempla.

### 1.4 🟢 La MAC de cada cliente conectado ya está disponible

Las 426 sesiones activas reportan **todas** la MAC del equipo en `caller-id`:

```
name="0262C@gpon" caller-id="4C:D7:C8:5A:4C:BD" address=192.168.50.253 uptime=4w17h26m49s
```

Esto es un regalo para las dos partes del proyecto:

- **Para el inventario:** se puede sembrar automáticamente la MAC de 426 equipos instalados, ligados a su cliente. La carga inicial —que señalé como "lo que mata estos módulos"— se reduce a la mitad.
- **Para la seguridad:** cerrar el binding de MAC (§2.2) deja de ser un trabajo de campo. La MAC autorizada ya se observa; solo hay que copiarla al campo `caller-id` del secret.

### 1.5 🟡 El identificador del cliente es el número, y la letra es (probablemente) la caja

De las 575 filas:

| Formato | Cantidad |
|---|--:|
| `####@gpon` (sin letra) | 147 |
| `####L@gpon` (con letra A–J) | 417 |
| Sin `@gpon` (no son clientes) | 11 |

**El número identifica al cliente sin ambigüedad**: cuando un número aparece dos veces, es el mismo cliente en los dos routers, con la misma letra y el mismo nombre. Nunca son dos personas distintas.

**La letra** va de la A a la J, es estable por cliente, y no correlaciona con el router, ni con el perfil, ni con el rango de números (los sin letra son los 147 más antiguos, del 1 al 142).

La pista está en los comentarios mal formados, que conservan más detalle del que cabe en el nombre:

```
0228H2P3///HENRY SORIA VELASCO      ← ¿caja H2, puerto 3?
0141A7///SECUNDINO CABEZAS          ← ¿caja A7?
0155-F3///WILFREDO CACERES PANIAGUA ← ¿caja F3?
0194D1/// DAVID CANASA              ← ¿caja D1?
```

**Hipótesis:** la letra es la **caja NAP o el puerto PON de la OLT**, y en algunos casos se anotó también el número de caja y de puerto. Si se confirma, encaja directamente con la entidad `DistributionBox` que el sistema ya tiene, y daría el mapeo cliente→caja para los 417 con letra. **Esto lo tienes que confirmar tú** — es tu red, no se deduce del export.

---

## 2. Estado de la seguridad, con datos

### 2.1 🔴 La API está DESHABILITADA en los dos routers y no hay certificado

```
5 X name="api"     port=8728 address=""
7 X name="api-ssl" port=8729 address="" certificate=none
```

`X` = deshabilitado. Y `api-ssl` **no tiene certificado**, así que no se puede activar tal cual.

**Consecuencia para el plan:** hay un paso previo que no había contemplado — **generar e instalar un certificado TLS** en cada router antes de poder usar `api-ssl`. Se hace con `/certificate` en el propio RouterOS (autofirmado sirve, el agente lo fija por huella). Suma medio día, no más, pero hay que saberlo.

### 2.2 🔴 Cero binding de MAC en los 575 secrets

`caller-id=""` en todos, sin excepción. Combinado con contraseñas del tipo `wilnetcom` + código, **cualquiera que deduzca el código de un vecino puede autenticarse como él**.

El atenuante es que todos los perfiles llevan `only-one=yes`: solo puede haber una sesión por cuenta. Así que el robo no pasa desapercibido — echa al cliente legítimo, que verá cortes intermitentes. Sigue siendo un problema, pero se manifiesta como "mi internet se cae", no como consumo silencioso.

**Se arregla con la MAC que ya se observa (§1.4).**

### 2.3 🟠 Interfaz web sin cifrar, expuesta

```
2   name="www"     port=7904 address=""      ← ACTIVO, HTTP sin cifrar
4 X name="www-ssl" port=443  certificate=none ← desactivado
6   name="winbox"  port=8291 address=""      ← ACTIVO
```

El panel de administración está accesible por **HTTP en claro** en el puerto 7904, sin restricción de origen. Las credenciales de administración viajan sin cifrar por Internet.

Como el proyecto va a añadir reglas de firewall para la IP del agente, **es el momento de restringir también `www` y `winbox`**. Cuesta lo mismo hacerlo entonces.

> Detalle: `winbox` escucha en 8291 pero tú entras por el 1010, así que hay un NAT delante. Bien: significa que el punto de entrada ya está centralizado y es fácil de acotar.

### 2.4 🟠 Once cuentas que no son clientes, todas activas

```
CALVARIO:  54321        DIEGO        prueba
IEF:       12345        123456       prueba
           camara1      camara2      camara3
           alarma10     casaDelia
```

Cámaras, alarmas, una casa particular y cinco cuentas de prueba con credenciales triviales — **todas habilitadas**.

Además hay **21 secrets marcados `;;; libre`**: plazas recicladas que se guardan como reserva.

**Todas estas tienen que ir a una lista de intocables en el agente.** Sin ella, el sistema intentará algún día cortarle el servicio a `camara1` porque no le encuentra factura. Y las de prueba, con contraseña igual al usuario, deberían desactivarse por su cuenta.

### 2.5 🟡 Un perfil huérfano

16 secrets apuntan a `profile=*4`, un perfil **que ya no existe** (fue borrado y quedaron las referencias). Todos están deshabilitados y llevan años sin conectar. Es basura acumulada; conviene limpiarla antes de automatizar nada sobre esa tabla.

---

## 3. Cómo queda el mapeo cliente ↔ secret

Con los datos en la mano, el algoritmo se simplifica:

```
1. Del secret "0457D@gpon" → extraer el número: 457
2. Candidato en el sistema: TBN-0457
3. Verificar con el nombre del comentario contra Client.FullName
4. Guardar el NOMBRE COMPLETO del secret ("0457D@gpon") y la lista de
   routers donde existe, en columnas nuevas del cliente
```

Se añaden dos columnas al cliente: `PppoeSecretName` y la relación con los routers donde vive. `WinboxNumber` se queda como está.

**No puedo completar la conciliación todavía** porque falta la lista de clientes de la base de datos. Lo que sí puedo adelantar: 476 clientes en la red, con números del 1 al 477 — un rango denso y sin huecos grandes, exactamente lo que produce la secuencia `TbnSequence`. La correspondencia va a funcionar.

---

## 4. Lo que falta

| Qué | Por qué | Cómo |
|---|---|---|
| **El tercer router** | Solo llegaron CALVARIO e IEF. Falta uno de las tres direcciones | Mismos comandos, cambiando el nombre |
| **`clientes.csv`** | Sin él no hay conciliación | Parte 2 de las instrucciones |
| **Qué es la letra A–J** | Decide si se puede mapear cliente→caja NAP gratis | Solo lo sabes tú |
| **Por qué 88 duplicados** | Redundancia deliberada o restos de migración: cambia si hay que mantenerlos sincronizados | Solo lo sabes tú |
| **Los 5M y 40M** | Clientes en tarifas que el sistema no tiene | Decisión comercial |

---

## 5. Efecto sobre el plan

| Punto | Antes | Ahora |
|---|---|---|
| Mapeo `WinboxNumber` | 🟡 inferencia | 🟢 **confirmado**, algoritmo definido |
| Perfil de corte | se asumía que existía | 🔴 **hay que crearlo** |
| Nº de routers a tocar por corte | 1 | 🔴 **hasta 2** (88 clientes) |
| Activar la API | se asumía disponible | 🔴 **está apagada, sin certificado** |
| MAC de los equipos | trabajo de campo | 🟢 **426 ya disponibles** |
| Cómo se corta hoy | desconocido | 🟢 **no se corta; solo bajas definitivas** |

**Sobre la estimación:** los dos routers por cliente y el certificado suman; la MAC regalada y el mapeo resuelto restan. **Se mantiene en 7-9 semanas**, pero con el riesgo bastante más bajo que hace dos días: lo que quedaba por descubrir ya está descubierto.
