/**
 * Adaptador Groq (API de chat OpenAI-compatible). Las credenciales nunca
 * llegan al navegador, se escriben en logs ni se guardan en Git.
 */
import {
  ErrorProveedor,
  type BloqueLlamada,
  type BloqueTexto,
  type LlmAdapter,
  type OpcionesEnvio,
  type RespuestaLlm,
} from "./adapter.ts"

type ToolCall = { id: string; type: "function"; function: { name: string; arguments: string } }
type MensajeGroq = {
  role: "system" | "user" | "assistant" | "tool"
  content?: string | null
  tool_calls?: ToolCall[]
  tool_call_id?: string
}
type RespuestaGroq = {
  choices?: Array<{ finish_reason?: string; message?: { content?: string | null; tool_calls?: ToolCall[] } }>
  usage?: { prompt_tokens?: number; completion_tokens?: number }
}

function mensajesGroq(opciones: OpcionesEnvio): MensajeGroq[] {
  const salida: MensajeGroq[] = [{ role: "system", content: opciones.sistema }]
  for (const mensaje of opciones.mensajes) {
    if (mensaje.rol === "asistente") {
      const texto = mensaje.bloques.filter(b => b.tipo === "texto").map(b => b.tipo === "texto" ? b.texto : "").join("\n")
      const llamadas = mensaje.bloques.filter(b => b.tipo === "llamada").map(b => {
        if (b.tipo !== "llamada") throw new Error("bloque de llamada incorrecto")
        return { id: b.id, type: "function" as const, function: { name: b.nombre, arguments: JSON.stringify(b.argumentos) } }
      })
      salida.push({ role: "assistant", content: texto || null, ...(llamadas.length ? { tool_calls: llamadas } : {}) })
      continue
    }
    const textos = mensaje.bloques.filter(b => b.tipo === "texto")
    if (textos.length) salida.push({ role: "user", content: textos.map(b => b.tipo === "texto" ? b.texto : "").join("\n") })
    for (const bloque of mensaje.bloques) {
      if (bloque.tipo === "resultado") salida.push({ role: "tool", tool_call_id: bloque.id, content: bloque.contenido })
    }
  }
  return salida
}

export class AdaptadorGroq implements LlmAdapter {
  readonly proveedor = "groq"
  readonly modelo: string
  private readonly clave: string

  constructor(apiKey: string, modelo = "openai/gpt-oss-120b") {
    if (!apiKey.trim()) throw new ErrorProveedor("GROQ_API_KEY está vacía en el backend")
    this.clave = apiKey
    this.modelo = modelo
  }

  async enviar(opciones: OpcionesEnvio, reintento = false): Promise<RespuestaLlm> {
    let respuesta: Response
    try {
      respuesta = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        signal: AbortSignal.timeout(90_000),
        headers: {
          "Authorization": "Bearer " + this.clave,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: this.modelo,
          messages: mensajesGroq(opciones),
          max_completion_tokens: opciones.maxTokens,
          temperature: 0,
          tools: opciones.herramientas.map(h => ({
            type: "function",
            function: { name: h.name, description: h.description, parameters: h.input_schema },
          })),
          tool_choice: "auto",
          parallel_tool_calls: false,
        }),
      })
    } catch (error) {
      if (error instanceof Error && error.name === "TimeoutError") throw new ErrorProveedor("Groq tardó más de 90 segundos en responder")
      throw new ErrorProveedor("No hay conexión con el proveedor Groq desde el servidor")
    }
    if (!respuesta.ok) {
      if (respuesta.status === 401 || respuesta.status === 403) throw new ErrorProveedor("Groq rechazó la clave del backend: acceso denegado")
      if (respuesta.status === 429) {
        const detalle = await respuesta.json().catch(() => ({})) as { error?: { message?: string } }
        const mensaje = detalle.error?.message ?? ""
        const espera = Number(mensaje.match(/try again in ([0-9]+(?:\.[0-9]+)?)s?/i)?.[1] ?? 0)
        if (!reintento && espera > 0 && espera <= 60) {
          await new Promise<void>(resolver => setTimeout(resolver, Math.ceil(espera * 1000) + 1200))
          return this.enviar(opciones, true)
        }
        const limite = mensaje.match(/Limit\s+\d+/i)?.[0] ?? "cuota"
        const solicitado = mensaje.match(/Requested\s+\d+/i)?.[0] ?? ""
        throw new ErrorProveedor("Groq tiene límite temporal de tokens: " + limite + (solicitado ? " · " + solicitado : "") + ". Reintente en un minuto.")
      }
      throw new ErrorProveedor("Groq devolvió un error HTTP " + respuesta.status + " al solicitar la respuesta del modelo")
    }
    let cuerpo: RespuestaGroq
    try { cuerpo = await respuesta.json() as RespuestaGroq }
    catch { throw new ErrorProveedor("La respuesta de Groq no era JSON válido") }
    const mensaje = cuerpo.choices?.[0]?.message
    if (!mensaje) throw new ErrorProveedor("Groq no entregó contenido del modelo")
    const bloques: (BloqueTexto | BloqueLlamada)[] = []
    if (mensaje.content) bloques.push({ tipo: "texto", texto: mensaje.content })
    for (const tool of mensaje.tool_calls ?? []) {
      let argumentos: Record<string, unknown>
      try { argumentos = JSON.parse(tool.function.arguments) as Record<string, unknown> }
      catch { throw new ErrorProveedor("Groq entregó argumentos inválidos para la herramienta " + tool.function.name) }
      bloques.push({ tipo: "llamada", id: tool.id, nombre: tool.function.name, argumentos })
    }
    return {
      bloques,
      pide_herramientas: (mensaje.tool_calls?.length ?? 0) > 0,
      uso: { tokens_entrada: cuerpo.usage?.prompt_tokens ?? 0, tokens_salida: cuerpo.usage?.completion_tokens ?? 0 },
    }
  }
}
