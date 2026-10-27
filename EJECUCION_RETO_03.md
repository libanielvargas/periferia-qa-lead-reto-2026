
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
| V4 · Agente y conversación | **Terminada; modelo real probado** | Groq real por API, `oc_leer_paquete` y `oc_validar` ejecutadas contra sol-004, confirmación RC5 requerida, sin creación no autorizada; interfaz corporativa y chat con scroll. |
| V5 · Demostración integral | **Terminada** | `npm run demo` (6 casos, `sol-001` dos veces, `sol-004` con y sin confirmación); `npm test` 33 verdes; `npm run typecheck` limpio; `npm run dev` levanta front y API en un comando. `fixtures/` intacto. |
| V6 · Entrega y defensa | **Terminada** | Front y API públicos HTTP 200; Groq activo; 33 pruebas verdes; repositorio actualizado con documentación y logotipo original. |

### Estado de bloqueos a cierre del 27-oct-2026

- **Credencial IA: resuelto.** Groq configurado y respuesta real probada por URL pública. Nunca se versionó la credencial.
- **Límite Groq: gestionado.** 8.000 TPM observados; reintento automático acotado al plazo informado por el proveedor.
- **Bonus `modulo/`: pendiente opcional**, fuera del alcance obligatorio del reloj.
- **Túnel: resuelto y aislado** de los túneles de Qirava y Dani.

## Fuera de alcance declarado por PRD

SAP real, conectarse a correo real, Excel binario, base de datos, autenticación, multiusuario, workflow de aprobación. PDF de aprobación es P1 opcional; TXT+SHA256 es P0. Bonus de módulo reutilizable solo si TODOS los requisitos obligatorios ya funcionan.
