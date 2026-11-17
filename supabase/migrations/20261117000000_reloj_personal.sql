/*
  Reloj del personal (Gastos > Reloj del personal): los turnos se guardan en
  'restaurant-fichadas'. Admin y encargado ya pueden escribir todo; el cajero también
  marca entradas y salidas y paga las horas desde la caja. Tiene que coincidir con
  src/lib/sync/permisos.ts.
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
      'restaurant-cuenta-corriente',
      'restaurant-fichadas'
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
