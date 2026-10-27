# Protocolo — ingeniería de pruebas QA (uso por Claude)

Contrato de **cómo probar** una vertical durante la prueba de 120 minutos. Complementa
`protocols/vertical-feature.md` (que define *qué* entregar) con la disciplina de calidad.
No sustituye al enunciado: cuando llegue, sus instrucciones mandan.

Referencia de gobernanza y automatización (solo consulta, **no copiar código**):
skill `qirava-qa-governance` (criterios falsables, defectos reproducibles) y skill
`qa-automation-playwright-screenplay` (Playwright + Screenplay). El kit ejecutable vive
en `qa/` (ver `qa/README.md`).

## Principio irrenunciable

Una prueba **valida el estado final observable**, no el recorrido de clicks. Si el
"Entonces" no puede ser falso cuando el sistema está mal, no es una prueba: es una
narración. Cierra siempre afirmando estado por **UI y/o API/BBDD**.

## 1. Plan de pruebas como historia

Cada funcionalidad a probar se expresa como una historia breve:

> Como `<rol>` quiero `<objetivo>` para `<valor>`.

Y debajo, una tarjeta de prueba (máx. 8 líneas):

- **ID / trazabilidad**: issue de Jira si el enunciado lo exige.
- **Precondición**: estado mínimo verificable del sistema.
- **Acción**: la operación de negocio bajo prueba.
- **Resultado esperado**: estado final observable y concreto.
- **Oráculo**: dónde se comprueba (API, BBDD, UI) y por qué es la fuente de verdad.
- **Riesgo**: qué se rompe si esto falla (ver §3).
- **Datos**: mínimos e independientes; nada compartido entre pruebas.

## 2. Gherkin dado-cuando-entonces

- Lenguaje de **negocio**, no de implementación. Nada de selectores en el `.feature`.
- Un escenario por regla; variantes con `Esquema del escenario` + `Ejemplos`.
- `Entonces` afirma estado final falsable; añade un `Y` que contraste UI contra fuente
  de verdad cuando aplique.
- Plantilla lista en `qa/features/plantilla-negocio.feature`.

## 3. Riesgo primero

Ordena qué probar por **impacto × probabilidad**, no por orden de implementación.

| Nivel | Criterio | Cobertura mínima |
|---|---|---|
| Alto | Pérdida/corrupción de datos, dinero, acceso, bloqueo de flujo principal | happy-path + bordes + negativo + regresión |
| Medio | Funcionalidad secundaria degradada, UX rota recuperable | happy-path + 1 borde |
| Bajo | Cosmético, texto, caminos raros | smoke o diferido si el reloj aprieta |

A los ~100 min del reto: congela alcance, asegura que lo Alto quede probado y verde.

## 4. Criterios falsables

Un criterio es válido solo si existe una salida del sistema que lo haría fallar.

- ❌ "El usuario puede crear un registro" (no observable).
- ✅ "Tras crear 'X', `GET /api/registros` incluye 'X' y la tabla lo muestra."

Cada criterio nombra: entrada exacta, operación, salida esperada, oráculo.

## 5. Matriz de pruebas (UI / API / integración / datos)

Para cada vertical, decide la capa más barata que da evidencia verdadera:

| Capa | Qué valida | Cuándo usarla | Oráculo |
|---|---|---|---|
| **Datos** | Esquema, constraints, integridad, estado vs. borrado | Reglas de persistencia, histórico | consulta a BBDD |
| **API** | Contrato, códigos, validación, efectos de escritura | Lógica de negocio sin UI | respuesta + relectura (GET) |
| **UI** | Que el usuario ve y puede operar el resultado | Flujos de cara al usuario | elemento/estado visible |
| **Integración** | Que las capas concuerdan entre sí | Riesgo de desincronización UI↔fuente | UI contrastada con API/BBDD |

Regla: **no subas de capa sin motivo**. Un bug de validación se prueba en API, no con un
navegador. Reserva E2E (UI) para el flujo principal y para contrastar integración.

## 6. Defectos reproducibles

Un defecto sin reproducción es una opinión. Registra:

1. **Título**: síntoma observable en una línea.
2. **Entorno**: versión/commit, URL/BASE_URL, datos usados.
3. **Pasos numerados** deterministas (los del registro estructurado del kit).
4. **Esperado vs. obtenido**: estado final, no sensación.
5. **Evidencia**: línea(s) JSON del `StepLogger` + captura de `runStep` (ya enmascaradas).
6. **Severidad** según §3 e impacto en la entrega.

El kit (`qa/lib/logger.js`, `qa/lib/capture.js`) produce 3–5 automáticamente: pasos
numerados, captura bajo fallo de aserción y masking de secretos. Reutilízalo; no reinventes.

## 7. Patrón Screenplay (sin framework pesado)

Actor → Abilities → Tasks/Interactions (mutan) → Questions (leen, base de la aserción).
Implementación mínima en `qa/lib/screenplay.js`; ejemplo validando estado final en
`qa/examples/`. Mantén las Tasks en lenguaje de negocio y deja que las Questions sean el
oráculo de la aserción.

## Checklist de salida (DoD de prueba)

- [ ] Criterio falsable, con oráculo nombrado.
- [ ] Valida estado final (UI y/o API/BBDD), no solo clicks.
- [ ] Datos mínimos e independientes; sin secretos en logs (masking activo).
- [ ] Reproducible: corre dos veces con el mismo resultado.
- [ ] Evidencia adjunta (salida de comando / JSON de pasos / captura).
- [ ] No rompe regresión de verticales ya entregadas.
