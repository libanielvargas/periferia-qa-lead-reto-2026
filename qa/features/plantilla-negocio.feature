# language: es
# PLANTILLA de negocio. NO inventa una prueba concreta: describe la FORMA que
# debe tomar un escenario cuando llegue el enunciado. Reglas:
#   - Hablar en lenguaje de negocio (el "qué/para qué"), no de clicks ni selectores.
#   - "Entonces" afirma un ESTADO FINAL observable y falsable, no "se hizo clic".
#   - Un escenario por regla de negocio; usar Esquema del escenario para variantes.
#   - <placeholders> y Ejemplos se completan con datos reales de la prueba.

@dominio @plantilla
Característica: <Capacidad de negocio>
  Como <rol>
  Quiero <objetivo>
  Para <valor esperado>

  Antecedentes:
    Dado que existe <precondición mínima verificable>

  @happy-path
  Esquema del escenario: <resultado de negocio esperado>
    Dado <estado inicial relevante>
    Cuando <el actor realiza la acción de negocio con "<entrada>">
    Entonces <el estado final observable es "<resultado>">
    Y <la fuente de verdad (API/BBDD) concuerda con lo que ve el usuario>

    Ejemplos:
      | entrada   | resultado   |
      | <válida>  | <esperado>  |

  @borde @negativo
  Esquema del escenario: <la regla rechaza entradas inválidas>
    Dado <estado inicial relevante>
    Cuando <el actor intenta la acción con "<entrada_invalida>">
    Entonces <el sistema rechaza con "<mensaje/estado>">
    Y <el estado final NO cambió>

    Ejemplos:
      | entrada_invalida | mensaje            |
      | <vacía>          | <error esperado>   |
      | <duplicada>      | <error esperado>   |
