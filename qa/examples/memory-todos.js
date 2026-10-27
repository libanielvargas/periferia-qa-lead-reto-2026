// Ability + Tasks + Questions de ejemplo sobre un almacén en memoria.
// Sirve para demostrar y PROBAR el patrón Screenplay sin navegador: las
// pruebas unitarias ejercitan estas piezas y validan el estado final.

import { Ability, task, question } from '../lib/screenplay.js';

export class ManageTodos extends Ability {
  constructor() {
    super();
    this.items = [];
  }
  static freshStore() { return new ManageTodos(); }
}

export const AddTodo = (title) =>
  task(`agregar "${title}"`, (actor) => {
    actor.abilityTo(ManageTodos).items.push({ title, done: false });
  });

export const CompleteTodo = (title) =>
  task(`completar "${title}"`, (actor) => {
    const it = actor.abilityTo(ManageTodos).items.find((t) => t.title === title);
    if (!it) throw new Error(`no existe el pendiente "${title}"`);
    it.done = true;
  });

export const PendingCount = question('cantidad de pendientes', (actor) =>
  actor.abilityTo(ManageTodos).items.filter((t) => !t.done).length);

export const TodoTitles = question('títulos de pendientes', (actor) =>
  actor.abilityTo(ManageTodos).items.map((t) => t.title));
