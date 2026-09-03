/*
  # Perfil automático al registrar un usuario

  Sin una fila en `profiles` un usuario autenticado no tiene rol y las políticas
  RLS le niegan todo. Este trigger crea el perfil junto con el usuario.

  - El primer usuario del sistema queda como `admin`, para poder entrar y dar
    de alta al resto del personal.
  - Los siguientes toman el rol enviado en los metadatos del registro, o `moza`
    por defecto.
*/

CREATE OR REPLACE FUNCTION public.crear_perfil_para_usuario()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  rol_solicitado text;
  es_primer_usuario boolean;
BEGIN
  SELECT NOT EXISTS (SELECT 1 FROM profiles) INTO es_primer_usuario;

  rol_solicitado := COALESCE(NEW.raw_user_meta_data->>'rol', 'moza');

  IF rol_solicitado NOT IN ('admin', 'encargado', 'cajero', 'moza', 'cocina') THEN
    rol_solicitado := 'moza';
  END IF;

  IF es_primer_usuario THEN
    rol_solicitado := 'admin';
  END IF;

  INSERT INTO profiles (id, nombre, apellido, rol)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'nombre', split_part(NEW.email, '@', 1)),
    COALESCE(NEW.raw_user_meta_data->>'apellido', ''),
    rol_solicitado
  )
  ON CONFLICT (id) DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.crear_perfil_para_usuario();
