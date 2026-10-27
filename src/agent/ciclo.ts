/**
 * Ciclo del agente (PRD §6.3): prompt → modelo → herramientas → respuesta.
 * CA1 tope de iteraciones por turno · CA2 el modelo no afirma valores que no vengan de
 * herramientas (lo impone el prompt) · CA3 confirmación humana en un mensaje posterior ·
 * CA4 toda llamada queda en el historial y en out/log.jsonl · CA5 un error no mata la sesión.
 */
import { appendFileSync, mkdirSync, readFileSync } from "node:fs"
import { join, resolve } from "node:path"
import { ejecutarHerramienta, definicionesHerramientas } from "../tools/registro.ts"
import type { Contexto } from "../tools/oc.ts"
import { ErrorProveedor, type Bloque, type LlmAdapter, type MensajeLlm } from "../llm/adapter.ts"

export const LIMITES = {
  /** CA1: tope de iteraciones herramienta → modelo por turno. */
  iteracionesPorTurno: Number(process.env.AGENTE_MAX_ITERACIONES ?? 25),
  /** Tope de tokens por sesión: un usuario no puede gastar la clave sin límite (PRD §8). */
  tokensPorSesion: Number(process.env.AGENTE_MAX_TOKENS_SESION ?? 200_000),
  maxTokensRespuesta: Number(process.env.AGENTE_MAX_TOKENS_RESPUESTA ?? 4_000),
}

export type LlamadaVisible = {
  nombre: string
  argumentos: Record<string, unknown>
  ok: boolean
  resumen: string
  resultado: unknown
}

export type TurnoAgente = {
  reply: string
  toolCalls: LlamadaVisible[]
  needsConfirmation: boolean
  iteraciones: number
  limiteAlcanzado: boolean
  uso: { tokens_entrada: number; tokens_salida: number; tokens_sesion: number }
}

export type Sesion = {
  id: string
  mensajes: MensajeLlm[]
  tokensUsados: number
  historialVisible: Array<
    | { rol: "usuario"; texto: string; ts: string }
    | { rol: "asistente"; texto: string; toolCalls: LlamadaVisible[]; needsConfirmation: boolean; ts: string }
  >
}

const sesiones = new Map<string, Sesion>()

export function obtenerSesion(id: string): Sesion {
  const existente = sesiones.get(id)
  if (existente) return existente
  const nueva: Sesion = { id, mensajes: [], tokensUsados: 0, historialVisible: [] }
  sesiones.set(id, nueva)
  return nueva
}

export function cargarPrompt(directorio: string): string {
  const comportamiento = readFileSync(join(resolve(directorio), "agent", "prompt.md"), "utf8")
  const conocimiento = readFileSync(
    join(resolve(directorio), "src", "knowledge", "ordenes-compra.md"),
    "utf8",
  )
  return `${comportamiento}\n\n---\n\n# Conocimiento del proceso (referencia)\n\n${conocimiento}`
}

function registrarLog(directorio: string, entrada: Record<string, unknown>): void {
  const carpeta = join(resolve(directorio), "out")
  mkdirSync(carpeta, { recursive: true })
  appendFileSync(
    join(carpeta, "log.jsonl"),
    `${JSON.stringify({ ts: new Date().toISOString(), ...entrada })}\n`,
    "utf8",
  )
}

/** Resumen corto del resultado para el chat: la analista no lee JSON crudo. */
function resumir(nombre: string, resultado: unknown): { ok: boolean; resumen: string } {
  const r = resultado as { ok?: boolean; error?: string; data?: Record<string, unknown> }
  if (r?.ok !== true) return { ok: false, resumen: r?.error ?? "error no descrito" }
  const d = r.data ?? {}
  switch (nombre) {
    case "oc_leer_paquete": {
      const solicitud = d.solicitud as { solicitud_id?: string; valor_total?: number } | undefined
      const faltantes = (d.faltantes as string[] | undefined) ?? []
      return {
        ok: true,
        resumen: `${solicitud?.solicitud_id ?? "paquete"} leído${
          faltantes.length > 0 ? ` · faltan: ${faltantes.join(", ")}` : ""
        }${d.factura ? " · con factura" : ""}`,
      }
    }
    case "oc_validar": {
      const bloqueos = (d.bloqueos as Array<{ codigo: string }>) ?? []
      const confirmaciones = (d.confirmaciones as Array<{ codigo: string }>) ?? []
      return {
        ok: true,
        resumen: `apta=${String(d.apta)} · bloqueos: ${bloqueos.map((b) => b.codigo).join(", ") || "ninguno"} · confirmaciones: ${confirmaciones.map((c) => c.codigo).join(", ") || "ninguna"} · retroactiva=${String(d.retroactiva)}`,
      }
    }
    case "oc_construir_payload":
      return { ok: true, resumen: `payload válido · trazabilidad en ${String(d.ruta_trazabilidad)}` }
    case "oc_generar_evidencia":
      return { ok: true, resumen: `${String(d.ruta)} · sha256 ${String(d.sha256).slice(0, 16)}…` }
    case "oc_crear":
      return {
        ok: true,
        resumen: `OC ${String(d.numero_oc)}${d.idempotente ? " (idempotente)" : ""} · retroactiva=${String(d.retroactiva)}`,
      }
    default:
      return { ok: true, resumen: "ejecutada" }
  }
}

/** CA3: ¿el turno quedó esperando una confirmación humana? */
function quedaPendienteConfirmacion(llamadas: LlamadaVisible[]): boolean {
  const creoOc = llamadas.some((l) => l.nombre === "oc_crear" && l.ok)
  if (creoOc) return false
  return llamadas.some((llamada) => {
    if (!llamada.ok) return /requiere confirmaci[óo]n/i.test(llamada.resumen)
    const data = (llamada.resultado as { data?: { confirmaciones?: unknown[] } }).data
    return Array.isArray(data?.confirmaciones) && data.confirmaciones.length > 0
  })
}

export async function ejecutarTurno(
  adaptador: LlmAdapter,
  sesion: Sesion,
  mensajeUsuario: string,
  ctx: Contexto,
): Promise<TurnoAgente> {
  if (sesion.tokensUsados >= LIMITES.tokensPorSesion) {
    throw new ErrorProveedor(
      `esta sesión alcanzó el tope de ${LIMITES.tokensPorSesion.toLocaleString("es-CO")} tokens; abra una sesión nueva`,
    )
  }

  const ts = new Date().toISOString()
  sesion.mensajes.push({ rol: "usuario", bloques: [{ tipo: "texto", texto: mensajeUsuario }] })
  sesion.historialVisible.push({ rol: "usuario", texto: mensajeUsuario, ts })
  registrarLog(ctx.directory, { sessionId: sesion.id, evento: "mensaje_usuario", texto: mensajeUsuario })

  const sistema = cargarPrompt(ctx.directory)
  const herramientas = definicionesHerramientas()
  const llamadasDelTurno: LlamadaVisible[] = []
  const textos: string[] = []
  let iteraciones = 0
  let limiteAlcanzado = false
  let entrada = 0
  let salida = 0

  while (iteraciones < LIMITES.iteracionesPorTurno) {
    iteraciones += 1
    const respuesta = await adaptador.enviar({
      sistema,
      mensajes: sesion.mensajes,
      herramientas,
      maxTokens: LIMITES.maxTokensRespuesta,
    })
    entrada += respuesta.uso.tokens_entrada
    salida += respuesta.uso.tokens_salida
    sesion.tokensUsados += respuesta.uso.tokens_entrada + respuesta.uso.tokens_salida

    const bloquesAsistente: Bloque[] = respuesta.bloques.map((bloque) =>
      bloque.tipo === "texto"
        ? { tipo: "texto", texto: bloque.texto }
        : { tipo: "llamada", id: bloque.id, nombre: bloque.nombre, argumentos: bloque.argumentos },
    )
    sesion.mensajes.push({ rol: "asistente", bloques: bloquesAsistente })

    for (const bloque of respuesta.bloques) {
      if (bloque.tipo === "texto" && bloque.texto.trim() !== "") textos.push(bloque.texto.trim())
    }

    const llamadas = respuesta.bloques.filter((b) => b.tipo === "llamada")
    if (!respuesta.pide_herramientas || llamadas.length === 0) {
      return {
        reply: textos.join("\n\n"),
        toolCalls: llamadasDelTurno,
        needsConfirmation: quedaPendienteConfirmacion(llamadasDelTurno),
        iteraciones,
        limiteAlcanzado: false,
        uso: { tokens_entrada: entrada, tokens_salida: salida, tokens_sesion: sesion.tokensUsados },
      }
    }

    const resultados: Bloque[] = []
    for (const llamada of llamadas) {
      const bruto = await ejecutarHerramienta(llamada.nombre, llamada.argumentos, ctx)
      const resultado: unknown = JSON.parse(bruto)
      const { ok, resumen } = resumir(llamada.nombre, resultado)
      const visible: LlamadaVisible = {
        nombre: llamada.nombre,
        argumentos: llamada.argumentos,
        ok,
        resumen,
        resultado,
      }
      llamadasDelTurno.push(visible)
      registrarLog(ctx.directory, {
        sessionId: sesion.id,
        evento: "tool_call",
        herramienta: llamada.nombre,
        argumentos: llamada.argumentos,
        ok,
        resumen,
      })
      resultados.push({ tipo: "resultado", id: llamada.id, contenido: bruto })
    }
    sesion.mensajes.push({ rol: "usuario", bloques: resultados })

    if (sesion.tokensUsados >= LIMITES.tokensPorSesion) {
      limiteAlcanzado = true
      break
    }
  }

  // CA1: al alcanzar el tope, el agente responde con lo que tiene y lo que falta.
  const aviso = limiteAlcanzado
    ? `Alcancé el tope de tokens de esta sesión (${LIMITES.tokensPorSesion.toLocaleString("es-CO")}).`
    : `Alcancé el tope de ${LIMITES.iteracionesPorTurno} iteraciones de herramientas en este turno.`
  const faltante =
    llamadasDelTurno.length > 0
      ? `Hasta aquí ejecuté: ${llamadasDelTurno.map((l) => l.nombre).join(", ")}. Dígame si continúo con la creación de la OC o si revisa primero los hallazgos.`
      : "No alcancé a ejecutar ninguna herramienta; reformule la petición indicando el caso (por ejemplo sol-004)."

  return {
    reply: [...textos, `${aviso} ${faltante}`].join("\n\n"),
    toolCalls: llamadasDelTurno,
    needsConfirmation: quedaPendienteConfirmacion(llamadasDelTurno),
    iteraciones,
    limiteAlcanzado: true,
    uso: { tokens_entrada: entrada, tokens_salida: salida, tokens_sesion: sesion.tokensUsados },
  }
}

/** Añade el turno al historial visible de la sesión (lo consume GET /api/sessions/:id). */
export function registrarTurnoVisible(sesion: Sesion, turno: TurnoAgente): void {
  sesion.historialVisible.push({
    rol: "asistente",
    texto: turno.reply,
    toolCalls: turno.toolCalls,
    needsConfirmation: turno.needsConfirmation,
    ts: new Date().toISOString(),
  })
}
