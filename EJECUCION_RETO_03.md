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

- [ ] **V1 · Entrada funcional:** Node 20+/TypeScript, Zod, paquetes locales, `oc_leer_paquete` normaliza los 6 casos JSON/texto, adjuntos ausentes como null y errores tipados; `demo.ts` ejecuta lectura; prueba de lectura + input malo.
- [ ] **V2 · Controles verificables:** `oc_validar` aplica RC1–RC10 de PRD §7.3: bloqueos vs confirmaciones vs derivados vs retroactiva; validar exactamente expectativas de `sol-001..006`; prueba de cada control. No crear OC cuando hay bloqueos.
- [ ] **V3 · Creación real simulada:** `oc_construir_payload` con Zod + `out/<caso>/trazabilidad.json`; `oc_generar_evidencia` crea TXT + SHA256; `SapAdapter` y mock, `oc_crear` con confirmación, secuencia 4500000001, idempotencia, `out/sap/ordenes.jsonl`, `out/control.csv` por cada intento.
- [ ] **V4 · Agente y conversación:** `agent/prompt.md`; backend API, adaptador LLM real con env secreto, bucle limitado, tool calls visibles/registradas en `out/log.jsonl`, errores comprensibles, historial, confirmación en mensaje posterior; frontend chat responsive con estados y evidencia. Health sin secretos.
- [ ] **V5 · Demostración integral:** `demo.ts` procesa 6 casos sin LLM, procesa `sol-001` dos veces mostrando idempotencia y `sol-004` con/sin confirmación. Pruebas unitarias/API/integración reproducibles. `npm run dev` levanta todo en un comando. Fixture jamás se modifica.
- [ ] **V6 · Entrega y defensa:** URL **pública** usable durante defensa; preferir un túnel Cloudflare aislado autorizado y comprobado sin afectar Qirava/Dani; `README.md`, `.env.example`, `SOLUCION.md` con 12 apartados PRD §9.1 (matriz RC1–RC10, SAP real propuesto, compras retroactivas, costos, uso real de IA, trade-offs, cobertura). Verificar seguridad, Git limpio, push y URL HTTP desde fuera; no enviar a Periferia sin orden de Libaniel.

## Evidencias a escribir en cada vertical

- Comando probado, salida y estado real; ruta de test (ej.: `npm test`); bugs pendientes; commit; URL al estar activa.
- Anotar aquí el estado de la ejecución y bloqueos concretos: **No iniciado**. Es decisión deliberada: Libaniel debe pegar el disparador en Claude Code visible dentro de VS Code.

## Fuera de alcance declarado por PRD

SAP real, conectarse a correo real, Excel binario, base de datos, autenticación, multiusuario, workflow de aprobación. PDF de aprobación es P1 opcional; TXT+SHA256 es P0. Bonus de módulo reutilizable solo si TODOS los requisitos obligatorios ya funcionan.
