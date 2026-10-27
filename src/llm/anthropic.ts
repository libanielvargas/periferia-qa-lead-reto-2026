/**
 * Implementación del adaptador para Anthropic (Claude), con el SDK oficial.
 * La clave se lee SOLO de la variable de entorno del backend y no se registra, no se
 * devuelve por la API y no viaja al front.
 */
import Anthropic from "@anthropic-ai/sdk"
import {
  ErrorProveedor,
  type Bloque,
  type BloqueLlamada,
  type BloqueTexto,
  type LlmAdapter,
  type MensajeLlm,
  type OpcionesEnvio,
  type RespuestaLlm,
} from "./adapter.ts"

const MODELO_POR_DEFECTO = "claude-sonnet-5"
const TIMEOUT_MS = 90_000

function aContenidoAnthropic(bloques: Bloque[]): Anthropic.ContentBlockParam[] {
  return bloques.map((bloque) => {
    switch (bloque.tipo) {
      case "texto":
        return { type: "text", text: bloque.texto }
      case "llamada":
        return { type: "tool_use", id: bloque.id, name: bloque.nombre, input: bloque.argumentos }
      case "resultado":
        return { type: "tool_result", tool_use_id: bloque.id, content: bloque.contenido }
    }
  })
}

function aMensajesAnthropic(mensajes: MensajeLlm[]): Anthropic.MessageParam[] {
  return mensajes.map((mensaje) => ({
    role: mensaje.rol === "usuario" ? "user" : "assistant",
    content: aContenidoAnthropic(mensaje.bloques),
  }))
}

export class AdaptadorAnthropic implements LlmAdapter {
  readonly proveedor = "anthropic"
  readonly modelo: string
  private readonly cliente: Anthropic

  constructor(apiKey: string, modelo: string = MODELO_POR_DEFECTO) {
    if (apiKey.trim() === "") {
      throw new ErrorProveedor("ANTHROPIC_API_KEY está vacía en el entorno del backend")
    }
    this.modelo = modelo
    this.cliente = new Anthropic({ apiKey, timeout: TIMEOUT_MS, maxRetries: 1 })
  }

  async enviar(opciones: OpcionesEnvio): Promise<RespuestaLlm> {
    let respuesta: Anthropic.Message
    try {
      respuesta = await this.cliente.messages.create({
        model: this.modelo,
        max_tokens: opciones.maxTokens,
        system: [{ type: "text", text: opciones.sistema, cache_control: { type: "ephemeral" } }],
        messages: aMensajesAnthropic(opciones.mensajes),
        tools: opciones.herramientas.map((herramienta) => ({
          name: herramienta.name,
          description: herramienta.description,
          input_schema: herramienta.input_schema as Anthropic.Tool.InputSchema,
        })),
      })
    } catch (causa) {
      throw new ErrorProveedor(traducirError(causa))
    }

    if (respuesta.stop_reason === "refusal") {
      throw new ErrorProveedor(
        "el modelo declinó responder esta solicitud por políticas de seguridad; reformule el mensaje",
      )
    }

    const bloques: (BloqueTexto | BloqueLlamada)[] = []
    for (const bloque of respuesta.content) {
      if (bloque.type === "text") {
        bloques.push({ tipo: "texto", texto: bloque.text })
      } else if (bloque.type === "tool_use") {
        bloques.push({
          tipo: "llamada",
          id: bloque.id,
          nombre: bloque.name,
          // El input llega como JSON ya parseado por el SDK; nunca se compara como string.
          argumentos: (bloque.input ?? {}) as Record<string, unknown>,
        })
      }
    }

    return {
      bloques,
      pide_herramientas: respuesta.stop_reason === "tool_use",
      uso: {
        tokens_entrada: respuesta.usage.input_tokens + (respuesta.usage.cache_read_input_tokens ?? 0),
        tokens_salida: respuesta.usage.output_tokens,
      },
    }
  }
}

/** Traduce el error del proveedor a una frase útil, sin filtrar la clave ni cabeceras. */
function traducirError(causa: unknown): string {
  if (causa instanceof Anthropic.AuthenticationError) {
    return "el proveedor rechazó la credencial del backend (ANTHROPIC_API_KEY inválida o revocada)"
  }
  if (causa instanceof Anthropic.RateLimitError) {
    return "el proveedor está limitando las peticiones por cuota; reintente en unos segundos"
  }
  if (causa instanceof Anthropic.APIConnectionTimeoutError) {
    return `el proveedor no respondió en ${TIMEOUT_MS / 1000} s; reintente o procese el caso con demo.ts`
  }
  if (causa instanceof Anthropic.APIConnectionError) {
    return "no hay conexión con el proveedor del modelo desde el backend"
  }
  if (causa instanceof Anthropic.APIError) {
    return `el proveedor devolvió un error ${causa.status ?? ""}: ${causa.message}`.trim()
  }
  return causa instanceof Error ? causa.message : String(causa)
}
