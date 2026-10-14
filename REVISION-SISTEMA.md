Pedidos y PedidosYa — 14/10/2026

- Se agregó el apartado Ventas → Pedidos, con pedidos para llevar, delivery propio y PedidosYa. Pasan por la Cocina, y los que se cobran en el local se cobran en Caja → Cobros.
- PedidosYa entra solo, por la integración oficial de Delivery Hero (función `supabase/functions/pedidosya`). Los pedidos se aceptan y se rechazan desde el sistema, y un aviso sonoro se repite hasta que alguien los atiende.
- Lo pagado en la app no entra en la caja del día. Queda en la cuenta "PedidosYa (a cobrar)", ya descontada la comisión.
- Pasos pendientes: pedir el alta a PedidosYa, aplicar `20261014000000_pedidosya.sql`, publicar la función y cargar los secretos. El paso a paso está en `supabase/functions/pedidosya/LEEME.md`.
- Verificación: 82 pruebas (`npm test`, 20 de ellas de PedidosYa, una con el token de ejemplo de la documentación oficial) y 10 en Chrome (`npm run test:e2e`). No se probó contra PedidosYa real: hacen falta las credenciales que entregan ellos.

---

Mejoras — 13/10/2026

Pasos pendientes en Supabase (sin esto, la versión nueva no sincroniza):

1. Aplicar la migración `supabase/migrations/20261013000000_seguridad_y_sync_por_registro.sql` (SQL Editor o `supabase db push`).
2. En Authentication → Sign In / Providers, desactivar "Allow new users to sign up" si las cuentas las crea solo el administrador. Aunque quede activo, las cuentas nuevas ya no obtienen permisos hasta que un admin las aprueba.
3. Actualizar todos los dispositivos a la vez: los que queden con la versión anterior siguen escribiendo en la tabla vieja.

Seguridad:

- Antes, quien se registraba podía elegir su rol (incluso admin) y cualquier usuario podía cambiarse el rol desde su perfil. Ahora las cuentas nuevas quedan pendientes y solo un admin asigna rol, estado y local (Usuarios → Cuentas de acceso).
- Los permisos de escritura por rol se controlan en el servidor (`puede_escribir_registro`). Por ejemplo, una moza solo modifica mesas y comandas.
- Las cuentas nuevas ya no se asignan automáticamente al primer local.
- Cada pantalla controla el rol: escribir la dirección de una pantalla ajena lleva a la pantalla inicial.

Sincronización:

- Cada pedido, pago, movimiento, etc. viaja como un registro propio (`sync_registros`). Dos dispositivos que modifican registros distintos ya no se pisan. Si dos dispositivos editan el mismo registro, queda el último.
- Solo se suben los registros modificados, no la lista completa.
- La primera vez que un dispositivo con la versión nueva se conecta, migra los datos de `sync_documentos`.
- Al recuperar la conexión o volver a la pestaña, se piden los cambios perdidos.
- Los errores de sincronización ahora se muestran en el encabezado.

Otros cambios:

- IDs únicos entre dispositivos (`src/lib/ids.ts`), también por http en la red del local.
- Navegación con dirección (`#/caja`, `#/stock`...): recargar mantiene la pantalla y el botón atrás funciona.
- Cada pantalla, Excel, PDF y OCR se cargan solo cuando se usan. El archivo inicial pasó de 1,7 MB a 330 KB.
- `xlsx` se actualizó a 0.20.3 (oficial de SheetJS) y `pdfjs-dist` a 6.4 (falla de seguridad con PDF maliciosos). `npm audit --omit=dev`: 0 vulnerabilidades.
- Jornada comercial: hasta la hora de corte (por defecto 05:00, configurable en Configuración), lo vendido después de medianoche cuenta para el día anterior.
- App instalable (PWA): con https, el sistema abre sin conexión.
- Los movimientos de stock ya no guardan una copia del insumo, y el encabezado avisa cuando el almacenamiento del navegador supera el 80 %.

Verificación:

- `npm test`: 62 pruebas aprobadas, incluida la simulación de dos dispositivos con un Supabase falso.
- `npm run test:e2e`: 8 pruebas en Chrome real (todas las pantallas, permisos por rol, venta completa, funcionamiento sin conexión).
- `npm run typecheck`, `npm run lint` (queda la advertencia preexistente de AuthContext) y `npm run build`: aprobados.
- No se probó contra el Supabase real: la migración y la sincronización entre dispositivos reales requieren una prueba después del paso 1.

Pendiente:

- Dividir Stock.tsx (unas 2.900 líneas), Productos.tsx y Caja.tsx en componentes más chicos.
- Mover los datos de localStorage a IndexedDB si el aviso de espacio aparece seguido.
- El stock de un insumo es un número absoluto: si dos cajas descuentan el mismo insumo a la vez, queda el último valor. Los movimientos sí se registran completos.

---

Revisión del sistema — 16/09/2026

Se revisó el código de los flujos principales y se ejecutaron pruebas con almacenamiento en memoria, sin modificar datos del negocio. Esta revisión no equivale a una prueba completa en producción.

Correcciones realizadas:

- Stock escucha cambios del catálogo, movimientos y producciones. Entrar a la pantalla ya no vuelve a guardar una copia antigua o vacía.
- Compras, pagos a proveedores y cobros habituales agrupan las escrituras locales. Ante un fallo de almacenamiento se restauran los valores anteriores; los avisos y la cola de sincronización se procesan al completar la operación.
- Los pagos a proveedores rechazan montos inválidos, cuentas inexistentes, facturas de otro proveedor y pagos superiores al saldo pendiente.
- Los gastos descuentan correctamente el efectivo, incluso cuando usan parte del fondo inicial de caja.
- El arrastre automático de caja no se repite cuando una pantalla vuelve a leer los saldos durante las notificaciones.
- Las compras recalculan costos y márgenes de productos tanto ante aumentos como ante bajas, sin modificar automáticamente sus precios de venta.
- El cobro comprueba que la comanda y la caja sigan abiertas, que el pedido no haya cambiado y que los importes sean válidos.
- La apertura de caja rechaza importes negativos, evita abrir una segunda caja del día y guarda conjuntamente el fondo inicial y el traspaso.

Resultados:

- `npm test`: 34 pruebas aprobadas. Incluyen cuenta corriente, compras, pagos parciales, reversión ante fallos, traspasos, estados de mesas, recetas, preparaciones y porcentajes de listas.
- `npm run typecheck`: aprobado.
- `npm run lint`: sin errores; queda una advertencia preexistente de Fast Refresh en AuthContext.tsx.
- `npm run build`: aprobado. Persisten avisos sobre tamaño del archivo JavaScript y datos de Browserslist desactualizados.
- `git diff --check`: aprobado.

Límites y comprobaciones pendientes:

- No se pudo conectar el navegador integrado: falló antes de abrir una página por un error de configuración de la herramienta (`sandboxPolicy`). No se verificaron visualmente las pantallas, navegación, impresión, cámara, OCR ni importación de archivos desde la interfaz.
- No se probó el inicio de sesión real, las políticas de Supabase ni la sincronización entre dispositivos conectados. Las pruebas de guardado y reversión son locales; no garantizan una transacción distribuida entre varios dispositivos.
- Los flujos de interfaz modificados requieren una prueba de uso en navegador: seleccionar mesa, agregar y enviar productos, cobrar, registrar compra y revisar Pagos y listas.

Para repetir las comprobaciones locales: `npm test`, `npm run typecheck`, `npm run lint` y `npm run build`.
