/*
  El cajero paga gastos y sueldos desde la caja del día. Hasta ahora el servidor le
  rechazaba el gasto: el movimiento de plata se guardaba, pero el gasto no llegaba
  a "Gastos > Pagos" en los otros equipos. Tiene que coincidir con src/lib/sync/permisos.ts.
*/
CREATE OR REPLACE FUNCTION public.puede_escribir_registro(p_clave text, p_registro_id text)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT CASE
    WHEN tiene_rol(ARRAY['admin', 'encargado']) THEN true
    WHEN p_clave = 'restaurant-usuarios' THEN p_registro_id = '#' || auth.uid()::text AND tiene_rol(ARRAY['cajero', 'moza', 'cocina'])
    WHEN tiene_rol(ARRAY['cajero']) THEN p_clave = ANY (ARRAY[
      'restaurant-mesas',
      'restaurant-demo-pedidos',
      'restaurant-demo-ingredientes',
      'restaurant-demo-producciones',
      'restaurant-demo-movimientos-stock',
      'restaurant-cajas-diarias',
      'restaurant-apartados-caja',
      'restaurant-pagos',
      'restaurant-gastos',
      'restaurant-cuentas-dinero',
      'restaurant-movimientos-financieros',
      'restaurant-cuenta-corriente'
    ])
    WHEN tiene_rol(ARRAY['moza', 'cocina']) THEN p_clave = ANY (ARRAY[
      'restaurant-mesas',
      'restaurant-demo-pedidos'
    ])
    ELSE false
  END
$$;

REVOKE ALL ON FUNCTION public.puede_escribir_registro(text, text) FROM public;
GRANT EXECUTE ON FUNCTION public.puede_escribir_registro(text, text) TO authenticated;
