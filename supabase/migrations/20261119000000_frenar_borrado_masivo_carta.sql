/*
  Freno en el servidor contra el borrado masivo de la carta.

  Qué pasaba: un equipo con una versión vieja del sistema (o con la copia del navegador vacía)
  subía "borrado" para todos los productos de golpe y la carta desaparecía en todos los
  dispositivos. El freno que ya existe en la app solo protege a los equipos actualizados; este
  freno vale para cualquier equipo, tenga la versión que tenga.

  1. Un mismo envío no puede borrar más de 5 registros de la carta, las categorías, las listas de
     precios ni los usuarios. Si lo intenta, se rechaza entero con código 42501 (el mismo que un
     permiso denegado): la app no borra nada y vuelve a bajar lo que hay en el servidor.
     Borrar productos de a uno (o de a pocos) desde la pantalla sigue funcionando igual.
  2. Al borrar un registro se guarda su último contenido en vez de dejarlo vacío, para poder
     recuperarlo si alguna vez se borra algo por error. La app no lo lee (mira "eliminado").
*/

-- 2. Conservar el contenido de lo borrado (la hora y el autor se siguen sellando igual).
CREATE OR REPLACE FUNCTION public.sellar_sync_registro()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at := now();
  NEW.updated_by := auth.uid();
  IF TG_OP = 'UPDATE' AND NEW.eliminado AND NEW.payload IS NULL THEN
    NEW.payload := OLD.payload;
  END IF;
  RETURN NEW;
END;
$$;

-- 1. El freno.
CREATE OR REPLACE FUNCTION public.frenar_borrado_masivo_carta()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  borrados integer;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    SELECT count(*) INTO borrados
    FROM nuevas n
    JOIN viejas v USING (local_id, clave, registro_id)
    WHERE n.eliminado AND NOT v.eliminado
      AND n.clave = ANY (ARRAY['restaurant-productos', 'restaurant-categorias', 'restaurant-listas-precios', 'restaurant-usuarios']);
  ELSE
    borrados := 0;
  END IF;

  IF borrados > 5 THEN
    RAISE EXCEPTION 'Se bloqueó un borrado masivo de % registros de la carta. Este equipo tenía una copia vieja o vacía.', borrados
      USING ERRCODE = '42501';
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS frenar_borrado_masivo_carta ON sync_registros;
CREATE TRIGGER frenar_borrado_masivo_carta
  AFTER UPDATE ON sync_registros
  REFERENCING OLD TABLE AS viejas NEW TABLE AS nuevas
  FOR EACH STATEMENT
  EXECUTE FUNCTION public.frenar_borrado_masivo_carta();
