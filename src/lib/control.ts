/**
 * Log de control para contabilidad y auditoría (HU-5): out/control.csv.
 * Se agrega una fila por CADA intento —creado, idempotente, bloqueado o pendiente de
 * confirmación— porque la dirección quiere medir el desvío de proceso, no solo los éxitos.
 */
import { appendFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs"
import { join, resolve } from "node:path"

export type ResultadoIntento =
  | "creada"
  | "idempotente"
  | "bloqueada"
  | "pendiente_confirmacion"
  | "error"

export type FilaControl = {
  solicitud_id: string
  resultado: ResultadoIntento
  numero_oc: string | null
  retroactiva: boolean
  bloqueos: string[]
  confirmaciones: string[]
}

const ENCABEZADO = "solicitud_id,resultado,numero_oc,retroactiva,bloqueos,confirmaciones,ts"

function campo(valor: string): string {
  return `"${valor.replace(/"/g, '""')}"`
}

/** Agrega una fila a out/control.csv y devuelve la ruta relativa del archivo. */
export function registrarControl(directorio: string, fila: FilaControl): string {
  const carpeta = join(resolve(directorio), "out")
  mkdirSync(carpeta, { recursive: true })
  const ruta = join(carpeta, "control.csv")
  if (!existsSync(ruta)) writeFileSync(ruta, `${ENCABEZADO}\n`, "utf8")
  const linea = [
    campo(fila.solicitud_id),
    campo(fila.resultado),
    campo(fila.numero_oc ?? ""),
    campo(String(fila.retroactiva)),
    campo(fila.bloqueos.join(" ")),
    campo(fila.confirmaciones.join(" ")),
    campo(new Date().toISOString()),
  ].join(",")
  appendFileSync(ruta, `${linea}\n`, "utf8")
  return "out/control.csv"
}
