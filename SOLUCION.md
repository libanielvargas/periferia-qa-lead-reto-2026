# SOLUCIÓN — Reto técnico 03 · Agente conversacional "Órdenes de Compra SAP"

Candidato: Libaniel Vargas · 27-oct-2026 · Equipo Perxia 2.0, Periferia IT Group

---

## 1. Problema en una frase

La analista administrativa redigita a mano en SAP cada orden de compra que llega por
correo, y la validación de que quien aprueba puede aprobar ese monto en ese centro de
costos es mental, no sistemática. Le duele a ella (tiempo y errores que se pagan en cierre
contable), a contabilidad (gasto sin control verificable) y a la dirección, que hoy no
puede medir qué porcentaje de las OC se crea después de que llegó la factura.

## 2. Arquitectura

```
┌──────────────────────┐   HTTP/JSON    ┌──────────────────────────────────────────────┐
│ web/index.html       │ ─────────────▶ │ src/server.ts  (node:http, sin framework)    │
│ · historial          │ ◀───────────── │  · POST /api/chat · GET /api/sessions/:id    │
│ · tool calls         │                │  · GET /api/health · GET /api/casos          │
│ · confirmación       │                └───────┬──────────────────────────────────────┘
└──────────────────────┘                        │
                                   ┌────────────▼─────────────┐
                                   │ src/agent/ciclo.ts       │  tope de iteraciones,
                                   │ prompt → modelo →        │  tope de tokens,
                                   │ herramientas → respuesta │  sesiones en memoria
                                   └────┬──────────────┬──────┘
                        ┌───────────────▼──┐      ┌────▼─────────────────────┐
                        │ src/llm/         │      │ src/tools/oc.ts          │
                        │ adapter.ts (iface)│      │ herramientas zod         │
                        │ anthropic.ts      │      │ registro.ts (validación) │
                        └──────────────────┘      └────┬─────────────────────┘
                                        ┌──────────────▼──────────────┐
                                        │ src/lib/  controles RC1–RC10│
                                        │ parseo · maestros · payload │
                                        │ evidencia · control.csv     │
                                        └────┬───────────────────┬────┘
                                   ┌─────────▼────────┐   ┌──────▼──────────────┐
                                   │ src/sap/adapter  │   │ fixtures/ (lectura) │
                                   │ src/sap/mock.ts  │   │ out/     (escritura)│
                                   └──────────────────┘   └─────────────────────┘
```

La separación que pide el PRD §6.5 está explícita:

| Capa | Dónde vive | Qué cambia si cambia |
|---|---|---|
| **Comportamiento** | `agent/prompt.md` | Cómo conversa, cuándo pregunta, qué no hace. |
| **Conocimiento** | `src/knowledge/ordenes-compra.md` | El proceso de compras y el significado de cada control. |
| **Ejecución** | `src/tools/oc.ts` + `src/lib/` | Las reglas que se calculan y los artefactos que se escriben. |

Un cambio de reglas de negocio toca `src/lib/controles.ts` y el conocimiento; **no toca el
servidor ni el ciclo del agente**. Un cambio de proveedor LLM toca solo `src/llm/`.
El system prompt se arma en ejecución como `prompt.md` + conocimiento, así que el modelo
nunca lee reglas embebidas en código.

**Por qué Node puro sin framework web:** la API tiene cuatro rutas y un archivo estático.
Express habría añadido una dependencia y una capa de abstracción que ninguna vertical
necesitaba. Node 22.6+ ejecuta TypeScript nativo, así que tampoco hay paso de build ni
bundler: `npm run dev` levanta front y backend en un comando, en segundos.

## 3. Ciclo del agente

`src/agent/ciclo.ts`, un bucle explícito (no el tool runner del SDK) para poder registrar
y resumir cada llamada:

1. El mensaje del usuario entra al historial de la sesión y a `out/log.jsonl`.
2. Se envía al modelo el system prompt (comportamiento + conocimiento, con `cache_control`
   para no pagarlo completo en cada turno), el historial y las definiciones de las cinco
   herramientas derivadas de sus propios esquemas Zod.
3. Si el modelo pide herramientas, cada argumento se **valida con Zod antes de ejecutar**;
   un argumento inválido vuelve al modelo como `{ ok:false, error }` en lugar de romper el
   turno. Los resultados se devuelven como `tool_result` y el bucle sigue.
4. Si el modelo responde texto sin pedir herramientas, el turno termina.

| Regla PRD | Cómo se implementó |
|---|---|
| CA1 · tope de iteraciones | `AGENTE_MAX_ITERACIONES` (25). Al alcanzarlo el agente responde con lo que ejecutó y qué falta decidir, en vez de cortarse. Probado en `tests/api-y-ciclo.test.ts`. |
| CA2 · no afirmar valores propios | El prompt lo prohíbe explícitamente y el diseño lo hace innecesario: todo monto, código SAP, número de OC y hash sale de una herramienta. El payload que se persiste es el que validó Zod, no uno que el modelo pueda reescribir. |
| CA3 · confirmación humana | `oc_crear` exige `confirmado: true` y lo verifica **contra la validación recalculada del fixture**, no contra lo que diga el modelo: si hay confirmaciones pendientes y no llega `confirmado`, la herramienta se niega y registra `pendiente_confirmacion`. El backend marca el turno `needsConfirmation` y el front lo resalta en ámbar. |
| CA4 · trazabilidad | Toda llamada queda en el historial visible del chat y en `out/log.jsonl`. |
| CA5 · errores no matan la sesión | Los errores del proveedor se traducen a frases claras (`ErrorProveedor`) y vuelven con HTTP 502 sin borrar la sesión; los de herramienta llegan resumidos al chat. |

Costo: además del tope por turno hay un tope de **tokens por sesión** (200 000 por
defecto). Al alcanzarlo la sesión responde que debe abrirse una nueva, de modo que un
visitante del link público no puede consumir la clave sin límite.

## 4. Elección del modelo

**Anthropic · `claude-sonnet-5`** (configurable con `LLM_MODEL`; el adaptador no depende
del modelo).

Por qué: este flujo no requiere razonamiento abierto, requiere *disciplina de herramientas*
—llamar la correcta, no inventar valores, parar y preguntar—. Sonnet 5 cumple eso con
un costo por caso tres veces menor que un modelo de la gama superior, y el adaptador
permite subir a Opus con una variable de entorno si en la defensa se quiere comparar.

Costo estimado por caso procesado (tarifa Sonnet 5: USD 2 / MTok entrada, 10 / MTok salida):

| Concepto | Tokens aprox. | Costo |
|---|---|---|
| System prompt (prompt + conocimiento), 1.ª vez | ~2 500 entrada | 0,005 USD |
| 3–4 iteraciones del turno (historial + resultados de herramienta) | ~9 000 entrada | 0,018 USD |
| Respuestas del modelo (tabla de la OC + preguntas) | ~1 200 salida | 0,012 USD |
| **Total por caso completo, incluida la confirmación** | | **≈ 0,035 USD** |

Con caché de prompt el system prompt se cobra a una fracción desde el segundo turno, así
que un caso que se procese en dos turnos (validar → confirmar) queda por debajo de 0,04
USD. A 500 OC/mes son unos 20 USD mensuales de modelo, frente al tiempo de digitación que
reemplaza.

## 5. Matriz de controles RC1–RC10

| # | Implementación (`src/lib/controles.ts`) | Tipo | Prueba |
|---|---|---|---|
| RC1 | Busca el proveedor por NIT normalizado (dígitos, sin dígito de verificación) y, si la solicitud no trae NIT, por nombre normalizado (sin acentos ni sufijo societario). Distingue *inexistente* de *inactivo*. | Bloqueo | `sol-002` + caso de proveedor inactivo |
| RC2 | Exige aprobación presente, con "Aprobado" en el cuerpo, y que el remitente figure como aprobador del centro de costos. Enumera los válidos en el mensaje. | Bloqueo | `sol-003` + aprobación sin "Aprobado" |
| RC3 | `valor_total` ≤ tope del aprobador autorizado. Si el aprobador no está autorizado, compara contra el tope más alto del centro para decir si *alguien* podría aprobarlo. | Bloqueo | `sol-003` + monto sobre tope |
| RC4 | `subarea` ∈ `subareas` del centro; también bloquea si el centro no existe. | Bloqueo | subárea ajena |
| RC5 | `abs(cotización − solicitud) / solicitud ≤ 2 %`; sin cotización, confirmación. | Confirmación | `sol-004` + caso sin cotización |
| RC6 | IVA ausente → se deriva de `indicador_iva_default` y se confirma; si el proveedor no existe, bloquea (no hay de dónde derivar); si el código informado no está en el maestro, bloquea. | Confirmación + derivado | `sol-006` |
| RC7 | Condiciones de pago ausentes → se derivan del proveedor y **solo se informan**. | Derivado | `sol-006` (se verifica que *no* aparezca como confirmación) |
| RC8 | `factura.fecha < fecha_solicitud` → `retroactiva = true` + confirmación + fila en `control.csv`. | Confirmación | `sol-005` |
| RC9 | `fecha_aprobación ≥ fecha_solicitud`. | Confirmación | aprobación antedatada |
| RC10 | `cantidad × valor_unitario = valor_total ± 1`. | Bloqueo | cantidad alterada |

**La más difícil: RC1.** No por la regla, sino porque la identidad del proveedor llega
escrita de tres formas distintas en el mismo paquete: `900555111` en la solicitud,
`900.555.111-2` en la cotización y `TecnoSuministros S.A.S.` como nombre. Y `sol-006` no
trae NIT, así que el único camino es el nombre. Resolverlo "a ojo" con `includes` habría
dado falsos positivos entre razones sociales parecidas; resolverlo comparando cadenas
exactas habría bloqueado `sol-006`. La solución fue normalizar en dos claves explícitas
(`clavNit` quita el dígito de verificación, `clavNombre` quita acentos, puntuación y
sufijo societario) y usar el NIT como clave primaria y el nombre como respaldo, con el
orden documentado. Es también la decisión con más riesgo en producción: dos proveedores
distintos con nombre casi igual y sin NIT se confundirían, y por eso en producción el
maestro debe consultarse en SAP por NIT obligatorio (ver §12).

**Segundo punto sutil:** la unidad de medida SAP (`UN`/`H`/`MES`) no existe en ninguna
fuente; hay que derivarla de la descripción. La primera versión leyó "vigencia 12 meses"
en `sol-001` y puso `MES`, cuando lo que se compran son 120 licencias. La corrección fue
distinguir *lo que mide la cantidad* de *la duración del ítem*: `MES` exige un servicio
facturado por mes ("mensual", "por mes"), no una vigencia. Queda como prueba explícita.

## 6. Diseño del adaptador SAP real

Hoy `src/sap/mock.ts` implementa `SapAdapter` sobre archivos. El diseño real, dado que la
viabilidad de integración **no está confirmada**:

**Opción elegida: OData `API_PURCHASEORDER_PROCESS_SRV` (API_PURCHASEORDER_2) vía SAP
Integration Suite como intermediario.** Por qué:

- Es la API pública y versionada de SAP para órdenes de compra; `BAPI_PO_CREATE1` por
  RFC obliga a abrir puertos, instalar el SDK NW RFC y acoplarse a estructuras ABAP que
  cambian con cada upgrade. OData habla HTTP/JSON, que es lo que este agente ya produce.
- Integration Suite en el medio resuelve tres cosas que no quiero dentro del agente:
  custodia de credenciales, reintentos con idempotencia, y un punto único de auditoría
  para contabilidad.
- Si Basis no autoriza Integration Suite, el mismo adaptador apunta directo al gateway
  OData del S/4; la interfaz no cambia.

**Mapeo del payload (§7.4 → OData):**

| Payload propio | Entidad/campo OData |
|---|---|
| `sociedad` | `A_PurchaseOrder/CompanyCode` |
| `organizacion_compras` | `PurchasingOrganization` (+ `PurchasingGroup` por configurar) |
| `proveedor.codigo_sap` | `Supplier` |
| `moneda` | `DocumentCurrency` |
| `condiciones_pago` | `PaymentTerms` |
| `referencia.solicitud_id` | `PurchaseOrderByCustomer` (clave de idempotencia) y `CorrespncExternalReference` |
| `posiciones[].descripcion` | `A_PurchaseOrderItem/PurchaseOrderItemText` (40 car., ya recortado en origen) |
| `posiciones[].cantidad` / `precio_unitario` | `OrderQuantity` / `NetPriceAmount` + `NetPriceQuantity` |
| `posiciones[].unidad` | `PurchaseOrderQuantityUnit` (`UN`→`EA`, `H`→`HUR`, `MES`→`MON` por tabla de conversión ISO) |
| `posiciones[].centro_costo` / `subarea` | `A_PurOrdAccountAssignment/CostCenter` y `ProfitCenter` o campo Z según diseño de Controlling |
| `posiciones[].indicador_iva` | `TaxCode` |
| `aprobador.evidencia_sha256` | Adjunto por `API_CV_ATTACHMENT_SRV` (DMS), con el hash en el nombre lógico |
| `excepciones[]` | No viaja a SAP: queda en `control.csv` y en el log de auditoría |

**Autenticación y credenciales:** OAuth 2.0 client credentials contra el tenant de
Integration Suite; mTLS si Basis lo exige. Las credenciales viven en el gestor de secretos
de la plataforma (Azure Key Vault o SAP Credential Store) y se inyectan como variables de
entorno al backend en el arranque. **Nunca** en el repositorio, en el prompt, en el
historial de la conversación ni en los logs: el modelo no necesita credenciales porque no
llama a SAP, llama a una herramienta que las usa en el servidor.

**Idempotencia y error parcial:** la clave natural es `solicitud_id`. Antes de crear,
`buscarOrdenPorReferencia` consulta `A_PurchaseOrder?$filter=PurchaseOrderByCustomer eq
'<solicitud_id>'`; si existe, se devuelve ese número y la operación no se repite (es
exactamente el contrato que ya cumple el mock y que está probado). Para el reintento tras
timeout se envía además un `x-idempotency-key` derivado de `solicitud_id` + hash del
payload, de modo que un reintento con el mismo contenido sea un no-op y un reintento con
contenido distinto falle explícitamente en lugar de crear una OC gemela. Si SAP responde
con error parcial —cabecera creada y posición rechazada— el adaptador **no intenta
arreglarla**: marca la OC como incompleta en `control.csv`, deja el `numero_oc` que SAP ya
asignó y devuelve al humano la posición y el mensaje de SAP. Crear órdenes a medias sin
avisar es peor que no crearlas.

**Plan B si la conexión no es viable:** el valor del agente no depende de escribir en SAP.
Con el mismo payload validado se entrega (a) un archivo de carga masiva en el formato que
acepte el equipo de SAP (LSMW/LTMC o un CSV plano), que la analista sube en lote una vez al
día, y (b) una vista "lista para pegar" con los campos en el orden exacto de la pantalla
`ME21N`, más la evidencia ya generada y adjunta. La digitación baja de ocho campos
pensados a una verificación visual, y los controles RC1–RC10 ya se aplicaron. El 100 % del
ahorro en validación y el 100 % de la medición de retroactivas se consiguen sin integración.

## 7. Lectura del proceso: las OC retroactivas

Lo que le diría a la dirección es que hoy no tienen un problema de digitación, tienen un
problema de **secuencia**, y que la digitación es solo donde se nota. Una OC creada después
de la factura significa que alguien comprometió plata de la compañía sin que existiera un
documento de compromiso: la cotización no se contrastó, el tope del aprobador no se
verificó antes del gasto sino después, y la OC pasó de ser un control a ser un trámite para
poder radicar la factura. El dato que falta no es cuántas OC se digitan mal, es qué
proporción del gasto entró por esa puerta: `sol-005` es ese caso, y hoy es indistinguible
de `sol-001` en cualquier reporte.

Por eso el agente no las rechaza. Rechazarlas sin medirlas solo movería el desvío a otro
lado —se crearía la OC con fecha retroactiva a mano— y la compañía perdería la única
oportunidad de verlo. Lo que hace es marcarlas: cada intento queda en `out/control.csv`
con `retroactiva = true/false`, el centro de costos y el aprobador. En un mes eso da el
porcentaje real, por área y por proveedor, y esa conversación ya no es una opinión.

El cambio de proceso que propondría es el más barato de los posibles: **la factura no se
radica sin OC previa, y el bloqueo vive en cuentas por pagar, no en compras.** Hoy el
incentivo está invertido: quien necesita la OC retroactiva es contabilidad, para poder
pagar, así que la presión cae sobre la analista que no originó el desvío. Si el requisito
se verifica al radicar, la presión vuelve a quien compró sin orden. Y como habrá excepciones
legítimas (servicios recurrentes, emergencias), propondría una figura de OC abierta o marco
por proveedor recurrente para los casos previsibles, y que el resto pase por una aprobación
explícita del líder *consciente de que está autorizando una compra retroactiva*. Primero
medir tres meses con el agente, después poner el umbral: una política puesta sin la línea
base se convierte en una excepción permanente.

## 8. Decisiones y trade-offs

**1. La confirmación se verifica en la herramienta, no en el prompt.**
`oc_crear` recalcula la validación desde el fixture y se niega si hay confirmaciones
pendientes sin `confirmado: true`. *Alternativa descartada:* confiar en que el modelo
respete la instrucción del prompt de preguntar primero. La descarté porque el riesgo que
el propio PRD señala (§10: "el modelo arregle un monto para que cuadre") es un riesgo de
diseño, no de redacción: si la única barrera es una frase en el prompt, un turno mal
interpretado crea una OC real. El costo es que la herramienta vuelve a leer y validar el
fixture en cada llamada (microsegundos) y que el modelo no puede "ayudar" saltándose el
paso. Me parece el lado correcto del intercambio.

**2. Bucle propio en lugar del tool runner del SDK.**
*Alternativa descartada:* `client.beta.messages.tool_runner`, que habría ahorrado unas 60
líneas. La descarté porque el PRD exige que el front muestre cada llamada con su resultado
resumido, que todo quede en `out/log.jsonl` y que exista un tope de iteraciones con una
respuesta útil al alcanzarlo; con el bucle explícito eso son tres puntos obvios del código
en lugar de tres hooks. El costo es mantener el bucle yo mismo, y que un cambio de
proveedor obliga a traducir bloques en `src/llm/` — que es precisamente lo que la interfaz
`LlmAdapter` aísla.

**3. Node nativo para TypeScript, sin bundler y sin framework web.**
*Alternativa descartada:* Vite + Express (o Bun). La descarté porque añadía dependencias,
configuración y un paso de build para cuatro rutas HTTP y un HTML; el PRD pide arrancar en
menos de dos minutos en una máquina limpia y aquí son `npm install` y `npm run dev`. El
costo es que el front es HTML y JavaScript a mano en vez de React: menos ergonomía para
crecer, suficiente para un chat con historial, llamadas desplegables y un estado
resaltado. Si esto creciera a un producto, el front es la primera pieza que reescribiría.

**4. SAP simulado que relee el archivo en cada operación.**
*Alternativa descartada:* contador en memoria. La descarté porque la idempotencia que pide
HU-5 debe sobrevivir a un reinicio del servidor; con el estado en `out/sap/ordenes.jsonl`
reiniciar no duplica órdenes. El costo es leer el archivo completo en cada creación: con
miles de órdenes habría que indexar, pero en este alcance es correcto y es lo que hace la
prueba de idempotencia verificable.

## 9. Supuestos al interpretar el PRD

1. **`oc_validar` puede releer el fixture.** El contrato recibe `{ caso, paquete }`, pero
   acepto que el paquete se omita y lo releo del caso. Evita que un paquete manipulado en
   la conversación cambie el resultado de un control, y hace cada herramienta usable sola.
2. **RC3 cuando el aprobador no está autorizado.** El PRD define RC3 contra "el tope del
   aprobador". Si el aprobador no es aprobador de ese centro, no hay tope que comparar; en
   ese caso comparo contra el tope más alto del centro y reporto RC3 solo si ningún
   aprobador podría autorizarlo. En `sol-003` eso agrega un segundo bloqueo (RC2 + RC3)
   que es cierto y útil: ni cambiando de aprobador se arreglaría.
3. **Un bloqueo no se confirma.** `confirmado: true` solo levanta confirmaciones. Un caso
   bloqueado no se crea ni con confirmación, y se registra como `bloqueada`.
4. **"Aprobado" se detecta con tolerancia de forma** (mayúsculas, "Aprobada"), no por
   coincidencia exacta de cadena: `sol-003` dice "Aprobado desde comercial".
5. **El valor de la OC es siempre el de la solicitud aprobada**, nunca el de la cotización,
   incluso cuando la analista confirma la discrepancia de RC5. La cotización es evidencia
   para decidir, no fuente del monto; cambiarlo requeriría una nueva aprobación.
6. **Una sola posición por OC.** Los fixtures traen un ítem por solicitud. El esquema es un
   arreglo y el payload numera desde 10, listo para varias, pero no inventé un partidor de
   descripciones que los datos no sustentan.
7. **La unidad SAP se deriva de la descripción** (§5), porque no está en ninguna fuente, y
   se declara como `derivado` en la trazabilidad para que sea revisable.
8. **`validez_hasta` de la cotización se calcula** sumando los días de validez a la fecha
   del documento, y se reporta como dato de la cotización.
9. **Sesiones en memoria.** El PRD las permite en memoria o archivo; en memoria es
   suficiente para la defensa y evita persistir conversaciones sin necesidad.

## 10. Cobertura

| Historia | Estado | Evidencia | Qué falta para producción |
|---|---|---|---|
| HU-1 · Leer el paquete | **Hecho** | `oc_leer_paquete`, 6 casos en `npm run demo`; adjunto ausente → `null` + `faltantes`, sin excepción | Leer `.xlsx` y `.pdf` reales (hoy los fixtures vienen normalizados) e ingesta del buzón de correo |
| HU-2 · Validar contra maestros | **Hecho** | RC1–RC10 con prueba por control (`tests/controles.test.ts`) | Maestros en vivo desde SAP en vez de JSON; política para proveedor inactivo |
| HU-3 · Construir el payload | **Hecho** | `out/<caso>/trazabilidad.json` con fuente declarada por campo; esquema Zod | Varias posiciones por OC; `PurchasingGroup` y reglas de Controlling reales |
| HU-4 · Evidencia de aprobación | **Hecho (P0)** | `out/<caso>/aprobacion.txt` + `sha256` verificable con `shasum -a 256` | PDF (P1, no implementado) y adjuntar al documento en SAP DMS; firma digital si auditoría la exige |
| HU-5 · Crear la OC en SAP | **Hecho (simulado)** | Numeración desde `4500000001`, idempotencia probada, `out/control.csv` por intento | El adaptador OData real de §6 |
| HU-6 · Manejo de errores | **Hecho** | `{ ok:false, error }` en todas las herramientas; JSON malformado, monto no numérico y caso inexistente probados | Alertas operativas y reintentos ante caída de SAP |
| §6.1 · Front de chat | **Hecho** | Historial, "pensando", cada tool call desplegable, confirmación resaltada, responsive | Streaming de la respuesta; accesibilidad revisada; reescritura en React si crece |
| §6.3 · Ciclo del agente | **Hecho** | CA1–CA5 con prueba (`tests/api-y-ciclo.test.ts`) | Observabilidad (trazas, métricas de costo por caso) |
| §9.4 · Bonus módulo reutilizable | **No hecho** | — | Es bonus y los requisitos obligatorios eran la prioridad del reloj |

Pruebas: **33 verdes** (`npm test`) sobre cuatro capas —normalización y controles, contrato
de herramientas con los artefactos en disco como oráculo, ciclo del agente con adaptador
guionado, y contrato HTTP contra el servidor real—, más `npm run demo` como verificación
integral sin modelo. `npm run typecheck` pasa en modo estricto, sin `any`.

## 11. Uso de IA para construir

| Asistente | Para qué | Qué descarté de lo que propuso |
|---|---|---|
| **Claude Code (Opus 5)** en VS Code | Casi todo el código de esta solución, dirigido por mí: dominio y esquemas Zod, controles RC1–RC10, herramientas, ciclo del agente, servidor, front, pruebas y esta documentación. | Dos cosas, ambas detectadas al revisar la salida. (a) Su primer heurístico de unidad de medida leyó "vigencia 12 meses" como unidad y puso `MES` en `sol-001`, cuando lo que se compran son 120 licencias; lo corregí distinguiendo duración de unidad de medida y quedó como prueba. (b) Fijó `claude-opus-5` como modelo por defecto; lo bajé a Sonnet 5 por costo por caso, dejando el modelo configurable por variable de entorno. |
| **Claude (chat)** | Contrastar la elección de integración SAP (OData vs. BAPI vs. Integration Suite) y el mapeo de campos de §6. | La propuesta inicial de usar RFC/BAPI por ser "el estándar histórico": no se sostiene con una viabilidad no confirmada, porque exige infraestructura antes de poder probar algo. |

Puedo explicar cada línea entregada: los límites los puse yo (bucle propio en vez del tool
runner, validación de confirmación en la herramienta, Node nativo sin bundler, un solo
ítem por OC) y cada decisión está justificada en §8 y §9. Lo que la IA aportó fue
velocidad de escritura, no criterio de diseño.

## 12. Riesgos en producción y mitigación

| Riesgo | Por qué importa | Mitigación |
|---|---|---|
| **Identidad del proveedor por nombre** (RC1) | Dos razones sociales parecidas sin NIT podrían confundirse y mandar la OC al proveedor equivocado. | NIT obligatorio en la solicitud; el match por nombre pasa a ser una *sugerencia que la analista confirma*, no una resolución automática. |
| **Maestros desactualizados** | Los fixtures se asumen completos; en producción un tope o un aprobador viejo valida mal. | Consultar maestros en SAP en tiempo real con caché corta e invalidación; registrar en `control.csv` la versión del maestro usada. |
| **El modelo altera un valor del payload** | Es el riesgo que el PRD marca en §10. | Ya mitigado por diseño: los montos salen de las herramientas y se persiste el payload validado por Zod, no lo que el modelo escriba. Reforzaría con una comparación del payload contra la solicitud antes de enviar a SAP. |
| **Confirmación por chat como evidencia de control** | "Confirmo" en una conversación no identifica a la persona: no hay autenticación (fuera del alcance del reto). | Autenticación y usuario nominal antes de producción; el `confirmado_por` debe venir de la sesión autenticada, no de un texto. Hoy el link es público: **no debe recibir datos reales**. |
| **Evidencia sin firma** | Un TXT con hash demuestra integridad, no autoría; auditoría puede exigir más. | Firmar el artefacto o conservar el `.eml` original con sus cabeceras y DKIM, y adjuntar en DMS con retención. |
| **Costo y abuso del link público** | Una clave propia expuesta en un chat abierto. | Ya hay topes por turno y por sesión; en producción, autenticación, cuota por usuario y alertas de consumo. |
| **Doble creación ante timeout de SAP** | Un reintento ciego crea una OC gemela que alguien tendrá que anular. | Idempotencia por `solicitud_id` + `x-idempotency-key` (§6); ante error parcial, no reintentar: devolver al humano. |
| **Fixtures como contrato de datos** | El agente confía en la forma normalizada; un Excel real traerá celdas vacías, montos como texto y nombres con espacios. | La normalización ya rechaza montos no numéricos con error legible; antes de producción, una batería de Excel reales y una cola de "paquetes ilegibles" revisada por la analista. |

---

## 13. Link de prueba

**URL pública (túnel Cloudflare efímero, activo durante la defensa):**
`https://christmas-counseling-expenditures-boards.trycloudflare.com`

Sin clave de acceso: el PRD permite el link público. El `sessionId` lo genera el navegador,
así que cada pestaña es una conversación independiente.

Verificación externa en el momento de la entrega:

```
$ curl -s https://christmas-counseling-expenditures-boards.trycloudflare.com/api/health
{"ok":true,"provider":"anthropic","model":"claude-sonnet-5", ... }
$ curl -o /dev/null -w "%{http_code}" https://christmas-counseling-expenditures-boards.trycloudflare.com/
200
```

El túnel es efímero: si cambia la URL, se regenera con `cloudflared tunnel --url
http://localhost:8787` y se actualiza aquí. En local, `npm run dev`.
