import { huella } from './registros';
import type { Pedido } from '../types';
import { estadoSegunCocina } from '../cobroComanda';

/**
 * Qué hacer cuando otro equipo cambió el mismo registro que se cambió acá, antes de que esto se subiera.
 * Antes ganaba el último en guardar y el cambio del otro se perdía sin aviso (la caja sumaba un cobro
 * y el celular, con una copia vieja, lo borraba al cargar un gasto; una tablet reabría una mesa cobrada).
 *
 *  - Caja del día y cuentas de plata: los importes se suman de los dos lados (lo que cambió cada equipo).
 *  - Comandas: una comanda cobrada o cerrada no se reabre; si las dos siguen abiertas, se juntan los productos.
 *  - Lo demás: se queda lo del otro equipo (lo que ya estaba guardado) y se avisa.
 *
 * `valor` undefined significa que el registro queda borrado.
 */
export type Resolucion = { valor: unknown; aviso?: string };

type Registro = Record<string, unknown>;

const esRegistro = (valor: unknown): valor is Registro => typeof valor === 'object' && valor !== null && !Array.isArray(valor);
const igual = (a: unknown, b: unknown) => huella(a) === huella(b);
const redondear = (n: number) => Math.round(n * 100) / 100;

/** Campos que van acumulando: si los dos equipos los cambiaron, se suman las dos diferencias. */
const contadoresPorClave: Record<string, string[]> = {
  'restaurant-cajas-diarias': [
    'efectivo', 'tarjeta', 'transferencia', 'total_ventas', 'monto_esperado_efectivo',
    'ventas_cuenta_corriente', 'cobros_cuenta_corriente',
  ],
  'restaurant-cuentas-dinero': ['saldo'],
};

export const clavesConBaseCompleta = new Set(['restaurant-cajas-diarias', 'restaurant-cuentas-dinero', 'restaurant-demo-pedidos']);

/** Lo que cambió cada lado respecto de la base; si los dos cambiaron el mismo campo, gana el otro equipo. */
const fusionarCampos = (local: Registro, remoto: Registro, base: Registro | undefined, contadores: string[]) => {
  const resultado: Registro = { ...remoto };
  const campos = new Set([...Object.keys(local), ...Object.keys(remoto), ...Object.keys(base || {})]);
  campos.forEach(campo => {
    if (contadores.includes(campo)) {
      const l = Number(local[campo]) || 0;
      const r = Number(remoto[campo]) || 0;
      const b = base ? Number(base[campo]) || 0 : r;
      resultado[campo] = redondear(r + (l - b));
      return;
    }
    if (!base) return;
    const cambioAca = !igual(local[campo], base[campo]);
    const cambioAlla = !igual(remoto[campo], base[campo]);
    if (cambioAca && !cambioAlla) {
      if (local[campo] === undefined) delete resultado[campo];
      else resultado[campo] = local[campo];
    }
  });
  return resultado;
};

const resolverContadores = (clave: string, local: unknown, remoto: unknown, base: unknown): Resolucion => {
  if (!esRegistro(remoto)) return { valor: remoto, aviso: 'un registro de caja que otro equipo borró' };
  if (!esRegistro(local)) return { valor: remoto };
  const fusion = fusionarCampos(local, remoto, esRegistro(base) ? base : undefined, contadoresPorClave[clave]);
  // Una caja cerrada en cualquiera de los dos equipos queda cerrada, con la diferencia sobre lo esperado sumado.
  if (clave === 'restaurant-cajas-diarias') {
    const cerrada = [local, remoto].find(caja => caja.estado === 'cerrada');
    if (cerrada) {
      ['estado', 'closed_at', 'cerrado_por_id', 'cerrado_por_nombre', 'monto_cierre_efectivo'].forEach(campo => {
        if (cerrada[campo] !== undefined) fusion[campo] = cerrada[campo];
      });
      const contado = Number(fusion.monto_cierre_efectivo);
      if (Number.isFinite(contado)) fusion.diferencia_efectivo = redondear(contado - (Number(fusion.monto_esperado_efectivo) || 0));
    }
  }
  return { valor: fusion };
};

const pedidosCerrados = ['cobrado', 'cuenta_corriente', 'cancelado'];
const cerrado = (pedido: Registro) => pedidosCerrados.includes(String(pedido.estado));

const nombreComanda = (pedido: Registro) => {
  const mesa = esRegistro(pedido.mesa) ? pedido.mesa : undefined;
  if (mesa?.nombre && !/^\d+$/.test(String(mesa.nombre).trim())) return String(mesa.nombre);
  if (mesa?.numero !== undefined) return `Mesa ${mesa.numero}`;
  return 'una comanda';
};

const listaPorId = (valor: unknown) => new Map(
  (Array.isArray(valor) ? valor : []).filter(esRegistro).map(item => [String(item.id), item] as const),
);

/** Junta los productos de las dos versiones: lo que agregó cada uno queda; lo que sacó uno solo, se saca. */
const fusionarItems = (local: unknown, remoto: unknown, base: unknown) => {
  const L = listaPorId(local);
  const R = listaPorId(remoto);
  const B = base === undefined ? undefined : listaPorId(base);
  const ids = [...new Set([...R.keys(), ...L.keys()])];
  const resultado: Registro[] = [];
  ids.forEach(id => {
    const l = L.get(id);
    const r = R.get(id);
    const b = B?.get(id);
    if (l && r) resultado.push(b && igual(r, b) ? l : r);
    else if (r) { if (!B || !b || !igual(r, b)) resultado.push(r); } // acá se sacó: solo si allá no lo tocaron
    else if (l) { if (!B || !b || !igual(l, b)) resultado.push(l); } // allá se sacó: solo si acá no lo tocaron
  });
  return resultado;
};

const fusionarHistorial = (local: unknown, remoto: unknown) => {
  const todos = [...listaPorId(remoto).values(), ...listaPorId(local).values()];
  const vistos = new Set<string>();
  return todos
    .filter(evento => (vistos.has(String(evento.id)) ? false : (vistos.add(String(evento.id)), true)))
    .sort((a, b) => String(a.at).localeCompare(String(b.at)));
};

const conTotales = (pedido: Registro) => {
  const items = Array.isArray(pedido.items) ? pedido.items.filter(esRegistro) : [];
  const subtotal = redondear(items.filter(item => item.estado !== 'cancelado').reduce((suma, item) => suma + (Number(item.subtotal) || 0), 0));
  return { ...pedido, subtotal, total: redondear(subtotal - (Number(pedido.descuento) || 0) + (Number(pedido.recargo) || 0)) };
};

const resolverPedido = (local: unknown, remoto: unknown, base: unknown): Resolucion => {
  if (!esRegistro(remoto)) return { valor: remoto };
  if (!esRegistro(local)) return { valor: remoto };
  const nombre = nombreComanda(remoto);
  if (cerrado(remoto) && !cerrado(local)) {
    return { valor: remoto, aviso: `${nombre} ya estaba cerrada en otro equipo: no se guardaron los cambios hechos acá` };
  }
  if (cerrado(local) && !cerrado(remoto)) {
    const agregados = [...listaPorId(remoto.items).keys()].filter(id => !listaPorId(local.items).has(id));
    return {
      valor: local,
      aviso: agregados.length ? `${nombre}: otro equipo le agregó productos después de cerrarla; revisala` : undefined,
    };
  }
  if (cerrado(local) && cerrado(remoto)) return { valor: remoto };
  // Las dos abiertas: se juntan productos e historial; el resto, lo que cambió cada uno.
  const b = esRegistro(base) ? base : undefined;
  const fusion = fusionarCampos(local, remoto, b, []);
  fusion.items = fusionarItems(local.items, remoto.items, b ? b.items : undefined);
  fusion.historial = fusionarHistorial(local.historial, remoto.historial);
  // Si un equipo marcó "entregado" y el otro mandó un agregado, cocina tiene que seguir viéndola.
  fusion.estado = estadoSegunCocina(fusion as unknown as Pedido);
  return { valor: conTotales(fusion), aviso: `${nombre} se cambió en dos equipos a la vez; se juntaron los productos de los dos` };
};

export const resolverConflicto = (clave: string, local: unknown, remoto: unknown, base?: unknown): Resolucion => {
  if (contadoresPorClave[clave]) return resolverContadores(clave, local, remoto, base);
  if (clave === 'restaurant-demo-pedidos') return resolverPedido(local, remoto, base);
  return { valor: remoto, aviso: 'otro equipo cambió lo mismo al mismo tiempo; se dejó su versión' };
};
