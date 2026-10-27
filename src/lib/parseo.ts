/**
 * Normalización de texto colombiano (montos "COP 11.400.000", NIT "900.555.111-2")
 * y extracción de cotización y factura desde los .txt de los fixtures.
 * Todo valor devuelto proviene del texto; nada se inventa.
 */

/** "COP 11.400.000" → 11400000. Devuelve null si no hay dígitos usables. */
export function montoDesdeTexto(texto: string): number | null {
  const limpio = texto.replace(/[^\d,.]/g, "")
  if (limpio === "") return null
  // Formato local: punto como separador de miles, coma como decimal.
  const normalizado = limpio.replace(/\./g, "").replace(",", ".")
  const valor = Number(normalizado)
  return Number.isFinite(valor) ? valor : null
}

/** NIT a clave comparable: solo dígitos, sin dígito de verificación. */
export function clavNit(nit: string | null | undefined): string | null {
  if (!nit) return null
  const digitos = nit.replace(/\D/g, "")
  if (digitos.length === 0) return null
  return digitos.length > 9 ? digitos.slice(0, 9) : digitos
}

/** Nombre a clave comparable: minúsculas, sin acentos, sin sufijos societarios ni puntuación. */
export function clavNombre(nombre: string): string {
  return nombre
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\b(s\.?a\.?s\.?|s\.?a\.?|ltda\.?|sas|sa)\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
}

/** Texto a fecha ISO corta (YYYY-MM-DD) tomando solo la parte de fecha. */
export function fechaISO(valor: string): string {
  return valor.slice(0, 10)
}

export function sumarDias(fechaBase: string, dias: number): string {
  const base = new Date(`${fechaISO(fechaBase)}T00:00:00Z`)
  base.setUTCDate(base.getUTCDate() + dias)
  return base.toISOString().slice(0, 10)
}

export type CotizacionParseada = {
  referencia: string | null
  proveedor: string
  nit: string | null
  total: number
  moneda: string
  validez_hasta: string | null
  texto: string
}

/** Extrae los campos de `cotizacion.txt`. Lanza Error si falta proveedor o total. */
export function parsearCotizacion(texto: string): CotizacionParseada {
  const referencia = texto.match(/COTIZACI[ÓO]N\s+([^\n]+)/i)?.[1]?.trim() ?? null
  const proveedor = texto.match(/^Proveedor:\s*(.+)$/im)?.[1]?.trim()
  if (!proveedor) throw new Error("la cotización no declara proveedor")

  const lineaTotal = texto.match(/^TOTAL[^\n:]*:\s*([A-Z]{3})?\s*([\d.,]+)/im)
  if (!lineaTotal) throw new Error("la cotización no declara un TOTAL legible")
  const total = montoDesdeTexto(lineaTotal[2] ?? "")
  if (total === null) throw new Error(`total de cotización no numérico: "${lineaTotal[2]}"`)

  const nit = texto.match(/^NIT:\s*([\d.\-]+)/im)?.[1]?.trim() ?? null
  const moneda = lineaTotal[1] ?? texto.match(/\b(COP|USD)\b/)?.[1] ?? "COP"

  const fechaCotizacion = texto.match(/^Fecha:\s*(\d{4}-\d{2}-\d{2})/im)?.[1] ?? null
  const diasValidez = texto.match(/Validez de la oferta:\s*(\d+)\s*d[ií]as/i)?.[1]
  const validez_hasta =
    fechaCotizacion && diasValidez ? sumarDias(fechaCotizacion, Number(diasValidez)) : null

  return { referencia, proveedor, nit, total, moneda, validez_hasta, texto }
}

export type FacturaParseada = { numero: string; fecha: string; total: number }

/** Extrae los campos de `factura.txt`. Lanza Error si falta número, fecha o total. */
export function parsearFactura(texto: string): FacturaParseada {
  const numero = texto.match(/FACTURA[^\n]*?No\.\s*([A-Z0-9\-]+)/i)?.[1]?.trim()
  const fecha = texto.match(/Fecha de emisi[óo]n:\s*(\d{4}-\d{2}-\d{2})/i)?.[1]
  const lineaTotal = texto.match(/^TOTAL[^\n:]*:\s*([A-Z]{3})?\s*([\d.,]+)/im)
  const total = lineaTotal ? montoDesdeTexto(lineaTotal[2] ?? "") : null
  if (!numero) throw new Error("la factura no declara número")
  if (!fecha) throw new Error("la factura no declara fecha de emisión")
  if (total === null) throw new Error("la factura no declara un TOTAL legible")
  return { numero, fecha, total }
}
