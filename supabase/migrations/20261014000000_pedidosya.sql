/*
  # Integración con PedidosYa

  - pedidosya_locales: qué local de BurgerPOS corresponde a cada "remoteId" (el código
    del local que se le informa a PedidosYa al dar de alta la integración) y su comisión.
  - pedidosya_pedidos: el pedido original tal como lo mandó PedidosYa, con las URLs para
    aceptarlo, rechazarlo, etc. Solo la función `pedidosya` (service role) escribe acá.

  El pedido en sí se guarda en sync_registros (clave restaurant-demo-pedidos), así llega
  en vivo a todas las pantallas como cualquier comanda.
*/

CREATE TABLE IF NOT EXISTS pedidosya_locales (
  remote_id text PRIMARY KEY CHECK (remote_id ~ '^[A-Za-z0-9_.-]{3,64}$'),
  local_id uuid NOT NULL UNIQUE REFERENCES locales(id) ON DELETE CASCADE,
  comision numeric NOT NULL DEFAULT 0 CHECK (comision >= 0 AND comision < 100),
  activo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS pedidosya_pedidos (
  token text PRIMARY KEY,
  local_id uuid NOT NULL REFERENCES locales(id) ON DELETE CASCADE,
  remote_id text NOT NULL,
  pedido_id text NOT NULL UNIQUE,
  payload jsonb NOT NULL,
  ultimo_estado text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pedidosya_pedidos_local ON pedidosya_pedidos(local_id, created_at DESC);

ALTER TABLE pedidosya_locales ENABLE ROW LEVEL SECURITY;
ALTER TABLE pedidosya_pedidos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "PedidosYa locales: lectura del local" ON pedidosya_locales;
CREATE POLICY "PedidosYa locales: lectura del local"
  ON pedidosya_locales FOR SELECT TO authenticated
  USING (local_id = local_id_actual() AND tiene_rol(ARRAY['admin', 'encargado', 'cajero']));

DROP POLICY IF EXISTS "PedidosYa locales: alta del admin" ON pedidosya_locales;
CREATE POLICY "PedidosYa locales: alta del admin"
  ON pedidosya_locales FOR INSERT TO authenticated
  WITH CHECK (local_id = local_id_actual() AND tiene_rol(ARRAY['admin']));

DROP POLICY IF EXISTS "PedidosYa locales: cambios del admin" ON pedidosya_locales;
CREATE POLICY "PedidosYa locales: cambios del admin"
  ON pedidosya_locales FOR UPDATE TO authenticated
  USING (local_id = local_id_actual() AND tiene_rol(ARRAY['admin']))
  WITH CHECK (local_id = local_id_actual() AND tiene_rol(ARRAY['admin']));

DROP POLICY IF EXISTS "PedidosYa pedidos: lectura del local" ON pedidosya_pedidos;
CREATE POLICY "PedidosYa pedidos: lectura del local"
  ON pedidosya_pedidos FOR SELECT TO authenticated
  USING (local_id = local_id_actual() AND tiene_rol(ARRAY['admin', 'encargado', 'cajero']));
