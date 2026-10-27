/**
 * Interfaz del adaptador SAP (obligatoria, PRD §7.4).
 * El ciclo del agente y las herramientas dependen solo de esta interfaz:
 * cambiar de SAP simulado a SAP real no toca la lógica de negocio.
 */
import type { OrdenCompra } from "../lib/dominio.ts"

export interface SapAdapter {
  consultarProveedor(nit: string): Promise<{ codigo_sap: string; activo: boolean } | null>
  crearOrden(orden: OrdenCompra): Promise<{ numero_oc: string; fecha: string }>
  buscarOrdenPorReferencia(solicitud_id: string): Promise<{ numero_oc: string } | null>
}
