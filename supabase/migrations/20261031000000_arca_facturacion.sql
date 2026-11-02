/*
  # Facturación electrónica con ARCA

  - arca_config: datos fiscales del local. Los carga el admin; la caja los lee.
  - comprobantes_fiscales: facturas y notas de crédito. Solo la función `arca` (service role)
    escribe: un usuario no puede inventar ni cambiar un CAE. Por eso no van en sync_registros.
  - arca_tokens: el acceso a ARCA dura 12 horas y no se puede pedir otro mientras siga vigente.
  - arca_turnos: los números son correlativos; este turno evita que dos cajas pidan el mismo.
*/

CREATE TABLE IF NOT EXISTS arca_config (
  local_id uuid PRIMARY KEY REFERENCES locales(id) ON DELETE CASCADE,
  cuit text NOT NULL CHECK (cuit ~ '^[0-9]{11}$'),
  razon_social text NOT NULL,
  domicilio text NOT NULL DEFAULT '',
  ingresos_brutos text NOT NULL DEFAULT '',
  inicio_actividades date,
  condicion_emisor text NOT NULL CHECK (condicion_emisor IN ('monotributo', 'responsable_inscripto')),
  punto_venta integer NOT NULL CHECK (punto_venta BETWEEN 1 AND 99998),
  alicuota numeric NOT NULL DEFAULT 21 CHECK (alicuota IN (0, 2.5, 5, 10.5, 21, 27)),
  concepto integer NOT NULL DEFAULT 1 CHECK (concepto IN (1, 2, 3)),
  umbral_identificacion numeric NOT NULL DEFAULT 10000000 CHECK (umbral_identificacion > 0),
  activo boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS comprobantes_fiscales (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  local_id uuid NOT NULL REFERENCES locales(id) ON DELETE CASCADE,
  pago_id text NOT NULL,
  clase text NOT NULL CHECK (clase IN ('factura', 'nota_credito')),
  asociado_id uuid REFERENCES comprobantes_fiscales(id),
  ambiente text NOT NULL CHECK (ambiente IN ('homologacion', 'produccion')),
  estado text NOT NULL CHECK (estado IN ('pendiente', 'autorizado', 'rechazado', 'descartado')),
  emisor jsonb NOT NULL,
  cbte_tipo integer NOT NULL,
  punto_venta integer NOT NULL,
  numero bigint,
  fecha text,
  concepto integer NOT NULL,
  doc_tipo integer NOT NULL,
  doc_nro text NOT NULL,
  condicion_iva_receptor integer NOT NULL,
  receptor_nombre text NOT NULL DEFAULT '',
  total numeric NOT NULL CHECK (total > 0),
  neto numeric NOT NULL,
  iva numeric NOT NULL,
  alicuota numeric NOT NULL,
  cae text,
  cae_vencimiento text,
  qr_url text,
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (local_id, pago_id, clase)
);

-- Solo lo autorizado ocupa el número de forma definitiva: uno pendiente puede tener que cambiarlo.
CREATE UNIQUE INDEX IF NOT EXISTS idx_comprobantes_numero_unico
  ON comprobantes_fiscales (ambiente, (emisor->>'cuit'), punto_venta, cbte_tipo, numero)
  WHERE estado = 'autorizado';
CREATE INDEX IF NOT EXISTS idx_comprobantes_local ON comprobantes_fiscales (local_id, created_at DESC);

CREATE TABLE IF NOT EXISTS arca_tokens (
  ambiente text PRIMARY KEY,
  token text NOT NULL,
  firma text NOT NULL,
  vence timestamptz NOT NULL
);

CREATE TABLE IF NOT EXISTS arca_turnos (
  clave text PRIMARY KEY,
  hasta timestamptz NOT NULL
);

ALTER TABLE arca_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE comprobantes_fiscales ENABLE ROW LEVEL SECURITY;
-- Sin políticas: solo el service role puede tocarlas.
ALTER TABLE arca_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE arca_turnos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ARCA config: lectura del local" ON arca_config;
CREATE POLICY "ARCA config: lectura del local"
  ON arca_config FOR SELECT TO authenticated
  USING (local_id = local_id_actual() AND tiene_rol(ARRAY['admin', 'encargado', 'cajero']));

DROP POLICY IF EXISTS "ARCA config: alta del admin" ON arca_config;
CREATE POLICY "ARCA config: alta del admin"
  ON arca_config FOR INSERT TO authenticated
  WITH CHECK (local_id = local_id_actual() AND tiene_rol(ARRAY['admin']));

DROP POLICY IF EXISTS "ARCA config: cambios del admin" ON arca_config;
CREATE POLICY "ARCA config: cambios del admin"
  ON arca_config FOR UPDATE TO authenticated
  USING (local_id = local_id_actual() AND tiene_rol(ARRAY['admin']))
  WITH CHECK (local_id = local_id_actual() AND tiene_rol(ARRAY['admin']));

DROP POLICY IF EXISTS "Comprobantes fiscales: lectura del local" ON comprobantes_fiscales;
CREATE POLICY "Comprobantes fiscales: lectura del local"
  ON comprobantes_fiscales FOR SELECT TO authenticated
  USING (local_id = local_id_actual() AND tiene_rol(ARRAY['admin', 'encargado', 'cajero']));

CREATE OR REPLACE FUNCTION arca_tomar_turno(p_clave text, p_segundos integer)
RETURNS boolean
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  INSERT INTO arca_turnos (clave, hasta)
  VALUES (p_clave, now() + make_interval(secs => p_segundos))
  ON CONFLICT (clave) DO UPDATE SET hasta = EXCLUDED.hasta
  WHERE arca_turnos.hasta < now();
  RETURN FOUND;
END;
$$;

REVOKE ALL ON FUNCTION arca_tomar_turno(text, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION arca_tomar_turno(text, integer) TO service_role;
