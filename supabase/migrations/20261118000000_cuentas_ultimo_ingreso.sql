/*
  Para ver por qué alguien no puede entrar: Usuarios > Cuentas de acceso muestra cuándo
  entró por última vez cada cuenta, si le falta confirmar el email y si Supabase la bloqueó.
  Las contraseñas no se devuelven: Supabase guarda solo un resumen cifrado.
*/
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
  created_at timestamptz,
  ultimo_ingreso timestamptz,
  email_confirmado boolean,
  bloqueada_hasta timestamptz
)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT p.id, u.email::text, p.nombre, p.apellido, p.rol, p.activo, p.local_id, p.paginas, p.created_at,
         u.last_sign_in_at, u.email_confirmed_at IS NOT NULL, u.banned_until
  FROM profiles p
  JOIN auth.users u ON u.id = p.id
  WHERE tiene_rol(ARRAY['admin'])
    AND (p.local_id = local_id_actual() OR p.local_id IS NULL)
  ORDER BY p.local_id IS NOT NULL, p.created_at DESC
$$;

REVOKE ALL ON FUNCTION public.cuentas_del_local() FROM public;
GRANT EXECUTE ON FUNCTION public.cuentas_del_local() TO authenticated;
