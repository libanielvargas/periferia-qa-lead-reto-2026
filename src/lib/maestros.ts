/**
 * Carga de maestros desde `fixtures/reto-03/maestros/` (solo lectura).
 * Los fixtures son la única fuente de verdad; no hay valores embebidos en código.
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { z } from "zod"
import {
  CentroCostoSchema,
  CondicionPagoSchema,
  IndicadorIvaSchema,
  ProveedorSchema,
  type CentroCosto,
  type Proveedor,
} from "./dominio.ts"
import { clavNit, clavNombre } from "./parseo.ts"

export type Maestros = {
  proveedores: Proveedor[]
  centros: CentroCosto[]
  indicadoresIva: z.infer<typeof IndicadorIvaSchema>[]
  condicionesPago: z.infer<typeof CondicionPagoSchema>[]
}

const cache = new Map<string, Maestros>()

function leerJson<T>(ruta: string, esquema: z.ZodType<T>): T {
  const bruto: unknown = JSON.parse(readFileSync(ruta, "utf8"))
  return esquema.parse(bruto)
}

/** Lee y valida los cuatro maestros. Cachea por raíz de proyecto. */
export function cargarMaestros(directorio: string): Maestros {
  const enCache = cache.get(directorio)
  if (enCache) return enCache
  const base = join(directorio, "fixtures", "reto-03", "maestros")
  const maestros: Maestros = {
    proveedores: leerJson(join(base, "proveedores.json"), z.array(ProveedorSchema)),
    centros: leerJson(join(base, "centros-costo.json"), z.array(CentroCostoSchema)),
    indicadoresIva: leerJson(join(base, "indicadores-iva.json"), z.array(IndicadorIvaSchema)),
    condicionesPago: leerJson(join(base, "condiciones-pago.json"), z.array(CondicionPagoSchema)),
  }
  cache.set(directorio, maestros)
  return maestros
}

/** RC1: busca proveedor por NIT; si la solicitud no trae NIT, por nombre normalizado. */
export function buscarProveedor(
  maestros: Maestros,
  nit: string | null,
  nombre: string,
): Proveedor | null {
  const porNit = clavNit(nit)
  if (porNit) {
    const hallado = maestros.proveedores.find((p) => clavNit(p.nit) === porNit)
    if (hallado) return hallado
  }
  const porNombre = clavNombre(nombre)
  return maestros.proveedores.find((p) => clavNombre(p.nombre) === porNombre) ?? null
}

export function buscarCentro(maestros: Maestros, centroCosto: string): CentroCosto | null {
  return maestros.centros.find((c) => c.centro_costo === centroCosto) ?? null
}
