import { test } from 'node:test';
import assert from 'node:assert/strict';
import { StepLogger } from '../lib/logger.js';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

function fixedClock() {
  return () => '2026-01-01T00:00:00.000Z';
}

test('numera pasos de forma incremental', () => {
  const log = new StepLogger({ sink: null, clock: fixedClock() });
  log.step('abrir sesión');
  log.step('crear registro');
  assert.equal(log.entries[0].step, 1);
  assert.equal(log.entries[1].step, 2);
  assert.equal(log.entries[0].level, 'step');
});

test('enmascara datos sensibles en el registro', () => {
  const log = new StepLogger({ sink: null, clock: fixedClock() });
  log.info('login', { user: 'ana', password: 'secreto123' });
  assert.equal(log.entries[0].data.user, 'ana');
  assert.match(log.entries[0].data.password, /REDACTED/);
});

test('emite por el sink y acumula en memoria', () => {
  const lines = [];
  const log = new StepLogger({ sink: { log: (l) => lines.push(l) }, clock: fixedClock() });
  log.step('paso');
  assert.equal(lines.length, 1);
  assert.equal(JSON.parse(lines[0]).message, 'paso');
  assert.equal(log.toJSON().length, 1);
});

test('persiste JSONL enmascarado en disco sin exponer credenciales', () => {
  const dir = mkdtempSync(join(tmpdir(), 'periferia-qa-log-'));
  try {
    const path = join(dir, 'evidence', 'pasos.jsonl');
    const log = new StepLogger({ sink: null, filePath: path, clock: fixedClock() });
    log.step('abrir URL /clientes');
    log.info('enviar formulario', { password: 'secreto123', nombre: 'Cliente' });
    const raw = readFileSync(path, 'utf8');
    const lines = raw.trim().split('\n').map(JSON.parse);
    assert.equal(lines.length, 2);
    assert.equal(lines[1].data.nombre, 'Cliente');
    assert.match(lines[1].data.password, /REDACTED/);
    assert.ok(!raw.includes('secreto123'));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('errores salen por sink.error cuando existe', () => {
  const errs = [];
  const log = new StepLogger({ sink: { log() {}, error: (l) => errs.push(l) }, clock: fixedClock() });
  log.error('falló algo');
  assert.equal(errs.length, 1);
});
