/*
  Cobro de comandas en dos manos: la moza pide el cobro, caja lo resuelve.

  La solicitud viaja dentro de la comanda (registro de 'restaurant-demo-pedidos' en
  sync_registros), igual que el resto de la comanda. Moza y cocina pueden escribir
  comandas, así que el permiso por clave no alcanza: este trigger impide que una cuenta
  de salón haga lo que solo decide caja, aunque mande el cambio a mano o desde una
  tablet desactualizada.

  Para moza y cocina:
    - una comanda cobrada o pasada a cuenta corriente ya no se modifica ni se borra;
    - no pueden cerrarla como cobrada ni pasarla a cuenta corriente;
    - no pueden marcar la solicitud como ticket emitido, pagada ni rechazada, ni
      tocar una solicitud que ya tiene el ticket impreso;
    - mientras la solicitud está en caja, no pueden cambiar el importe.
  En vez de rechazar la escritura (la tablet se quedaría con un error de sync), se
  conserva lo que había en el servidor y el resto del cambio se guarda: la tablet recibe
  la versión corregida por tiempo real.

  Admin, encargado y cajero no pasan por este control. Tampoco las funciones del servidor
  (PedidosYa), que escriben sin usuario.

  No cambia tablas ni datos existentes: se puede aplicar en cualquier momento.
*/

CREATE OR REPLACE FUNCTION public.proteger_cobro_comanda()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  viejo jsonb;
  sol_vieja jsonb;
  sol_nueva jsonb;
BEGIN
  IF NEW.clave <> 'restaurant-demo-pedidos' OR auth.uid() IS NULL
     OR tiene_rol(ARRAY['admin', 'encargado', 'cajero']) THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    viejo := CASE WHEN OLD.eliminado THEN NULL ELSE OLD.payload END;
  ELSE
    -- Un upsert entra por acá aunque el registro exista: se compara contra lo guardado.
    SELECT CASE WHEN r.eliminado THEN NULL ELSE r.payload END INTO viejo
    FROM sync_registros r
    WHERE r.local_id = NEW.local_id AND r.clave = NEW.clave AND r.registro_id = NEW.registro_id;
  END IF;

  -- Cerrada por caja: queda como está.
  IF viejo IS NOT NULL AND viejo->>'estado' IN ('cobrado', 'cuenta_corriente') THEN
    NEW.payload := viejo;
    NEW.eliminado := false;
    RETURN NEW;
  END IF;

  IF NEW.eliminado OR NEW.payload IS NULL OR jsonb_typeof(NEW.payload) <> 'object' THEN
    RETURN NEW;
  END IF;

  -- Solo caja la cierra.
  IF NEW.payload->>'estado' IN ('cobrado', 'cuenta_corriente') THEN
    NEW.payload := jsonb_set(NEW.payload, '{estado}', COALESCE(viejo->'estado', '"abierto"'::jsonb)) - 'hora_cierre';
  END IF;

  sol_vieja := viejo->'solicitud_cobro';
  sol_nueva := NEW.payload->'solicitud_cobro';
  IF jsonb_typeof(sol_vieja) IS DISTINCT FROM 'object' THEN sol_vieja := NULL; END IF;
  IF jsonb_typeof(sol_nueva) IS DISTINCT FROM 'object' THEN sol_nueva := NULL; END IF;

  -- Lo que resuelve caja no lo cambia el salón. Puede retirar una solicitud pendiente o
  -- devuelta, o hacer una nueva (otro id), pero no deshacer lo que caja decidió sobre esa.
  IF sol_nueva IS DISTINCT FROM sol_vieja AND (
       COALESCE(sol_vieja->>'estado', '') = 'ticket_emitido'
    OR COALESCE(sol_nueva->>'estado', '') IN ('ticket_emitido', 'pagada', 'rechazada')
    OR (COALESCE(sol_vieja->>'estado', '') IN ('rechazada', 'pagada') AND sol_nueva->>'id' = sol_vieja->>'id')
  ) THEN
    NEW.payload := CASE
      WHEN sol_vieja IS NULL THEN NEW.payload - 'solicitud_cobro'
      ELSE jsonb_set(NEW.payload, '{solicitud_cobro}', sol_vieja)
    END;
    sol_nueva := sol_vieja;
  END IF;

  -- Con la misma solicitud en caja, el importe no se mueve.
  IF sol_nueva IS NOT NULL AND sol_vieja IS NOT NULL
     AND sol_nueva->>'estado' IN ('solicitado', 'ticket_emitido')
     AND sol_nueva->>'id' = sol_vieja->>'id'
     AND (NEW.payload->'total') IS DISTINCT FROM (viejo->'total') THEN
    NEW.payload := NEW.payload || jsonb_build_object(
      'items', COALESCE(viejo->'items', '[]'::jsonb),
      'subtotal', viejo->'subtotal',
      'descuento', viejo->'descuento',
      'recargo', viejo->'recargo',
      'total', viejo->'total'
    );
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.proteger_cobro_comanda() FROM public;

DROP TRIGGER IF EXISTS proteger_cobro_comanda ON sync_registros;
CREATE TRIGGER proteger_cobro_comanda
  BEFORE INSERT OR UPDATE ON sync_registros
  FOR EACH ROW
  EXECUTE FUNCTION public.proteger_cobro_comanda();
