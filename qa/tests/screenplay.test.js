import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Actor } from '../lib/screenplay.js';
import { ManageTodos, AddTodo, CompleteTodo, PendingCount, TodoTitles } from '../examples/memory-todos.js';

test('el actor ejecuta tareas y la aserción valida el ESTADO FINAL', async () => {
  const ana = Actor.named('Ana').whoCan(ManageTodos.freshStore());

  await ana.attemptsTo(
    AddTodo('redactar plan'),
    AddTodo('revisar riesgos'),
    CompleteTodo('redactar plan'),
  );

  // La prueba cierra validando estado observable, no el recorrido de acciones.
  assert.equal(await ana.asks(PendingCount), 1);
  assert.deepEqual(await ana.asks(TodoTitles), ['redactar plan', 'revisar riesgos']);
});

test('una tarea inválida falla de forma reproducible', async () => {
  const leo = Actor.named('Leo').whoCan(ManageTodos.freshStore());
  await assert.rejects(() => leo.attemptsTo(CompleteTodo('inexistente')), /no existe el pendiente/);
});

test('exige la habilidad antes de actuar', () => {
  const sin = Actor.named('SinHabilidad');
  assert.throws(() => sin.abilityTo(ManageTodos), /no tiene la habilidad ManageTodos/);
});
