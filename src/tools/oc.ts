/**
 * Herramientas tipadas del agente (PRD §6.2). El nombre que ve el modelo es oc_<export>.
 *
 * Contrato: `execute` devuelve SIEMPRE un string JSON con { ok:true, data } o
 * { ok:false, error }; nunca lanza. Son la única fuente de valores que el agente puede
 * afirmar, y son importables sin el servidor (así las usa demo.ts y las pruebas).
 */
import { z } from "zod"
import {
  OrdenCompraSchema,
  PaqueteSchema,
  ValidacionSchema,
  type Resultado,
} from "../lib/dominio.ts"
import { leerPaquete } from "../lib/paquete.ts"
import { cargarMaestros } from "../lib/maestros.ts"
import { validar as aplicarControles } from "../lib/controles.ts"
import { construirPayload } from "../lib/payload.ts"
import { generarEvidencia } from "../lib/evidencia.ts"
import { registrarControl } from "../lib/control.ts"
import { SapMock } from "../sap/mock.ts"
import type { SapAdapter } from "../sap/adapter.ts"

export type Contexto = {
  /** Raíz del proyecto: todas las rutas se resuelven desde aquí, nunca absolutas. */
  directory: string
  sessionId: string
  /** Inyectable para pruebas; por defecto el SAP simulado sobre archivos. */
  sap?: SapAdapter
}

export type Herramienta<A extends z.ZodRawShape> = {
  description: string
  args: A
  execute(args: z.infer<z.ZodObject<A>>, ctx: Contexto): Promise<string>
}

/** Serializa el contrato uniforme; `error` siempre es una frase legible para la analista. */
function responder<T>(resultado: Resultado<T>): string {
  return JSON.stringify(resultado)
}

function mensaje(causa: unknown): string {
  return causa instanceof Error ? causa.message : String(causa)
}

function sapDe(ctx: Contexto): SapAdapter {
  return ctx.sap ?? new SapMock(ctx.directory)
}

export const leer_paquete = {
  description:
    "Lee y normaliza el paquete de una solicitud de compra (correo, solicitud, cotización, aprobación y factura si existe) desde fixtures/reto-03/solicitudes/<caso>.",
  args: {
    caso: z
      .string()
      .describe("Nombre de la carpeta del caso en fixtures/reto-03/solicitudes/, por ejemplo sol-001"),
  },
  async execute(args, ctx) {
    try {
      const paquete = leerPaquete(ctx.directory, args.caso)
      return responder({ ok: true, data: paquete })
    } catch (causa) {
      return responder({ ok: false, error: mensaje(causa) })
    }
  },
} satisfies Herramienta<{ caso: z.ZodString }>

export const validar = {
  description:
    "Aplica los controles RC1 a RC10 sobre un paquete y devuelve si la orden es apta, sus bloqueos, las confirmaciones que requiere, los valores derivados de maestros y si es una compra retroactiva.",
  args: {
    caso: z.string().describe("Nombre de la carpeta del caso, por ejemplo sol-004"),
    paquete: z
      .unknown()
      .optional()
      .describe(
        "Paquete devuelto por oc_leer_paquete. Si se omite, la herramienta lo vuelve a leer del fixture del caso.",
      ),
  },
  async execute(args, ctx) {
    try {
      const paquete =
        args.paquete === undefined || args.paquete === null
          ? leerPaquete(ctx.directory, args.caso)
          : PaqueteSchema.parse(args.paquete)
      const validacion = aplicarControles(paquete, cargarMaestros(ctx.directory))
      return responder({ ok: true, data: validacion })
    } catch (causa) {
      return responder({ ok: false, error: mensaje(causa) })
    }
  },
} satisfies Herramienta<{ caso: z.ZodString; paquete: z.ZodOptional<z.ZodUnknown> }>

export const construir_payload = {
  description:
    "Construye el payload de la orden de compra tal como quedaría en SAP, validado con esquema, y escribe la trazabilidad campo por campo en out/<caso>/trazabilidad.json.",
  args: {
    caso: z.string().describe("Nombre de la carpeta del caso, por ejemplo sol-001"),
    paquete: z.unknown().optional().describe("Paquete de oc_leer_paquete; si se omite se relee del fixture"),
    validacion: z
      .unknown()
      .optional()
      .describe("Resultado de oc_validar; si se omite se recalcula"),
  },
  async execute(args, ctx) {
    try {
      const paquete =
        args.paquete === undefined || args.paquete === null
          ? leerPaquete(ctx.directory, args.caso)
          : PaqueteSchema.parse(args.paquete)
      const validacion =
        args.validacion === undefined || args.validacion === null
          ? aplicarControles(paquete, cargarMaestros(ctx.directory))
          : ValidacionSchema.parse(args.validacion)
      if (!validacion.apta) {
        return responder({
          ok: false,
          error: `no se construye el payload de ${args.caso}: hay bloqueos sin resolver (${validacion.bloqueos
            .map((b) => b.codigo)
            .join(", ")})`,
        })
      }
      const construido = construirPayload(ctx.directory, paquete, validacion)
      return responder({
        ok: true,
        data: {
          payload: construido.payload,
          ruta_trazabilidad: construido.ruta_trazabilidad,
          trazabilidad: construido.trazabilidad,
          descripcion_recortada: construido.descripcion_recortada,
        },
      })
    } catch (causa) {
      return responder({ ok: false, error: mensaje(causa) })
    }
  },
} satisfies Herramienta<{
  caso: z.ZodString
  paquete: z.ZodOptional<z.ZodUnknown>
  validacion: z.ZodOptional<z.ZodUnknown>
}>

export const generar_evidencia = {
  description:
    "Genera la evidencia de aprobación del gasto en out/<caso>/aprobacion.txt y devuelve su ruta y su sha256 para adjuntarla a la orden de compra.",
  args: {
    caso: z.string().describe("Nombre de la carpeta del caso, por ejemplo sol-001"),
  },
  async execute(args, ctx) {
    try {
      const evidencia = generarEvidencia(ctx.directory, args.caso)
      return responder({ ok: true, data: evidencia })
    } catch (causa) {
      return responder({ ok: false, error: mensaje(causa) })
    }
  },
} satisfies Herramienta<{ caso: z.ZodString }>

export const crear = {
  description:
    "Crea la orden de compra en SAP y devuelve su número. Solo procede si la validación es apta y, cuando hay confirmaciones pendientes, si la analista ya confirmó explícitamente. Registra el intento en out/control.csv.",
  args: {
    caso: z.string().describe("Nombre de la carpeta del caso, por ejemplo sol-004"),
    payload: z
      .unknown()
      .optional()
      .describe("Payload devuelto por oc_construir_payload; si se omite se reconstruye del caso"),
    confirmado: z
      .boolean()
      .optional()
      .describe(
        "true solo si la analista confirmó en su último mensaje las confirmaciones pendientes del caso",
      ),
    confirmado_por: z
      .string()
      .optional()
      .describe("Quién confirmó, para dejarlo en las excepciones de la orden"),
  },
  async execute(args, ctx) {
    try {
      const paquete = leerPaquete(ctx.directory, args.caso)
      const validacion = aplicarControles(paquete, cargarMaestros(ctx.directory))
      const codigos = {
        bloqueos: validacion.bloqueos.map((b) => b.codigo),
        confirmaciones: validacion.confirmaciones.map((c) => c.codigo),
      }

      if (!validacion.apta) {
        registrarControl(ctx.directory, {
          solicitud_id: paquete.solicitud.solicitud_id,
          resultado: "bloqueada",
          numero_oc: null,
          retroactiva: validacion.retroactiva,
          ...codigos,
        })
        return responder({
          ok: false,
          error: `la orden de ${args.caso} no se crea: ${validacion.bloqueos
            .map((b) => `${b.codigo} ${b.detalle}`)
            .join(" | ")}`,
        })
      }

      const confirmado = args.confirmado === true
      if (validacion.confirmaciones.length > 0 && !confirmado) {
        registrarControl(ctx.directory, {
          solicitud_id: paquete.solicitud.solicitud_id,
          resultado: "pendiente_confirmacion",
          numero_oc: null,
          retroactiva: validacion.retroactiva,
          ...codigos,
        })
        return responder({
          ok: false,
          error: `la orden de ${args.caso} requiere confirmación humana antes de crearse: ${validacion.confirmaciones
            .map((c) => `${c.codigo} ${c.detalle}`)
            .join(" | ")}`,
        })
      }

      const payload =
        args.payload === undefined || args.payload === null
          ? construirPayload(ctx.directory, paquete, validacion).payload
          : OrdenCompraSchema.parse(args.payload)

      const payloadConfirmado = {
        ...payload,
        excepciones: payload.excepciones.map((excepcion) => ({
          ...excepcion,
          confirmado_por: confirmado ? (args.confirmado_por ?? "analista") : excepcion.confirmado_por,
        })),
      }

      const sap = sapDe(ctx)
      const previa = await sap.buscarOrdenPorReferencia(payload.referencia.solicitud_id)
      const creada = await sap.crearOrden(payloadConfirmado)
      const idempotente = previa !== null

      registrarControl(ctx.directory, {
        solicitud_id: paquete.solicitud.solicitud_id,
        resultado: idempotente ? "idempotente" : "creada",
        numero_oc: creada.numero_oc,
        retroactiva: validacion.retroactiva,
        ...codigos,
      })

      return responder({
        ok: true,
        data: {
          numero_oc: creada.numero_oc,
          fecha: creada.fecha,
          idempotente,
          retroactiva: validacion.retroactiva,
          evidencia_sha256: payload.aprobador.evidencia_sha256,
          ruta_evidencia: `out/${args.caso}/aprobacion.txt`,
          ruta_control: "out/control.csv",
        },
      })
    } catch (causa) {
      return responder({ ok: false, error: mensaje(causa) })
    }
  },
} satisfies Herramienta<{
  caso: z.ZodString
  payload: z.ZodOptional<z.ZodUnknown>
  confirmado: z.ZodOptional<z.ZodBoolean>
  confirmado_por: z.ZodOptional<z.ZodString>
}>

/** Registro con el nombre que ve el modelo: oc_<export> (PRD §6.2). */
export const herramientas = {
  oc_leer_paquete: leer_paquete,
  oc_validar: validar,
  oc_construir_payload: construir_payload,
  oc_generar_evidencia: generar_evidencia,
  oc_crear: crear,
} as const

export type NombreHerramienta = keyof typeof herramientas
