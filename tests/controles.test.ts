/**
 * Capa datos/negocio: los seis fixtures contra RC1–RC10.
 * Oráculo: el resultado de `oc_validar` sobre el fixture real, no un doble.
 * Cada "Entonces" es falsable: si un control deja de aplicarse, el assert falla.
 */
import { strict as assert } from "node:assert"
import { test } from "node:test"
import { resolve } from "node:path"
import { leerPaquete } from "../src/lib/paquete.ts"
import { cargarMaestros } from "../src/lib/maestros.ts"
import { derivarUnidad, validar } from "../src/lib/controles.ts"
import { clavNit, montoDesdeTexto, parsearCotizacion } from "../src/lib/parseo.ts"

const DIR = resolve(import.meta.dirname, "..")
const maestros = cargarMaestros(DIR)

function validarCaso(caso: string) {
  return validar(leerPaquete(DIR, caso), maestros)
}

function codigos(lista: Array<{ codigo: string }>): string[] {
  return [...new Set(lista.map((h) => h.codigo))].sort()
}

test("sol-001 · caso normal: apta, sin bloqueos ni confirmaciones", () => {
  const v = validarCaso("sol-001")
  assert.equal(v.apta, true)
  assert.deepEqual(codigos(v.bloqueos), [])
  assert.deepEqual(codigos(v.confirmaciones), [])
  assert.equal(v.retroactiva, false)
  assert.equal(v.derivados.proveedor_codigo_sap, "100234")
})

test("sol-002 · RC1: proveedor inexistente bloquea y la OC no es apta", () => {
  const v = validarCaso("sol-002")
  assert.equal(v.apta, false)
  assert.ok(codigos(v.bloqueos).includes("RC1"))
  assert.match(v.bloqueos[0]?.detalle ?? "", /no existe en el maestro de proveedores/)
  assert.ok((v.bloqueos[0]?.accion_sugerida ?? "").length > 0, "todo bloqueo trae acción sugerida")
})

test("sol-003 · RC2: aprobador sin autoridad en el centro de costo bloquea", () => {
  const v = validarCaso("sol-003")
  assert.equal(v.apta, false)
  assert.ok(codigos(v.bloqueos).includes("RC2"))
  // El monto (74 M) supera el tope más alto de CC-2020 (30 M): también se reporta RC3.
  assert.ok(codigos(v.bloqueos).includes("RC3"))
})

test("sol-004 · RC5: discrepancia cotización > 2 % pide confirmación, no bloquea", () => {
  const v = validarCaso("sol-004")
  assert.equal(v.apta, true)
  assert.deepEqual(codigos(v.bloqueos), [])
  assert.deepEqual(codigos(v.confirmaciones), ["RC5"])
  assert.match(v.confirmaciones[0]?.detalle ?? "", /26\.500\.000/)
  assert.match(v.confirmaciones[0]?.detalle ?? "", /25\.000\.000/)
})

test("sol-005 · RC8: factura anterior a la solicitud marca retroactiva y pide confirmación", () => {
  const v = validarCaso("sol-005")
  assert.equal(v.apta, true)
  assert.equal(v.retroactiva, true)
  assert.deepEqual(codigos(v.confirmaciones), ["RC8"])
})

test("sol-006 · RC6 y RC7: IVA derivado pide confirmación; condiciones de pago solo informan", () => {
  const v = validarCaso("sol-006")
  assert.equal(v.apta, true)
  assert.deepEqual(codigos(v.confirmaciones), ["RC6"])
  assert.equal(v.derivados.indicador_iva, "C1")
  assert.equal(v.derivados.condiciones_pago, "Z030")
  assert.ok(
    v.informativos.some((h) => h.codigo === "RC7"),
    "RC7 se informa como derivado, nunca como confirmación",
  )
  assert.ok(!codigos(v.confirmaciones).includes("RC7"))
})

test("RC3 · un monto por encima del tope del aprobador autorizado bloquea", () => {
  const paquete = leerPaquete(DIR, "sol-001")
  // mlopez tiene tope 50 M en CC-1010: 60 M debe bloquear por RC3.
  const excedido = {
    ...paquete,
    solicitud: { ...paquete.solicitud, valor_total: 60_000_000, valor_unitario: 500_000 },
  }
  assert.ok(codigos(validar(excedido, maestros).bloqueos).includes("RC3"))
})

test("RC4 · una subárea ajena al centro de costo bloquea", () => {
  const paquete = leerPaquete(DIR, "sol-001")
  const ajena = { ...paquete, solicitud: { ...paquete.solicitud, subarea: "Marketing" } }
  assert.ok(codigos(validar(ajena, maestros).bloqueos).includes("RC4"))
})

test("RC5 · sin cotización se pide confirmación en lugar de asumir el valor", () => {
  const paquete = { ...leerPaquete(DIR, "sol-001"), cotizacion: null }
  const v = validar(paquete, maestros)
  assert.deepEqual(codigos(v.confirmaciones), ["RC5"])
  assert.equal(v.apta, true)
})

test("RC9 · aprobación anterior a la solicitud pide confirmación", () => {
  const paquete = leerPaquete(DIR, "sol-001")
  const anterior = {
    ...paquete,
    aprobacion: { ...paquete.aprobacion!, fecha: "2026-08-19T10:00:00-05:00" },
  }
  assert.ok(codigos(validar(anterior, maestros).confirmaciones).includes("RC9"))
})

test("RC10 · cantidad × valor unitario distinto del total bloquea", () => {
  const paquete = leerPaquete(DIR, "sol-001")
  const descuadrado = { ...paquete, solicitud: { ...paquete.solicitud, cantidad: 119 } }
  assert.ok(codigos(validar(descuadrado, maestros).bloqueos).includes("RC10"))
})

test("RC2 · aprobación sin la palabra Aprobado bloquea", () => {
  const paquete = leerPaquete(DIR, "sol-001")
  const sinAprobar = {
    ...paquete,
    aprobacion: { ...paquete.aprobacion!, aprobado: false, texto: "Lo reviso mañana." },
  }
  assert.ok(codigos(validar(sinAprobar, maestros).bloqueos).includes("RC2"))
})

test("RC1 · un proveedor inactivo del maestro bloquea igual que uno inexistente", () => {
  const paquete = leerPaquete(DIR, "sol-001")
  // Consultores Ágiles S.A.S. existe en el maestro con activo = false.
  const inactivo = {
    ...paquete,
    solicitud: {
      ...paquete.solicitud,
      proveedor_nit: "901777888",
      proveedor_nombre: "Consultores Ágiles S.A.S.",
    },
  }
  const bloqueo = validar(inactivo, maestros).bloqueos.find((b) => b.codigo === "RC1")
  assert.match(bloqueo?.detalle ?? "", /inactivo/)
})

test("normalización · montos, NIT con dígito de verificación y unidad derivada", () => {
  assert.equal(montoDesdeTexto("COP 11.400.000"), 11_400_000)
  assert.equal(montoDesdeTexto("sin cifras"), null)
  assert.equal(clavNit("900.555.111-2"), "900555111")
  assert.equal(clavNit("900555111"), "900555111")
  assert.equal(derivarUnidad("Bolsa de 100 horas de arquitectura"), "H")
  assert.equal(derivarUnidad("Soporte mensual de plataforma"), "MES")
  // "vigencia 12 meses" es una duración del ítem, no su unidad de medida.
  assert.equal(derivarUnidad("Renovación licencias 120 puestos, vigencia 12 meses"), "UN")
})

test("cotización ilegible produce un Error con motivo, no un total inventado", () => {
  assert.throws(() => parsearCotizacion("Proveedor: X\nsin total"), /TOTAL/)
})
