/**
 * Despacho de herramientas por nombre, con validación Zod de los argumentos ANTES de
 * ejecutar (PRD §6.2): si el modelo manda argumentos inválidos, el error vuelve al modelo
 * como { ok:false, error } en vez de romper el ciclo del agente.
 * También expone el esquema JSON de cada herramienta para el proveedor LLM.
 */
import { z } from "zod"
import { herramientas, type Contexto, type NombreHerramienta } from "./oc.ts"

type HerramientaOpaca = {
  description: string
  args: z.ZodRawShape
  execute(args: never, ctx: Contexto): Promise<string>
}

const registro = herramientas as unknown as Record<string, HerramientaOpaca>

export function nombresHerramientas(): NombreHerramienta[] {
  return Object.keys(herramientas) as NombreHerramienta[]
}

export type DefinicionHerramienta = {
  name: string
  description: string
  input_schema: { type: "object"; properties: Record<string, unknown>; required?: string[] }
}

/** Definiciones para el proveedor LLM, derivadas de los mismos esquemas Zod. */
export function definicionesHerramientas(): DefinicionHerramienta[] {
  return Object.entries(registro).map(([name, herramienta]) => {
    const esquema = z.toJSONSchema(z.object(herramienta.args), { io: "input" }) as {
      type: "object"
      properties?: Record<string, unknown>
      required?: string[]
    }
    return {
      name,
      description: herramienta.description,
      input_schema: {
        type: "object",
        properties: esquema.properties ?? {},
        ...(esquema.required ? { required: esquema.required } : {}),
      },
    }
  })
}

/** Ejecuta una herramienta por nombre. Nunca lanza: devuelve el JSON del contrato. */
export async function ejecutarHerramienta(
  nombre: string,
  argumentos: unknown,
  ctx: Contexto,
): Promise<string> {
  const herramienta = registro[nombre]
  if (!herramienta) {
    return JSON.stringify({
      ok: false,
      error: `no existe la herramienta "${nombre}". Disponibles: ${nombresHerramientas().join(", ")}`,
    })
  }
  const validacion = z.object(herramienta.args).safeParse(argumentos ?? {})
  if (!validacion.success) {
    const detalle = validacion.error.issues
      .map((issue) => `${issue.path.join(".") || "(raíz)"}: ${issue.message}`)
      .join("; ")
    return JSON.stringify({ ok: false, error: `argumentos inválidos para ${nombre}: ${detalle}` })
  }
  try {
    return await herramienta.execute(validacion.data as never, ctx)
  } catch (causa) {
    const motivo = causa instanceof Error ? causa.message : String(causa)
    return JSON.stringify({ ok: false, error: `fallo inesperado en ${nombre}: ${motivo}` })
  }
}
