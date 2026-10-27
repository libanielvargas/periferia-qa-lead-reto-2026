import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runStep } from '../lib/capture.js';
import { StepLogger } from '../lib/logger.js';

const clock = () => '2026-01-01T00:00:00.000Z';

test('devuelve el resultado y no captura en caso feliz', async () => {
  let shots = 0;
  const log = new StepLogger({ sink: null, clock });
  const r = await runStep('sumar', () => 2 + 2, { logger: log, screenshot: () => (shots += 1) });
  assert.equal(r, 4);
  assert.equal(shots, 0);
  assert.equal(log.entries.at(-1).message, 'ok: sumar');
});

test('captura pantalla y re-lanza ante fallo de aserción', async () => {
  const log = new StepLogger({ sink: null, clock });
  const shots = [];
  await assert.rejects(
    () => runStep('aserción', () => { assert.equal(1, 2); }, {
      logger: log,
      screenshot: (file) => { shots.push(file); return file; },
    }),
    /1 !== 2|Expected/,
  );
  assert.equal(shots.length, 1);
  const err = log.entries.at(-1);
  assert.equal(err.level, 'error');
  assert.equal(err.data.screenshot, shots[0]);
});

test('un fallo de captura no oculta el error original', async () => {
  const log = new StepLogger({ sink: null, clock });
  await assert.rejects(
    () => runStep('x', () => { throw new Error('boom'); }, {
      logger: log,
      screenshot: () => { throw new Error('sin display'); },
    }),
    /boom/,
  );
  assert.equal(log.entries.at(-1).data.screenshot, null);
});
