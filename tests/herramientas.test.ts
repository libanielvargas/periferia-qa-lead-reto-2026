/**
 * Capa herramientas + persistencia: contrato { ok, data|error }, idempotencia,
 * confirmación humana y artefactos escritos en out/.
 * Oráculo: los archivos que quedan en disco (ordenes.jsonl, control.csv, aprobacion.txt),
 * no el valor que devolvió la función. Cada prueba usa su propio directorio temporal.
 */
import { strict as assert } from "node:assert"
import { test } from "node:test"
import { createHash } from "node:crypto"
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import { ejecutarHerramienta } from "../src/tools/registro.ts"
import type { Contexto } from "../src/tools/oc.ts"

const RAIZ = resolve(import.meta.dirname, "..")

/** Copia solo fixtures/ y agent/: las pruebas jamás escriben en el repo. */
function entornoAislado(): { ctx: Contexto; limpiar: () => void } {
  const base = mkdtempSync(join(tmpdir(), "reto03-"))
  cpSync(join(RAIZ, "fixtures"), join(base, "fixtures"), { recursive: true })
  return {
    ctx: { directory: base, sessionId: "test" },
    limpiar: () => rmSync(base, { recursive: true, force: true }),
  }
}

type Respuesta = { ok: true; data: Record<string, unknown> } | { ok: false; error: string }

async function llamar(
  ctx: Contexto,
  nombre: string,
  argumentos: Record<string, unknown>,
): Promise<Respuesta> {
  return JSON.parse(await ejecutarHerramienta(nombre, argumentos, ctx)) as Respuesta
}

function leerCsv(ctx: Contexto): string[] {
  return readFileSync(join(ctx.directory, "out", "control.csv"), "utf8").trim().split("\n")
}

test("oc_leer_paquete normaliza el caso y reporta campos opcionales como null", async () => {
  const { ctx, limpiar } = entornoAislado()
  try {
    const r = await llamar(ctx, "oc_leer_paquete", { caso: "sol-006" })
    assert.ok(r.ok)
    const solicitud = r.data.solicitud as Record<string, unknown>
    assert.equal(solicitud.indicador_iva, null)
    assert.equal(solicitud.condiciones_pago, null)
    assert.equal(r.data.factura, null)
    const cotizacion = r.data.cotizacion as { total: number; validez_hasta: string }
    assert.equal(cotizacion.total, 5_400_000)
    assert.equal(cotizacion.validez_hasta, "2026-09-27")
  } finally {
    limpiar()
  }
})

test("oc_leer_paquete de un caso inexistente devuelve ok:false con motivo, sin lanzar", async () => {
  const { ctx, limpiar } = entornoAislado()
  try {
    const r = await llamar(ctx, "oc_leer_paquete", { caso: "sol-999" })
    assert.equal(r.ok, false)
    assert.match((r as { error: string }).error, /no existe el caso/)
  } finally {
    limpiar()
  }
})

test("argumentos inválidos se rechazan antes de ejecutar y el error vuelve al modelo", async () => {
  const { ctx, limpiar } = entornoAislado()
  try {
    const sinCaso = await llamar(ctx, "oc_leer_paquete", {})
    assert.equal(sinCaso.ok, false)
    assert.match((sinCaso as { error: string }).error, /argumentos inválidos/)

    const inexistente = await llamar(ctx, "oc_inventada", { caso: "sol-001" })
    assert.equal(inexistente.ok, false)
    assert.match((inexistente as { error: string }).error, /no existe la herramienta/)

    // Un caso con separadores de ruta no puede escapar de fixtures/.
    const travesia = await llamar(ctx, "oc_leer_paquete", { caso: "../../etc" })
    assert.equal(travesia.ok, false)
    assert.match((travesia as { error: string }).error, /caso inválido/)
  } finally {
    limpiar()
  }
})

test("oc_crear sin confirmación no crea la OC de sol-004 y deja la fila pendiente en control.csv", async () => {
  const { ctx, limpiar } = entornoAislado()
  try {
    const r = await llamar(ctx, "oc_crear", { caso: "sol-004" })
    assert.equal(r.ok, false)
    assert.match((r as { error: string }).error, /requiere confirmación humana/)
    // Oráculo real: no hay órdenes en el SAP simulado.
    assert.equal(existsSync(join(ctx.directory, "out", "sap", "ordenes.jsonl")), false)
    assert.match(leerCsv(ctx)[1] ?? "", /pendiente_confirmacion/)
  } finally {
    limpiar()
  }
})

test("oc_crear con confirmación crea sol-004 y la deja en ordenes.jsonl con la excepción confirmada", async () => {
  const { ctx, limpiar } = entornoAislado()
  try {
    const r = await llamar(ctx, "oc_crear", {
      caso: "sol-004",
      confirmado: true,
      confirmado_por: "analista.qa",
    })
    assert.ok(r.ok)
    assert.equal(r.data.numero_oc, "4500000001")
    const fila = JSON.parse(
      readFileSync(join(ctx.directory, "out", "sap", "ordenes.jsonl"), "utf8").trim(),
    ) as { numero_oc: string; orden: { excepciones: Array<{ codigo: string; confirmado_por: string }> } }
    assert.equal(fila.numero_oc, "4500000001")
    assert.deepEqual(
      fila.orden.excepciones.map((e) => [e.codigo, e.confirmado_por]),
      [["RC5", "analista.qa"]],
    )
  } finally {
    limpiar()
  }
})

test("crear dos veces el mismo solicitud_id devuelve el número existente (idempotencia)", async () => {
  const { ctx, limpiar } = entornoAislado()
  try {
    const primera = await llamar(ctx, "oc_crear", { caso: "sol-001" })
    const segunda = await llamar(ctx, "oc_crear", { caso: "sol-001" })
    assert.ok(primera.ok && segunda.ok)
    assert.equal(primera.data.idempotente, false)
    assert.equal(segunda.data.idempotente, true)
    assert.equal(segunda.data.numero_oc, primera.data.numero_oc)
    // Oráculo: una sola línea en el SAP simulado, no dos.
    const lineas = readFileSync(join(ctx.directory, "out", "sap", "ordenes.jsonl"), "utf8")
      .trim()
      .split("\n")
    assert.equal(lineas.length, 1)
    // Y dos filas de control: creada + idempotente.
    assert.deepEqual(
      leerCsv(ctx)
        .slice(1)
        .map((l) => l.split(",")[1]),
      ['"creada"', '"idempotente"'],
    )
  } finally {
    limpiar()
  }
})

test("un caso bloqueado no crea OC y queda registrado como bloqueada con sus códigos", async () => {
  const { ctx, limpiar } = entornoAislado()
  try {
    const r = await llamar(ctx, "oc_crear", { caso: "sol-002", confirmado: true })
    assert.equal(r.ok, false)
    // Ni siquiera con confirmado:true: un bloqueo no se confirma.
    assert.equal(existsSync(join(ctx.directory, "out", "sap", "ordenes.jsonl")), false)
    assert.match(leerCsv(ctx)[1] ?? "", /"bloqueada".*RC1/)
  } finally {
    limpiar()
  }
})

test("sol-005 confirmada queda marcada retroactiva = true en control.csv", async () => {
  const { ctx, limpiar } = entornoAislado()
  try {
    const r = await llamar(ctx, "oc_crear", { caso: "sol-005", confirmado: true })
    assert.ok(r.ok)
    assert.equal(r.data.retroactiva, true)
    const fila = leerCsv(ctx)[1] ?? ""
    assert.match(fila, /"creada"/)
    assert.match(fila, /"true"/)
    assert.match(fila, /RC8/)
  } finally {
    limpiar()
  }
})

test("oc_generar_evidencia escribe el TXT y su sha256 coincide con el del archivo en disco", async () => {
  const { ctx, limpiar } = entornoAislado()
  try {
    const r = await llamar(ctx, "oc_generar_evidencia", { caso: "sol-001" })
    assert.ok(r.ok)
    const contenido = readFileSync(join(ctx.directory, "out", "sol-001", "aprobacion.txt"), "utf8")
    assert.equal(r.data.sha256, createHash("sha256").update(contenido, "utf8").digest("hex"))
    assert.match(contenido, /mlopez@periferia-ficticia\.com/)
    assert.match(contenido, /Aprobado, proceder con la orden de compra/)
  } finally {
    limpiar()
  }
})

test("oc_construir_payload respeta el límite SAP de 40 caracteres y traza cada campo", async () => {
  const { ctx, limpiar } = entornoAislado()
  try {
    const r = await llamar(ctx, "oc_construir_payload", { caso: "sol-001" })
    assert.ok(r.ok)
    const payload = r.data.payload as {
      posiciones: Array<{ descripcion: string; unidad: string; indicador_iva: string }>
      condiciones_pago: string
      aprobador: { evidencia_sha256: string }
    }
    assert.ok(payload.posiciones[0]!.descripcion.length <= 40)
    assert.equal(payload.posiciones[0]!.unidad, "UN")
    assert.equal(payload.condiciones_pago, "Z030")
    assert.equal(payload.aprobador.evidencia_sha256.length, 64)

    const traza = JSON.parse(
      readFileSync(join(ctx.directory, "out", "sol-001", "trazabilidad.json"), "utf8"),
    ) as { trazabilidad: Record<string, { fuente: string }> }
    // Todo campo del payload declara una fuente conocida.
    for (const [campo, entrada] of Object.entries(traza.trazabilidad)) {
      assert.match(
        entrada.fuente,
        /^(solicitud|cotizacion|correo|aprobacion|derivado|maestro\..+)$/,
        `campo sin fuente válida: ${campo}`,
      )
    }
    assert.equal(traza.trazabilidad["proveedor.codigo_sap"]?.fuente, "maestro.proveedores")
  } finally {
    limpiar()
  }
})

test("oc_construir_payload se niega cuando hay bloqueos sin resolver", async () => {
  const { ctx, limpiar } = entornoAislado()
  try {
    const r = await llamar(ctx, "oc_construir_payload", { caso: "sol-003" })
    assert.equal(r.ok, false)
    assert.match((r as { error: string }).error, /bloqueos sin resolver/)
  } finally {
    limpiar()
  }
})
