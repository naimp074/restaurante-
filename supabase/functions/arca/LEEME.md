# Facturación electrónica con ARCA

Esta función pide el CAE a ARCA (servicios WSAA y WSFEv1). Corre en Supabase porque el certificado y su clave privada no pueden estar en el navegador.

## Cómo funciona

1. Se cobra como siempre. Si ARCA está caída, la venta no se frena.
2. Al imprimir o finalizar, la caja llama a `POST /emitir`. Repetir el pedido no factura dos veces.
3. La función toma un turno por CUIT, punto de venta y tipo, pide el último número y solicita el CAE.
4. Si ARCA no responde, el comprobante queda **pendiente** con su número guardado. Al reintentar, primero consulta si ARCA lo había autorizado.
5. Los pendientes y rechazados se resuelven en Ventas → Facturas.

El tipo sale solo: monotributo emite C; responsable inscripto emite A a inscriptos y monotributistas, y B al resto.

Al anular un cobro facturado se emite una nota de crédito. Sin nota autorizada, el cobro no se anula.

## Pasos para ponerlo en marcha

### 1. Aplicar la migración

Ejecutá `supabase/migrations/20261031000000_arca_facturacion.sql` en el SQL Editor de Supabase.

### 2. Sacar el certificado de homologación (prueba)

Estos comandos y los del paso 4 van en **Git Bash** (en PowerShell no está `openssl` y `$(cat ...)` rompe el certificado):

```bash
openssl genrsa -out arca.key 2048
MSYS_NO_PATHCONV=1 openssl req -new -key arca.key -subj "/C=AR/O=BurgerPOS/CN=burgerpos/serialNumber=CUIT 20111111112" -out arca.csr
```

Cambiá el CUIT por el tuyo, sin guiones. Sin `MSYS_NO_PATHCONV=1`, Git Bash cambia el texto de `-subj` y `openssl` falla. Con clave fiscal, en el servicio **WSASS – Autogestión Certificados Homologación**:

1. Creá el certificado pegando `arca.csr` y guardá el resultado como `arca.crt`.
2. Autorizá ese certificado para el servicio `wsfe`.

No subas `arca.key` a git ni la compartas.

### 3. Publicar la función

```bash
npx supabase login
npx supabase functions deploy arca --no-verify-jwt --use-api --project-ref mcjnthwcfyqbrgwdjwir
```

La función verifica la sesión del usuario por su cuenta.

### 4. Cargar los secretos

| Secreto | Valor |
| --- | --- |
| `ARCA_CERTIFICADO` | Contenido completo de `arca.crt` |
| `ARCA_CLAVE_PRIVADA` | Contenido completo de `arca.key` |
| `ARCA_AMBIENTE` | `homologacion` para pruebas, `produccion` para facturar de verdad |

```bash
npx supabase secrets set ARCA_CERTIFICADO="$(cat arca.crt)" ARCA_CLAVE_PRIVADA="$(cat arca.key)" ARCA_AMBIENTE=homologacion --project-ref mcjnthwcfyqbrgwdjwir
```

### 5. Configurar el local

En Configuración → Facturación ARCA, el admin carga los datos fiscales y activa "Facturar desde la caja".

### 6. Probar en homologación

Hacé un cobro y emití: Factura a consumidor final, Factura A si corresponde, nota de crédito y un reintento. Estos comprobantes salen marcados **PRUEBA: SIN VALIDEZ FISCAL**.

Antes de pasar a producción, verificá que el QR impreso abra la página de ARCA y confirmá los códigos con `FEParamGetCondicionIvaReceptor`.

### 7. Pasar a producción

1. Con tu contador, creá en ARCA un punto de venta para **Web Services** y cargalo en Configuración.
2. Generá un certificado en **Administración de Certificados Digitales** (el de homologación no sirve) y asocialo a `wsfe` en **Administrador de Relaciones**.
3. Actualizá los secretos y poné `ARCA_AMBIENTE=produccion`.
4. Publicá de nuevo la función.

## Si facturás para otros CUIT

**Con certificado propio (recomendado).** Cada empresa usa su CUIT en estos secretos y solo su local puede usarlos:

| Secreto | Valor |
| --- | --- |
| `ARCA_CERTIFICADO_<CUIT>` | Contenido de su `.crt` |
| `ARCA_CLAVE_PRIVADA_<CUIT>` | Contenido de su `.key` |
| `ARCA_AMBIENTE_<CUIT>` | `homologacion` o `produccion` (sin definir: `homologacion`) |
| `ARCA_LOCAL_<CUIT>` | `id` de su local en la tabla `locales` (sin definir: no puede facturar) |

Antes de activarla, verificala sin emitir nada: `node scripts/arca-consultar.cjs <nombre> <cuit>`. Lee `arca-<nombre>.crt` y `arca-<nombre>.key`, y deja el acceso de 12 horas en `arca-<nombre>.token.sql`: cargalo en el SQL Editor antes de usar la función.

**Con delegación.** Sin esos secretos se usan los generales: el contribuyente delega `wsfe` al CUIT dueño del certificado en Administrador de Relaciones y carga su CUIT en Configuración.

## Lo que no está hecho

- **Cuenta corriente y PedidosYa pagado en la app:** no se facturan automáticamente. Falta definir con el contador cuándo y cómo.
- **Varias alícuotas de IVA en una misma venta:** se usa una por local.
- **CAEA** (contingencia cuando ARCA está caída): los comprobantes quedan pendientes hasta que vuelva.
