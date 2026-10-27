# Gobierno de navegadores — Periferia (obligatorio)

Fuente de autoridad: `qirava-knowledge-vault/10-fabrica/gobierno/docs/operacion/FACTORY_RUNTIME_POLICY.md`, reglas de browser broker/leases (solo lectura). La autorización del proyecto NO permite modificar ese gobierno.

## Antes de cualquier Playwright, REA o navegación UI

1. Identificar el navegador existente con sesión autenticada; **no crear otra ventana, instancia ni perfil**.
2. Consultar el **browser broker de Qirava** y solicitar una pestaña compatible libre; si no existe, solo el broker puede abrir una **pestaña dentro de la ventana existente**, nunca nueva ventana.
3. Adquirir y registrar lease con `owner`, `project`, `resource`, `priority`, `acquired`, `heartbeat`, `released`. Mantener heartbeat y liberar lease al terminar. Nunca entrar en pestaña de otro proyecto sin lease.
4. Usar el MCP `playwright` local (`npx -y @playwright/mcp@latest --extension`) para adjuntarse a la pestaña autorizada. El MCP `rea` local (`npx -y rea-agents@6.8.0 mcp`) sigue el MISMO gobierno cuando inspecciona/captura productos ajenos.
5. **Si no se verifica broker + lease + pestaña, no navegar.** La conexión exitosa al MCP, un `--extension` y la presencia de Chrome no equivalen a un lease.
6. Jamás borrar cookies, reiniciar sesión, cerrar ventana, ejecutar `chromium.launch`, `browserType.launch`, `--user-data-dir`, `npx playwright install` o la fixture `page` de Playwright Test estándar sin un adaptador validado por el broker.
7. `npm run test:e2e` está bloqueado expresamente hasta construir ese adaptador. Los tests `npm test` usan Node puro y son seguros.

## Evidencia y trabajo QA

- Para UI gobernada: Gherkin → tareas Screenplay → interacciones instrumentadas → oráculo de estado final (UI/API) → evidencia JSONL bajo `qa/evidence` y screenshot **solo ante fallo**.
- Para API, componentes y BBDD: ejecutar directamente sin navegador y afirmar datos, contratos, permisos e integridad relacional.
- REA puede analizar una aplicación por capturas/protocolos o código autorizado; ninguna operación de captura tiene permiso implícito para abrir otra ventana.
- No tocar ni reiniciar servicios del proyecto Dani Barbershop; preservar todos los proyectos Qirava ajenos.

## Estado verificado (27-oct-2026)

- MCP REA 6.8.0 y Playwright MCP `--extension` registrados **solo en config local del proyecto** y reportados conectados.
- **No** existe constancia de lease de browser broker ni de un escenario UI real ejecutado desde este proyecto. Hasta comprobarlo, el navegador permanece fuera de alcance.
