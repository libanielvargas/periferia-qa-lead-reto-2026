/**
 * demo.ts — verificación de las herramientas SIN modelo y SIN clave (PRD §6.6).
 *
 * Procesa los 6 casos de fixtures/reto-03/solicitudes llamando directamente a las
 * herramientas, demuestra idempotencia ejecutando sol-001 dos veces y muestra sol-004
 * sin confirmación (no crea) y con confirmación (crea).
 *
 * Uso: npm run demo
 */
import { rmSync } from "node:fs"
import { resolve } from "node:path"
import { ejecutarHerramienta } from "./src/tools/registro.ts"
import type { Contexto } from "./src/tools/oc.ts"

const DIRECTORIO = resolve(import.meta.dirname)
const CASOS = ["sol-001", "sol-002", "sol-003", "sol-004", "sol-005", "sol-006"] as const

const ctx: Contexto = { directory: DIRECTORIO, sessionId: "demo" }

type Respuesta = { ok: true; data: Record<string, unknown> } | { ok: false; error: string }

async function llamar(nombre: string, argumentos: Record<string, unknown>): Promise<Respuesta> {
  const bruto = await ejecutarHerramienta(nombre, argumentos, ctx)
  return JSON.parse(bruto) as Respuesta
}

function titulo(texto: string): void {
  console.log(`\n${"═".repeat(78)}\n${texto}\n${"═".repeat(78)}`)
}

type Hallazgo = { codigo: string; detalle: string }

function codigos(lista: Hallazgo[]): string {
  return lista.length === 0 ? "ninguno" : lista.map((h) => h.codigo).join(", ")
}

async function procesar(caso: string, confirmado: boolean): Promise<void> {
  const etiqueta = confirmado ? `${caso} (confirmado por la analista)` : caso
  console.log(`\n── ${etiqueta} ${"─".repeat(Math.max(0, 60 - etiqueta.length))}`)

  const lectura = await llamar("oc_leer_paquete", { caso })
  if (!lectura.ok) {
    console.log(`  lectura        ✗ ${lectura.error}`)
    return
  }
  const paquete = lectura.data
  const solicitud = paquete.solicitud as { solicitud_id: string; valor_total: number }
  const faltantes = paquete.faltantes as string[]
  console.log(
    `  paquete        ✓ ${solicitud.solicitud_id} · ${solicitud.valor_total.toLocaleString("es-CO")} COP` +
      `${faltantes.length > 0 ? ` · faltantes: ${faltantes.join(", ")}` : ""}` +
      `${paquete.factura ? " · con factura" : ""}`,
  )

  const validacion = await llamar("oc_validar", { caso, paquete })
  if (!validacion.ok) {
    console.log(`  validación     ✗ ${validacion.error}`)
    return
  }
  const v = validacion.data as {
    apta: boolean
    bloqueos: Hallazgo[]
    confirmaciones: Hallazgo[]
    informativos: Hallazgo[]
    retroactiva: boolean
  }
  console.log(`  apta           ${v.apta ? "sí" : "NO"}`)
  console.log(`  bloqueos       ${codigos(v.bloqueos)}`)
  console.log(`  confirmaciones ${codigos(v.confirmaciones)}`)
  console.log(`  derivados      ${codigos(v.informativos)}`)
  console.log(`  retroactiva    ${v.retroactiva}`)
  for (const hallazgo of [...v.bloqueos, ...v.confirmaciones]) {
    console.log(`    · ${hallazgo.codigo}: ${hallazgo.detalle}`)
  }

  const creacion = await llamar("oc_crear", {
    caso,
    confirmado,
    confirmado_por: confirmado ? "analista.demo" : undefined,
  })
  if (creacion.ok) {
    const d = creacion.data as { numero_oc: string; idempotente: boolean; ruta_evidencia: string }
    console.log(
      `  OC             ✓ ${d.numero_oc}${d.idempotente ? " (idempotente: ya existía)" : ""} · evidencia ${d.ruta_evidencia}`,
    )
  } else {
    console.log(`  OC             ✗ no creada — ${creacion.error}`)
  }
}

async function principal(): Promise<void> {
  // Determinismo (PRD §8): out/ se limpia al inicio. fixtures/ nunca se toca.
  rmSync(resolve(DIRECTORIO, "out"), { recursive: true, force: true })

  titulo("DEMO · Agente de Órdenes de Compra SAP — herramientas sin modelo de lenguaje")
  console.log(`Fixtures: fixtures/reto-03/solicitudes · Salidas: out/ (limpiado al iniciar)`)

  titulo("1 · Los seis casos, sin confirmación humana")
  for (const caso of CASOS) await procesar(caso, false)

  titulo("2 · Idempotencia: sol-001 por segunda vez")
  await procesar("sol-001", false)

  titulo("3 · Confirmación explícita: sol-004 (discrepancia de cotización RC5)")
  await procesar("sol-004", true)

  titulo("4 · Confirmación explícita: sol-005 (compra retroactiva RC8) y sol-006 (IVA derivado RC6)")
  await procesar("sol-005", true)
  await procesar("sol-006", true)

  titulo("Artefactos generados")
  console.log("  out/control.csv              una fila por intento (creada/bloqueada/pendiente)")
  console.log("  out/sap/ordenes.jsonl        órdenes del SAP simulado, desde 4500000001")
  console.log("  out/<caso>/aprobacion.txt    evidencia de aprobación + sha256")
  console.log("  out/<caso>/trazabilidad.json fuente de cada campo del payload\n")
}

await principal()
