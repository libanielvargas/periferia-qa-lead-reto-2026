// PLANTILLA de ejemplo (NO se ejecuta en la preparación: requiere `npm i` y un
// sistema bajo prueba). Demuestra el contrato irrenunciable: validar el ESTADO
// FINAL por API y/o UI, no solo el recorrido de clicks. ESTA PLANTILLA USA EL
// FIXTURE page DE PLAYWRIGHT TEST, QUE ABRE NAVEGADOR; NO EJECUTAR. Primero
// crear adaptador gobernado al broker Qirava con lease válido. Usa Screenplay y el
// registro con captura bajo fallo. Reemplaza los TODO por selectores/endpoints
// reales cuando el enunciado los defina.

import { test, expect } from '@playwright/test';
import { Actor, Ability, task, question } from '../lib/screenplay.js';
import { runStep } from '../lib/capture.js';
import { StepLogger } from '../lib/logger.js';

const BASE_URL = process.env.BASE_URL ?? 'http://localhost:3000';

class BrowseTheWeb extends Ability {
  constructor(page) { super(); this.page = page; }
}
class CallApi extends Ability {
  constructor(request) { super(); this.request = request; }
}

// --- Tasks (mutan estado del sistema vía UI) ---
const CrearRegistro = (nombre) =>
  task(`crear registro "${nombre}"`, async (actor) => {
    const { page } = actor.abilityTo(BrowseTheWeb);
    await page.goto(`${BASE_URL}/registros/nuevo`);
    await page.getByLabel('Nombre').fill(nombre); // TODO: selector real
    await page.getByRole('button', { name: 'Guardar' }).click(); // TODO
  });

// --- Questions (leen estado; base de la aserción) ---
const RegistrosEnApi = question('registros según la API', async (actor) => {
  const { request } = actor.abilityTo(CallApi);
  const res = await request.get(`${BASE_URL}/api/registros`); // TODO: endpoint real
  expect(res.ok()).toBeTruthy();
  return res.json();
});

test('crear un registro queda reflejado en el estado final (API + UI)', async ({ page, request }) => {
  const log = new StepLogger({ name: 'e2e', filePath: 'evidence/flujo-estado-final.jsonl' });
  const shot = (file) => page.screenshot({ path: file, fullPage: true }).then(() => file);
  const actor = Actor.named('QA').whoCan(new BrowseTheWeb(page), new CallApi(request));
  const nombre = `demo-${test.info().testId}`;

  await runStep('crear registro por UI', () => actor.attemptsTo(CrearRegistro(nombre)), {
    logger: log,
    screenshot: shot,
  });

  // Estado final por API: la fuente de verdad confirma la escritura.
  await runStep('verificar estado final por API', async () => {
    const registros = await actor.asks(RegistrosEnApi);
    expect(registros.map((r) => r.nombre)).toContain(nombre);
  }, { logger: log, screenshot: shot });

  // Estado final por UI: lo que el usuario realmente ve.
  await runStep('verificar estado final por UI', async () => {
    await page.goto(`${BASE_URL}/registros`);
    await expect(page.getByRole('row', { name: nombre })).toBeVisible(); // TODO
  }, { logger: log, screenshot: shot });
});
