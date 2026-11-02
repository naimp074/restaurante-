/*
  # Pantallas por usuario

  - profiles.paginas: pantallas que puede abrir la cuenta. NULL usa las de su rol.
  - Solo un admin puede cambiarlas: el perfil propio se puede editar, así que el trigger las protege.
*/

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS paginas text[];

CREATE OR REPLACE FUNCTION public.proteger_campos_de_perfil()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- auth.uid() es NULL cuando el cambio viene del panel, de una migración o de una función con service role.
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  IF (NEW.rol IS DISTINCT FROM OLD.rol
      OR NEW.activo IS DISTINCT FROM OLD.activo
      OR NEW.local_id IS DISTINCT FROM OLD.local_id
      OR NEW.paginas IS DISTINCT FROM OLD.paginas) THEN
    IF NOT tiene_rol(ARRAY['admin']) THEN
      RAISE EXCEPTION 'Solo un administrador puede cambiar rol, pantallas, estado o local de una cuenta.'
        USING ERRCODE = '42501';
    END IF;
    IF NEW.id = auth.uid() AND (NEW.rol <> 'admin' OR NOT NEW.activo) THEN
      RAISE EXCEPTION 'No podés quitarte el rol de administrador ni desactivar tu propia cuenta.'
        USING ERRCODE = '42501';
    END IF;
    IF NEW.local_id IS DISTINCT FROM local_id_actual() THEN
      RAISE EXCEPTION 'Solo podés asignar cuentas a tu propio local.'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- Cambia lo que devuelve: Postgres pide borrarla antes de crearla de nuevo.
DROP FUNCTION IF EXISTS public.cuentas_del_local();
CREATE FUNCTION public.cuentas_del_local()
RETURNS TABLE (
  id uuid,
  email text,
  nombre text,
  apellido text,
  rol text,
  activo boolean,
  local_id uuid,
  paginas text[],
  created_at timestamptz
)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT p.id, u.email::text, p.nombre, p.apellido, p.rol, p.activo, p.local_id, p.paginas, p.created_at
  FROM profiles p
  JOIN auth.users u ON u.id = p.id
  WHERE tiene_rol(ARRAY['admin'])
    AND (p.local_id = local_id_actual() OR p.local_id IS NULL)
  ORDER BY p.local_id IS NOT NULL, p.created_at DESC
$$;

REVOKE ALL ON FUNCTION public.cuentas_del_local() FROM public;
GRANT EXECUTE ON FUNCTION public.cuentas_del_local() TO authenticated;
