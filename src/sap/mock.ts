/**
 * SAP simulado sobre archivos (PRD §3.2: sin base de datos).
 * Numeración secuencial desde 4500000001 e idempotencia por solicitud_id, resueltas
 * releyendo out/sap/ordenes.jsonl: el estado vive en el archivo, no en memoria, así que
 * reiniciar el servidor no duplica órdenes.
 */
import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs"
import { join, resolve } from "node:path"
import type { OrdenCompra } from "../lib/dominio.ts"
import type { SapAdapter } from "./adapter.ts"
import { cargarMaestros } from "../lib/maestros.ts"
import { clavNit } from "../lib/parseo.ts"

const PRIMER_NUMERO = 4500000001

type FilaOrden = { numero_oc: string; fecha: string; solicitud_id: string; orden: OrdenCompra }

export class SapMock implements SapAdapter {
  readonly rutaOrdenes: string
  private readonly directorio: string

  constructor(directorio: string) {
    this.directorio = directorio
    this.rutaOrdenes = join(resolve(directorio), "out", "sap", "ordenes.jsonl")
  }

  private leerOrdenes(): FilaOrden[] {
    if (!existsSync(this.rutaOrdenes)) return []
    return readFileSync(this.rutaOrdenes, "utf8")
      .split("\n")
      .filter((linea) => linea.trim() !== "")
      .map((linea) => JSON.parse(linea) as FilaOrden)
  }

  async consultarProveedor(nit: string): Promise<{ codigo_sap: string; activo: boolean } | null> {
    const clave = clavNit(nit)
    const proveedor = cargarMaestros(this.directorio).proveedores.find(
      (p) => clavNit(p.nit) === clave,
    )
    return proveedor ? { codigo_sap: proveedor.codigo_sap, activo: proveedor.activo } : null
  }

  async buscarOrdenPorReferencia(solicitud_id: string): Promise<{ numero_oc: string } | null> {
    const fila = this.leerOrdenes().find((o) => o.solicitud_id === solicitud_id)
    return fila ? { numero_oc: fila.numero_oc } : null
  }

  async crearOrden(orden: OrdenCompra): Promise<{ numero_oc: string; fecha: string }> {
    const ordenes = this.leerOrdenes()
    const existente = ordenes.find((o) => o.solicitud_id === orden.referencia.solicitud_id)
    if (existente) return { numero_oc: existente.numero_oc, fecha: existente.fecha }

    const numero_oc = String(PRIMER_NUMERO + ordenes.length)
    const fecha = new Date().toISOString()
    mkdirSync(join(resolve(this.directorio), "out", "sap"), { recursive: true })
    const fila: FilaOrden = {
      numero_oc,
      fecha,
      solicitud_id: orden.referencia.solicitud_id,
      orden,
    }
    appendFileSync(this.rutaOrdenes, `${JSON.stringify(fila)}\n`, "utf8")
    return { numero_oc, fecha }
  }
}
