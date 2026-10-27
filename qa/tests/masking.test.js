import { test } from 'node:test';
import assert from 'node:assert/strict';
import { maskObject, maskString, maskValue, MASK } from '../lib/masking.js';

test('enmascara por nombre de clave sensible', () => {
  const out = maskObject({ user: 'ana', password: 'p4ssw0rd', nested: { token: 'abc123' } });
  assert.equal(out.user, 'ana');
  assert.equal(out.password, MASK);
  assert.equal(out.nested.token, MASK);
});

test('enmascara tokens Bearer en texto libre', () => {
  const masked = maskString('Authorization: Bearer eyJhbGciOiToken.Value.Signature12345');
  assert.match(masked, /Bearer \*\*\*REDACTED\*\*\*/);
});

test('enmascara tokens largos aunque la clave no sea sensible', () => {
  const out = maskObject({ note: 'id=ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789' });
  assert.match(out.note, /REDACTED/);
});

test('respeta valores no sensibles y tipos no-string', () => {
  const out = maskObject({ count: 3, active: true, name: 'ok' });
  assert.deepEqual(out, { count: 3, active: true, name: 'ok' });
});

test('enmascara secretos dentro de arreglos', () => {
  const out = maskValue('secrets', ['short', 'otro']);
  assert.deepEqual(out, [MASK, MASK]);
});
