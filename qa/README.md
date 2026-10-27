# qa/ — kit QA portátil

Capacidades de prueba listas para usar cuando llegue el enunciado. Diseño y disciplina
en `../protocols/qa-engineering.md`. Nada aquí asume una app concreta.

## Contenido

| Ruta | Qué es |
|---|---|
| `lib/screenplay.js` | Screenplay mínimo: `Actor`, `Ability`, `task`/`interaction`, `question`. |
| `lib/logger.js` | `StepLogger`: registro estructurado paso a paso (JSON), reloj inyectable. |
| `lib/capture.js` | `runStep`: ejecuta un paso, captura pantalla ante fallo de aserción y re-lanza. |
| `lib/masking.js` | Enmascarado de secretos por nombre de clave y por forma del valor. |
| `examples/memory-todos.js` | Ability/Tasks/Questions en memoria (demo + base de pruebas). |
| `examples/flujo-estado-final.spec.js` | **Plantilla** Playwright: valida estado final por API+UI. |
| `features/plantilla-negocio.feature` | **Plantilla** Gherkin de negocio (sin prueba inventada). |
| `tests/*.test.js` | Pruebas unitarias del helper, **sin navegador**. |

## Ejecutar las pruebas unitarias (ahora, sin instalar nada)

Usan el runner nativo de Node (`node --test`); no requieren navegador ni dependencias.

```bash
cd qa
npm test
# → 15 pruebas verdes (masking, logger, capture, screenplay)
```

## Dependencias declaradas pero NO instaladas

`package.json` declara `@playwright/test` y `@cucumber/cucumber` como `devDependencies`
**justificadas** (E2E con validación de estado y Gherkin de negocio). En la preparación
**no se instalan ni se lanza navegador**. Cuando el enunciado lo exija:

```bash
npm install            # instala Playwright Test y Cucumber
npm run test:e2e       # BLOQUEADO deliberadamente: Playwright Test lanzaría otro navegador
# Para UI: MCP Playwright --extension + lease Qirava verificado (protocols/browser-governance.md)
# cucumber requiere step definitions adaptadas al enunciado y al mismo broker
```

## Ejemplo de uso (Screenplay, sin navegador)

```js
import { Actor } from './lib/screenplay.js';
import { ManageTodos, AddTodo, CompleteTodo, PendingCount } from './examples/memory-todos.js';

const ana = Actor.named('Ana').whoCan(ManageTodos.freshStore());
await ana.attemptsTo(AddTodo('plan'), AddTodo('riesgos'), CompleteTodo('plan'));
// La aserción valida ESTADO FINAL, no el recorrido:
console.assert((await ana.asks(PendingCount)) === 1);
```

Para E2E, cambia la Ability en memoria por `BrowseTheWeb(page)` / `CallApi(request)`
como en `examples/flujo-estado-final.spec.js`: las Tasks actúan por UI y las Questions
confirman el estado final por API.

## Cómo reproducir un bug con el kit

1. Envuelve cada paso en `runStep('descripción', fn, { logger, screenshot })`.
2. Al fallar una aserción, `runStep` captura pantalla y registra el error (enmascarado)
   y re-lanza, de modo que la prueba falla de verdad.
3. Adjunta como evidencia: las líneas JSON de `logger.toJSON()` (pasos numerados) y la
   captura referida en la entrada `error`.
4. Completa la ficha de defecto de `../protocols/qa-engineering.md` §6.

```js
import { StepLogger } from './lib/logger.js';
import { runStep } from './lib/capture.js';

const log = new StepLogger({ name: 'repro-123', filePath: 'evidence/repro-123.jsonl' });
// En E2E: const shot = (f) => page.screenshot({ path: f }).then(() => f);
try {
  await runStep('crear registro', () => actor.attemptsTo(/* ... */), { logger: log /*, screenshot: shot */ });
  await runStep('verificar estado final', async () => {
    // expect(estadoReal).toEqual(estadoEsperado)
  }, { logger: log /*, screenshot: shot */ });
} finally {
  console.log(JSON.stringify(log.toJSON(), null, 2)); // evidencia reproducible
}
```

Los secretos (password, token, Authorization, tokens largos) se redactan en logs y
evidencia automáticamente (`lib/masking.js`).
