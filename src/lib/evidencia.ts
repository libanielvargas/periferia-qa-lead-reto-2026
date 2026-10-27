/**
 * HU-4 (P0): evidencia de aprobación como TXT + sha256 en out/<caso>/.
 * El sha256 se calcula sobre el contenido exacto del archivo escrito, de modo que
 * auditoría pueda recalcularlo con `shasum -a 256 out/<caso>/aprobacion.txt`.
 */
import { createHash } from "node:crypto"
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { join, resolve } from "node:path"
import { z } from "zod"
import { validarNombreCaso } from "./paquete.ts"

const AprobacionCrudaSchema = z.object({
  de: z.string(),
  para: z.string().optional(),
  cc: z.array(z.string()).optional(),
  fecha: z.string(),
  asunto: z.string().optional(),
  cuerpo: z.string(),
})

export type Evidencia = { ruta: string; sha256: string; aprobador: string; fecha: string }

export function sha256(contenido: string): string {
  return createHash("sha256").update(contenido, "utf8").digest("hex")
}

/** Genera out/<caso>/aprobacion.txt con encabezados + cuerpo y devuelve su sha256. */
export function generarEvidencia(directorio: string, caso: string): Evidencia {
  validarNombreCaso(caso)
  const origen = resolve(directorio, "fixtures", "reto-03", "solicitudes", caso, "aprobacion.json")
  if (!existsSync(origen)) {
    throw new Error(`el caso "${caso}" no tiene aprobacion.json: no hay evidencia que generar`)
  }
  const aprobacion = AprobacionCrudaSchema.parse(JSON.parse(readFileSync(origen, "utf8")))

  const contenido = [
    "EVIDENCIA DE APROBACIÓN DE GASTO",
    `Caso: ${caso}`,
    "",
    `De: ${aprobacion.de}`,
    `Para: ${aprobacion.para ?? "(no informado)"}`,
    `CC: ${(aprobacion.cc ?? []).join(", ") || "(ninguno)"}`,
    `Fecha: ${aprobacion.fecha}`,
    `Asunto: ${aprobacion.asunto ?? "(sin asunto)"}`,
    "",
    "--- CUERPO DEL CORREO ---",
    aprobacion.cuerpo,
    "--- FIN DEL CUERPO ---",
    "",
  ].join("\n")

  const carpeta = join(resolve(directorio), "out", caso)
  mkdirSync(carpeta, { recursive: true })
  const ruta = join(carpeta, "aprobacion.txt")
  writeFileSync(ruta, contenido, "utf8")

  return {
    ruta: `out/${caso}/aprobacion.txt`,
    sha256: sha256(contenido),
    aprobador: aprobacion.de,
    fecha: aprobacion.fecha,
  }
}
