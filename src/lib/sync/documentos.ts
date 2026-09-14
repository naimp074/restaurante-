/** Claves locales que viajan a Supabase. El orden es el del plan: operación primero. */
export type DocumentoSync = {
  clave: string;
  evento: string;
};

export const documentosSync: DocumentoSync[] = [
  { clave: 'restaurant-mesas', evento: 'restaurant-mesas-updated' },
  { clave: 'restaurant-sectores-mesas', evento: 'restaurant-sectores-mesas-updated' },
  { clave: 'restaurant-demo-pedidos', evento: 'restaurant-pedidos-updated' },
  { clave: 'restaurant-productos', evento: 'restaurant-productos-updated' },
  { clave: 'restaurant-listas-precios', evento: 'restaurant-listas-precios-updated' },
  { clave: 'restaurant-demo-ingredientes', evento: 'restaurant-ingredientes-updated' },
  { clave: 'restaurant-demo-producciones', evento: 'restaurant-producciones-updated' },
  { clave: 'restaurant-demo-movimientos-stock', evento: 'restaurant-movimientos-stock-updated' },
  { clave: 'restaurant-demo-registros-produccion', evento: 'restaurant-registros-produccion-updated' },
  { clave: 'restaurant-cajas-diarias', evento: 'restaurant-cajas-updated' },
  { clave: 'restaurant-apartados-caja', evento: 'restaurant-apartados-caja-updated' },
  { clave: 'restaurant-pagos', evento: 'restaurant-pagos-updated' },
  { clave: 'restaurant-gastos', evento: 'restaurant-gastos-updated' },
  { clave: 'restaurant-cuentas-dinero', evento: 'restaurant-cuentas-dinero-updated' },
  { clave: 'restaurant-movimientos-financieros', evento: 'restaurant-movimientos-financieros-updated' },
  { clave: 'restaurant-cuenta-corriente', evento: 'restaurant-cuenta-corriente-updated' },
  { clave: 'restaurant-proveedores', evento: 'restaurant-proveedores-updated' },
  { clave: 'restaurant-facturas-proveedor', evento: 'restaurant-facturas-proveedor-updated' },
  { clave: 'restaurant-pagos-proveedor', evento: 'restaurant-pagos-proveedor-updated' },
  { clave: 'restaurant-usuarios', evento: 'restaurant-usuarios-updated' },
  { clave: 'restaurant-config-local', evento: 'restaurant-config-local-updated' },
];

export const documentoPorClave = (clave: string) => documentosSync.find(item => item.clave === clave);

export const clavesSync = new Set(documentosSync.map(item => item.clave));
