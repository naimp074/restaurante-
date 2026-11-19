/** Cómo se muestra el historial de borrados (ver components/HistorialBorrados.tsx). */

/** La única cuenta que ve el historial de borrados: naimpaz274, el dueño del sistema. */
export const cuentaDelHistorialDeBorrados = '115ce296-d4d3-4686-a007-dc86cae74e98';

export const puedeVerHistorialDeBorrados = (usuarioId?: string | null) => usuarioId === cuentaDelHistorialDeBorrados;

/** Una fila borrada tal como la guarda el servidor: quién la borró y cuándo lo sella el servidor. */
export type FilaBorrada = {
  clave: string;
  registro_id: string;
  payload: Record<string, unknown> | null;
  updated_at: string;
  updated_by: string | null;
};

/** Varias filas borradas por la misma persona, de lo mismo, en el mismo minuto. */
export type Grupo = {
  id: string;
  clave: string;
  quien: string | null;
  cuando: string;
  filas: FilaBorrada[];
};

const nombresClave: Record<string, string> = {
  'restaurant-productos': 'Productos de la carta',
  'restaurant-categorias': 'Categorías',
  'restaurant-listas-precios': 'Listas de precios',
  'restaurant-usuarios': 'Usuarios',
  'restaurant-demo-pedidos': 'Comandas',
  'restaurant-pagos': 'Cobros',
  'restaurant-movimientos-financieros': 'Movimientos de dinero',
  'restaurant-cajas-diarias': 'Cajas del día',
  'restaurant-apartados-caja': 'Apartados de caja',
  'restaurant-gastos': 'Gastos',
  'restaurant-cuentas-dinero': 'Cuentas de dinero',
  'restaurant-cuenta-corriente': 'Cuenta corriente',
  'restaurant-proveedores': 'Proveedores',
  'restaurant-facturas-proveedor': 'Facturas de proveedores',
  'restaurant-pagos-proveedor': 'Pagos a proveedores',
  'restaurant-mesas': 'Mesas',
  'restaurant-sectores-mesas': 'Sectores de mesas',
  'restaurant-demo-ingredientes': 'Insumos',
  'restaurant-demo-producciones': 'Producciones',
  'restaurant-demo-movimientos-stock': 'Movimientos de stock',
  'restaurant-demo-registros-produccion': 'Registros de producción',
  'restaurant-fichadas': 'Fichadas del reloj',
  'restaurant-config-local': 'Configuración',
};

export const nombreClave = (clave: string) => nombresClave[clave] || clave.replace(/^restaurant-/, '');

const dinero = (n: number) => `$${Math.round(n).toLocaleString('es-AR')}`;

export const hora = (iso: string) => new Date(iso).toLocaleString('es-AR', {
  day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
});

/** Una línea que diga qué era lo borrado, con lo que tenga a mano. */
export const describirBorrado = (fila: Pick<FilaBorrada, 'payload' | 'registro_id'>) => {
  const p = fila.payload;
  if (!p) return `${fila.registro_id.replace(/^#/, '')} (borrado antes de que se guardara el contenido)`;
  const texto = [p.nombre, p.concepto, p.descripcion, p.motivo]
    .find(valor => typeof valor === 'string' && valor.trim()) as string | undefined;
  const mesa = (p.mesa as { numero?: number } | undefined)?.numero;
  const pedido = (p.pedido as { mesa?: { numero?: number } } | undefined)?.mesa?.numero;
  const lugar = mesa ?? pedido;
  const importe = [p.total_cobrado, p.total, p.monto, p.precio_venta, p.saldo]
    .find(valor => typeof valor === 'number') as number | undefined;
  const partes = [
    typeof p.codigo === 'string' ? p.codigo : '',
    texto || (lugar !== undefined ? `Mesa ${lugar}` : fila.registro_id.replace(/^#/, '')),
    importe !== undefined ? dinero(importe) : '',
  ].filter(Boolean);
  return partes.join(' · ');
};

/** Junta los borrados de una misma persona, de lo mismo y en el mismo minuto: un borrado masivo se ve como uno. */
export const agruparBorrados = (filas: FilaBorrada[]): Grupo[] => {
  const grupos: Grupo[] = [];
  for (const fila of filas) {
    const minuto = fila.updated_at.slice(0, 16);
    const ultimo = grupos[grupos.length - 1];
    if (ultimo && ultimo.clave === fila.clave && ultimo.quien === fila.updated_by && ultimo.cuando.slice(0, 16) === minuto) {
      ultimo.filas.push(fila);
    } else {
      grupos.push({ id: `${fila.clave}:${fila.registro_id}:${fila.updated_at}`, clave: fila.clave, quien: fila.updated_by, cuando: fila.updated_at, filas: [fila] });
    }
  }
  return grupos;
};
