/**
 * API HTTP del chat y servidor del front (PRD §6.4). Node puro: sin framework web.
 *
 * POST /api/chat           { sessionId, message } → { reply, toolCalls[], needsConfirmation }
 * GET  /api/sessions/:id   historial completo de la sesión
 * GET  /api/health         { ok, provider, model } — sin exponer claves
 * GET  /api/casos          casos disponibles en fixtures (para los atajos del front)
 */
import { createServer, type IncomingMessage, type ServerResponse } from "node:http"
import { execFile, spawn } from "node:child_process"
import { readdirSync, readFileSync, existsSync } from "node:fs"
import { extname, join, normalize, resolve } from "node:path"
import { AdaptadorAnthropic } from "./llm/anthropic.ts"
import { AdaptadorGroq } from "./llm/groq.ts"
import { ErrorProveedor, type LlmAdapter } from "./llm/adapter.ts"
import {
  LIMITES,
  ejecutarTurno,
  obtenerSesion,
  registrarTurnoVisible,
} from "./agent/ciclo.ts"
import { nombresHerramientas } from "./tools/registro.ts"

const DIRECTORIO = resolve(import.meta.dirname, "..")
const PUERTO = Number(process.env.PORT ?? 8787)
const PROVEEDOR = process.env.GROQ_API_KEY ? "groq" : "anthropic"
const MODELO = process.env.LLM_MODEL ?? (PROVEEDOR === "groq" ? "openai/gpt-oss-120b" : "claude-sonnet-5")
const LIMITE_CUERPO = 1_000_000
let demoEnCurso = false

/** El adaptador se construye una vez; si no hay clave, el chat responde 503 explicando. */
function construirAdaptador(): { adaptador: LlmAdapter | null; motivo: string | null } {
  const groq = process.env.GROQ_API_KEY
  const anthropic = process.env.ANTHROPIC_API_KEY
  try {
    if (groq?.trim()) return { adaptador: new AdaptadorGroq(groq, MODELO), motivo: null }
    if (anthropic?.trim()) return { adaptador: new AdaptadorAnthropic(anthropic, MODELO), motivo: null }
    return {
      adaptador: null,
      motivo: "Configure GROQ_API_KEY o ANTHROPIC_API_KEY en el servidor para habilitar el agente conversacional.",
    }
  } catch (causa) {
    return { adaptador: null, motivo: causa instanceof Error ? causa.message : String(causa) }
  }
}

const { adaptador, motivo } = construirAdaptador()

function json(res: ServerResponse, estado: number, cuerpo: unknown): void {
  const texto = JSON.stringify(cuerpo)
  res.writeHead(estado, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
  })
  res.end(texto)
}

async function leerCuerpo(req: IncomingMessage): Promise<unknown> {
  const trozos: Buffer[] = []
  let total = 0
  for await (const trozo of req) {
    const buffer = trozo as Buffer
    total += buffer.length
    if (total > LIMITE_CUERPO) throw new Error("cuerpo de la petición demasiado grande")
    trozos.push(buffer)
  }
  if (total === 0) return {}
  return JSON.parse(Buffer.concat(trozos).toString("utf8"))
}

const TIPOS: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
}

function servirEstatico(ruta: string, res: ServerResponse): boolean {
  const relativa = ruta === "/" ? "index.html" : normalize(ruta).replace(/^(\.\.[/\\])+/, "").slice(1)
  const archivo = join(DIRECTORIO, "web", relativa)
  if (!archivo.startsWith(join(DIRECTORIO, "web")) || !existsSync(archivo)) return false
  res.writeHead(200, { "content-type": TIPOS[extname(archivo)] ?? "application/octet-stream" })
  res.end(readFileSync(archivo))
  return true
}

function casosDisponibles(): string[] {
  const base = join(DIRECTORIO, "fixtures", "reto-03", "solicitudes")
  if (!existsSync(base)) return []
  return readdirSync(base, { withFileTypes: true })
    .filter((entrada) => entrada.isDirectory())
    .map((entrada) => entrada.name)
    .sort()
}

const servidor = createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`)

  try {

    if (req.method === "POST" && url.pathname === "/api/demo/stream") {
      if (demoEnCurso) return json(res, 409, { ok: false, error: "La demo ya está ejecutándose; espere su resultado." })
      demoEnCurso = true

      // NDJSON: una línea JSON por evento, emitida en cuanto demo.ts produce salida real.
      res.writeHead(200, {
        "content-type": "application/x-ndjson; charset=utf-8",
        "cache-control": "no-store",
        "x-accel-buffering": "no",
      })
      const emitir = (evento: Record<string, unknown>): void => {
        if (!res.writableEnded) res.write(JSON.stringify(evento) + "\n")
      }

      emitir({ tipo: "inicio", mensaje: "Ejecución aislada sin credenciales de Groq ni Anthropic." })

      // El hijo nunca recibe las claves de IA: se demuestra que la demo es determinista.
      const envHijo = Object.fromEntries(
        Object.entries(process.env).filter(([nombre]) => nombre !== "GROQ_API_KEY" && nombre !== "ANTHROPIC_API_KEY"),
      )
      const hijo = spawn(process.execPath, [join(DIRECTORIO, "demo.ts")], { cwd: DIRECTORIO, env: envHijo })

      let cerrado = false
      const finalizar = (ok: boolean, extra: Record<string, unknown> = {}): void => {
        if (cerrado) return
        cerrado = true
        clearTimeout(temporizador)
        emitir({ tipo: "fin", ok, ...extra })
        if (!res.writableEnded) res.end()
        demoEnCurso = false
      }

      const temporizador = setTimeout(() => {
        hijo.kill("SIGKILL")
        emitir({ tipo: "error", error: "La demo superó el tiempo máximo de 60 s y fue detenida." })
        finalizar(false, { codigo: null })
      }, 60_000)

      // Reparte la salida por líneas completas; conserva el resto parcial entre trozos.
      const hacerLector = (canal: "stdout" | "stderr") => {
        let pendiente = ""
        return {
          dato(trozo: Buffer): void {
            pendiente += trozo.toString("utf8")
            let corte: number
            while ((corte = pendiente.indexOf("\n")) >= 0) {
              const linea = pendiente.slice(0, corte).replace(/\r$/, "")
              pendiente = pendiente.slice(corte + 1)
              emitir({ tipo: "linea", canal, texto: linea })
            }
          },
          vaciar(): void {
            if (pendiente !== "") {
              emitir({ tipo: "linea", canal, texto: pendiente.replace(/\r$/, "") })
              pendiente = ""
            }
          },
        }
      }
      const lectorOut = hacerLector("stdout")
      const lectorErr = hacerLector("stderr")
      hijo.stdout.on("data", (trozo: Buffer) => lectorOut.dato(trozo))
      hijo.stderr.on("data", (trozo: Buffer) => lectorErr.dato(trozo))

      hijo.on("error", (error) => {
        emitir({ tipo: "error", error: "No se pudo ejecutar demo.ts: " + error.message })
        finalizar(false, { codigo: null })
      })
      hijo.on("close", (codigo) => {
        lectorOut.vaciar()
        lectorErr.vaciar()
        if (codigo !== 0 && !cerrado) {
          emitir({ tipo: "error", error: `demo.ts terminó con código ${codigo}.` })
        }
        finalizar(codigo === 0, { codigo })
      })

      // Si el cliente cierra la conexión, no dejamos el proceso huérfano.
      res.on("close", () => {
        if (!cerrado) {
          hijo.kill()
          clearTimeout(temporizador)
          demoEnCurso = false
          cerrado = true
        }
      })
      return
    }

    if (req.method === "POST" && url.pathname === "/api/demo") {
      if (demoEnCurso) return json(res, 409, { ok: false, error: "La demo ya está ejecutándose; espere su resultado." })
      demoEnCurso = true
      try {
        const salida = await new Promise<string>((resolver, rechazar) => {
          execFile(process.execPath, [join(DIRECTORIO, "demo.ts")], {
            cwd: DIRECTORIO,
            timeout: 60_000,
            maxBuffer: 1_000_000,
            env: Object.fromEntries(Object.entries(process.env).filter(([nombre]) => nombre !== "GROQ_API_KEY" && nombre !== "ANTHROPIC_API_KEY")),
          }, (error, stdout, stderr) => {
            if (error) rechazar(new Error("demo.ts terminó con error: " + (stderr || error.message).slice(0, 600)))
            else resolver(stdout)
          })
        })
        return json(res, 200, { ok: true, salida, sin_ia: true })
      } catch (error) {
        return json(res, 500, { ok: false, error: error instanceof Error ? error.message : "No se pudo ejecutar la demo" })
      } finally {
        demoEnCurso = false
      }
    }

    if (req.method === "GET" && url.pathname === "/api/health") {
      // Nunca expone la clave: solo si está configurada o no.
      return json(res, 200, {
        ok: true,
        provider: adaptador?.proveedor ?? PROVEEDOR,
        model: MODELO,
        llm_configurado: adaptador !== null,
        motivo_llm: motivo,
        herramientas: nombresHerramientas(),
        limites: LIMITES,
      })
    }

    if (req.method === "GET" && url.pathname === "/api/casos") {
      return json(res, 200, { ok: true, casos: casosDisponibles() })
    }

    if (req.method === "GET" && url.pathname.startsWith("/api/sessions/")) {
      const id = decodeURIComponent(url.pathname.slice("/api/sessions/".length))
      const sesion = obtenerSesion(id)
      return json(res, 200, {
        ok: true,
        sessionId: sesion.id,
        historial: sesion.historialVisible,
        tokens_sesion: sesion.tokensUsados,
      })
    }

    if (req.method === "POST" && url.pathname === "/api/chat") {
      const cuerpo = (await leerCuerpo(req)) as { sessionId?: unknown; message?: unknown }
      const sessionId = typeof cuerpo.sessionId === "string" && cuerpo.sessionId !== ""
        ? cuerpo.sessionId
        : null
      const message = typeof cuerpo.message === "string" ? cuerpo.message.trim() : ""
      if (!sessionId) return json(res, 400, { ok: false, error: "falta sessionId" })
      if (message === "") return json(res, 400, { ok: false, error: "falta message" })
      if (message.length > 4000) {
        return json(res, 400, { ok: false, error: "el mensaje excede 4000 caracteres" })
      }
      if (!adaptador) return json(res, 503, { ok: false, error: motivo })

      const sesion = obtenerSesion(sessionId)
      try {
        const turno = await ejecutarTurno(adaptador, sesion, message, {
          directory: DIRECTORIO,
          sessionId,
        })
        registrarTurnoVisible(sesion, turno)
        return json(res, 200, {
          ok: true,
          reply: turno.reply,
          toolCalls: turno.toolCalls,
          needsConfirmation: turno.needsConfirmation,
          iteraciones: turno.iteraciones,
          limiteAlcanzado: turno.limiteAlcanzado,
          uso: turno.uso,
        })
      } catch (causa) {
        // CA5: el error se muestra en lenguaje claro y la sesión sigue viva.
        const texto =
          causa instanceof ErrorProveedor
            ? causa.message
            : `error inesperado del backend: ${causa instanceof Error ? causa.message : String(causa)}`
        return json(res, 502, { ok: false, error: texto })
      }
    }

    if (req.method === "GET" && servirEstatico(url.pathname, res)) return

    return json(res, 404, { ok: false, error: `ruta no encontrada: ${req.method} ${url.pathname}` })
  } catch (causa) {
    return json(res, 400, {
      ok: false,
      error: causa instanceof Error ? causa.message : String(causa),
    })
  }
})

servidor.listen(PUERTO, "127.0.0.1", () => {
  console.log(`▸ Agente de Órdenes de Compra SAP en http://localhost:${PUERTO}`)
  console.log(`  modelo: ${MODELO} · LLM ${adaptador ? "configurado" : `no configurado (${motivo})`}`)
  console.log(`  herramientas: ${nombresHerramientas().join(", ")}`)
  console.log(`  casos: ${casosDisponibles().join(", ") || "(ninguno)"}`)
})
