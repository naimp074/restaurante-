/*
  # Seguridad de cuentas y sincronización por registro

  1. Altas de usuarios
     - El rol ya no sale de los metadatos del registro (los elige quien se registra).
     - El primer usuario del sistema es admin del primer local.
     - Los siguientes quedan inactivos y sin local hasta que un admin los aprueba.

  2. Perfiles
     - Nadie puede cambiarse su propio rol, estado o local. Solo un admin, y solo
       sobre perfiles de su local o pendientes de aprobación.
     - Admin y encargado solo ven perfiles de su propio local (o pendientes).

  3. sync_registros
     - Reemplaza a sync_documentos: cada pedido, pago, movimiento, etc. es una fila.
       Dos dispositivos que tocan registros distintos ya no se pisan.
     - La escritura se controla por rol y por clave en el servidor.
*/

-- ============================================================
-- 1. ALTAS DE USUARIOS
-- ============================================================
CREATE OR REPLACE FUNCTION public.crear_perfil_para_usuario()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  es_primer_usuario boolean;
  lid uuid;
BEGIN
  SELECT NOT EXISTS (SELECT 1 FROM profiles) INTO es_primer_usuario;

  IF es_primer_usuario THEN
    SELECT id INTO lid FROM locales ORDER BY created_at ASC LIMIT 1;
    IF lid IS NULL THEN
      INSERT INTO locales (nombre) VALUES ('Local principal') RETURNING id INTO lid;
    END IF;
  END IF;

  INSERT INTO profiles (id, nombre, apellido, rol, activo, local_id)
  VALUES (
    NEW.id,
    COALESCE(NULLIF(NEW.raw_user_meta_data->>'nombre', ''), split_part(NEW.email, '@', 1)),
    COALESCE(NEW.raw_user_meta_data->>'apellido', ''),
    CASE WHEN es_primer_usuario THEN 'admin' ELSE 'moza' END,
    es_primer_usuario,
    lid
  )
  ON CONFLICT (id) DO NOTHING;

  RETURN NEW;
END;
$$;

-- Sin local asignado no se adivina uno: lo asigna un admin al aprobar la cuenta.
CREATE OR REPLACE FUNCTION public.asignar_local_si_falta()
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  lid uuid;
BEGIN
  SELECT local_id INTO lid FROM profiles WHERE id = auth.uid() AND activo;
  IF lid IS NULL THEN
    RAISE EXCEPTION 'Tu cuenta todavía no fue aprobada por un administrador.'
      USING ERRCODE = '42501';
  END IF;
  RETURN lid;
END;
$$;

-- ============================================================
-- 2. PERFILES
-- ============================================================
CREATE OR REPLACE FUNCTION public.proteger_campos_de_perfil()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- auth.uid() es NULL cuando el cambio viene del panel o de una migración.
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  IF (NEW.rol IS DISTINCT FROM OLD.rol
      OR NEW.activo IS DISTINCT FROM OLD.activo
      OR NEW.local_id IS DISTINCT FROM OLD.local_id) THEN
    IF NOT tiene_rol(ARRAY['admin']) THEN
      RAISE EXCEPTION 'Solo un administrador puede cambiar rol, estado o local de una cuenta.'
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

DROP TRIGGER IF EXISTS proteger_campos_de_perfil ON profiles;
CREATE TRIGGER proteger_campos_de_perfil
  BEFORE UPDATE ON profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.proteger_campos_de_perfil();

DROP POLICY IF EXISTS "Perfil propio o gestión de personal: lectura" ON profiles;
CREATE POLICY "Perfil propio o gestión de personal: lectura"
  ON profiles FOR SELECT
  TO authenticated
  USING (
    auth.uid() = id
    OR (tiene_rol(ARRAY['admin', 'encargado']) AND (local_id = local_id_actual() OR local_id IS NULL))
  );

DROP POLICY IF EXISTS "Administración: actualización de perfiles" ON profiles;
CREATE POLICY "Administración: actualización de perfiles"
  ON profiles FOR UPDATE
  TO authenticated
  USING (tiene_rol(ARRAY['admin']) AND (local_id = local_id_actual() OR local_id IS NULL))
  WITH CHECK (tiene_rol(ARRAY['admin']) AND local_id = local_id_actual());

-- El admin necesita el email para reconocer a quién aprueba; profiles no lo guarda.
CREATE OR REPLACE FUNCTION public.cuentas_del_local()
RETURNS TABLE (
  id uuid,
  email text,
  nombre text,
  apellido text,
  rol text,
  activo boolean,
  local_id uuid,
  created_at timestamptz
)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT p.id, u.email::text, p.nombre, p.apellido, p.rol, p.activo, p.local_id, p.created_at
  FROM profiles p
  JOIN auth.users u ON u.id = p.id
  WHERE tiene_rol(ARRAY['admin'])
    AND (p.local_id = local_id_actual() OR p.local_id IS NULL)
  ORDER BY p.local_id IS NOT NULL, p.created_at DESC
$$;

REVOKE ALL ON FUNCTION public.cuentas_del_local() FROM public;
GRANT EXECUTE ON FUNCTION public.cuentas_del_local() TO authenticated;

DROP POLICY IF EXISTS "Locales: lectura del propio" ON locales;
CREATE POLICY "Locales: lectura del propio"
  ON locales FOR SELECT TO authenticated
  USING (id = local_id_actual());

DROP POLICY IF EXISTS "Locales: admin gestiona" ON locales;
CREATE POLICY "Locales: admin gestiona"
  ON locales FOR UPDATE TO authenticated
  USING (tiene_rol(ARRAY['admin']) AND id = local_id_actual())
  WITH CHECK (tiene_rol(ARRAY['admin']) AND id = local_id_actual());

-- ============================================================
-- 3. SINCRONIZACIÓN POR REGISTRO
-- ============================================================
CREATE TABLE IF NOT EXISTS sync_registros (
  local_id uuid NOT NULL REFERENCES locales(id) ON DELETE CASCADE,
  clave text NOT NULL,
  registro_id text NOT NULL,
  payload jsonb,
  eliminado boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  PRIMARY KEY (local_id, clave, registro_id)
);

CREATE INDEX IF NOT EXISTS idx_sync_registros_updated_at ON sync_registros(local_id, updated_at DESC);

-- La hora y el autor los pone el servidor: el reloj de una tablet no es confiable.
CREATE OR REPLACE FUNCTION public.sellar_sync_registro()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at := now();
  NEW.updated_by := auth.uid();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sellar_sync_registro ON sync_registros;
CREATE TRIGGER sellar_sync_registro
  BEFORE INSERT OR UPDATE ON sync_registros
  FOR EACH ROW
  EXECUTE FUNCTION public.sellar_sync_registro();

/*
  Qué puede escribir cada rol. Tiene que coincidir con permisosSync.ts.
  - admin y encargado: todo.
  - cajero: la operación del día (cobros, caja, cuenta corriente y el stock que descuenta la venta).
  - moza y cocina: mesas y comandas.
  - Cualquiera: su propia ficha en la lista de personal (se actualiza al iniciar sesión).
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

ALTER TABLE sync_registros ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Sync registros: lectura del local" ON sync_registros;
CREATE POLICY "Sync registros: lectura del local"
  ON sync_registros FOR SELECT TO authenticated
  USING (local_id = local_id_actual() AND tiene_rol(ARRAY['admin', 'encargado', 'cajero', 'moza', 'cocina']));

DROP POLICY IF EXISTS "Sync registros: alta según rol" ON sync_registros;
CREATE POLICY "Sync registros: alta según rol"
  ON sync_registros FOR INSERT TO authenticated
  WITH CHECK (local_id = local_id_actual() AND puede_escribir_registro(clave, registro_id));

DROP POLICY IF EXISTS "Sync registros: cambio según rol" ON sync_registros;
CREATE POLICY "Sync registros: cambio según rol"
  ON sync_registros FOR UPDATE TO authenticated
  USING (local_id = local_id_actual() AND puede_escribir_registro(clave, registro_id))
  WITH CHECK (local_id = local_id_actual() AND puede_escribir_registro(clave, registro_id));

-- Las bajas viajan como eliminado = true; borrar filas no está permitido.

ALTER TABLE sync_registros REPLICA IDENTITY FULL;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_rel prel
      JOIN pg_class c ON c.oid = prel.prrelid
      JOIN pg_publication p ON p.oid = prel.prpubid
      WHERE p.pubname = 'supabase_realtime' AND c.relname = 'sync_registros'
    ) THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE sync_registros;
    END IF;
  END IF;
END $$;

-- La tabla vieja queda solo para leer: la app la migra a sync_registros la primera vez.
DROP POLICY IF EXISTS "Sync: escritura del local" ON sync_documentos;
