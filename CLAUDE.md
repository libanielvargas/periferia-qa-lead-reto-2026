# CLAUDE.md — Prueba técnica Periferia QA Lead

Reglas operativas para el desafío de **desarrollo asistido por IA de 2 horas**.
Este archivo manda sobre cualquier comportamiento por defecto.

## Contexto

- Repositorio independiente de la prueba técnica. Nada aquí depende de otros proyectos.
- Hoy el repositorio está **PREPARADO, no implementado**: no existe aplicación, base de
  datos, frontend ni nube. Esas piezas se crean **solo cuando el enunciado lo exija**.
- No implementes funcionalidad de la prueba hasta tener el enunciado en mano.

## Límite de tiempo

- **120 minutos** de reloj, duros. El cronómetro es el recurso escaso.
- Prioriza terminar una vertical antes que empezar dos a medias.
- A los ~100 min, congela alcance: cierra lo abierto, no abras nada nuevo.

## Features verticales independientes

- Una *feature vertical* es la unidad de entrega: la rebanada más delgada que aporta valor
  observable de punta a punta.
- Cada vertical incluye **solo las capas que necesita**: base de datos **y/o** API **y/o**
  frontend **y/o** prueba. Si una capa no es necesaria para el criterio, no se crea.
- Las verticales mantienen el menor acoplamiento viable; las dependencias reales quedan explícitas.
- Contrato detallado de ejecución en `protocols/vertical-feature.md`.

## Cero código anticipatorio

- No escribas abstracciones, capas, configuraciones ni dependencias "por si acaso".
- No crees base de datos, API, front o infraestructura que ninguna vertical activa use.
- Si no hay un criterio verificable que lo exija ahora, no va.
- Borra el andamiaje que deje de usarse.

## Definición de terminado (DoD)

Una vertical está **terminada** cuando:

1. Cumple su criterio verificable, demostrado con evidencia (comando, salida o captura).
2. Solo contiene las capas que ese criterio necesitaba.
3. No rompe verticales ya entregadas.
4. Tiene trazabilidad a su issue de Jira (ver SKILL).
5. No deja código anticipatorio ni muerto.

## Convenciones

- Se usan convenciones Superpowers (skills, agentes), **sin** abrir sesiones extra ni
  planes de varias fases para tareas acotadas.
- No instalar dependencias ni crear app/BBDD/nube/front fuera de lo que exija una vertical.
- Commit por vertical verificada, sin secretos ni artefactos efímeros; push cuando lo pida el entregable. No detener al worker esperando aprobación intermedia, pero la entrega final externa la autoriza Libaniel.
- Operaciones de Jira: solo cuando se indique explícitamente.

## Harness

- `scripts/harness.py` ejecuta **un** worker Claude con checkpoint, heartbeat, timeout y
  reporte HTML. No reintenta a ciegas ante límites de tokens.
- Uso: `python3 scripts/harness.py status` y `python3 scripts/harness.py run -- <cmd>`.
