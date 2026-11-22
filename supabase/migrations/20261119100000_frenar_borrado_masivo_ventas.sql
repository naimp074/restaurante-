/*
  El freno contra borrados masivos ahora protege también comandas, cobros, cajas, gastos y
  movimientos de dinero.

  Qué pasó el 19/11 a las 07:02: un equipo con una versión vieja del sistema (abierta desde antes
  de la actualización) borró de golpe 299 comandas y 269 cobros. El freno de la app solo frena a
  los equipos actualizados; este vale para cualquiera.

  Un mismo envío no puede borrar más de 5 registros de estas listas: se rechaza entero con código
  42501 y el equipo vuelve a bajar lo que hay en el servidor. En el uso normal nunca se borran
  más de a uno (anular un cobro, borrar un gasto). "Empezar de cero" sigue funcionando: la app
  nueva manda esos borrados de a 5.
*/

CREATE OR REPLACE FUNCTION public.frenar_borrado_masivo_carta()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  borrados integer;
BEGIN
  SELECT count(*) INTO borrados
  FROM nuevas n
  JOIN viejas v USING (local_id, clave, registro_id)
  WHERE n.eliminado AND NOT v.eliminado
    AND n.clave = ANY (ARRAY[
      'restaurant-productos', 'restaurant-categorias', 'restaurant-listas-precios', 'restaurant-usuarios',
      'restaurant-demo-pedidos', 'restaurant-pagos', 'restaurant-movimientos-financieros',
      'restaurant-cajas-diarias', 'restaurant-apartados-caja', 'restaurant-gastos',
      'restaurant-proveedores', 'restaurant-facturas-proveedor', 'restaurant-pagos-proveedor'
    ]);

  IF borrados > 5 THEN
    RAISE EXCEPTION 'Se bloqueó un borrado masivo de % registros. Este equipo tenía una copia vieja o vacía.', borrados
      USING ERRCODE = '42501';
  END IF;
  RETURN NULL;
END;
$$;
