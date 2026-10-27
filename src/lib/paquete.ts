/**
 * HU-1: lectura y normalización del paquete de un caso (PRD §7.2).
 * Un adjunto ausente se reporta como null más su nombre en `faltantes`; nunca excepción
 * hacia el agente (el llamador la convierte en { ok:false, error }).
 */
import { existsSync, readFileSync } from "node:fs"
import { join, resolve } from "node:path"
import { z } from "zod"
import { SolicitudSchema, type Paquete, type Solicitud } from "./dominio.ts"
import { fechaISO, parsearCotizacion, parsearFactura } from "./parseo.ts"

const CorreoCrudoSchema = z.object({
  id: z.string(),
  de: z.string(),
  asunto: z.string(),
  fecha: z.string(),
  cuerpo: z.string().optional(),
  adjuntos: z.array(z.string()).default([]),
})

const AprobacionCrudaSchema = z.object({
  de: z.string(),
  para: z.string().optional(),
  fecha: z.string(),
  asunto: z.string().optional(),
  cuerpo: z.string(),
})

/** La solicitud cruda admite campos opcionales (PRD §7.1) y se normaliza a null. */
const SolicitudCrudaSchema = z.object({
  solicitud_id: z.string(),
  solicitante: z.string(),
  proveedor_nombre: z.string(),
  proveedor_nit: z.string().optional(),
  descripcion: z.string(),
  centro_costo: z.string(),
  subarea: z.string(),
  cantidad: z.union([z.number(), z.string()]),
  valor_unitario: z.union([z.number(), z.string()]),
  valor_total: z.union([z.number(), z.string()]),
  moneda: z.string(),
  indicador_iva: z.string().optional(),
  condiciones_pago: z.string().optional(),
  fecha_solicitud: z.string(),
})

/** El caso identifica una carpeta de fixtures: sin separadores ni rutas absolutas. */
export function validarNombreCaso(caso: string): void {
  if (!/^[A-Za-z0-9_-]+$/.test(caso)) {
    throw new Error(
      `caso inválido "${caso}": use el nombre de carpeta en fixtures/reto-03/solicitudes (ej. sol-001)`,
    )
  }
}

function numeroObligatorio(valor: number | string, campo: string): number {
  const numero = typeof valor === "number" ? valor : Number(valor.replace(/[^\d.-]/g, ""))
  if (!Number.isFinite(numero)) {
    throw new Error(`${campo} no es numérico: "${String(valor)}"`)
  }
  return numero
}

function leerTexto(ruta: string): string | null {
  return existsSync(ruta) ? readFileSync(ruta, "utf8") : null
}

/** Lee el paquete del caso. Lanza Error con mensaje legible ante dato inutilizable. */
export function leerPaquete(directorio: string, caso: string): Paquete {
  validarNombreCaso(caso)
  const carpeta = resolve(directorio, "fixtures", "reto-03", "solicitudes", caso)
  if (!existsSync(carpeta)) {
    throw new Error(`no existe el caso "${caso}" en fixtures/reto-03/solicitudes`)
  }

  const faltantes: string[] = []

  const correoCrudo = leerTexto(join(carpeta, "correo.json"))
  if (correoCrudo === null) throw new Error(`falta correo.json en el caso "${caso}"`)
  const solicitudCruda = leerTexto(join(carpeta, "solicitud.json"))
  if (solicitudCruda === null) throw new Error(`falta solicitud.json en el caso "${caso}"`)

  let correo: z.infer<typeof CorreoCrudoSchema>
  let solicitudBruta: z.infer<typeof SolicitudCrudaSchema>
  try {
    correo = CorreoCrudoSchema.parse(JSON.parse(correoCrudo))
    solicitudBruta = SolicitudCrudaSchema.parse(JSON.parse(solicitudCruda))
  } catch (causa) {
    const motivo = causa instanceof Error ? causa.message : String(causa)
    throw new Error(`correo.json o solicitud.json mal formados en "${caso}": ${motivo}`)
  }

  if (solicitudBruta.moneda !== "COP" && solicitudBruta.moneda !== "USD") {
    throw new Error(`moneda no soportada "${solicitudBruta.moneda}" en la solicitud de "${caso}"`)
  }

  const solicitud: Solicitud = SolicitudSchema.parse({
    ...solicitudBruta,
    proveedor_nit: solicitudBruta.proveedor_nit ?? null,
    indicador_iva: solicitudBruta.indicador_iva ?? null,
    condiciones_pago: solicitudBruta.condiciones_pago ?? null,
    cantidad: numeroObligatorio(solicitudBruta.cantidad, "cantidad"),
    valor_unitario: numeroObligatorio(solicitudBruta.valor_unitario, "valor_unitario"),
    valor_total: numeroObligatorio(solicitudBruta.valor_total, "valor_total"),
    fecha_solicitud: fechaISO(solicitudBruta.fecha_solicitud),
  })

  const cotizacionTexto = leerTexto(join(carpeta, "cotizacion.txt"))
  let cotizacion: Paquete["cotizacion"] = null
  if (cotizacionTexto === null) {
    faltantes.push("cotizacion.txt (cotización del proveedor)")
  } else {
    cotizacion = parsearCotizacion(cotizacionTexto)
  }

  const aprobacionTexto = leerTexto(join(carpeta, "aprobacion.json"))
  let aprobacion: Paquete["aprobacion"] = null
  if (aprobacionTexto === null) {
    faltantes.push("aprobacion.json (correo de aprobación del líder)")
  } else {
    const cruda = AprobacionCrudaSchema.parse(JSON.parse(aprobacionTexto))
    aprobacion = {
      de: cruda.de,
      fecha: cruda.fecha,
      aprobado: /\baprobad[oa]\b/i.test(cruda.cuerpo),
      texto: cruda.cuerpo,
    }
  }

  const facturaTexto = leerTexto(join(carpeta, "factura.txt"))
  const factura = facturaTexto === null ? null : parsearFactura(facturaTexto)

  return {
    caso,
    correo: { id: correo.id, de: correo.de, asunto: correo.asunto, fecha: correo.fecha },
    solicitud,
    cotizacion,
    aprobacion,
    factura,
    faltantes,
  }
}
