# Agente conversacional "Órdenes de Compra SAP" — Reto técnico 03

Agente que lee el paquete de una solicitud de compra (correo, solicitud, cotización y
aprobación del líder), lo valida contra los maestros, construye la orden de compra como
quedaría en SAP, genera la evidencia de aprobación y crea la OC en un SAP simulado.
Las excepciones no se resuelven a la fuerza: se clasifican y vuelven al humano.

- **Link de prueba:** https://static-baseline-vatican-anatomy.trycloudflare.com (túnel efímero; si cambia, se regenera y se actualiza en `SOLUCION.md` §13).
- **IA real verificada:** Groq (modelo `openai/gpt-oss-120b`) respondió por `/api/chat` desde la URL pública y ejecutó `oc_leer_paquete` y `oc_validar` para `sol-004`, sin crear la orden sin autorización.
- **Interfaz:** identidad original de Periferia, chat con historial desplazable y compositor fijo.
- **Sin autenticación:** el link es público, como permite el PRD §6.1.
- **Planteamiento de la solución:** [`SOLUCION.md`](SOLUCION.md).

## Levantar en local (un comando)

Requiere **Node 22.6+** (ejecuta TypeScript nativo; no hay paso de build). Probado en Node 25.2.

```bash
npm install
cp .env.example .env     # y configure GROQ_API_KEY (o ANTHROPIC_API_KEY)
npm run dev              # front + API en http://localhost:8794
```

Sin clave el servidor arranca igual: sirve el front, responde `/api/health` y `/api/chat`
devuelve `503` explicando que falta la credencial. Las herramientas siguen verificables
con `npm run demo`.

### Variables de entorno

| Variable | Obligatoria | Para qué |
|---|---|---|
| `GROQ_API_KEY` | para Groq | Clave privada del proveedor preferido; solo en el backend. |
| `ANTHROPIC_API_KEY` | alternativa | Clave de Anthropic si Groq no está configurado. |
| `LLM_MODEL` | no | Modelo; por defecto Groq `openai/gpt-oss-120b` cuando GROQ_API_KEY está configurada. |
| `PORT` | no | Puerto del backend; por defecto `8787`. |
| `AGENTE_MAX_ITERACIONES` | no | Tope de iteraciones herramienta→modelo por turno (25). |
| `AGENTE_MAX_TOKENS_SESION` | no | Tope de tokens por sesión (200 000). |
| `AGENTE_MAX_TOKENS_RESPUESTA` | no | `max_tokens` por petición (4 000). |

## Verificación

```bash
npm run demo        # los 6 casos sin modelo y sin clave (PRD §6.6)
npm test            # 33 pruebas: datos, herramientas, ciclo del agente y API
npm run typecheck   # TypeScript estricto, sin `any`
```

`npm run demo` limpia `out/` al inicio, procesa los seis casos, repite `sol-001` para
mostrar la idempotencia y crea `sol-004`, `sol-005` y `sol-006` con confirmación explícita.

`npm test` no gasta tokens de ningún proveedor: el ciclo del agente se prueba con un
adaptador LLM guionado. El adaptador real se verifica con el chat (`npm run dev`) o con
`npm run demo:llm` si quiere un turno real contra el proveedor.

### Evidencia reproducible

| Artefacto | Qué demuestra |
|---|---|
| `out/control.csv` | Una fila por intento: `creada`, `idempotente`, `bloqueada` o `pendiente_confirmacion`, con `retroactiva` y los códigos de control. |
| `out/sap/ordenes.jsonl` | Órdenes del SAP simulado, numeradas desde `4500000001`. |
| `out/<caso>/aprobacion.txt` | Evidencia de aprobación. Verifique el hash: `shasum -a 256 out/sol-001/aprobacion.txt` coincide con el `evidencia_sha256` del payload. |
| `out/<caso>/trazabilidad.json` | Fuente declarada de cada campo del payload. |
| `out/log.jsonl` | Toda llamada a herramienta ejecutada por el agente. |

## API

| Método | Ruta | Cuerpo / respuesta |
|---|---|---|
| `POST` | `/api/chat` | `{ sessionId, message }` → `{ ok, reply, toolCalls[], needsConfirmation, iteraciones, uso }` |
| `GET` | `/api/sessions/:id` | Historial visible de la sesión y tokens consumidos |
| `GET` | `/api/health` | `{ ok, provider, model, llm_configurado, herramientas, limites }` — nunca la clave |
| `GET` | `/api/casos` | Casos disponibles en `fixtures/reto-03/solicitudes` |

Ejemplo:

```bash
curl -s localhost:8794/api/chat -H 'content-type: application/json' \
  -d '{"sessionId":"demo","message":"Procesa la solicitud sol-004 y no la crees hasta que yo lo confirme."}'
```

## Estructura

```
agent/prompt.md              comportamiento del agente (system prompt)
src/knowledge/               conocimiento del proceso de compras
src/tools/oc.ts              herramientas tipadas con zod (oc_<export>)
src/tools/registro.ts        validación de argumentos y despacho
src/lib/                     dominio, parseo, maestros, controles RC1–RC10, payload, evidencia, control.csv
src/llm/adapter.ts           interfaz del proveedor LLM
src/llm/groq.ts              implementación con Groq y tool-calling real
src/llm/anthropic.ts         alternativa con SDK de Anthropic
src/sap/adapter.ts|mock.ts   interfaz SapAdapter y SAP simulado sobre archivos
src/agent/ciclo.ts           ciclo del agente, sesiones y topes
src/server.ts                API HTTP y servidor del front
web/index.html               chat (historial, tool calls visibles, confirmación resaltada)
demo.ts                      herramientas sin modelo
tests/                       pruebas de datos, herramientas, ciclo y API
fixtures/                    entregados por Periferia — no se modifican
out/                         generado en ejecución (no versionado)
```

## Chat: qué pedirle

```
Procesa la solicitud "sol-004". Muéstrame la OC como quedaría en SAP, qué
validaciones pasó y cuáles no, y no la crees hasta que yo lo confirme.
```

El front muestra cada llamada a herramienta (nombre, argumentos y resultado) y resalta en
ámbar el turno cuando el agente queda esperando su confirmación. Responda "confirmo" en el
mensaje siguiente para que cree la OC.

## Notas de seguridad

- La clave del modelo se lee solo de la variable de entorno del backend; no aparece en el
  repositorio, el front, los logs ni las respuestas de la API (hay una prueba que lo afirma).
- Las herramientas no ejecutan comandos de shell y resuelven rutas siempre dentro del
  proyecto: un `caso` con separadores de ruta se rechaza.
- `fixtures/` es de solo lectura; todo lo que se escribe va a `out/`.
- Topes de iteraciones y de tokens por sesión evitan que un usuario del link gaste la clave
  sin límite.
