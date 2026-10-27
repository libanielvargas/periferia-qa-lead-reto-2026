/**
 * Esquemas y tipos del dominio "Órdenes de Compra SAP" (PRD §7.1, §7.2, §7.4).
 * Única definición de forma de datos: herramientas, pruebas y demo importan de aquí.
 */
import { z } from "zod"

export const SolicitudSchema = z.object({
  solicitud_id: z.string(),
  solicitante: z.string(),
  proveedor_nombre: z.string(),
  proveedor_nit: z.string().nullable(),
  descripcion: z.string(),
  centro_costo: z.string(),
  subarea: z.string(),
  cantidad: z.number(),
  valor_unitario: z.number(),
  valor_total: z.number(),
  moneda: z.enum(["COP", "USD"]),
  indicador_iva: z.string().nullable(),
  condiciones_pago: z.string().nullable(),
  fecha_solicitud: z.string(),
})
export type Solicitud = z.infer<typeof SolicitudSchema>

export const PaqueteSchema = z.object({
  caso: z.string(),
  correo: z.object({
    id: z.string(),
    de: z.string(),
    asunto: z.string(),
    fecha: z.string(),
  }),
  solicitud: SolicitudSchema,
  cotizacion: z
    .object({
      referencia: z.string().nullable(),
      proveedor: z.string(),
      nit: z.string().nullable(),
      total: z.number(),
      moneda: z.string(),
      validez_hasta: z.string().nullable(),
      texto: z.string(),
    })
    .nullable(),
  aprobacion: z
    .object({
      de: z.string(),
      fecha: z.string(),
      aprobado: z.boolean(),
      texto: z.string(),
    })
    .nullable(),
  factura: z
    .object({ numero: z.string(), fecha: z.string(), total: z.number() })
    .nullable(),
  faltantes: z.array(z.string()),
})
export type Paquete = z.infer<typeof PaqueteSchema>

/** Maestros (PRD §7.1). */
export const ProveedorSchema = z.object({
  codigo_sap: z.string(),
  nit: z.string(),
  nombre: z.string(),
  condiciones_pago_default: z.string(),
  indicador_iva_default: z.string(),
  activo: z.boolean(),
})
export type Proveedor = z.infer<typeof ProveedorSchema>

export const CentroCostoSchema = z.object({
  centro_costo: z.string(),
  nombre: z.string().optional(),
  subareas: z.array(z.string()),
  aprobadores: z.array(
    z.object({
      email: z.string(),
      nombre: z.string().optional(),
      tope: z.number(),
    }),
  ),
})
export type CentroCosto = z.infer<typeof CentroCostoSchema>

export const IndicadorIvaSchema = z.object({
  codigo: z.string(),
  descripcion: z.string(),
  tasa: z.number(),
})
export const CondicionPagoSchema = z.object({
  codigo: z.string(),
  descripcion: z.string(),
  dias: z.number(),
})

/** Resultado de los controles RC1–RC10 (PRD §7.3). */
export const HallazgoSchema = z.object({
  codigo: z.string(),
  tipo: z.enum(["bloqueo", "confirmacion", "derivado"]),
  detalle: z.string(),
  accion_sugerida: z.string(),
})
export type Hallazgo = z.infer<typeof HallazgoSchema>

export const DerivadosSchema = z.object({
  indicador_iva: z.string().nullable(),
  condiciones_pago: z.string().nullable(),
  unidad: z.enum(["UN", "H", "MES"]),
  proveedor_codigo_sap: z.string().nullable(),
  proveedor_nit: z.string().nullable(),
})
export type Derivados = z.infer<typeof DerivadosSchema>

export const ValidacionSchema = z.object({
  caso: z.string(),
  apta: z.boolean(),
  bloqueos: z.array(HallazgoSchema),
  confirmaciones: z.array(HallazgoSchema),
  derivados: DerivadosSchema,
  informativos: z.array(HallazgoSchema),
  retroactiva: z.boolean(),
})
export type Validacion = z.infer<typeof ValidacionSchema>

/** Payload de la OC (PRD §7.4). */
export const OrdenCompraSchema = z.object({
  referencia: z.object({
    solicitud_id: z.string(),
    correo_id: z.string(),
    cotizacion_ref: z.string().nullable(),
  }),
  sociedad: z.literal("1000"),
  organizacion_compras: z.literal("1000"),
  proveedor: z.object({
    codigo_sap: z.string(),
    nit: z.string(),
    nombre: z.string(),
  }),
  moneda: z.enum(["COP", "USD"]),
  condiciones_pago: z.string(),
  aprobador: z.object({
    email: z.string(),
    fecha_aprobacion: z.string(),
    evidencia_sha256: z.string(),
  }),
  posiciones: z
    .array(
      z.object({
        numero: z.number(),
        descripcion: z.string().max(40),
        cantidad: z.number(),
        unidad: z.enum(["UN", "H", "MES"]),
        precio_unitario: z.number(),
        centro_costo: z.string(),
        subarea: z.string(),
        indicador_iva: z.string(),
      }),
    )
    .min(1),
  excepciones: z.array(
    z.object({
      codigo: z.string(),
      detalle: z.string(),
      confirmado_por: z.string().nullable(),
    }),
  ),
})
export type OrdenCompra = z.infer<typeof OrdenCompraSchema>

/** Resultado uniforme de toda herramienta (PRD §6.2): nunca lanza. */
export type Resultado<T> = { ok: true; data: T } | { ok: false; error: string }

export type Fuente = "solicitud" | "cotizacion" | "correo" | "aprobacion" | "derivado" | `maestro.${string}`

export type Trazabilidad = Record<string, { valor: unknown; fuente: Fuente; nota?: string }>
