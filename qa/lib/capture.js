// Ejecuta un paso de prueba con registro y captura bajo fallo. Si `fn` lanza
// (p. ej. un fallo de aserción), intenta una captura de pantalla, registra el
// error enmascarado y RE-LANZA para que la prueba falle de verdad.
//
// `screenshot` se inyecta para no acoplar al navegador: en Playwright basta
//   (file) => page.screenshot({ path: file }).then(() => file)
// En pruebas unitarias se inyecta una función falsa.

import { StepLogger } from './logger.js';
import { maskString } from './masking.js';

function slug(name) {
  return String(name).replace(/[^a-z0-9]+/gi, '-').replace(/^-+|-+$/g, '').toLowerCase() || 'paso';
}

export async function runStep(name, fn, { logger, screenshot, artifactName, artifactDir = 'evidence' } = {}) {
  const log = logger ?? new StepLogger();
  log.step(name);
  try {
    const result = await fn();
    log.info(`ok: ${name}`);
    return result;
  } catch (err) {
    const file = artifactName ?? `${artifactDir}/error-${slug(name)}.png`;
    let captured = null;
    if (typeof screenshot === 'function') {
      try {
        captured = await screenshot(file);
      } catch {
        captured = null; // un fallo de captura no debe ocultar el error original
      }
    }
    log.error(`fallo: ${name}`, {
      error: maskString(String((err && err.message) || err)),
      screenshot: captured,
    });
    throw err;
  }
}
