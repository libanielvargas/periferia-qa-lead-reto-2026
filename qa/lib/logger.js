// Registro estructurado paso a paso. Cada entrada es una línea JSON con sello
// de tiempo, nivel y datos enmascarados. El reloj es inyectable para pruebas
// deterministas. Guarda las entradas en memoria para aserciones y evidencia.

import { maskObject, maskString } from './masking.js';
import { appendFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

export class StepLogger {
  constructor({ sink = console, clock = () => new Date().toISOString(), name = 'qa', filePath = null } = {}) {
    this.sink = sink;
    this.filePath = filePath;
    this.clock = clock;
    this.name = name;
    this.entries = [];
    this._step = 0;
  }

  _emit(level, message, data) {
    if (level === 'step') this._step += 1;
    const entry = {
      ts: this.clock(),
      logger: this.name,
      level,
      step: this._step,
      message: maskString(String(message)),
    };
    if (data !== undefined) entry.data = maskObject(data);
    this.entries.push(entry);
    const line = JSON.stringify(entry);
    if (this.filePath) {
      mkdirSync(dirname(this.filePath), { recursive: true });
      appendFileSync(this.filePath, `${line}\n`, { encoding: 'utf8', mode: 0o600 });
    }
    if (level === 'error' && this.sink && typeof this.sink.error === 'function') this.sink.error(line);
    else if (this.sink && typeof this.sink.log === 'function') this.sink.log(line);
    return entry;
  }

  step(message, data) { return this._emit('step', message, data); }
  info(message, data) { return this._emit('info', message, data); }
  error(message, data) { return this._emit('error', message, data); }

  /** Entradas acumuladas (ya enmascaradas), útiles como evidencia. */
  toJSON() { return this.entries; }
}
