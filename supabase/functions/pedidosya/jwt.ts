/**
 * PedidosYa firma cada llamada con un JWT (HS512) en el encabezado Authorization, usando
 * el secreto que entrega junto con las credenciales. Además el token debe traer el claim
 * `service: middleware`. Sin esto, cualquiera podría inyectar pedidos falsos.
 */

const base64UrlABytes = (texto: string) => {
  const base64 = texto.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(texto.length / 4) * 4, '=');
  const binario = atob(base64);
  return Uint8Array.from(binario, c => c.charCodeAt(0));
};

const iguales = (a: Uint8Array, b: Uint8Array) => {
  if (a.length !== b.length) return false;
  let diferencia = 0;
  for (let i = 0; i < a.length; i += 1) diferencia |= a[i] ^ b[i];
  return diferencia === 0;
};

export const verificarJwtMiddleware = async (encabezado: string | null, secreto: string, ahora = Date.now()) => {
  if (!secreto || !encabezado?.startsWith('Bearer ')) return false;
  const partes = encabezado.slice(7).trim().split('.');
  if (partes.length !== 3) return false;
  const [cabeceraB64, cuerpoB64, firmaB64] = partes;

  try {
    const cabecera = JSON.parse(new TextDecoder().decode(base64UrlABytes(cabeceraB64)));
    if (cabecera.alg !== 'HS512') return false;

    const clave = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(secreto),
      { name: 'HMAC', hash: 'SHA-512' },
      false,
      ['sign'],
    );
    const firma = new Uint8Array(await crypto.subtle.sign('HMAC', clave, new TextEncoder().encode(`${cabeceraB64}.${cuerpoB64}`)));
    if (!iguales(firma, base64UrlABytes(firmaB64))) return false;

    const cuerpo = JSON.parse(new TextDecoder().decode(base64UrlABytes(cuerpoB64)));
    if (cuerpo.service !== 'middleware') return false;
    if (typeof cuerpo.exp === 'number' && cuerpo.exp * 1000 < ahora) return false;
    return true;
  } catch {
    return false;
  }
};
