# Inicio en VS Code — MacBook de Libaniel

Abre en VS Code EXACTAMENTE esta carpeta:

`/Users/libanielvargas/Periferia-QA-Lead-2026`

No abras las carpetas individuales en Descargas ni los repositorios Qirava. La copia de trabajo contiene `PRD.md`, `fixtures/reto-03/`, `.claude/skills/`, `EJECUCION_RETO_03.md` y `ARRANQUE_CLAUDE.md`. Los originales permanecen intactos en Descargas.

Abre el panel **Claude Code** de VS Code asociado a este workspace y envía el disparador breve:

> Lee y ejecuta íntegramente `ARRANQUE_CLAUDE.md`. Soy Libaniel: confirmo RETO 03; trabaja aquí, visible en VS Code, actualiza `EJECUCION_RETO_03.md` por vertical y continúa hasta cumplir el PRD con pruebas, `demo.ts`, chat con LLM real, URL pública y `SOLUCION.md`. No ejecutes agentes ocultos ni abras navegadores ajenos al broker Qirava. Comienza ya.

La primera salida esperada es lectura de PRD y V1, no una propuesta de Jira. Si el panel no reconoce skills, confirmar el symlink `.claude/skills -> ../.agents/skills`.
