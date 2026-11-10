/**
 * El plano de mesas no repite la carga de comandas ni el cobro: deja anotado qué mesa o
 * comanda tocó y abre la pantalla de siempre, que la toma al entrar.
 */
const claveMesa = 'restaurant-mesa-a-abrir';
const clavePedido = 'restaurant-pedido-a-cobrar';
/** Si la pantalla no se llegó a abrir (sin permiso, otra pestaña), el aviso vence solo. */
const vigenciaMs = 60_000;

export type MesaAAbrir = { mesaId: string; personas?: number; mozaId?: string };

const guardar = (clave: string, datos: object) => {
  try {
    window.sessionStorage.setItem(clave, JSON.stringify({ ...datos, at: Date.now() }));
  } catch {
    // Sin sessionStorage (modo privado viejo) la pantalla abre igual, sin preselección.
  }
};

const tomar = <T,>(clave: string): T | null => {
  try {
    const raw = window.sessionStorage.getItem(clave);
    if (!raw) return null;
    window.sessionStorage.removeItem(clave);
    const datos = JSON.parse(raw) as T & { at?: number };
    return datos.at && Date.now() - datos.at <= vigenciaMs ? datos : null;
  } catch {
    return null;
  }
};

export const pedirAbrirMesa = (datos: MesaAAbrir) => guardar(claveMesa, datos);
export const tomarMesaAAbrir = () => tomar<MesaAAbrir>(claveMesa);

export const pedirCobrarPedido = (pedidoId: string) => guardar(clavePedido, { pedidoId });
export const tomarPedidoACobrar = () => tomar<{ pedidoId: string }>(clavePedido)?.pedidoId ?? null;
