/**
 * Interfaz propia del proveedor LLM (PRD §6.1): `enviar(mensajes, herramientas)`.
 * El ciclo del agente depende solo de estos tipos, así que cambiar de proveedor no toca
 * el ciclo ni las herramientas.
 */
import type { DefinicionHerramienta } from "../tools/registro.ts"

export type BloqueTexto = { tipo: "texto"; texto: string }
export type BloqueLlamada = {
  tipo: "llamada"
  id: string
  nombre: string
  argumentos: Record<string, unknown>
}
export type BloqueResultado = { tipo: "resultado"; id: string; contenido: string }
export type Bloque = BloqueTexto | BloqueLlamada | BloqueResultado

export type MensajeLlm = { rol: "usuario" | "asistente"; bloques: Bloque[] }

export type RespuestaLlm = {
  bloques: (BloqueTexto | BloqueLlamada)[]
  /** true si el modelo pidió ejecutar herramientas y el ciclo debe continuar. */
  pide_herramientas: boolean
  uso: { tokens_entrada: number; tokens_salida: number }
}

export type OpcionesEnvio = {
  sistema: string
  mensajes: MensajeLlm[]
  herramientas: DefinicionHerramienta[]
  /** Tope de tokens de salida por petición. */
  maxTokens: number
}

export interface LlmAdapter {
  readonly proveedor: string
  readonly modelo: string
  enviar(opciones: OpcionesEnvio): Promise<RespuestaLlm>
}

/** Error de proveedor ya traducido a lenguaje claro para mostrar en el chat (CA5). */
export class ErrorProveedor extends Error {
  constructor(mensaje: string) {
    super(mensaje)
    this.name = "ErrorProveedor"
  }
}
