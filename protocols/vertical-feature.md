# Contrato de entrega — feature vertical (uso por Claude)
Propósito: resolver el enunciado real dentro de 120 minutos; no es un proyecto productivo para crecer después.

## Al recibir el enunciado
1. Copiar literalmente restricciones y entregables exigidos. Preguntar solo lo bloqueante.
2. Ordenar funcionalidades por impacto en la evaluación y dependencia real.
3. Desglosar cada funcionalidad en una historia con criterio demostrable y subtareas técnicas que un agente pueda cerrar. No poblar Jira con trabajo especulativo.
4. Plan de una línea por feature: **comportamiento observable → datos mínimos → endpoint si hace falta → UI si hace falta → prueba → evidencia**.

## Disciplina por feature
- Entregar una rebanada funcional completa antes de iniciar la siguiente. La DB/API/UI se crean o modifican solo si esa feature lo necesita; no se hacen capas enteras por adelantado.
- CREATE no autoriza preparar READ/UPDATE/DELETE. Reusar lo construido cuando llegue una feature posterior.
- Al desactivar registros, preferir estado/inactivo cuando la integridad e historial de dominio lo exijan; un UPDATE de registro no es un ALTER TABLE, que cambia esquema.
- Emplear componentes, imágenes y animaciones solo cuando aporten al requerimiento; sin instalación preventiva.
- Verificar entradas, salida, casos límite relevantes y regresión de las features terminadas.
- DoD por historia: criterio logrado, prueba reproducible, interfaz utilizable si corresponde, evidencia, estado actualizado, sin código muerto ni secretos publicados.
- Evitar abstracciones, optimización, seguridad ceremonial y escalamiento sin requisito, pero mantener higiene de credenciales, validación básica y datos consistentes.

## Tarjeta mínima (máx. 8 líneas)
ID Jira; objetivo de usuario; precondición; acción; resultado; datos/capas indispensables; verificación; dependencia.
No extender la especificación a funcionalidades fuera del enunciado.

## Cadencia de 2 horas
0–10: leer reto + priorizar; 10–100: verticales ordenadas y comprobadas; 100–120: estabilizar, tests smoke, empaquetar y entrega. Si el reto exige otra distribución, respetar su instrucción expresa.
Superpowers ya está instalado en el perfil de Claude Code; este documento añade el contrato específico de la prueba, sin copiar kits de Qirava.
