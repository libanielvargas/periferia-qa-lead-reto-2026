// Patrón Screenplay mínimo, sin framework pesado.
//   Actor        — quién actúa; posee Abilities.
//   Ability      — capacidad (manejar API, navegar, un almacén en memoria...).
//   Task/Interaction — lo que el actor intenta (muta estado del sistema).
//   Question     — lo que el actor pregunta (lee estado; base de la aserción).
//
// La prueba debe cerrar validando una Question sobre el ESTADO FINAL, no solo
// que las Tasks se ejecutaron.

export class Ability {}

export class Actor {
  constructor(name) {
    this.name = name;
    this.abilities = new Map();
  }

  static named(name) { return new Actor(name); }

  whoCan(...abilities) {
    for (const a of abilities) this.abilities.set(a.constructor, a);
    return this;
  }

  abilityTo(AbilityClass) {
    const a = this.abilities.get(AbilityClass);
    if (!a) throw new Error(`${this.name} no tiene la habilidad ${AbilityClass.name}`);
    return a;
  }

  async attemptsTo(...tasks) {
    for (const t of tasks) await t.performAs(this);
    return this;
  }

  async asks(question) {
    return question.answeredBy(this);
  }
}

export function task(name, perform) {
  return { name, async performAs(actor) { return perform(actor); } };
}

// Sinónimo semántico: una interacción es una tarea atómica de bajo nivel.
export const interaction = task;

export function question(name, answer) {
  return { name, async answeredBy(actor) { return answer(actor); } };
}
