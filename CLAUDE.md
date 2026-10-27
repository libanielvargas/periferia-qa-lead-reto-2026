# CLAUDE.md — Prueba técnica Periferia QA Lead

## Reto seleccionado y arranque visible (AUTORIDAD ACTUAL)

Libaniel seleccionó RETO 03 «Órdenes de Compra SAP» el 27-oct-2026. La fuente obligatoria y completa es `PRD.md`; los casos inmutables están en `fixtures/reto-03/`. Para proceder leer `ARRANQUE_CLAUDE.md` y ejecutar las verticales de `EJECUCION_RETO_03.md`. Claude Code debe trabajar en la ventana visible de VS Code de Libaniel, nunca mediante procesos ocultos disparados por un agente externo. Se omite Jira durante la evaluación: el tablero único es `EJECUCION_RETO_03.md`. **Todos los P0, chat con LLM real, demo.ts sin LLM, URL pública, pruebas y SOLUCION.md son obligatorios.** No reutilizar código privado Qirava.

Reglas operativas para el desafío de **desarrollo asistido por IA de 2 horas**.
Este archivo manda sobre cualquier comportamiento por defecto.

## Contexto

- Repositorio independiente de la prueba técnica. Nada aquí depende de otros proyectos.
- Hoy el repositorio está **PREPARADO, no implementado**: no existe aplicación, base de
  datos, frontend ni nube. Esas piezas se crean **solo cuando el enunciado lo exija**.
- No implementes funcionalidad de la prueba hasta tener el enunciado en mano.

## Límite de tiempo

- **120 minutos** de reloj, duros. El cronómetro es el recurso escaso.
- Prioriza terminar una vertical antes que empezar dos a medias.
- A los ~100 min, congela alcance: cierra lo abierto, no abras nada nuevo.

## Features verticales independientes

- Una *feature vertical* es la unidad de entrega: la rebanada más delgada que aporta valor
  observable de punta a punta.
- Cada vertical incluye **solo las capas que necesita**: base de datos **y/o** API **y/o**
  frontend **y/o** prueba. Si una capa no es necesaria para el criterio, no se crea.
- Las verticales mantienen el menor acoplamiento viable; las dependencias reales quedan explícitas.
- Contrato detallado de ejecución en `protocols/vertical-feature.md`.

## Cero código anticipatorio

- No escribas abstracciones, capas, configuraciones ni dependencias "por si acaso".
- No crees base de datos, API, front o infraestructura que ninguna vertical activa use.
- Si no hay un criterio verificable que lo exija ahora, no va.
- Borra el andamiaje que deje de usarse.

## Definición de terminado (DoD)

Una vertical está **terminada** cuando:

1. Cumple su criterio verificable, demostrado con evidencia (comando, salida o captura).
2. Solo contiene las capas que ese criterio necesitaba.
3. No rompe verticales ya entregadas.
4. Tiene trazabilidad a su issue de Jira (ver SKILL).
5. No deja código anticipatorio ni muerto.
6. **Lleva prueba funcional que valida el estado final** (UI y/o API/BBDD), no solo el
   recorrido de clicks. Sin esa prueba verde y reproducible, la vertical no está terminada.

## Pruebas funcionales (obligatorio)

- Toda vertical con comportamiento observable exige una prueba que afirme **estado final
  falsable**, no "se ejecutó la acción". Si el "Entonces" no puede ser falso con el
  sistema roto, no cuenta.
- Elige la **capa más barata que da evidencia verdadera** (datos < API < UI); reserva E2E
  para el flujo principal y para contrastar integración UI↔fuente de verdad.
- Diseño, matriz de capas, criterios falsables, Gherkin, riesgo y ficha de defecto
  reproducible: `protocols/qa-engineering.md`.
- Kit ejecutable (Screenplay mínimo, registro con captura bajo fallo, masking de
  secretos, plantillas Gherkin): `qa/` — ver `qa/README.md`. Pruebas del helper: `cd qa && npm test`.
- Referencia de consulta (solo lectura, **no copiar código**): skills `qirava-qa-governance`
  y `qa-automation-playwright-screenplay`.
- Prohibido en la preparación: instalar/lanzar navegador o ejecutar Playwright sobre una
  sesión real; esas dependencias quedan declaradas en `qa/package.json`, sin instalar.

## Gobierno obligatorio de navegadores

- Leer `protocols/browser-governance.md` antes de cualquier acción de UI, de REA o Playwright.
- La sesión autenticada y las pestañas pertenecen al **broker de Qirava**; jamás crear ventanas, perfiles ni lanzar Chrome/Chromium.
- MCP Playwright y REA están registrados **localmente**: conexión MCP no significa tener lease de pestaña. Adquirir y verificar lease en el broker antes de navegar; si no se puede verificar, **bloquear navegación**, continuar solo con pruebas sin navegador.
- `npm run test:e2e` queda bloqueado hasta que exista adaptador verificado del broker: Playwright Test estándar lanzaría un navegador nuevo.
- Nunca cerrar, resetear o desplazar pestañas alquiladas por otros proyectos ni tocar el servicio de Dani Barbershop.

## Convenciones

- Se usan convenciones Superpowers (skills, agentes), **sin** abrir sesiones extra ni
  planes de varias fases para tareas acotadas.
- No instalar dependencias ni crear app/BBDD/nube/front fuera de lo que exija una vertical.
- Commit por vertical verificada, sin secretos ni artefactos efímeros; push cuando lo pida el entregable. No detener al worker esperando aprobación intermedia, pero la entrega final externa la autoriza Libaniel.
- Operaciones de Jira: solo cuando se indique explícitamente.

## Harness

- `scripts/harness.py` ejecuta **un** worker Claude con checkpoint, heartbeat, timeout y
  reporte HTML. No reintenta a ciegas ante límites de tokens.
- Uso: `python3 scripts/harness.py status` y `python3 scripts/harness.py run -- <cmd>`.
