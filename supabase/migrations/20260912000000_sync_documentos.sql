/*
  Sync entre dispositivos: un local, los mismos documentos de negocio.
  Los stores del navegador siguen siendo la fuente inmediata; esta tabla
  replica el JSON por clave y avisa por Realtime.
*/

CREATE TABLE IF NOT EXISTS locales (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre text NOT NULL DEFAULT 'Local principal',
  created_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO locales (nombre)
SELECT 'Local principal'
WHERE NOT EXISTS (SELECT 1 FROM locales);

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS local_id uuid REFERENCES locales(id);

UPDATE profiles
SET local_id = (SELECT id FROM locales ORDER BY created_at ASC LIMIT 1)
WHERE local_id IS NULL;

CREATE TABLE IF NOT EXISTS sync_documentos (
  local_id uuid NOT NULL REFERENCES locales(id) ON DELETE CASCADE,
  clave text NOT NULL,
  payload jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  PRIMARY KEY (local_id, clave)
);

CREATE INDEX IF NOT EXISTS idx_sync_documentos_updated_at ON sync_documentos(updated_at DESC);

ALTER TABLE locales ENABLE ROW LEVEL SECURITY;
ALTER TABLE sync_documentos ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.local_id_actual()
RETURNS uuid
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT local_id FROM profiles WHERE id = auth.uid()
$$;

REVOKE ALL ON FUNCTION public.local_id_actual() FROM public;
GRANT EXECUTE ON FUNCTION public.local_id_actual() TO authenticated;

CREATE OR REPLACE FUNCTION public.asignar_local_si_falta()
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  lid uuid;
BEGIN
  SELECT local_id INTO lid FROM profiles WHERE id = auth.uid();
  IF lid IS NOT NULL THEN
    RETURN lid;
  END IF;

  SELECT id INTO lid FROM locales ORDER BY created_at ASC LIMIT 1;
  IF lid IS NULL THEN
    INSERT INTO locales (nombre) VALUES ('Local principal') RETURNING id INTO lid;
  END IF;

  UPDATE profiles SET local_id = lid WHERE id = auth.uid() AND local_id IS NULL;
  RETURN lid;
END;
$$;

REVOKE ALL ON FUNCTION public.asignar_local_si_falta() FROM public;
GRANT EXECUTE ON FUNCTION public.asignar_local_si_falta() TO authenticated;

DROP POLICY IF EXISTS "Locales: lectura del propio" ON locales;
CREATE POLICY "Locales: lectura del propio"
  ON locales FOR SELECT TO authenticated
  USING (id = local_id_actual() OR local_id_actual() IS NULL);

DROP POLICY IF EXISTS "Locales: admin gestiona" ON locales;
CREATE POLICY "Locales: admin gestiona"
  ON locales FOR ALL TO authenticated
  USING (tiene_rol(ARRAY['admin']))
  WITH CHECK (tiene_rol(ARRAY['admin']));

DROP POLICY IF EXISTS "Sync: lectura del local" ON sync_documentos;
CREATE POLICY "Sync: lectura del local"
  ON sync_documentos FOR SELECT TO authenticated
  USING (local_id = local_id_actual());

DROP POLICY IF EXISTS "Sync: escritura del local" ON sync_documentos;
CREATE POLICY "Sync: escritura del local"
  ON sync_documentos FOR ALL TO authenticated
  USING (local_id = local_id_actual())
  WITH CHECK (local_id = local_id_actual());

ALTER TABLE sync_documentos REPLICA IDENTITY FULL;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_rel prel
      JOIN pg_class c ON c.oid = prel.prrelid
      JOIN pg_publication p ON p.oid = prel.prpubid
      WHERE p.pubname = 'supabase_realtime' AND c.relname = 'sync_documentos'
    ) THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE sync_documentos;
    END IF;
  END IF;
END $$;
