# Integración con PedidosYa

Esta función es el "plugin" que PedidosYa (Delivery Hero) llama para mandar los pedidos al sistema. Sigue la documentación oficial de integración POS:

- Guía general: https://integrar.pedidosya.com/es/documentation/
- API que implementa esta función (Plugin API): https://integration-middleware.stg.restaurant-partners.com/apidocs/pos-plugin-api
- API que usa esta función para aceptar, rechazar, etc. (Middleware API): https://integration-middleware.stg.restaurant-partners.com/apidocs/pos-middleware-api

## Cómo funciona

1. PedidosYa manda el pedido a `POST /order/{remoteId}`, firmado con un JWT (HS512).
2. La función verifica la firma y busca a qué local corresponde el `remoteId` (tabla `pedidosya_locales`).
3. Guarda el pedido original (`pedidosya_pedidos`) y crea el pedido en `sync_registros`. Así aparece en vivo en el apartado Pedidos, en la Cocina y con aviso sonoro en todas las pantallas.
4. Desde el sistema se acepta o se rechaza. La función inicia sesión en PedidosYa (`/v2/login`) y llama a las URLs que vinieron con el pedido.
5. Si PedidosYa cancela el pedido, llama a `PUT /remoteId/{remoteId}/remoteOrder/{id}/posOrderStatus` y el pedido queda cancelado.

Si un pedido no se acepta ni se rechaza a tiempo (unos 15 minutos), PedidosYa lo cancela solo y puede pausar el local. Por eso el sistema suena hasta que alguien lo atiende.

## Pasos para ponerlo en marcha

### 1. Pedir el alta a PedidosYa

Se pide en https://integrar.pedidosya.com/es/ ("Comenzar"). Ellos piden:

- Una clave PGP pública. Con ella te mandan las credenciales cifradas por email (revisá el correo no deseado).
- **Base URL del plugin:** la dirección que muestra Configuración → PedidosYa. Tiene esta forma: `https://<tu-proyecto>.supabase.co/functions/v1/pedidosya`.
- **Remote ID:** un código para cada local (por ejemplo `BURGERPOS_CENTRO`). Es el mismo que se carga en Configuración → PedidosYa.
- El tipo de integración: **directa** (los pedidos se aceptan desde BurgerPOS, sin la tablet de PedidosYa).

Te entregan: usuario y clave de la integración, y un **secreto** para verificar los JWT. Primero dan acceso a un ambiente de prueba (staging) y después al de producción.

### 2. Aplicar la migración

Ejecutá `supabase/migrations/20261014000000_pedidosya.sql` en el SQL Editor de Supabase, igual que la migración anterior.

### 3. Publicar la función

Opción A, con la herramienta de Supabase:

```bash
npx supabase login
npx supabase link --project-ref <tu-proyecto>
npx supabase functions deploy pedidosya --no-verify-jwt
```

`--no-verify-jwt` es necesario: PedidosYa no tiene una sesión de Supabase. La función verifica igual la firma propia de PedidosYa y, para las acciones del sistema, la sesión del usuario.

Opción B, desde el panel: Edge Functions → Deploy a new function → nombre `pedidosya`. Hay que pegar los cuatro archivos (`index.ts`, `manejador.ts`, `mapeo.ts`, `jwt.ts`) y desactivar "Enforce JWT verification".

### 4. Cargar los secretos

En Edge Functions → Secrets (o con `npx supabase secrets set NOMBRE=valor`):

| Secreto | Valor |
| --- | --- |
| `PEDIDOSYA_SECRETO` | El secreto para verificar los JWT que te dio PedidosYa |
| `PEDIDOSYA_USUARIO` | Usuario de la integración |
| `PEDIDOSYA_CLAVE` | Clave de la integración |
| `PEDIDOSYA_API` | `https://integration-middleware.stg.restaurant-partners.com` para pruebas. En producción, la dirección que te indique PedidosYa |

### 5. Configurar el local en el sistema

En Configuración → PedidosYa, el admin carga el **Remote ID** y la **comisión %**.

Para que los productos descuenten stock, el **código externo** de cada producto en el menú de PedidosYa tiene que ser igual al **código** del producto en BurgerPOS. Si no coincide, el sistema lo busca por nombre. Si tampoco lo encuentra, el producto se cobra igual pero no descuenta stock, y la tarjeta del pedido lo avisa.

### 6. Probar

PedidosYa pide una prueba de punta a punta con su equipo: hacer pedidos desde un local de prueba, aceptar, rechazar y cancelar. Los pedidos de prueba aparecen con la etiqueta PRUEBA.

## La plata

- **Pagado en la app:** no entra en la caja del día. Al tocar "Finalizar pedido" se descuenta el stock y el importe menos la comisión queda en la cuenta **PedidosYa (a cobrar)**. Cuando PedidosYa liquida, se pasa a Banco con un traspaso (Gastos → Traspasos).
- **Se paga al retirar o al repartidor:** se cobra en Caja → Cobros, como una mesa.

## Lo que no está hecho

- **Subir el menú a PedidosYa** (Catalog / Menu Import): el menú se mantiene en el portal de PedidosYa.
- **Modificar productos de un pedido** después de aceptarlo.
- **Pausar el local desde el sistema** (Vendor Availability): los avisos de PedidosYa se reciben, pero no se muestran.
