/**
 * Capa API + ciclo del agente.
 *
 * El ciclo se prueba con un adaptador LLM falso (guion de respuestas): valida CA1 tope de
 * iteraciones, CA3 confirmación en un mensaje posterior y CA4 registro en out/log.jsonl
 * SIN gastar tokens de ningún proveedor. El adaptador real se prueba por separado contra
 * el proveedor cuando hay clave (ver README, sección "Verificación").
 */
import { strict as assert } from "node:assert"
import { after, test } from "node:test"
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import { spawn, type ChildProcess } from "node:child_process"
import { ejecutarTurno, obtenerSesion } from "../src/agent/ciclo.ts"
import type { LlmAdapter, OpcionesEnvio, RespuestaLlm } from "../src/llm/adapter.ts"
import type { Contexto } from "../src/tools/oc.ts"

const RAIZ = resolve(import.meta.dirname, "..")

function entornoAislado(): { ctx: Contexto; limpiar: () => void } {
  const base = mkdtempSync(join(tmpdir(), "reto03-api-"))
  cpSync(join(RAIZ, "fixtures"), join(base, "fixtures"), { recursive: true })
  cpSync(join(RAIZ, "agent"), join(base, "agent"), { recursive: true })
  cpSync(join(RAIZ, "src", "knowledge"), join(base, "src", "knowledge"), { recursive: true })
  return {
    ctx: { directory: base, sessionId: "ciclo" },
    limpiar: () => rmSync(base, { recursive: true, force: true }),
  }
}

/** Adaptador falso: devuelve el guion en orden, una respuesta por iteración. */
class LlmGuionado implements LlmAdapter {
  readonly proveedor = "falso"
  readonly modelo = "guion"
  readonly peticiones: OpcionesEnvio[] = []
  private indice = 0
  private readonly guion: RespuestaLlm[]

  constructor(guion: RespuestaLlm[]) {
    this.guion = guion
  }

  async enviar(opciones: OpcionesEnvio): Promise<RespuestaLlm> {
    this.peticiones.push(opciones)
    const respuesta = this.guion[Math.min(this.indice, this.guion.length - 1)]
    this.indice += 1
    if (!respuesta) throw new Error("guion agotado")
    return respuesta
  }
}

const uso = { tokens_entrada: 10, tokens_salida: 5 }

function texto(texto: string): RespuestaLlm {
  return { bloques: [{ tipo: "texto", texto }], pide_herramientas: false, uso }
}

function llamada(nombre: string, argumentos: Record<string, unknown>, id = "t1"): RespuestaLlm {
  return {
    bloques: [{ tipo: "llamada", id, nombre, argumentos }],
    pide_herramientas: true,
    uso,
  }
}

test("CA3 · el agente valida sol-004, no crea y el turno queda marcado needsConfirmation", async () => {
  const { ctx, limpiar } = entornoAislado()
  try {
    const llm = new LlmGuionado([
      llamada("oc_validar", { caso: "sol-004" }),
      texto("La cotización difiere 6 % de la solicitud. ¿Confirma que creo la OC?"),
    ])
    const turno = await ejecutarTurno(llm, obtenerSesion("s-ca3"), "Procesa sol-004", ctx)

    assert.equal(turno.needsConfirmation, true)
    assert.equal(turno.toolCalls.length, 1)
    assert.match(turno.toolCalls[0]?.resumen ?? "", /confirmaciones: RC5/)
    // Oráculo: no se creó nada en el SAP simulado.
    assert.equal(existsSync(join(ctx.directory, "out", "sap", "ordenes.jsonl")), false)
    // CA4: la llamada quedó en out/log.jsonl.
    const log = readFileSync(join(ctx.directory, "out", "log.jsonl"), "utf8")
    assert.match(log, /"herramienta":"oc_validar"/)
    // El system prompt enviado al modelo incluye comportamiento y conocimiento.
    assert.match(llm.peticiones[0]?.sistema ?? "", /System prompt — Agente de Órdenes de Compra SAP/)
    assert.match(llm.peticiones[0]?.sistema ?? "", /Conocimiento del proceso/)
  } finally {
    limpiar()
  }
})

test("CA3 · tras la confirmación del usuario, el agente crea la OC y el turno deja de estar pendiente", async () => {
  const { ctx, limpiar } = entornoAislado()
  try {
    const sesion = obtenerSesion("s-confirma")
    const llm = new LlmGuionado([
      llamada("oc_validar", { caso: "sol-004" }),
      texto("¿Confirma que creo la OC?"),
    ])
    await ejecutarTurno(llm, sesion, "Procesa sol-004", ctx)

    const llm2 = new LlmGuionado([
      llamada("oc_crear", { caso: "sol-004", confirmado: true, confirmado_por: "analista" }, "t2"),
      texto("Creé la OC 4500000001."),
    ])
    const segundo = await ejecutarTurno(llm2, sesion, "Confirmo, créala", ctx)

    assert.equal(segundo.needsConfirmation, false)
    assert.equal(segundo.toolCalls[0]?.ok, true)
    const ordenes = readFileSync(join(ctx.directory, "out", "sap", "ordenes.jsonl"), "utf8").trim()
    assert.match(ordenes, /"numero_oc":"4500000001"/)
    // El historial de la sesión conserva ambos turnos del usuario.
    assert.equal(sesion.historialVisible.filter((e) => e.rol === "usuario").length, 2)
  } finally {
    limpiar()
  }
})

test("CA1 · al alcanzar el tope de iteraciones el agente responde con lo que tiene", async () => {
  const { ctx, limpiar } = entornoAislado()
  try {
    // Un modelo que pide herramientas indefinidamente.
    const llm = new LlmGuionado([llamada("oc_leer_paquete", { caso: "sol-001" })])
    const turno = await ejecutarTurno(llm, obtenerSesion("s-tope"), "Procesa sol-001", ctx)

    assert.equal(turno.limiteAlcanzado, true)
    assert.equal(turno.iteraciones, 25)
    assert.match(turno.reply, /tope de 25 iteraciones/)
    assert.match(turno.reply, /Hasta aquí ejecuté/)
  } finally {
    limpiar()
  }
})

test("CA5 · un error de herramienta no mata la sesión y llega resumido al chat", async () => {
  const { ctx, limpiar } = entornoAislado()
  try {
    const llm = new LlmGuionado([
      llamada("oc_leer_paquete", { caso: "sol-999" }),
      texto("Ese caso no existe en los fixtures."),
    ])
    const turno = await ejecutarTurno(llm, obtenerSesion("s-error"), "Procesa sol-999", ctx)
    assert.equal(turno.toolCalls[0]?.ok, false)
    assert.match(turno.toolCalls[0]?.resumen ?? "", /no existe el caso/)
    assert.match(turno.reply, /no existe/)
  } finally {
    limpiar()
  }
})

// --- Capa API: contrato HTTP contra el servidor real, sin clave de proveedor. ---

const PUERTO = 8899
let servidor: ChildProcess | null = null

async function arrancarServidor(): Promise<void> {
  if (servidor !== null) return
  servidor = spawn(process.execPath, [join(RAIZ, "src", "server.ts")], {
    env: { ...process.env, PORT: String(PUERTO), ANTHROPIC_API_KEY: "" },
    stdio: "ignore",
  })
  servidor.unref()
  for (let intento = 0; intento < 50; intento += 1) {
    try {
      await fetch(`http://127.0.0.1:${PUERTO}/api/health`)
      return
    } catch {
      await new Promise((listo) => setTimeout(listo, 100))
    }
  }
  throw new Error("el servidor no respondió en 5 s")
}

after(() => servidor?.kill())

test("API · /api/health informa proveedor y modelo sin exponer la clave", async () => {
  await arrancarServidor()
  const respuesta = await fetch(`http://127.0.0.1:${PUERTO}/api/health`)
  const cuerpo = (await respuesta.json()) as Record<string, unknown>
  assert.equal(respuesta.status, 200)
  assert.equal(cuerpo.provider, "anthropic")
  assert.ok(typeof cuerpo.model === "string")
  assert.deepEqual(cuerpo.herramientas, [
    "oc_leer_paquete",
    "oc_validar",
    "oc_construir_payload",
    "oc_generar_evidencia",
    "oc_crear",
  ])
  // Falsable: ninguna parte de la respuesta contiene una credencial.
  assert.doesNotMatch(JSON.stringify(cuerpo), /sk-ant|api[_-]?key"\s*:\s*"[^"]/i)
})

test("API · /api/chat valida el cuerpo y explica la ausencia de clave con 503", async () => {
  await arrancarServidor()
  const sinSesion = await fetch(`http://127.0.0.1:${PUERTO}/api/chat`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ message: "hola" }),
  })
  assert.equal(sinSesion.status, 400)

  const sinClave = await fetch(`http://127.0.0.1:${PUERTO}/api/chat`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ sessionId: "s1", message: "Procesa sol-001" }),
  })
  assert.equal(sinClave.status, 503)
  assert.match(((await sinClave.json()) as { error: string }).error, /ANTHROPIC_API_KEY/)
})

test("API · el front y la lista de casos se sirven desde el mismo origen", async () => {
  await arrancarServidor()
  const front = await fetch(`http://127.0.0.1:${PUERTO}/`)
  assert.equal(front.status, 200)
  assert.match(await front.text(), /Agente de Órdenes de Compra SAP/)

  const casos = (await (await fetch(`http://127.0.0.1:${PUERTO}/api/casos`)).json()) as {
    casos: string[]
  }
  assert.deepEqual(casos.casos, ["sol-001", "sol-002", "sol-003", "sol-004", "sol-005", "sol-006"])
})
