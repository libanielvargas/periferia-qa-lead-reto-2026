/**
 * HU-2: controles RC1–RC10 del PRD §7.3.
 * Bloqueo impide crear la OC. Confirmación la permite solo con confirmado = true.
 * Derivado es un valor completado desde maestros, que el agente debe informar.
 */
import type { Derivados, Hallazgo, Paquete, Validacion } from "./dominio.ts"
import { buscarCentro, buscarProveedor, type Maestros } from "./maestros.ts"
import { clavNombre } from "./parseo.ts"

const TOLERANCIA_COTIZACION = 0.02
const TOLERANCIA_MONTO = 1

/**
 * Unidad SAP derivada de la descripción: no existe en la solicitud ni en maestros.
 * Solo cuenta lo que mide la cantidad; "vigencia 12 meses" es una duración del ítem,
 * no su unidad de medida, por eso MES exige un servicio facturado por mes.
 */
export function derivarUnidad(descripcion: string): Derivados["unidad"] {
  const texto = clavNombre(descripcion)
  if (/\bhoras?\b/.test(texto)) return "H"
  if (/\b(mensual|mensuales|por mes|al mes)\b/.test(texto)) return "MES"
  return "UN"
}

export function validar(paquete: Paquete, maestros: Maestros): Validacion {
  const bloqueos: Hallazgo[] = []
  const confirmaciones: Hallazgo[] = []
  const informativos: Hallazgo[] = []
  const { solicitud } = paquete

  // --- RC1 · proveedor existe en el maestro y está activo (bloqueo).
  const proveedor = buscarProveedor(maestros, solicitud.proveedor_nit, solicitud.proveedor_nombre)
  if (!proveedor) {
    bloqueos.push({
      codigo: "RC1",
      tipo: "bloqueo",
      detalle: `El proveedor "${solicitud.proveedor_nombre}"${
        solicitud.proveedor_nit ? ` (NIT ${solicitud.proveedor_nit})` : ""
      } no existe en el maestro de proveedores.`,
      accion_sugerida:
        "Pedir a compras la creación del proveedor en SAP, o confirmar el NIT correcto con el solicitante.",
    })
  } else if (!proveedor.activo) {
    bloqueos.push({
      codigo: "RC1",
      tipo: "bloqueo",
      detalle: `El proveedor "${proveedor.nombre}" (código SAP ${proveedor.codigo_sap}) está inactivo.`,
      accion_sugerida: "Solicitar la reactivación del proveedor o elegir un proveedor alterno.",
    })
  }

  // --- RC2 · aprobación existe, dice "Aprobado" y viene de un aprobador del centro (bloqueo).
  const centro = buscarCentro(maestros, solicitud.centro_costo)
  if (!centro) {
    bloqueos.push({
      codigo: "RC4",
      tipo: "bloqueo",
      detalle: `El centro de costo "${solicitud.centro_costo}" no existe en el maestro.`,
      accion_sugerida: "Confirmar el centro de costo con el solicitante.",
    })
  }
  const aprobadorAutorizado =
    paquete.aprobacion && centro
      ? (centro.aprobadores.find(
          (a) => a.email.toLowerCase() === paquete.aprobacion?.de.toLowerCase(),
        ) ?? null)
      : null

  if (!paquete.aprobacion) {
    bloqueos.push({
      codigo: "RC2",
      tipo: "bloqueo",
      detalle: "No hay correo de aprobación en el paquete.",
      accion_sugerida: "Pedir al solicitante el correo de aprobación del líder.",
    })
  } else if (!paquete.aprobacion.aprobado) {
    bloqueos.push({
      codigo: "RC2",
      tipo: "bloqueo",
      detalle: `El correo de ${paquete.aprobacion.de} no contiene una aprobación explícita.`,
      accion_sugerida: "Pedir al líder que responda el correo con la palabra \"Aprobado\".",
    })
  } else if (centro && !aprobadorAutorizado) {
    bloqueos.push({
      codigo: "RC2",
      tipo: "bloqueo",
      detalle: `${paquete.aprobacion.de} no figura como aprobador del centro de costo ${centro.centro_costo}. Aprobadores válidos: ${centro.aprobadores
        .map((a) => a.email)
        .join(", ")}.`,
      accion_sugerida: `Reenviar la solicitud a un aprobador autorizado de ${centro.centro_costo}.`,
    })
  }

  // --- RC3 · valor_total ≤ tope del aprobador para ese centro (bloqueo).
  if (aprobadorAutorizado && solicitud.valor_total > aprobadorAutorizado.tope) {
    bloqueos.push({
      codigo: "RC3",
      tipo: "bloqueo",
      detalle: `El valor total ${formatearCop(solicitud.valor_total)} excede el tope de ${aprobadorAutorizado.email} (${formatearCop(aprobadorAutorizado.tope)}).`,
      accion_sugerida: "Escalar la aprobación a un aprobador con tope suficiente para ese centro.",
    })
  } else if (centro && !aprobadorAutorizado && centro.aprobadores.length > 0) {
    const topeMaximo = Math.max(...centro.aprobadores.map((a) => a.tope))
    if (solicitud.valor_total > topeMaximo) {
      bloqueos.push({
        codigo: "RC3",
        tipo: "bloqueo",
        detalle: `El valor total ${formatearCop(solicitud.valor_total)} supera el tope más alto del centro ${centro.centro_costo} (${formatearCop(topeMaximo)}): ningún aprobador de ese centro puede autorizarlo.`,
        accion_sugerida:
          "Dividir la compra según política, o escalar a un centro/aprobador con tope suficiente.",
      })
    }
  }

  // --- RC4 · la subárea pertenece al centro de costo (bloqueo).
  if (centro && !centro.subareas.includes(solicitud.subarea)) {
    bloqueos.push({
      codigo: "RC4",
      tipo: "bloqueo",
      detalle: `La subárea "${solicitud.subarea}" no pertenece a ${centro.centro_costo}. Subáreas válidas: ${centro.subareas.join(", ")}.`,
      accion_sugerida: "Corregir la subárea con el solicitante antes de crear la OC.",
    })
  }

  // --- RC5 · cotización vs solicitud dentro del 2 % (confirmación).
  if (!paquete.cotizacion) {
    confirmaciones.push({
      codigo: "RC5",
      tipo: "confirmacion",
      detalle: "El paquete no trae cotización del proveedor; no se puede contrastar el valor.",
      accion_sugerida: "Confirmar que se crea la OC sin cotización, o pedirla al proveedor.",
    })
  } else {
    const diferencia =
      Math.abs(paquete.cotizacion.total - solicitud.valor_total) / solicitud.valor_total
    if (diferencia > TOLERANCIA_COTIZACION) {
      confirmaciones.push({
        codigo: "RC5",
        tipo: "confirmacion",
        detalle: `La cotización (${formatearCop(paquete.cotizacion.total)}) difiere de la solicitud (${formatearCop(solicitud.valor_total)}) en ${(diferencia * 100).toFixed(2)} %, por encima del 2 % tolerado.`,
        accion_sugerida:
          "Confirmar con cuál valor se crea la OC; la OC se construye con el valor de la solicitud aprobada.",
      })
    }
  }

  // --- RC6 · indicador de IVA ausente → derivado del proveedor + confirmación.
  const indicadorIva = solicitud.indicador_iva ?? proveedor?.indicador_iva_default ?? null
  if (!solicitud.indicador_iva) {
    if (indicadorIva) {
      const descripcionIva =
        maestros.indicadoresIva.find((i) => i.codigo === indicadorIva)?.descripcion ?? indicadorIva
      confirmaciones.push({
        codigo: "RC6",
        tipo: "confirmacion",
        detalle: `La solicitud no informa indicador de IVA; se derivó ${indicadorIva} (${descripcionIva}) del maestro del proveedor.`,
        accion_sugerida: `Confirmar que el indicador de IVA correcto es ${indicadorIva}.`,
      })
      informativos.push({
        codigo: "RC6",
        tipo: "derivado",
        detalle: `indicador_iva = ${indicadorIva} (maestro.proveedores.indicador_iva_default)`,
        accion_sugerida: "Informar a la analista el valor derivado.",
      })
    } else {
      bloqueos.push({
        codigo: "RC6",
        tipo: "bloqueo",
        detalle:
          "La solicitud no informa indicador de IVA y no hay proveedor en el maestro desde el cual derivarlo.",
        accion_sugerida: "Pedir el indicador de IVA al solicitante o resolver primero RC1.",
      })
    }
  } else if (!maestros.indicadoresIva.some((i) => i.codigo === solicitud.indicador_iva)) {
    bloqueos.push({
      codigo: "RC6",
      tipo: "bloqueo",
      detalle: `El indicador de IVA "${solicitud.indicador_iva}" no existe en el maestro de indicadores.`,
      accion_sugerida: "Corregir el indicador de IVA con el solicitante.",
    })
  }

  // --- RC7 · condiciones de pago ausentes → derivadas del proveedor (solo se informa).
  const condicionesPago = solicitud.condiciones_pago ?? proveedor?.condiciones_pago_default ?? null
  if (!solicitud.condiciones_pago && condicionesPago) {
    const descripcion =
      maestros.condicionesPago.find((c) => c.codigo === condicionesPago)?.descripcion ??
      condicionesPago
    informativos.push({
      codigo: "RC7",
      tipo: "derivado",
      detalle: `condiciones_pago = ${condicionesPago} (${descripcion}), derivadas del maestro del proveedor.`,
      accion_sugerida: "Solo informar; no requiere confirmación.",
    })
  } else if (!condicionesPago) {
    bloqueos.push({
      codigo: "RC7",
      tipo: "bloqueo",
      detalle:
        "La solicitud no informa condiciones de pago y no hay proveedor en el maestro desde el cual derivarlas.",
      accion_sugerida: "Pedir las condiciones de pago o resolver primero RC1.",
    })
  }

  // --- RC8 · factura anterior a la solicitud → compra retroactiva (confirmación).
  const retroactiva = paquete.factura !== null && paquete.factura.fecha < solicitud.fecha_solicitud
  if (retroactiva && paquete.factura) {
    confirmaciones.push({
      codigo: "RC8",
      tipo: "confirmacion",
      detalle: `Compra retroactiva: la factura ${paquete.factura.numero} es del ${paquete.factura.fecha}, anterior a la solicitud (${solicitud.fecha_solicitud}).`,
      accion_sugerida:
        "Confirmar la creación: la OC queda marcada retroactiva = true en out/control.csv para medición de la dirección.",
    })
  }

  // --- RC9 · fecha de aprobación ≥ fecha de solicitud (confirmación).
  if (paquete.aprobacion && paquete.aprobacion.fecha.slice(0, 10) < solicitud.fecha_solicitud) {
    confirmaciones.push({
      codigo: "RC9",
      tipo: "confirmacion",
      detalle: `La aprobación (${paquete.aprobacion.fecha.slice(0, 10)}) es anterior a la solicitud (${solicitud.fecha_solicitud}).`,
      accion_sugerida: "Confirmar que la aprobación corresponde a esta solicitud.",
    })
  }

  // --- RC10 · cantidad × valor_unitario = valor_total ± 1 (bloqueo).
  const calculado = solicitud.cantidad * solicitud.valor_unitario
  if (Math.abs(calculado - solicitud.valor_total) > TOLERANCIA_MONTO) {
    bloqueos.push({
      codigo: "RC10",
      tipo: "bloqueo",
      detalle: `Aritmética inconsistente: ${solicitud.cantidad} × ${formatearCop(solicitud.valor_unitario)} = ${formatearCop(calculado)}, pero la solicitud declara ${formatearCop(solicitud.valor_total)}.`,
      accion_sugerida: "Pedir al solicitante que corrija cantidad, valor unitario o valor total.",
    })
  }

  const derivados: Derivados = {
    indicador_iva: indicadorIva,
    condiciones_pago: condicionesPago,
    unidad: derivarUnidad(solicitud.descripcion),
    proveedor_codigo_sap: proveedor?.codigo_sap ?? null,
    proveedor_nit: proveedor?.nit ?? null,
  }

  return {
    caso: paquete.caso,
    apta: bloqueos.length === 0,
    bloqueos,
    confirmaciones,
    derivados,
    informativos,
    retroactiva,
  }
}

export function formatearCop(valor: number): string {
  return `COP ${valor.toLocaleString("es-CO", { maximumFractionDigits: 0 })}`
}
