# MikroTik — hallazgos de la inspección y arquitectura revisada

**Fecha:** 2026-08-27
**Fuente:** capturas de WinBox aportadas por el usuario (gestor de conexiones, PPP → Secrets, detalle de un secret)
**Revisa:** `PLAN_INVENTARIO_Y_RED_2026-08.md` §3
**Aviso:** lo leído en capturas de baja resolución va marcado como **inferencia**. Todo lo inferido se confirma con un export (§7).

---

## 1. Lo que se ve

### 1.1 Infraestructura

| Dato | Valor | Fuente |
|---|---|---|
| Modelo | **CCR1009-7G-1S+** | barra de título |
| RouterOS | **v6.45.9** | barra de título |
| WinBox | v3.40 (64 bit) | ventana |
| Identidad del router | **CALVARIO** | barra de título |
| Routers gestionados | **3** — `200.58.84.212`, `200.58.82.113`, `181.115.154.138` | lista *Managed* |
| Puerto de gestión | **1010** (no el 8291 por defecto) | todas las direcciones |
| Usuario | **`user1010`**, el mismo en los tres | lista *Managed* |
| Secrets en CALVARIO | **~452** | contador inferior |

### 1.2 Cómo está montado el servicio

Un `PPP Secret` por cliente, todos con `Service: pppoe`. El detalle abierto muestra:

```
Name:            0457D@gpon
Password:        wilnetcom0457D
Service:         pppoe
Caller ID:       (vacío)
Profile:         plan-30MX-IP20
Local Address:   (vacío)
Remote Address:  (vacío)
Last Logged Out: Jul/31/2026 21:20:57
Estado:          enabled
```

Y la lista usa comentarios de RouterOS como directorio de clientes:

```
;;; 0455D//// JOSUE CRISTIAN RAMIREZ ARNEZ
;;; 0456D//// SANDRA CLAURE BUSTOS
;;; 0457D//// VANESSA KACHI BUSTOS
;;; 0459H//// GUSTAVO HERRERRA LEON
;;; 0465C//// SANTOS MAMANI SACA
;;; 0475B//// VANIA ACARAPI CUIZAGUANA
```

Perfiles observados: `plan-30MX-IP20`, `plan-30MX-…`, `plan-50MX`, `Plan-50M`, `plan-80MX`.

---

## 2. Los tres cambios al plan

### 2.1 🔴 RouterOS v6.45.9 → **no hay REST API**

El plan dejaba abierta la posibilidad de hablar por REST sin dependencias. **Queda descartada:** la REST API llegó en RouterOS 7.1, y aquí hay un v6.45.9 (una compilación de finales de 2019).

**Consecuencia:** el agente debe usar la **API binaria** (8728 en claro / 8729 con TLS), lo que exige una librería: `librouteros` si el agente es Python, `tik4net` si es C#.

**Recomendación firme: no acoplar este proyecto a una actualización de RouterOS.** Actualizar el firmware de un BNG que sostiene a 452 clientes es una operación de riesgo con su propia ventana de mantenimiento y su propio plan de vuelta atrás. Que se haga —conviene, v6.45.9 lleva seis años— pero como tarea aparte y por sus propios motivos. El agente se diseña contra la API binaria, que funciona igual en v6 y en v7.

### 2.2 🟢 Los routers tienen IP pública → **desaparece el bloqueante del "NOC"**

Este es el cambio importante, y es a mejor. El plan asumía routers inalcanzables desde fuera, lo que obligaba a poner una máquina en la oficina del ISP. **Las tres direcciones gestionadas son IPs públicas de Internet.**

Eso abre una opción que antes no existía:

> **El agente puede correr en un VPS con IP fija**, en cualquier parte, y el MikroTik lo deja entrar por una regla de firewall que solo admite esa IP.

Comparado con lo que proponía el plan:

| | Mini-PC en la oficina (plan original) | **VPS con IP fija (nuevo)** |
|---|---|---|
| Coste | equipo + UPS | ~5 USD/mes |
| Si se corta la luz en la oficina | el agente muere | indiferente |
| Si se cae el Internet de la oficina | el agente muere | indiferente |
| Quién lo mantiene | alguien que pase por ahí | se administra por SSH |
| IP fija para el allow-list | depende del ISP de la oficina | garantizada |

**El VPS gana en todo.** Y resuelve la pregunta que quedó abierta ("¿hay un equipo disponible?"): ya no hace falta ninguno.

> **Lo que NO recomiendo, aunque ahora sea técnicamente posible:** que Railway hable directo con los routers. Railway no garantiza IP de salida fija en todos los planes, y sin IP fija la regla de firewall tendría que admitir `0.0.0.0/0` — es decir, abrir la API del router a Internet entero. El VPS intermedio cuesta 5 dólares y evita exactamente eso.

**Arquitectura revisada:**

```
Railway (backend)  ──HTTPS──▶  NetworkCommandOutbox
       ▲                              │
       │  el agente pregunta          │
       │  y reporta (solo saliente)   │
       │                              ▼
   VPS con IP fija  ── API 8729 (TLS) ──▶  CALVARIO      200.58.84.212:8729
   (agente)                            ├─▶  router 2      200.58.82.113:8729
                                       └─▶  router 3      181.115.154.138:8729

   Firewall de cada router: solo acepta 8729 desde la IP del VPS.
```

### 2.3 🟡 Son tres routers, y parecen organizados por zona

`CALVARIO` es un barrio, no un nombre de equipo. **Inferencia:** cada router cubre una zona geográfica.

El sistema ya tiene `CoverageZone` y cada cliente ya está ligado a una zona, así que el modelo encaja: `NetworkDevice` con `CoverageZoneId`, y el comando de corte se enruta al router que corresponde.

Pero hay un caso que hay que resolver antes de escribir código: **¿un cliente puede estar en un router que no sea el de su zona?** (mudanzas, reequilibrio de carga, un sector servido por otro nodo). Si puede, el `NetworkDevice` no se deduce de la zona y hay que **descubrirlo**: el primer barrido pregunta a los tres routers dónde vive cada secret y lo guarda. Es más robusto y no cuesta mucho más — **recomiendo esa vía** en lugar de confiar en la zona.

---

## 3. El mapeo `WinboxNumber` ↔ secret: casi resuelto

Esta era "la incógnita más cara del proyecto". Las capturas la dejan a un paso de cerrarse.

**Los códigos TBN del sistema son `TBN-` + 4 dígitos**, con secuencia monotónica que nunca se reinicia (`TbnSequence`, `TbnService.GenerateNextAsync`, formato `D4`).

**Los secrets del MikroTik son 4 dígitos + una letra + `@gpon`:**

```
TBN-0455  ←→  0455D@gpon
TBN-0457  ←→  0457D@gpon
TBN-0477  ←→  0477H@gpon
```

Coinciden el ancho (4), el rango (los secrets van de ~0455 a ~0477 en la parte visible, y hay ~452 en total) y la naturaleza monotónica. **La correspondencia por número es casi seguro correcta.**

Quedan dos piezas sin explicar:

**La letra final** (`D`, `H`, `C`, `A`, `B`). No es la inicial del apellido: `0459H` es *Gustavo **H**errera* —encaja— pero `0455D` es *Josué Ramírez* y `0465C` es *Santos Mamani*, que no encajan. **Inferencia descartada.** Podría ser el nodo, el sector, la caja NAP o el técnico que instaló. Hay que preguntarlo, no adivinarlo.

**El sufijo `@gpon`.** Es el *realm* de la tecnología de acceso. Si todos los clientes son GPON será constante; si hay clientes por radio o cable, habrá otros realms (`@wifi`, `@cable`) y el mapeo tiene que contemplarlos.

**Función de mapeo propuesta**, a validar contra el export:

```
TBN-0457  →  extraer "0457"
          →  buscar secret cuyo Name empiece por "0457"
          →  verificar que solo haya UNO
          →  guardar el Name COMPLETO ("0457D@gpon") en el cliente
```

**Y la clave: el resultado se persiste.** Se añade una columna `PppoeSecretName` al cliente y se rellena una sola vez con la conciliación. A partir de ahí el sistema no vuelve a adivinar nada: usa el nombre exacto. `WinboxNumber` se queda como está, para búsquedas.

La comprobación cruzada que hace esto seguro: **los comentarios llevan el nombre completo del cliente**. Si `TBN-0457` es *Vanessa Kachi Bustos* en la base y el comentario de `0457D@gpon` dice `VANESSA KACHI BUSTOS`, el emparejamiento está confirmado por dos vías independientes. El script de conciliación puede clasificar cada cliente en:

- ✅ **Número y nombre coinciden** → automático
- ⚠️ **Número coincide, nombre no** → revisión manual
- ⚠️ **Nombre coincide, número no** → revisión manual
- ❌ **Sin correspondencia** → lista para resolver a mano

---

## 4. Los perfiles no se pueden deducir: hay que mapearlos

Los planes del sistema son **Cobre 30 Mb, Plata 50 Mb, Oro 80 Mb**. Los perfiles del router son `plan-30MX-IP20`, `plan-50MX`, `Plan-50M`, `plan-80MX`.

Las velocidades casan (30/50/80), pero:

- **Hay más de un perfil por velocidad**: `plan-50MX` y `Plan-50M` conviven.
- **La escritura es inconsistente**: `plan-` en unos, `Plan-` en otros.
- Hay sufijos con significado propio (`-IP20`) que probablemente indican el pool de IP y no la velocidad.

**Dos consecuencias directas:**

1. **Antes de cortar hay que guardar el perfil exacto que tenía el cliente**, tal cual, en la fila del outbox. Reconectar poniendo "el perfil que le tocaría por su plan" le cambiaría la configuración a una parte de los clientes sin que nadie lo pida. Ya estaba en el plan; ahora está confirmado con datos.

2. **Hace falta una tabla de mapeo plan ↔ perfil**, administrable desde el panel, no una convención en el código. Con una fila por perfil real del router y su plan correspondiente, más un perfil marcado como "el de corte".

---

## 5. Hallazgos de seguridad

No los buscaba; salen a la vista en las capturas. Los reporto porque el módulo de red va a tocar exactamente estas piezas, y porque tres de ellos se arreglan casi gratis mientras se construye.

### 5.1 🔴 Las contraseñas PPPoE son predecibles

`0457D@gpon` / `wilnetcom0457D`. El patrón es `wilnetcom` + el código del cliente. Conociendo el esquema, **cualquiera puede construir las credenciales de cualquier cliente**.

### 5.2 🔴 `Caller ID` vacío → sin vínculo con el equipo físico

En un secret PPPoE, `Caller ID` es la MAC autorizada. Está vacío en el que se ve, así que **cualquier equipo puede autenticarse con esas credenciales, desde cualquier punto de la red**.

Combinado con 5.1: alguien que deduzca el código de un vecino puede levantar la sesión de ese vecino y navegar con su plan. El cliente legítimo vería desconexiones intermitentes y abriría un ticket de "internet inestable" que nadie sabría diagnosticar.

**Aquí es donde los dos módulos se cruzan:** el inventario guarda la **MAC de cada ONU**. Con eso, el sistema puede rellenar el `Caller ID` de cada secret y atar cada cuenta a su equipo físico. Es una operación masiva, reversible y de bajo riesgo — y cierra el agujero sin tocar 452 contraseñas.

> Argumento de peso para hacer el **inventario antes que la red**: es lo que produce el dato que arregla esto.

### 5.3 🟠 Secrets de prueba en producción

En la lista conviven con los clientes reales:

```
54321   / 54321    → plan-30MX-…
prueba  / prueba   → plan-80MX
DIEGO   / wilnetcomD…
```

Dos problemas: son credenciales triviales que dan servicio real, y **son trampas para el automatismo**. Una lista de "cuentas intocables" en el agente es obligatoria: sin ella, un día el sistema intentará cortarle el servicio a `prueba` porque no encuentra su factura, o peor, tratará de emparejarla con un cliente.

### 5.4 🟠 WinBox expuesto a Internet en el puerto 1010

Cambiar el 8291 por el 1010 no es protección, solo reduce el ruido de los escaneos automáticos. Con IP pública, el servicio de gestión está al alcance de cualquiera.

Como el proyecto va a añadir una regla de firewall para la IP del VPS, **es el momento natural de restringir también WinBox** a las IPs desde las que se administra. Cuesta lo mismo hacerlo entonces que no hacerlo.

### 5.5 🟡 Un solo usuario para los tres routers

`user1010` en los tres. Si esa credencial se filtra, se pierde toda la red a la vez, y los registros no distinguen quién hizo qué.

El agente **no debe reutilizarla**: usuario propio, por router, con grupo de permisos mínimo (§6). Así, además, todo lo que haga el sistema queda separado de lo que hace una persona en el log del router.

---

## 6. Qué hay que configurar en el router antes de programar

Una sola vez, por cada uno de los tres routers.

**1 · Usuario del agente, con permisos acotados:**

```
/user group add name=tbn-agent policy=read,write,api,test
/user add name=tbn-agent group=tbn-agent password=<distinta por router>
```

Sin `full`, sin `password`, sin `ftp`, sin `sniff`. Puede leer y modificar secrets; no puede reconfigurar el router ni tocar cuentas de administración.

**2 · API con TLS, restringida a la IP del VPS:**

```
/ip service set api-ssl address=<IP_DEL_VPS> disabled=no
/ip service set api disabled=yes          ← el puerto 8728 en claro, cerrado
```

**3 · El perfil de corte**, creado a mano y una sola vez:

```
/ppp profile add name=MOROSO ...   ← con jardín vallado hacia la página de aviso
```

**El sistema nunca crea ni modifica perfiles: solo asigna uno de los que ya existen.** Es una restricción deliberada — acota lo que un fallo puede llegar a romper.

---

## 7. Lo que necesito para cerrar el diseño

Un solo archivo por router. En **New Terminal**:

```
/ppp secret print detail file=secrets-calvario
/ppp profile print detail file=profiles-calvario
/system resource print file=sysinfo-calvario
```

Quedan en **Files**, se descargan arrastrándolos desde WinBox. Repetir en los otros dos routers cambiando el nombre.

Con eso puedo entregar, sin tocar nada del router:

- El **script de conciliación** de los 452 secrets contra la tabla `Clients`, con el informe de los cuatro grupos de §3
- El **catálogo real de perfiles** y su mapeo a los planes Cobre/Plata/Oro
- La **explicación de la letra final** (con 452 casos, el patrón se ve solo)
- El inventario de **realms** además de `@gpon`
- La lista de **cuentas intocables** (pruebas, cuentas internas, secrets sin cliente)
- Cuántos secrets están **deshabilitados** hoy — que dice cómo se corta ahora mismo en la práctica

**El export no incluye las contraseñas en claro si se usa `print detail` sobre un usuario sin `policy=sensitive`.** Aun así, revisa el archivo antes de compartirlo y, si trae credenciales, pásalo por un canal privado o bórralas primero — no hacen ninguna falta para la conciliación.

---

## 8. Estado de las decisiones, actualizado

| # | Pregunta | Estado |
|---|---|---|
| 1 | Provisioning | ✅ **PPPoE con `/ppp secret`** |
| 2 | Qué contiene `WinboxNumber` | 🟡 **Casi resuelto** — `TBN-0457` ↔ `0457D@gpon`. Falta el export para confirmarlo en los 452 |
| 3 | Versión de RouterOS | ✅ **v6.45.9 → API binaria, no REST** |
| 3b | Cuántos routers | ✅ **3**, con IP pública, aparentemente por zona |
| 4 | Dónde corre el agente | ✅ **VPS con IP fija** (~5 USD/mes). Ya no hace falta hardware en la oficina |
| 5 | Inventario con o sin costes | ⬜ Pendiente — decisión de negocio |
| **6** | **¿Qué significa la letra final del secret?** | ⬜ **Nueva.** Se responde sola con el export |
| **7** | **¿Un cliente puede estar en un router que no sea el de su zona?** | ⬜ **Nueva.** Decide si el router se deduce o se descubre |
| **8** | **¿Cómo se corta hoy: deshabilitando el secret o cambiando el perfil?** | ⬜ **Nueva.** Marca cuál es el cambio real de práctica |

---

## 9. Efecto sobre las estimaciones

| Fase | Antes | Ahora | Motivo |
|---|---|---|---|
| N0 Descubrimiento | 3-5 días | **1-2 días** | Media respuesta ya está en las capturas |
| N3 Agente | 1.5-2 sem | **2-2.5 sem** | Sin REST: hay que integrar la librería binaria y montar el VPS |
| Conciliación de clientes | riesgo de días | **1-2 días** | El mapeo por número + comprobación por nombre lo automatiza |
| **Total Parte B** | 7-9 sem | **7-9 sem** | Se compensa: lo que cuesta la API binaria lo devuelve la conciliación |

Lo que sí cambia sustancialmente es el **riesgo**: la incógnita que podía convertir 7 semanas en 10 (que `WinboxNumber` no casara con nada) está prácticamente descartada.
