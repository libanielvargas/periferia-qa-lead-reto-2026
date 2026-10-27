# Tablero de ejecución — Reto 03 (Periferia)

**Duración:** 27-oct-2026 15:00–17:00 Bogotá. **Uno de tres retos seleccionado por Libaniel: RETO 03.** La solución debe quedar completa, verificable, pública y defendible; no hay tiempo para Jira ni arquitecturas no pedidas.

Fuente única de requisitos: `PRD.md`. Datos inviolables: `fixtures/reto-03/` (copiados íntegros de Descargas). Gobierno operativo: `CLAUDE.md`, `protocols/vertical-feature.md`, `protocols/qa-engineering.md`, `protocols/browser-governance.md`. Skills Claude: `.claude/skills/`.

## Contrato de trabajo

1. Una vertical = comportamiento útil de punta a punta (herramienta tipada Zod + API/chat necesario + oráculo de prueba). Solo construir las capas necesarias para ella.
2. Al terminar cada vertical: prueba de éxito y de fallo, commit concreto y actualizar aquí estado REAL y siguiente acción. Nada de trabajo anticipatorio.
3. No esperar revisión de Libaniel entre verticales; detenerse solo por decisión humana imprescindible, acceso negado o instrucción nueva.
4. Las herramientas de negocio devuelven JSON serializado `{ok,data}` o `{ok:false,error}`; nunca excepciones al agente; fuentes solamente en `fixtures/` y artefactos en `out/`.
5. IA debe ser real en el chat, con adaptador de proveedor y límites de iteraciones/tokens; `demo.ts` prueba las mismas herramientas SIN modelo y sin clave. Nada de respuestas simuladas que aparenten IA.
6. No tocar otros repositorios, túneles ni servicios de Qirava/Dani. No abrir nuevas ventanas de Chrome; ver protocolo browser.

## Backlog único (editar checks con pruebas reales)

- [x] **V1 · Entrada funcional:** Node 20+/TypeScript, Zod, paquetes locales, `oc_leer_paquete` normaliza los 6 casos JSON/texto, adjuntos ausentes como null y errores tipados; `demo.ts` ejecuta lectura; prueba de lectura + input malo.
- [x] **V2 · Controles verificables:** `oc_validar` aplica RC1–RC10 de PRD §7.3: bloqueos vs confirmaciones vs derivados vs retroactiva; validar exactamente expectativas de `sol-001..006`; prueba de cada control. No crear OC cuando hay bloqueos.
- [x] **V3 · Creación real simulada:** `oc_construir_payload` con Zod + `out/<caso>/trazabilidad.json`; `oc_generar_evidencia` crea TXT + SHA256; `SapAdapter` y mock, `oc_crear` con confirmación, secuencia 4500000001, idempotencia, `out/sap/ordenes.jsonl`, `out/control.csv` por cada intento.
- [x] **V4 · Agente y conversación:** `agent/prompt.md`; backend API, adaptador LLM real con env secreto, bucle limitado, tool calls visibles/registradas en `out/log.jsonl`, errores comprensibles, historial, confirmación en mensaje posterior; frontend chat responsive con estados y evidencia. Health sin secretos.
- [x] **V5 · Demostración integral:** `demo.ts` procesa 6 casos sin LLM, procesa `sol-001` dos veces mostrando idempotencia y `sol-004` con/sin confirmación. Pruebas unitarias/API/integración reproducibles. `npm run dev` levanta todo en un comando. Fixture jamás se modifica.
- [~] **V6 · Entrega y defensa:** URL **pública** usable durante defensa; preferir un túnel Cloudflare aislado autorizado y comprobado sin afectar Qirava/Dani; `README.md`, `.env.example`, `SOLUCION.md` con 12 apartados PRD §9.1 (matriz RC1–RC10, SAP real propuesto, compras retroactivas, costos, uso real de IA, trade-offs, cobertura). Verificar seguridad, Git limpio, push y URL HTTP desde fuera; no enviar a Periferia sin orden de Libaniel.

## Evidencias a escribir en cada vertical

### Estado real al cierre de la sesión (27-oct-2026)

| Vertical | Estado | Evidencia reproducible |
|---|---|---|
| V1 · Entrada funcional | **Terminada** | `npm run demo` normaliza los 6 casos; `sol-006` reporta `indicador_iva` y `condiciones_pago` como `null`; caso inexistente y cotización ilegible devuelven `{ok:false,error}`. |
| V2 · Controles verificables | **Terminada** | `npm test` → RC1–RC10 con una prueba por control. Resultado por fixture: `sol-001` apta sin hallazgos · `sol-002` RC1 · `sol-003` RC2+RC3 · `sol-004` RC5 · `sol-005` RC8 retroactiva · `sol-006` RC6 confirmación + RC7 derivado. |
| V3 · Creación real simulada | **Terminada** | `out/sap/ordenes.jsonl` desde `4500000001`; idempotencia probada (una sola línea tras dos creaciones); `out/<caso>/aprobacion.txt` con `sha256` que coincide con `shasum -a 256`; `out/<caso>/trazabilidad.json`; `out/control.csv` con una fila por intento. |
| V4 · Agente y conversación | **Terminada (pendiente clave humana)** | `agent/prompt.md` + `src/knowledge/`; `src/llm/anthropic.ts` con el SDK real; CA1–CA5 probados con adaptador guionado; front con tool calls desplegables y confirmación resaltada; `/api/health` sin secretos. **Bloqueo real:** no hay `ANTHROPIC_API_KEY` en el entorno, así que el chat contra el modelo no se ha ejecutado todavía; con la clave puesta en `.env`, `npm run demo:llm` lo comprueba en un turno. |
| V5 · Demostración integral | **Terminada** | `npm run demo` (6 casos, `sol-001` dos veces, `sol-004` con y sin confirmación); `npm test` 33 verdes; `npm run typecheck` limpio; `npm run dev` levanta front y API en un comando. `fixtures/` intacto. |
| V6 · Entrega y defensa | **Casi terminada** | URL pública verificada desde fuera: `https://christmas-counseling-expenditures-boards.trycloudflare.com` (`/api/health` 200, front 200). `README.md`, `.env.example` y `SOLUCION.md` con los 12 apartados escritos. Falta: commit/push final y el turno de chat con clave real. |

### Bloqueos concretos

1. **Clave del modelo.** Único punto que requiere a Libaniel: poner `ANTHROPIC_API_KEY` en
   `.env`. El adaptador real está escrito y el backend lo reporta en `/api/health`; sin
   clave `/api/chat` responde 503 explicándolo, y las herramientas siguen verificables.
2. **Bonus `modulo/` (PRD §9.4) no hecho**, por decisión de reloj: es bonus y los
   requisitos obligatorios tenían prioridad.
3. **Incidente de túnel, resuelto.** El primer `cloudflared tunnel --url` heredó
   `~/.cloudflared/config.yml` (túnel "ML Growth OS" → `meli-api.paraingenieros.org`) y por
   eso respondía el `http_status:404` de ese ingress. Se detuvo ese proceso de inmediato y
   se relanzó con un `--config` aislado en `/private/tmp`. No se tocaron los túneles de
   `qirava-wa-webhook` ni `belle-forme-preview`, que siguen corriendo.

## Fuera de alcance declarado por PRD

SAP real, conectarse a correo real, Excel binario, base de datos, autenticación, multiusuario, workflow de aprobación. PDF de aprobación es P1 opcional; TXT+SHA256 es P0. Bonus de módulo reutilizable solo si TODOS los requisitos obligatorios ya funcionan.
