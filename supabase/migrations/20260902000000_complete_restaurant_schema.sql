/*
  # Esquema completo del sistema de gestión

  Completa la migración inicial con todo lo que la aplicación ya utiliza:
  códigos de artículo, recetas con producciones propias, caja diaria, gastos,
  cuentas de dinero, cuenta corriente de proveedores, clientes y configuración.

  ## Cambios sobre tablas existentes
  - `profiles`: políticas reescritas con función auxiliar (las originales se
    auto-consultaban, lo que provoca recursión infinita en RLS)
  - `ingredientes`, `productos`: columna `codigo`
  - `ingredientes`: clave foránea real hacia `proveedores`
  - `mesas`: columna `nombre` y sector libre en lugar de lista cerrada
  - `proveedores`: datos fiscales
  - `pagos`: comprador y tipo de comprobante
  - `compras`: condición de pago y vencimiento
  - `movimientos_stock`: motivos de consumo interno y producción
  - `receta_items`: acepta componentes de stock o de producción propia

  ## Tablas nuevas
  `sectores_mesa`, `producciones_preparadas`, `registros_produccion`,
  `cajas_diarias`, `apartados_caja`, `gastos`, `cuentas_dinero`,
  `movimientos_financieros`, `facturas_proveedor`, `pagos_proveedor`,
  `clientes`, `configuracion_local`

  ## Seguridad
  RLS habilitado en todas las tablas nuevas, con permisos por rol.
*/

-- ============================================================
-- FUNCIÓN AUXILIAR DE ROLES
-- ============================================================
-- SECURITY DEFINER evita que la consulta a profiles vuelva a pasar por RLS,
-- que es lo que hacía recursivas las políticas originales.
CREATE OR REPLACE FUNCTION public.tiene_rol(roles text[])
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles p
    WHERE p.id = auth.uid() AND p.activo AND p.rol = ANY(roles)
  );
$$;

REVOKE ALL ON FUNCTION public.tiene_rol(text[]) FROM public;
GRANT EXECUTE ON FUNCTION public.tiene_rol(text[]) TO authenticated;

-- ============================================================
-- PROFILES: políticas sin recursión
-- ============================================================
DROP POLICY IF EXISTS "Users can read own profile" ON profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON profiles;
DROP POLICY IF EXISTS "Admins can read all profiles" ON profiles;
DROP POLICY IF EXISTS "Admins can insert profiles" ON profiles;
DROP POLICY IF EXISTS "Admins can update all profiles" ON profiles;

CREATE POLICY "Perfil propio o gestión de personal: lectura"
  ON profiles FOR SELECT
  TO authenticated
  USING (auth.uid() = id OR tiene_rol(ARRAY['admin', 'encargado']));

CREATE POLICY "Perfil propio: actualización"
  ON profiles FOR UPDATE
  TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

CREATE POLICY "Administración: alta de perfiles"
  ON profiles FOR INSERT
  TO authenticated
  WITH CHECK (tiene_rol(ARRAY['admin']));

CREATE POLICY "Administración: actualización de perfiles"
  ON profiles FOR UPDATE
  TO authenticated
  USING (tiene_rol(ARRAY['admin', 'encargado']))
  WITH CHECK (tiene_rol(ARRAY['admin', 'encargado']));

-- ============================================================
-- CÓDIGOS DE ARTÍCULO Y DATOS FALTANTES
-- ============================================================
ALTER TABLE ingredientes ADD COLUMN IF NOT EXISTS codigo text DEFAULT NULL;
ALTER TABLE productos ADD COLUMN IF NOT EXISTS codigo text DEFAULT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_ingredientes_codigo
  ON ingredientes(codigo) WHERE codigo IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_productos_codigo
  ON productos(codigo) WHERE codigo IS NOT NULL;

ALTER TABLE proveedores ADD COLUMN IF NOT EXISTS cuit text DEFAULT '';
ALTER TABLE proveedores ADD COLUMN IF NOT EXISTS direccion text DEFAULT '';
ALTER TABLE proveedores ADD COLUMN IF NOT EXISTS codigo_fiscal text DEFAULT '';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'ingredientes_proveedor_id_fkey'
  ) THEN
    ALTER TABLE ingredientes
      ADD CONSTRAINT ingredientes_proveedor_id_fkey
      FOREIGN KEY (proveedor_id) REFERENCES proveedores(id) ON DELETE SET NULL;
  END IF;
END $$;

ALTER TABLE pagos ADD COLUMN IF NOT EXISTS comprador_nombre text DEFAULT '';
ALTER TABLE pagos ADD COLUMN IF NOT EXISTS tipo_comprobante text NOT NULL DEFAULT 'ticket';
ALTER TABLE pagos DROP CONSTRAINT IF EXISTS pagos_tipo_comprobante_check;
ALTER TABLE pagos ADD CONSTRAINT pagos_tipo_comprobante_check
  CHECK (tipo_comprobante IN ('ticket', 'factura_x', 'factura_b', 'factura_a'));

ALTER TABLE compras ADD COLUMN IF NOT EXISTS condicion_pago text NOT NULL DEFAULT 'pendiente';
ALTER TABLE compras DROP CONSTRAINT IF EXISTS compras_condicion_pago_check;
ALTER TABLE compras ADD CONSTRAINT compras_condicion_pago_check
  CHECK (condicion_pago IN ('pendiente', 'pagada', 'parcial'));
ALTER TABLE compras ADD COLUMN IF NOT EXISTS monto_pagado numeric NOT NULL DEFAULT 0;
ALTER TABLE compras ADD COLUMN IF NOT EXISTS vencimiento date DEFAULT NULL;
ALTER TABLE compras ADD COLUMN IF NOT EXISTS origen text NOT NULL DEFAULT 'manual';

-- El stock también sale por consumo interno y por producción propia
ALTER TABLE movimientos_stock DROP CONSTRAINT IF EXISTS movimientos_stock_motivo_check;
ALTER TABLE movimientos_stock ADD CONSTRAINT movimientos_stock_motivo_check
  CHECK (motivo IN (
    'compra', 'venta', 'desperdicio', 'ajuste_manual', 'devolucion',
    'consumo_interno', 'produccion'
  ));

-- ============================================================
-- SECTORES DE MESA (configurables por el local)
-- ============================================================
CREATE TABLE IF NOT EXISTS sectores_mesa (
  id text PRIMARY KEY,
  nombre text NOT NULL,
  orden integer NOT NULL DEFAULT 0,
  activo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE sectores_mesa ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Sectores: lectura autenticada"
  ON sectores_mesa FOR SELECT TO authenticated USING (true);

CREATE POLICY "Sectores: gestión"
  ON sectores_mesa FOR ALL TO authenticated
  USING (tiene_rol(ARRAY['admin', 'encargado']))
  WITH CHECK (tiene_rol(ARRAY['admin', 'encargado']));

INSERT INTO sectores_mesa (id, nombre, orden) VALUES
  ('salon', 'Salón', 1),
  ('terraza', 'Terraza', 2),
  ('barra', 'Barra', 3),
  ('privado', 'Privado', 4)
ON CONFLICT (id) DO NOTHING;

ALTER TABLE mesas ADD COLUMN IF NOT EXISTS nombre text DEFAULT '';
ALTER TABLE mesas DROP CONSTRAINT IF EXISTS mesas_sector_check;

-- ============================================================
-- PRODUCCIONES PREPARADAS (milanesas, medallones, salsas)
-- ============================================================
CREATE TABLE IF NOT EXISTS producciones_preparadas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo text DEFAULT NULL,
  nombre text NOT NULL,
  descripcion text NOT NULL DEFAULT '',
  unidad_medida text NOT NULL DEFAULT 'unidad' CHECK (
    unidad_medida IN ('gramos', 'kilos', 'mililitros', 'litros', 'unidad', 'feta', 'porcion', 'paquete')
  ),
  cantidad_producida numeric NOT NULL DEFAULT 0,
  stock_actual numeric NOT NULL DEFAULT 0,
  costo_unitario numeric NOT NULL DEFAULT 0,
  activo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE producciones_preparadas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Producciones: lectura autenticada"
  ON producciones_preparadas FOR SELECT TO authenticated USING (true);

CREATE POLICY "Producciones: gestión"
  ON producciones_preparadas FOR ALL TO authenticated
  USING (tiene_rol(ARRAY['admin', 'encargado', 'cocina']))
  WITH CHECK (tiene_rol(ARRAY['admin', 'encargado', 'cocina']));

CREATE TABLE IF NOT EXISTS registros_produccion (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  produccion_id uuid NOT NULL REFERENCES producciones_preparadas(id) ON DELETE CASCADE,
  fecha date NOT NULL DEFAULT CURRENT_DATE,
  cantidad numeric NOT NULL DEFAULT 0,
  cantidad_base numeric NOT NULL DEFAULT 0,
  costo_total numeric NOT NULL DEFAULT 0,
  insumos_utilizados jsonb NOT NULL DEFAULT '[]'::jsonb,
  responsable_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  observaciones text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE registros_produccion ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Registros de producción: lectura"
  ON registros_produccion FOR SELECT TO authenticated
  USING (tiene_rol(ARRAY['admin', 'encargado', 'cocina']));

CREATE POLICY "Registros de producción: alta"
  ON registros_produccion FOR INSERT TO authenticated
  WITH CHECK (tiene_rol(ARRAY['admin', 'encargado', 'cocina']));

-- ============================================================
-- RECETAS: componentes de stock o de producción propia
-- ============================================================
-- La tabla original exigía un ingrediente por línea y permitía una sola
-- aparición de cada insumo por producto. Las planillas reales necesitan
-- componentes de producción y recetas de producciones.
ALTER TABLE receta_items DROP CONSTRAINT IF EXISTS receta_items_producto_id_ingrediente_id_key;
ALTER TABLE receta_items ALTER COLUMN producto_id DROP NOT NULL;
ALTER TABLE receta_items ALTER COLUMN ingrediente_id DROP NOT NULL;

ALTER TABLE receta_items ADD COLUMN IF NOT EXISTS produccion_padre_id uuid
  REFERENCES producciones_preparadas(id) ON DELETE CASCADE;
ALTER TABLE receta_items ADD COLUMN IF NOT EXISTS produccion_id uuid
  REFERENCES producciones_preparadas(id) ON DELETE RESTRICT;
ALTER TABLE receta_items ADD COLUMN IF NOT EXISTS tipo text NOT NULL DEFAULT 'stock';

ALTER TABLE receta_items DROP CONSTRAINT IF EXISTS receta_items_tipo_check;
ALTER TABLE receta_items ADD CONSTRAINT receta_items_tipo_check
  CHECK (tipo IN ('stock', 'produccion'));

-- Cada línea pertenece a un producto o a una producción, nunca a ambos
ALTER TABLE receta_items DROP CONSTRAINT IF EXISTS receta_items_dueno_check;
ALTER TABLE receta_items ADD CONSTRAINT receta_items_dueno_check
  CHECK (num_nonnulls(producto_id, produccion_padre_id) = 1);

-- El componente coincide con el tipo declarado
ALTER TABLE receta_items DROP CONSTRAINT IF EXISTS receta_items_componente_check;
ALTER TABLE receta_items ADD CONSTRAINT receta_items_componente_check
  CHECK (
    (tipo = 'stock' AND ingrediente_id IS NOT NULL AND produccion_id IS NULL)
    OR (tipo = 'produccion' AND produccion_id IS NOT NULL AND ingrediente_id IS NULL)
  );

CREATE INDEX IF NOT EXISTS idx_receta_items_producto ON receta_items(producto_id);
CREATE INDEX IF NOT EXISTS idx_receta_items_produccion_padre ON receta_items(produccion_padre_id);

-- ============================================================
-- CAJA DIARIA Y APARTADOS
-- ============================================================
CREATE TABLE IF NOT EXISTS cajas_diarias (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fecha date NOT NULL UNIQUE,
  cajero_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  cajero_nombre text NOT NULL DEFAULT '',
  monto_inicial numeric NOT NULL DEFAULT 0,
  efectivo numeric NOT NULL DEFAULT 0,
  tarjeta numeric NOT NULL DEFAULT 0,
  transferencia numeric NOT NULL DEFAULT 0,
  total_ventas numeric NOT NULL DEFAULT 0,
  monto_esperado_efectivo numeric NOT NULL DEFAULT 0,
  monto_cierre_efectivo numeric DEFAULT NULL,
  diferencia_efectivo numeric DEFAULT NULL,
  estado text NOT NULL DEFAULT 'abierta' CHECK (estado IN ('abierta', 'cerrada')),
  opened_at timestamptz NOT NULL DEFAULT now(),
  closed_at timestamptz DEFAULT NULL
);

ALTER TABLE cajas_diarias ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Caja diaria: lectura"
  ON cajas_diarias FOR SELECT TO authenticated
  USING (tiene_rol(ARRAY['admin', 'encargado', 'cajero']));

CREATE POLICY "Caja diaria: gestión"
  ON cajas_diarias FOR ALL TO authenticated
  USING (tiene_rol(ARRAY['admin', 'encargado', 'cajero']))
  WITH CHECK (tiene_rol(ARRAY['admin', 'encargado', 'cajero']));

CREATE TABLE IF NOT EXISTS apartados_caja (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  caja_id uuid REFERENCES cajas_diarias(id) ON DELETE CASCADE,
  fecha date NOT NULL DEFAULT CURRENT_DATE,
  nombre text NOT NULL DEFAULT '',
  monto numeric NOT NULL DEFAULT 0,
  observaciones text NOT NULL DEFAULT '',
  creado_por uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE apartados_caja ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Apartados: lectura"
  ON apartados_caja FOR SELECT TO authenticated
  USING (tiene_rol(ARRAY['admin', 'encargado', 'cajero']));

CREATE POLICY "Apartados: gestión"
  ON apartados_caja FOR ALL TO authenticated
  USING (tiene_rol(ARRAY['admin', 'encargado', 'cajero']))
  WITH CHECK (tiene_rol(ARRAY['admin', 'encargado', 'cajero']));

-- ============================================================
-- CUENTAS DE DINERO Y MOVIMIENTOS FINANCIEROS
-- ============================================================
CREATE TABLE IF NOT EXISTS cuentas_dinero (
  id text PRIMARY KEY,
  nombre text NOT NULL,
  tipo text NOT NULL DEFAULT 'efectivo' CHECK (
    tipo IN ('efectivo', 'banco', 'billetera_virtual', 'tarjeta', 'otra')
  ),
  saldo numeric NOT NULL DEFAULT 0,
  activa boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE cuentas_dinero ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Cuentas: lectura"
  ON cuentas_dinero FOR SELECT TO authenticated
  USING (tiene_rol(ARRAY['admin', 'encargado', 'cajero']));

CREATE POLICY "Cuentas: gestión"
  ON cuentas_dinero FOR ALL TO authenticated
  USING (tiene_rol(ARRAY['admin', 'encargado']))
  WITH CHECK (tiene_rol(ARRAY['admin', 'encargado']));

INSERT INTO cuentas_dinero (id, nombre, tipo) VALUES
  ('cuenta-caja-grande', 'Caja grande', 'efectivo'),
  ('cuenta-caja-chica', 'Caja chica', 'efectivo'),
  ('cuenta-banco', 'Banco', 'banco'),
  ('cuenta-mercado-pago', 'Mercado Pago', 'billetera_virtual')
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS facturas_proveedor (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  proveedor_id uuid NOT NULL REFERENCES proveedores(id) ON DELETE RESTRICT,
  compra_id uuid REFERENCES compras(id) ON DELETE SET NULL,
  numero text NOT NULL,
  fecha date NOT NULL DEFAULT CURRENT_DATE,
  vencimiento date NOT NULL DEFAULT CURRENT_DATE,
  total numeric NOT NULL DEFAULT 0,
  pagado numeric NOT NULL DEFAULT 0,
  recargo_por_vencimiento numeric NOT NULL DEFAULT 0,
  estado text NOT NULL DEFAULT 'pendiente' CHECK (
    estado IN ('pendiente', 'por_vencer', 'vencida', 'pagada')
  ),
  observaciones text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT facturas_proveedor_pagado_check CHECK (pagado >= 0 AND pagado <= total)
);

ALTER TABLE facturas_proveedor ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Facturas de proveedor: lectura"
  ON facturas_proveedor FOR SELECT TO authenticated
  USING (tiene_rol(ARRAY['admin', 'encargado']));

CREATE POLICY "Facturas de proveedor: gestión"
  ON facturas_proveedor FOR ALL TO authenticated
  USING (tiene_rol(ARRAY['admin', 'encargado']))
  WITH CHECK (tiene_rol(ARRAY['admin', 'encargado']));

CREATE TABLE IF NOT EXISTS pagos_proveedor (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  proveedor_id uuid NOT NULL REFERENCES proveedores(id) ON DELETE RESTRICT,
  factura_id uuid REFERENCES facturas_proveedor(id) ON DELETE SET NULL,
  cuenta_origen_id text NOT NULL REFERENCES cuentas_dinero(id) ON DELETE RESTRICT,
  fecha date NOT NULL DEFAULT CURRENT_DATE,
  metodo_pago text NOT NULL DEFAULT 'efectivo' CHECK (
    metodo_pago IN ('efectivo', 'transferencia', 'debito', 'credito', 'mixto')
  ),
  monto numeric NOT NULL DEFAULT 0,
  observaciones text NOT NULL DEFAULT '',
  creado_por uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE pagos_proveedor ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Pagos a proveedor: lectura"
  ON pagos_proveedor FOR SELECT TO authenticated
  USING (tiene_rol(ARRAY['admin', 'encargado']));

CREATE POLICY "Pagos a proveedor: gestión"
  ON pagos_proveedor FOR ALL TO authenticated
  USING (tiene_rol(ARRAY['admin', 'encargado']))
  WITH CHECK (tiene_rol(ARRAY['admin', 'encargado']));

CREATE TABLE IF NOT EXISTS movimientos_financieros (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fecha date NOT NULL DEFAULT CURRENT_DATE,
  tipo text NOT NULL CHECK (tipo IN ('entrada', 'salida', 'transferencia', 'ajuste')),
  origen text NOT NULL CHECK (origen IN (
    'venta', 'gasto', 'pago_proveedor', 'compra', 'apertura_caja',
    'retiro', 'transferencia_interna', 'ajuste'
  )),
  cuenta_id text REFERENCES cuentas_dinero(id) ON DELETE SET NULL,
  cuenta_destino_id text REFERENCES cuentas_dinero(id) ON DELETE SET NULL,
  monto numeric NOT NULL DEFAULT 0,
  descripcion text NOT NULL DEFAULT '',
  proveedor_id uuid REFERENCES proveedores(id) ON DELETE SET NULL,
  factura_proveedor_id uuid REFERENCES facturas_proveedor(id) ON DELETE SET NULL,
  compra_id uuid REFERENCES compras(id) ON DELETE SET NULL,
  pago_id uuid DEFAULT NULL,
  metodo_pago text DEFAULT NULL,
  creado_por uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE movimientos_financieros ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Movimientos financieros: lectura"
  ON movimientos_financieros FOR SELECT TO authenticated
  USING (tiene_rol(ARRAY['admin', 'encargado']));

CREATE POLICY "Movimientos financieros: alta"
  ON movimientos_financieros FOR INSERT TO authenticated
  WITH CHECK (tiene_rol(ARRAY['admin', 'encargado', 'cajero']));

-- ============================================================
-- GASTOS
-- ============================================================
CREATE TABLE IF NOT EXISTS gastos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fecha date NOT NULL DEFAULT CURRENT_DATE,
  concepto text NOT NULL,
  categoria text NOT NULL DEFAULT 'variable' CHECK (
    categoria IN ('sueldo', 'fijo', 'variable', 'extra')
  ),
  alcance text NOT NULL DEFAULT 'general' CHECK (alcance IN ('caja_dia', 'general')),
  metodo_pago text NOT NULL DEFAULT 'efectivo' CHECK (
    metodo_pago IN ('efectivo', 'transferencia', 'debito', 'credito', 'mixto')
  ),
  monto numeric NOT NULL DEFAULT 0,
  observaciones text NOT NULL DEFAULT '',
  cuenta_origen_id text REFERENCES cuentas_dinero(id) ON DELETE SET NULL,
  pagos_divididos jsonb NOT NULL DEFAULT '[]'::jsonb,
  proveedor_id uuid REFERENCES proveedores(id) ON DELETE SET NULL,
  comprobante text NOT NULL DEFAULT '',
  estado text NOT NULL DEFAULT 'pagado' CHECK (estado IN ('pendiente', 'pagado', 'vencido')),
  vencimiento date DEFAULT NULL,
  recurrente boolean NOT NULL DEFAULT false,
  creado_por uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE gastos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Gastos: lectura"
  ON gastos FOR SELECT TO authenticated
  USING (tiene_rol(ARRAY['admin', 'encargado', 'cajero']));

CREATE POLICY "Gastos: gestión"
  ON gastos FOR ALL TO authenticated
  USING (tiene_rol(ARRAY['admin', 'encargado']))
  WITH CHECK (tiene_rol(ARRAY['admin', 'encargado']));

-- ============================================================
-- CLIENTES
-- ============================================================
CREATE TABLE IF NOT EXISTS clientes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre text NOT NULL,
  documento text DEFAULT '',
  tipo_documento text NOT NULL DEFAULT 'dni' CHECK (tipo_documento IN ('dni', 'cuit', 'cuil')),
  telefono text NOT NULL DEFAULT '',
  email text NOT NULL DEFAULT '',
  direccion text NOT NULL DEFAULT '',
  activo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_clientes_documento
  ON clientes(documento) WHERE documento <> '';

ALTER TABLE clientes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Clientes: lectura autenticada"
  ON clientes FOR SELECT TO authenticated USING (true);

CREATE POLICY "Clientes: gestión"
  ON clientes FOR ALL TO authenticated
  USING (tiene_rol(ARRAY['admin', 'encargado', 'cajero']))
  WITH CHECK (tiene_rol(ARRAY['admin', 'encargado', 'cajero']));

ALTER TABLE pagos ADD COLUMN IF NOT EXISTS cliente_id uuid
  REFERENCES clientes(id) ON DELETE SET NULL;

-- ============================================================
-- CONFIGURACIÓN DEL LOCAL (fila única)
-- ============================================================
CREATE TABLE IF NOT EXISTS configuracion_local (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  nombre_local text NOT NULL DEFAULT '',
  direccion text NOT NULL DEFAULT '',
  telefono text NOT NULL DEFAULT '',
  cuit text NOT NULL DEFAULT '',
  iva_porcentaje numeric NOT NULL DEFAULT 21,
  moneda text NOT NULL DEFAULT 'ARS',
  margen_objetivo numeric NOT NULL DEFAULT 50,
  notificar_stock_bajo boolean NOT NULL DEFAULT true,
  notificar_cierre_caja boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE configuracion_local ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Configuración: lectura autenticada"
  ON configuracion_local FOR SELECT TO authenticated USING (true);

CREATE POLICY "Configuración: gestión"
  ON configuracion_local FOR ALL TO authenticated
  USING (tiene_rol(ARRAY['admin']))
  WITH CHECK (tiene_rol(ARRAY['admin']));

INSERT INTO configuracion_local (id) VALUES (true) ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- PERMISOS PARA EL DESCUENTO DE STOCK AL VENDER
-- ============================================================
-- Cobrar una mesa descuenta insumos y producciones según la receta, y lo hace
-- un cajero. Las políticas originales solo dejaban a admin y encargado.
DROP POLICY IF EXISTS "Admins can update ingredientes" ON ingredientes;
CREATE POLICY "Ingredientes: actualización de stock y costos"
  ON ingredientes FOR UPDATE
  TO authenticated
  USING (tiene_rol(ARRAY['admin', 'encargado', 'cajero', 'cocina']))
  WITH CHECK (tiene_rol(ARRAY['admin', 'encargado', 'cajero', 'cocina']));

DROP POLICY IF EXISTS "Admins can read movimientos_stock" ON movimientos_stock;
CREATE POLICY "Movimientos de stock: lectura"
  ON movimientos_stock FOR SELECT
  TO authenticated
  USING (tiene_rol(ARRAY['admin', 'encargado', 'cajero', 'cocina']));

DROP POLICY IF EXISTS "System can insert movimientos_stock" ON movimientos_stock;
CREATE POLICY "Movimientos de stock: alta"
  ON movimientos_stock FOR INSERT
  TO authenticated
  WITH CHECK (tiene_rol(ARRAY['admin', 'encargado', 'cajero', 'cocina']));

-- ============================================================
-- ÍNDICES ADICIONALES
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_gastos_fecha ON gastos(fecha);
CREATE INDEX IF NOT EXISTS idx_movimientos_financieros_fecha ON movimientos_financieros(fecha);
CREATE INDEX IF NOT EXISTS idx_facturas_proveedor_estado ON facturas_proveedor(proveedor_id, estado);
CREATE INDEX IF NOT EXISTS idx_pagos_created_at ON pagos(created_at);
CREATE INDEX IF NOT EXISTS idx_movimientos_stock_created_at ON movimientos_stock(created_at);
CREATE INDEX IF NOT EXISTS idx_registros_produccion_fecha ON registros_produccion(produccion_id, fecha);
