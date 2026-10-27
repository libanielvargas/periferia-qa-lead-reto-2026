/**
 * Un turno REAL contra el proveedor LLM, por consola (no reemplaza a demo.ts).
 * Sirve para comprobar que el adaptador, las definiciones de herramientas y el ciclo
 * funcionan contra el modelo de verdad, gastando un solo turno.
 *
 * Uso: npm run demo:llm -- "Procesa sol-004 y no la crees hasta que lo confirme"
 */
import { resolve } from "node:path"
import { AdaptadorAnthropic } from "./src/llm/anthropic.ts"
import { ejecutarTurno, obtenerSesion } from "./src/agent/ciclo.ts"

const clave = process.env.ANTHROPIC_API_KEY
if (!clave) {
  console.error(
    "Falta ANTHROPIC_API_KEY en el entorno. Esta comprobación consume tokens del proveedor;\n" +
      "para verificar las herramientas sin modelo use: npm run demo",
  )
  process.exit(1)
}

const mensaje =
  process.argv.slice(2).join(" ") ||
  'Procesa la solicitud "sol-004". Muéstrame la OC como quedaría en SAP, qué validaciones pasó y cuáles no, y no la crees hasta que yo lo confirme.'

const adaptador = new AdaptadorAnthropic(clave, process.env.LLM_MODEL ?? "claude-sonnet-5")
const ctx = { directory: resolve(import.meta.dirname), sessionId: "demo-llm" }

console.log(`▸ proveedor ${adaptador.proveedor} · modelo ${adaptador.modelo}`)
console.log(`▸ usuario: ${mensaje}\n`)

const turno = await ejecutarTurno(adaptador, obtenerSesion(ctx.sessionId), mensaje, ctx)

for (const llamada of turno.toolCalls) {
  console.log(`  ${llamada.ok ? "✓" : "✗"} ${llamada.nombre} · ${llamada.resumen}`)
}
console.log(`\n${turno.reply}\n`)
console.log(
  `▸ iteraciones: ${turno.iteraciones} · tokens entrada/salida: ${turno.uso.tokens_entrada}/${turno.uso.tokens_salida}` +
    ` · esperando confirmación: ${turno.needsConfirmation}`,
)
