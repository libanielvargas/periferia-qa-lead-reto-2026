# Periferia QA Lead — Kit de prueba técnica

Entorno **preparado** para un desafío de desarrollo asistido por IA de **2 horas**.
No contiene la aplicación: las piezas (BBDD, API, frontend, pruebas) se crean **solo
cuando el enunciado lo exija**, en rebanadas verticales.

## Qué hay aquí

| Archivo | Propósito |
|---|---|
| `CLAUDE.md` | Reglas operativas: límite de 120 min, verticales independientes, DoD, cero código anticipatorio. |
| `protocols/vertical-feature.md` | Contrato incremental: spec breve, criterios verificables, Jira y DoD. |
| `protocols/product-manager.md` | Contrato del PM supervisor (prioriza / desbloquea / escala; no programa). |
| `protocols/qa-engineering.md` | Disciplina de prueba: estado final falsable, matriz de capas, Gherkin, riesgo, defectos reproducibles. |
| `qa/` | Kit QA portátil: Screenplay mínimo, registro con captura bajo fallo, masking de secretos, plantillas Gherkin. Ver `qa/README.md`. |
| `scripts/harness.py` | Un worker Claude con checkpoint, heartbeat, timeout y reporte HTML. Solo stdlib. |

## Harness

```bash
# Ejecutar un worker (el comando va tras '--')
python3 scripts/harness.py run -- claude -p "describe la tarea"

# Timeout personalizado (segundos; por defecto 7200 = 120 min)
python3 scripts/harness.py run --timeout 3600 -- <comando...>

# Consultar estado del último run
python3 scripts/harness.py status
```

Artefactos de ejecución en `.harness/` (ignorado por git): `checkpoint.json`,
`report.html`, `worker.log`. Ante un límite de tokens/uso el harness **se detiene y
escala**; no reintenta a ciegas.

## Reglas clave

- 120 minutos duros. Una vertical terminada > tres a medias.
- Cada vertical incluye solo las capas que su criterio necesita.
- Toda vertical observable exige **prueba funcional que valide el estado final** (UI y/o API), no solo clicks. Guía en `protocols/qa-engineering.md`; kit en `qa/`.
- Nada de código anticipatorio.
- Commit tras verificaciones; push solo cuando corresponda al entregable, sin secretos; Libaniel hace la entrega externa.
- Superpowers está instalado en Claude Code a nivel de usuario. El PM es un protocolo, **no una sesión activa**; el harness provee vigilancia determinista para un worker.
