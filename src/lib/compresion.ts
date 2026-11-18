/**
 * Compresión para lo que se guarda en el navegador (localStorage).
 *
 * localStorage tiene un límite por sitio: unos 5 millones de caracteres en la computadora y
 * bastante menos en el iPhone. Con las comandas y los cobros de unos pocos días el celular se
 * llenaba: no podía guardar lo que bajaba del servidor y se quedaba mostrando datos viejos.
 *
 * Es LZW con un diccionario de hasta 32.767 entradas, en un árbol (sin armar strings por cada
 * letra). Cada código ocupa un solo carácter, siempre fuera del rango de los "surrogates"
 * (0xD800-0xDFFF), que algunos navegadores no guardan bien. Un JSON de comandas queda entre 5 y
 * 15 veces más chico. No usa librerías externas.
 */

export const marcaComprimido = 'lzw1:';
const base = 0x20;
const limite = 0x7fff;

type Nodo = { codigo: number; hijos: Map<number, Nodo> };

const caracter = (n: number) => String.fromCharCode(base + n);

export const comprimir = (texto: string): string => {
  const raiz = new Map<number, Nodo>();
  const salida: string[] = [];
  let siguiente = 1;
  let actual: Nodo | null = null;

  for (let i = 0; i < texto.length; i += 1) {
    const c = texto.charCodeAt(i);
    if (!actual) {
      const nodo = raiz.get(c);
      if (nodo) { actual = nodo; continue; }
      // Letra nueva: va literal (código 0 + sus dos mitades) y entra al diccionario.
      salida.push(caracter(0), caracter(c >> 8), caracter(c & 0xff));
      if (siguiente < limite) raiz.set(c, { codigo: siguiente++, hijos: new Map() });
      continue;
    }
    const hijo = actual.hijos.get(c);
    if (hijo) { actual = hijo; continue; }
    salida.push(caracter(actual.codigo));
    const nodo = raiz.get(c);
    if (nodo) {
      // Lo emitido más esta letra pasa a ser una entrada nueva (el descompresor la arma igual).
      if (siguiente < limite) actual.hijos.set(c, { codigo: siguiente++, hijos: new Map() });
      actual = nodo;
      continue;
    }
    // Letra nueva después de algo emitido: no se extiende la entrada, va literal.
    actual = null;
    salida.push(caracter(0), caracter(c >> 8), caracter(c & 0xff));
    if (siguiente < limite) raiz.set(c, { codigo: siguiente++, hijos: new Map() });
  }
  if (actual) salida.push(caracter(actual.codigo));
  return marcaComprimido + salida.join('');
};

export const descomprimir = (comprimido: string): string => {
  if (!comprimido.startsWith(marcaComprimido)) return comprimido;
  const entradas: string[] = [''];
  const salida: string[] = [];
  let anterior: string | null = null;
  let i = marcaComprimido.length;
  const leer = () => comprimido.charCodeAt(i++) - base;

  while (i < comprimido.length) {
    const codigo = leer();
    let actual: string;
    if (codigo === 0) {
      actual = String.fromCharCode((leer() << 8) | leer());
      // La letra nueva entra al diccionario; la anterior no se extiende (el compresor cortó ahí).
      if (entradas.length < limite) entradas.push(actual);
      anterior = null;
      salida.push(actual);
      continue;
    }
    if (codigo < entradas.length) actual = entradas[codigo];
    else if (anterior !== null && codigo === entradas.length) actual = anterior + anterior[0];
    else throw new Error('Datos comprimidos dañados.');
    if (anterior !== null && entradas.length < limite) entradas.push(anterior + actual[0]);
    salida.push(actual);
    anterior = actual;
  }
  return salida.join('');
};
