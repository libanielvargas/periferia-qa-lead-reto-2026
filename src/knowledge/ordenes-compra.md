# Conocimiento del proceso — Órdenes de compra en Periferia

Este archivo es **conocimiento**, no comportamiento: describe cómo funciona el proceso de
compras. El comportamiento del agente vive en `agent/prompt.md` y la ejecución en
`src/tools/oc.ts`. Un cambio de reglas de negocio se refleja aquí y en los controles, sin
tocar el servidor.

## El flujo real (as-is)

Cada compra llega a administración por correo con tres piezas: la solicitud (un Excel que
los fixtures entregan normalizado como JSON), la cotización del proveedor y el correo del
líder que aprueba el gasto. La analista digita a mano en SAP GUI: proveedor, descripción,
centro de costos, subárea, valor, indicador de IVA, aprobador y condiciones de pago; luego
imprime el correo de aprobación a PDF y lo adjunta a la OC. Se repite por cada factura que
entra a la compañía.

## Maestros que gobiernan la validación

| Maestro | Qué decide |
|---|---|
| `proveedores.json` | Si el proveedor existe, su código SAP, si está activo, y sus valores por defecto de condiciones de pago e indicador de IVA. |
| `centros-costo.json` | Qué subáreas pertenecen a cada centro, quién puede aprobar en él y hasta qué monto (tope). |
| `indicadores-iva.json` | Códigos de IVA válidos (`C0` excluido, `C1` 19 %, `C2` 5 %). |
| `condiciones-pago.json` | Códigos de condiciones de pago válidos (`Z000` inmediato … `Z060` 60 días). |

## Controles RC1–RC10

| # | Regla | Tipo |
|---|---|---|
| RC1 | El proveedor existe en el maestro (por NIT; sin NIT, por nombre normalizado) y está activo. | Bloqueo |
| RC2 | La aprobación existe, dice "Aprobado" y viene de un aprobador del centro de costo. | Bloqueo |
| RC3 | `valor_total` ≤ tope del aprobador en ese centro. | Bloqueo |
| RC4 | La subárea pertenece al centro de costo. | Bloqueo |
| RC5 | La cotización no difiere de la solicitud más de 2 %. Sin cotización, confirmación. | Confirmación |
| RC6 | Indicador de IVA ausente: se deriva del proveedor y se confirma. | Confirmación + derivado |
| RC7 | Condiciones de pago ausentes: se derivan del proveedor. Solo se informa. | Derivado |
| RC8 | Factura con fecha anterior a la solicitud: compra retroactiva. | Confirmación |
| RC9 | Fecha de aprobación ≥ fecha de solicitud. | Confirmación |
| RC10 | `cantidad × valor_unitario` = `valor_total` (± 1 unidad monetaria). | Bloqueo |

**Bloqueo** impide crear la OC: el caso vuelve al humano con la razón y la acción sugerida.
**Confirmación** permite crearla solo con confirmación explícita de la analista.
**Derivado** es un valor que el agente completó desde maestros y debe informar.

## Diferencias entre los tres tipos de excepción

Una excepción no se "arregla": se clasifica. Un proveedor inexistente no se crea desde el
agente (eso es maestro de datos, con su propio control). Un aprobador sin autoridad no se
sustituye por otro: la solicitud vuelve al circuito de aprobación. Una discrepancia de
cotización no se resuelve ajustando el monto: se expone a la analista, que decide.

## Compras retroactivas

Una parte significativa de las OC se crea **después** de que llegó la factura, saltándose
la cotización. El agente no las rechaza: las detecta (RC8), pide confirmación y las marca
`retroactiva = true` en `out/control.csv`, que es el insumo con el que contabilidad y la
dirección pueden por primera vez medir el tamaño real del desvío.

## Artefactos que deja cada caso

| Artefacto | Para quién |
|---|---|
| `out/<caso>/aprobacion.txt` + `sha256` | Auditoría: sustento del gasto, verificable con `shasum -a 256`. |
| `out/<caso>/trazabilidad.json` | Quien revise: de qué fuente salió cada campo del payload. |
| `out/sap/ordenes.jsonl` | El SAP simulado: una línea por OC, numeradas desde 4500000001. |
| `out/control.csv` | Contabilidad y dirección: una fila por intento, con retroactiva y códigos de control. |
| `out/log.jsonl` | Operación: toda llamada a herramienta del agente. |
