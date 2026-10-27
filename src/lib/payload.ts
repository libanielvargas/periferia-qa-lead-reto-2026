/**
 * HU-3: construcción del payload de la OC (PRD §7.4) con trazabilidad por campo.
 * Todo valor del payload declara su fuente: solicitud, cotizacion, correo,
 * maestro.<nombre> o derivado. La trazabilidad se persiste en out/<caso>/trazabilidad.json.
 */
import { mkdirSync, writeFileSync } from "node:fs"
import { join, resolve } from "node:path"
import {
  OrdenCompraSchema,
  type Derivados,
  type OrdenCompra,
  type Paquete,
  type Trazabilidad,
  type Validacion,
} from "./dominio.ts"
import { generarEvidencia } from "./evidencia.ts"

const LIMITE_TEXTO_BREVE_SAP = 40

/** Texto breve de posición SAP: máximo 40 caracteres (PRD §7.4). */
export function recortarDescripcion(descripcion: string): string {
  if (descripcion.length <= LIMITE_TEXTO_BREVE_SAP) return descripcion
  return `${descripcion.slice(0, LIMITE_TEXTO_BREVE_SAP - 1).trimEnd()}…`
}

export type PayloadConstruido = {
  payload: OrdenCompra
  trazabilidad: Trazabilidad
  ruta_trazabilidad: string
  descripcion_recortada: boolean
}

/**
 * Construye y valida el payload. Requiere derivados resueltos (indicador de IVA,
 * condiciones de pago y código SAP del proveedor); si falta alguno, lanza con el motivo.
 */
export function construirPayload(
  directorio: string,
  paquete: Paquete,
  validacion: Validacion,
  derivados: Derivados = validacion.derivados,
): PayloadConstruido {
  const { solicitud } = paquete
  if (!derivados.proveedor_codigo_sap || !derivados.proveedor_nit) {
    throw new Error(
      "no se puede construir el payload: el proveedor no está en el maestro (RC1 sin resolver)",
    )
  }
  if (!derivados.indicador_iva) {
    throw new Error("no se puede construir el payload: falta el indicador de IVA (RC6)")
  }
  if (!derivados.condiciones_pago) {
    throw new Error("no se puede construir el payload: faltan las condiciones de pago (RC7)")
  }
  if (!paquete.aprobacion) {
    throw new Error("no se puede construir el payload: el paquete no trae aprobación (RC2)")
  }

  const evidencia = generarEvidencia(directorio, paquete.caso)
  const descripcion = recortarDescripcion(solicitud.descripcion)

  const payload: OrdenCompra = OrdenCompraSchema.parse({
    referencia: {
      solicitud_id: solicitud.solicitud_id,
      correo_id: paquete.correo.id,
      cotizacion_ref: paquete.cotizacion?.referencia ?? null,
    },
    sociedad: "1000",
    organizacion_compras: "1000",
    proveedor: {
      codigo_sap: derivados.proveedor_codigo_sap,
      nit: derivados.proveedor_nit,
      nombre: solicitud.proveedor_nombre,
    },
    moneda: solicitud.moneda,
    condiciones_pago: derivados.condiciones_pago,
    aprobador: {
      email: paquete.aprobacion.de,
      fecha_aprobacion: paquete.aprobacion.fecha,
      evidencia_sha256: evidencia.sha256,
    },
    posiciones: [
      {
        numero: 10,
        descripcion,
        cantidad: solicitud.cantidad,
        unidad: derivados.unidad,
        precio_unitario: solicitud.valor_unitario,
        centro_costo: solicitud.centro_costo,
        subarea: solicitud.subarea,
        indicador_iva: derivados.indicador_iva,
      },
    ],
    excepciones: [...validacion.bloqueos, ...validacion.confirmaciones].map((hallazgo) => ({
      codigo: hallazgo.codigo,
      detalle: hallazgo.detalle,
      confirmado_por: null,
    })),
  })

  const trazabilidad: Trazabilidad = {
    "referencia.solicitud_id": { valor: payload.referencia.solicitud_id, fuente: "solicitud" },
    "referencia.correo_id": { valor: payload.referencia.correo_id, fuente: "correo" },
    "referencia.cotizacion_ref": {
      valor: payload.referencia.cotizacion_ref,
      fuente: "cotizacion",
      nota: paquete.cotizacion ? undefined : "sin cotización en el paquete",
    },
    sociedad: { valor: payload.sociedad, fuente: "derivado", nota: "constante de Periferia (PRD §7.4)" },
    organizacion_compras: {
      valor: payload.organizacion_compras,
      fuente: "derivado",
      nota: "constante de Periferia (PRD §7.4)",
    },
    "proveedor.codigo_sap": { valor: payload.proveedor.codigo_sap, fuente: "maestro.proveedores" },
    "proveedor.nit": { valor: payload.proveedor.nit, fuente: "maestro.proveedores" },
    "proveedor.nombre": { valor: payload.proveedor.nombre, fuente: "solicitud" },
    moneda: { valor: payload.moneda, fuente: "solicitud" },
    condiciones_pago: {
      valor: payload.condiciones_pago,
      fuente: solicitud.condiciones_pago ? "solicitud" : "maestro.proveedores",
      nota: solicitud.condiciones_pago ? undefined : "derivado por RC7",
    },
    "aprobador.email": { valor: payload.aprobador.email, fuente: "aprobacion" },
    "aprobador.fecha_aprobacion": { valor: payload.aprobador.fecha_aprobacion, fuente: "aprobacion" },
    "aprobador.evidencia_sha256": {
      valor: payload.aprobador.evidencia_sha256,
      fuente: "derivado",
      nota: `sha256 de ${evidencia.ruta}`,
    },
    "posiciones[0].descripcion": {
      valor: payload.posiciones[0]?.descripcion,
      fuente: "solicitud",
      nota:
        descripcion === solicitud.descripcion
          ? undefined
          : `recortada a ${LIMITE_TEXTO_BREVE_SAP} caracteres (límite de texto breve SAP)`,
    },
    "posiciones[0].cantidad": { valor: payload.posiciones[0]?.cantidad, fuente: "solicitud" },
    "posiciones[0].unidad": {
      valor: payload.posiciones[0]?.unidad,
      fuente: "derivado",
      nota: "inferida de la descripción de la solicitud",
    },
    "posiciones[0].precio_unitario": {
      valor: payload.posiciones[0]?.precio_unitario,
      fuente: "solicitud",
    },
    "posiciones[0].centro_costo": { valor: payload.posiciones[0]?.centro_costo, fuente: "solicitud" },
    "posiciones[0].subarea": { valor: payload.posiciones[0]?.subarea, fuente: "solicitud" },
    "posiciones[0].indicador_iva": {
      valor: payload.posiciones[0]?.indicador_iva,
      fuente: solicitud.indicador_iva ? "solicitud" : "maestro.proveedores",
      nota: solicitud.indicador_iva ? undefined : "derivado por RC6",
    },
  }

  const carpeta = join(resolve(directorio), "out", paquete.caso)
  mkdirSync(carpeta, { recursive: true })
  const ruta_trazabilidad = `out/${paquete.caso}/trazabilidad.json`
  writeFileSync(
    join(carpeta, "trazabilidad.json"),
    `${JSON.stringify({ caso: paquete.caso, payload, trazabilidad }, null, 2)}\n`,
    "utf8",
  )

  return {
    payload,
    trazabilidad,
    ruta_trazabilidad,
    descripcion_recortada: descripcion !== solicitud.descripcion,
  }
}
