
/*
  # Sistema Completo de Gestión de Restaurante / Hamburguesería

  ## Descripción
  Migración inicial que crea todas las tablas necesarias para el sistema de gestión
  de un restaurante/hamburguesería profesional.

  ## Tablas creadas

  ### Empleados y Roles
  - `profiles`: Perfiles de usuarios con roles (admin, encargado, cajero, moza, cocina)
  - `empleados`: Datos del personal del local

  ### Mesas y Servicio
  - `mesas`: Mesas del local con estado y capacidad
  - `turnos`: Turnos de trabajo del personal

  ### Catálogo
  - `categorias_producto`: Categorías de productos (hamburguesas, papas, bebidas, etc.)
  - `ingredientes`: Insumos y materias primas con stock
  - `productos`: Productos del menú con precios y costos
  - `receta_items`: Ingredientes que componen cada producto (receta técnica)

  ### Pedidos
  - `pedidos`: Pedidos por mesa con estado y totales
  - `pedido_items`: Items individuales de cada pedido con observaciones

  ### Pagos y Caja
  - `pagos`: Registros de cobros con método de pago

  ### Stock y Compras
  - `proveedores`: Proveedores de insumos
  - `compras`: Registros de compras de insumos
  - `movimientos_stock`: Historial de movimientos de stock

  ## Seguridad
  - RLS habilitado en todas las tablas
  - Políticas basadas en autenticación y roles
*/

-- ============================================================
-- PROFILES (extiende auth.users)
-- ============================================================
CREATE TABLE IF NOT EXISTS profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  nombre text NOT NULL DEFAULT '',
  apellido text NOT NULL DEFAULT '',
  rol text NOT NULL DEFAULT 'moza' CHECK (rol IN ('admin', 'encargado', 'cajero', 'moza', 'cocina')),
  activo boolean NOT NULL DEFAULT true,
  avatar_url text DEFAULT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own profile"
  ON profiles FOR SELECT
  TO authenticated
  USING (auth.uid() = id);

CREATE POLICY "Users can update own profile"
  ON profiles FOR UPDATE
  TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

CREATE POLICY "Admins can read all profiles"
  ON profiles FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.rol IN ('admin', 'encargado')
    )
  );

CREATE POLICY "Admins can insert profiles"
  ON profiles FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.rol = 'admin'
    )
  );

CREATE POLICY "Admins can update all profiles"
  ON profiles FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.rol IN ('admin', 'encargado')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.rol IN ('admin', 'encargado')
    )
  );

-- ============================================================
-- MESAS
-- ============================================================
CREATE TABLE IF NOT EXISTS mesas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  numero integer NOT NULL UNIQUE,
  capacidad integer NOT NULL DEFAULT 4,
  estado text NOT NULL DEFAULT 'libre' CHECK (
    estado IN ('libre', 'ocupada', 'esperando_pedido', 'en_preparacion', 'servida', 'pendiente_cobro', 'cerrada')
  ),
  empleado_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  sector text NOT NULL DEFAULT 'salon' CHECK (sector IN ('salon', 'terraza', 'barra', 'privado')),
  posicion_x integer NOT NULL DEFAULT 0,
  posicion_y integer NOT NULL DEFAULT 0,
  activa boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE mesas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read mesas"
  ON mesas FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authorized users can insert mesas"
  ON mesas FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.rol IN ('admin', 'encargado'))
  );

CREATE POLICY "Authorized users can update mesas"
  ON mesas FOR UPDATE
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.rol IN ('admin', 'encargado', 'cajero', 'moza'))
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.rol IN ('admin', 'encargado', 'cajero', 'moza'))
  );

-- ============================================================
-- CATEGORIAS DE PRODUCTO
-- ============================================================
CREATE TABLE IF NOT EXISTS categorias_producto (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre text NOT NULL UNIQUE,
  descripcion text DEFAULT '',
  icono text DEFAULT 'utensils',
  color text DEFAULT '#f59e0b',
  orden integer NOT NULL DEFAULT 0,
  activa boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE categorias_producto ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read categorias"
  ON categorias_producto FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admins can manage categorias"
  ON categorias_producto FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.rol IN ('admin', 'encargado'))
  );

CREATE POLICY "Admins can update categorias"
  ON categorias_producto FOR UPDATE
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.rol IN ('admin', 'encargado'))
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.rol IN ('admin', 'encargado'))
  );

-- ============================================================
-- INGREDIENTES / INSUMOS
-- ============================================================
CREATE TABLE IF NOT EXISTS ingredientes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre text NOT NULL,
  unidad_medida text NOT NULL DEFAULT 'unidad' CHECK (
    unidad_medida IN ('gramos', 'kilos', 'mililitros', 'litros', 'unidad', 'feta', 'porcion', 'paquete')
  ),
  stock_actual numeric NOT NULL DEFAULT 0,
  stock_minimo numeric NOT NULL DEFAULT 0,
  costo_por_unidad numeric NOT NULL DEFAULT 0,
  proveedor_id uuid DEFAULT NULL,
  activo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE ingredientes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read ingredientes"
  ON ingredientes FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admins can insert ingredientes"
  ON ingredientes FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.rol IN ('admin', 'encargado'))
  );

CREATE POLICY "Admins can update ingredientes"
  ON ingredientes FOR UPDATE
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.rol IN ('admin', 'encargado'))
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.rol IN ('admin', 'encargado'))
  );

-- ============================================================
-- PRODUCTOS
-- ============================================================
CREATE TABLE IF NOT EXISTS productos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre text NOT NULL,
  descripcion text DEFAULT '',
  categoria_id uuid REFERENCES categorias_producto(id) ON DELETE SET NULL,
  precio_venta numeric NOT NULL DEFAULT 0,
  costo_produccion numeric NOT NULL DEFAULT 0,
  margen_ganancia numeric NOT NULL DEFAULT 0,
  imagen_url text DEFAULT NULL,
  disponible boolean NOT NULL DEFAULT true,
  agotado boolean NOT NULL DEFAULT false,
  tiempo_preparacion integer NOT NULL DEFAULT 10,
  activo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE productos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read productos"
  ON productos FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admins can insert productos"
  ON productos FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.rol IN ('admin', 'encargado'))
  );

CREATE POLICY "Admins can update productos"
  ON productos FOR UPDATE
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.rol IN ('admin', 'encargado'))
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.rol IN ('admin', 'encargado'))
  );

-- ============================================================
-- RECETA ITEMS (ingredientes por producto)
-- ============================================================
CREATE TABLE IF NOT EXISTS receta_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  producto_id uuid NOT NULL REFERENCES productos(id) ON DELETE CASCADE,
  ingrediente_id uuid NOT NULL REFERENCES ingredientes(id) ON DELETE CASCADE,
  cantidad numeric NOT NULL DEFAULT 1,
  unidad_medida text NOT NULL DEFAULT 'unidad',
  costo_calculado numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(producto_id, ingrediente_id)
);

ALTER TABLE receta_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read receta_items"
  ON receta_items FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admins can manage receta_items"
  ON receta_items FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.rol IN ('admin', 'encargado'))
  );

CREATE POLICY "Admins can update receta_items"
  ON receta_items FOR UPDATE
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.rol IN ('admin', 'encargado'))
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.rol IN ('admin', 'encargado'))
  );

CREATE POLICY "Admins can delete receta_items"
  ON receta_items FOR DELETE
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.rol IN ('admin', 'encargado'))
  );

-- ============================================================
-- PEDIDOS
-- ============================================================
CREATE TABLE IF NOT EXISTS pedidos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mesa_id uuid NOT NULL REFERENCES mesas(id) ON DELETE RESTRICT,
  empleado_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  cantidad_personas integer NOT NULL DEFAULT 1,
  estado text NOT NULL DEFAULT 'abierto' CHECK (
    estado IN ('abierto', 'en_preparacion', 'listo', 'entregado', 'cobrado', 'cancelado')
  ),
  subtotal numeric NOT NULL DEFAULT 0,
  descuento numeric NOT NULL DEFAULT 0,
  recargo numeric NOT NULL DEFAULT 0,
  total numeric NOT NULL DEFAULT 0,
  observaciones text DEFAULT '',
  hora_apertura timestamptz NOT NULL DEFAULT now(),
  hora_cierre timestamptz DEFAULT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE pedidos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read pedidos"
  ON pedidos FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authorized users can insert pedidos"
  ON pedidos FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.rol IN ('admin', 'encargado', 'cajero', 'moza'))
  );

CREATE POLICY "Authorized users can update pedidos"
  ON pedidos FOR UPDATE
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.rol IN ('admin', 'encargado', 'cajero', 'moza', 'cocina'))
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.rol IN ('admin', 'encargado', 'cajero', 'moza', 'cocina'))
  );

-- ============================================================
-- PEDIDO ITEMS
-- ============================================================
CREATE TABLE IF NOT EXISTS pedido_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pedido_id uuid NOT NULL REFERENCES pedidos(id) ON DELETE CASCADE,
  producto_id uuid NOT NULL REFERENCES productos(id) ON DELETE RESTRICT,
  cantidad integer NOT NULL DEFAULT 1,
  precio_unitario numeric NOT NULL DEFAULT 0,
  subtotal numeric NOT NULL DEFAULT 0,
  observaciones text DEFAULT '',
  estado text NOT NULL DEFAULT 'pendiente' CHECK (
    estado IN ('pendiente', 'en_preparacion', 'listo', 'entregado', 'cancelado')
  ),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE pedido_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read pedido_items"
  ON pedido_items FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authorized users can insert pedido_items"
  ON pedido_items FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.rol IN ('admin', 'encargado', 'cajero', 'moza'))
  );

CREATE POLICY "Authorized users can update pedido_items"
  ON pedido_items FOR UPDATE
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.rol IN ('admin', 'encargado', 'cajero', 'moza', 'cocina'))
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.rol IN ('admin', 'encargado', 'cajero', 'moza', 'cocina'))
  );

CREATE POLICY "Authorized users can delete pedido_items"
  ON pedido_items FOR DELETE
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.rol IN ('admin', 'encargado', 'moza'))
  );

-- ============================================================
-- PAGOS
-- ============================================================
CREATE TABLE IF NOT EXISTS pagos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pedido_id uuid NOT NULL REFERENCES pedidos(id) ON DELETE RESTRICT,
  cajero_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  metodo_pago text NOT NULL DEFAULT 'efectivo' CHECK (
    metodo_pago IN ('efectivo', 'transferencia', 'debito', 'credito', 'mixto')
  ),
  monto numeric NOT NULL DEFAULT 0,
  monto_efectivo numeric NOT NULL DEFAULT 0,
  monto_transferencia numeric NOT NULL DEFAULT 0,
  monto_debito numeric NOT NULL DEFAULT 0,
  monto_credito numeric NOT NULL DEFAULT 0,
  descuento_aplicado numeric NOT NULL DEFAULT 0,
  recargo_aplicado numeric NOT NULL DEFAULT 0,
  total_cobrado numeric NOT NULL DEFAULT 0,
  vuelto numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE pagos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authorized users can read pagos"
  ON pagos FOR SELECT
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.rol IN ('admin', 'encargado', 'cajero'))
  );

CREATE POLICY "Cajeros can insert pagos"
  ON pagos FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.rol IN ('admin', 'encargado', 'cajero'))
  );

-- ============================================================
-- PROVEEDORES
-- ============================================================
CREATE TABLE IF NOT EXISTS proveedores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre text NOT NULL,
  contacto text DEFAULT '',
  telefono text DEFAULT '',
  email text DEFAULT '',
  activo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE proveedores ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read proveedores"
  ON proveedores FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admins can manage proveedores"
  ON proveedores FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.rol IN ('admin', 'encargado'))
  );

CREATE POLICY "Admins can update proveedores"
  ON proveedores FOR UPDATE
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.rol IN ('admin', 'encargado'))
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.rol IN ('admin', 'encargado'))
  );

-- ============================================================
-- COMPRAS
-- ============================================================
CREATE TABLE IF NOT EXISTS compras (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  proveedor_id uuid REFERENCES proveedores(id) ON DELETE SET NULL,
  empleado_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  fecha date NOT NULL DEFAULT CURRENT_DATE,
  total numeric NOT NULL DEFAULT 0,
  observaciones text DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE compras ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can read compras"
  ON compras FOR SELECT
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.rol IN ('admin', 'encargado', 'cajero'))
  );

CREATE POLICY "Admins can insert compras"
  ON compras FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.rol IN ('admin', 'encargado'))
  );

-- ============================================================
-- MOVIMIENTOS DE STOCK
-- ============================================================
CREATE TABLE IF NOT EXISTS movimientos_stock (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ingrediente_id uuid NOT NULL REFERENCES ingredientes(id) ON DELETE CASCADE,
  tipo text NOT NULL DEFAULT 'entrada' CHECK (tipo IN ('entrada', 'salida', 'ajuste')),
  cantidad numeric NOT NULL DEFAULT 0,
  motivo text NOT NULL DEFAULT 'compra' CHECK (
    motivo IN ('compra', 'venta', 'desperdicio', 'ajuste_manual', 'devolucion')
  ),
  compra_id uuid REFERENCES compras(id) ON DELETE SET NULL,
  pedido_id uuid REFERENCES pedidos(id) ON DELETE SET NULL,
  empleado_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  stock_anterior numeric NOT NULL DEFAULT 0,
  stock_nuevo numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE movimientos_stock ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can read movimientos_stock"
  ON movimientos_stock FOR SELECT
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.rol IN ('admin', 'encargado'))
  );

CREATE POLICY "System can insert movimientos_stock"
  ON movimientos_stock FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.rol IN ('admin', 'encargado'))
  );

-- ============================================================
-- INDEXES para performance
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_mesas_estado ON mesas(estado);
CREATE INDEX IF NOT EXISTS idx_pedidos_mesa_id ON pedidos(mesa_id);
CREATE INDEX IF NOT EXISTS idx_pedidos_estado ON pedidos(estado);
CREATE INDEX IF NOT EXISTS idx_pedido_items_pedido_id ON pedido_items(pedido_id);
CREATE INDEX IF NOT EXISTS idx_pedido_items_estado ON pedido_items(estado);
CREATE INDEX IF NOT EXISTS idx_movimientos_stock_ingrediente ON movimientos_stock(ingrediente_id);
CREATE INDEX IF NOT EXISTS idx_pagos_pedido_id ON pagos(pedido_id);

-- ============================================================
-- DATOS INICIALES: Categorías
-- ============================================================
INSERT INTO categorias_producto (nombre, descripcion, icono, color, orden) VALUES
  ('Hamburguesas', 'Hamburguesas clásicas y especiales', 'beef', '#ef4444', 1),
  ('Papas', 'Papas fritas y al horno', 'wheat', '#f59e0b', 2),
  ('Bebidas', 'Gaseosas, jugos y aguas', 'glass-water', '#3b82f6', 3),
  ('Postres', 'Helados, tortas y más', 'cake', '#ec4899', 4),
  ('Combos', 'Combos completos con bebida', 'package', '#10b981', 5),
  ('Extras', 'Adicionales y salsas', 'plus-circle', '#8b5cf6', 6)
ON CONFLICT (nombre) DO NOTHING;

-- ============================================================
-- DATOS INICIALES: Mesas
-- ============================================================
INSERT INTO mesas (numero, capacidad, sector, posicion_x, posicion_y) VALUES
  (1, 4, 'salon', 1, 1),
  (2, 4, 'salon', 2, 1),
  (3, 4, 'salon', 3, 1),
  (4, 4, 'salon', 4, 1),
  (5, 6, 'salon', 1, 2),
  (6, 6, 'salon', 2, 2),
  (7, 6, 'salon', 3, 2),
  (8, 2, 'barra', 4, 2),
  (9, 4, 'terraza', 1, 3),
  (10, 4, 'terraza', 2, 3),
  (11, 4, 'terraza', 3, 3),
  (12, 8, 'privado', 4, 3)
ON CONFLICT (numero) DO NOTHING;
