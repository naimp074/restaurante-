import type { Producto } from './types';
import { categoriasIniciales } from './mockData';

/** Nombre, precio y descripción. Precio null: la carta no se leía, queda sin vender hasta cargarlo. */
type ItemCarta = [nombre: string, precio: number | null, descripcion?: string];

const salsas = 'Salsas: chocolate, dulce de leche, frutilla, caramelo';
const sabores = 'Sabores: frutilla, vainilla, americana, chocolate, chocolate con almendras, granizado, dulce de leche, dulce de leche granizado, crema Oreo, cereza, banana split, chocotorta, frutos del bosque, tramontana, ananá, limón, durazno';

const carta: Record<string, ItemCarta[]> = {
  'cat-1': [
    ['Tradicional con tortillas', 4730, 'Tortillas, jugo de naranja y soda'],
    ['Tradicional con medialunas', 8800, 'Medialunas, jugo de naranja y soda'],
    ['Tradicional mixto', 4950, '1 tortilla, 1 medialuna, jugo de naranja y soda'],
    ['Light', 8800, 'Infusión a elección. Tostadas de pan blanco o integral, mermelada, queso untable, jugo de naranja, soda y ensalada de fruta'],
    ['De campo', 6600, 'Infusión a elección. Pan de campo, dulce de leche y manteca, jugo de naranja y soda'],
    ['Avocado', 8250, 'Infusión a elección. Tostada, palta, huevo revuelto, queso untable, ensalada de fruta, jugo y soda'],
    ['Proteico', 8250, 'Infusión a elección. Tostada de jamón y queso, huevo revuelto, ensalada de fruta, jugo y soda'],
    ['Delicioso', 8250, 'Infusión a elección. 2 churros y soda'],
    ['Fit', 8800, 'Infusión a elección. Panqueque de avena con fruta de estación, granola, miel, yogurt, jugo y soda'],
    ['Omelette', 8800, 'Huevos batidos y cocinados en una sartén con manteca o aceite, con queso derretido en su interior'],
    ['Bowl', 9000, 'Yogur griego, cremoso y refrescante que combina la textura espesa del yogur y dulzura natural de las frutas o puedes optar por granola'],
  ],
  'cat-2': [
    ['Café doble', 4400],
    ['Café en jarrita', 3850],
    ['Pocillo', 3500],
    ['Expreso', 3300],
    ['Americano', 4400],
    ['Macchiato', 4730],
    ['Café con leche', 4400],
    ['Lágrima', 4400],
    ['Latte', 4730],
    ['Capuccino', 5000],
    ['Café con caramelo', 4730],
    ['Submarino', 5000],
    ['Chocolatada fría', 5000],
    ['Chocolatada caliente', 4400],
    ['Té, tilo, boldo, saborizados', 3300],
    ['Mate cocido', 3300],
    ['Agrandá tu infusión', 1100],
    ['Ensalada de frutas', 5000],
    ['Vaso de yogurt con cereales', 5000],
  ],
  'cat-3': [
    ['Gaseosa 500 cc', 3300, 'Coca, Sprite, Fanta, Coca Zero, Pepsi, Seven Up, Mirinda, Manzana y agua saborizada'],
    ['Agua o soda 500 cc', 2750],
  ],
  'cat-4': [
    ['Helado 1 bocha', 3300, `Cucurucho o copa. ${sabores}`],
    ['Helado 2 bochas', 4070, `Cucurucho o copa. ${sabores}`],
    ['Helado 3 bochas', 5000, `Cucurucho o copa. ${sabores}`],
  ],
  'cat-5': [
    ['Promo calentito', 16000, '2 cafés con leche y tostado de jamón y queso'],
    ['Promo licuados', 16000, '2 vasos de licuado y tostado de jamón y queso'],
    ['Promo gaseosas', 15400, '2 vasos de gaseosa o jugo y tostado de jamón y queso'],
    ['Promo jugos', 15500, '2 vasos de jugo de naranja y 1 tostado de jamón y queso'],
    ['Promo apretado', 7700, '1 apretado a elección y 1 vaso de gaseosa'],
    ['Promo para compartir tostones', 22000, '3 tostones a elección y 2 vasos de gaseosa, jugo o limonada'],
    ['Promo tostón', 10000, '1 tostón a elección y 1 vaso de gaseosa, jugo o limonada'],
  ],
  'cat-6': [
    ['Agregado para wafle', 2000, 'Frutilla, arándanos, crema de leche, dulce de leche, nuez, chocolate, helado, banana, Nutella'],
  ],
  'cat-7': [
    ['Licuado de banana', 5200],
    ['Licuado de durazno', 5200],
    ['Licuado de ananá', 5200],
    ['Licuado de arándanos', 5200],
    ['Licuado de frutilla', 5200],
    ['Licuado Tutti', 13200, 'Banana, durazno, manzana, pera, naranja y ciruela'],
  ],
  'cat-8': [
    ['Tostado mixto jamón y queso', 8800],
    ['Sándwich especial pollo y verdura', 10450],
    ['Sándwich ternera y queso', 9900],
    ['Sándwich ternera, queso y tomate', 10450],
    ['Sándwich especial ternera y verdura', 10450],
    ['Triple salame y queso', 4400],
    ['Triple jamón y queso', 4400],
    ['Triple ternera y queso', 4400],
    ['Pebete jamón y queso', 4400],
    ['Pebete salame y queso', 4400],
    ['Pebete ternera y queso', 5000],
    ['Pebete ternera y verdura', 5000],
    ['Pebete pollo y queso', 5000],
    ['Picada chica', null],
    ['Picada grande', null],
  ],
  'cat-9': [
    ['Tostón opción 1', 6050, 'Palta, huevo revuelto, queso crema, tomatitos cherry y semillas'],
    ['Tostón opción 2', 6050, 'Huevo revuelto, bacon, palta, brote de soja y semillas'],
    ['Tostón opción 3', 6050, 'Huevo revuelto, jamón, queso, rúcula, palta y semillas'],
  ],
  'cat-10': [
    ['Medialuna', 880],
    ['Medialuna salada', 880],
    ['Medialuna con dulce de leche', 1100],
    ['Medialuna con jamón y queso fría o caliente', 2200],
    ['Tortilla', 770],
    ['Bollito', 770],
    ['Facturas', 1100],
    ['Panqueque de avena x 2', 3300],
    ['Tostadas', 770],
    ['Porción de budín inglés', 2750],
    ['Churro', null],
    ['Churro relleno de dulce de leche', null],
    ['Porción de torta', 3300],
    ['Porción de brownie', 4400],
  ],
  'cat-11': [
    ['Wafle Londres', 6050, 'Nutella, frutilla y crema batida'],
    ['Wafle Miami', 6050, 'Nutella, banana y nuez'],
    ['Wafle Amsterdam', 6050, 'Dulce de leche, banana y nuez'],
    ['Wafle Chicago', 6050, 'Nutella con galleta Oreo y crema de leche'],
    ['Wafle Bélgica', 6050, 'Banana, frutilla, Nutella y crema batida'],
    ['Wafle California', 6050, 'Dulce de leche, crema batida, frutilla y arándanos'],
    ['Wafle Islandia', 6050, 'Banana, chocolate y bocha de helado a elección'],
    ['Wafle sin agregados', 2000, salsas],
  ],
  'cat-12': [
    ['Jugo Refrescante', 5500, 'El jugo más refrescante. Naranja, frutilla, banana y vainilla'],
    ['Jugo Antigripal', 5500, 'Para subir las defensas. Jengibre, kiwi y naranja'],
    ['Jugo Energía', 5500, 'Para recargar las pilas. Manzana, ananá, albahaca, limón y naranja'],
    ['Jugo Antioxidante', 5500, 'Siempre joven. Hierbabuena, limón, arándano y naranja'],
    ['Jugo Citrón', 5500, 'Con un gran sabor a cítricos. Naranja, limón y menta'],
    ['Jugo Tropical', 5500, 'Como estar en el Caribe. Mango, naranja, coco y frutilla'],
  ],
  'cat-13': [
    ['Limonada (vaso)', 5500],
    ['Limonada (jarra)', 5500],
    ['Limonada menta y jengibre (vaso)', 5500],
    ['Limonada menta y jengibre (jarra)', 6050],
    ['Limonada frutos rojos (vaso)', 5500],
    ['Limonada frutos rojos (jarra)', 6050],
    ['Jugo de naranja (vaso)', 5500],
    ['Jugo de naranja (jarra)', 5500],
    ['Jugo de ananá', 11000],
    ['Jugo de durazno', 11000],
    ['Jugo de arándanos', 11000],
    ['Jugo de frutilla', 11000],
    ['Jugo de melón', 11000],
    ['Jugo de sandía', 11000],
    ['Jugo de mango', 11000],
    ['Jugo de kiwi', 11000],
  ],
  'cat-14': [
    ['Batido Oreo', 6050, salsas],
    ['Batido crocante', 6050, salsas],
    ['Batido Rocklets', 6050, salsas],
    ['Batido nuez', 6050, salsas],
    ['Batido chispas de chocolate', 6050, salsas],
  ],
};

/** Los ids son fijos: cargarla desde dos dispositivos no duplica nada. */
export const armarProductosCarta = (ahora = new Date().toISOString()): Producto[] =>
  Object.entries(carta)
    .flatMap(([categoriaId, items]) => items.map(item => ({ categoriaId, item })))
    .map(({ categoriaId, item: [nombre, precio, descripcion] }, index) => {
      const numero = String(index + 1).padStart(3, '0');
      return {
        id: `carta-${numero}`,
        codigo: `CARTA-${numero}`,
        nombre,
        descripcion: descripcion || '',
        categoria_id: categoriaId,
        precio_venta: precio ?? 0,
        costo_produccion: 0,
        margen_ganancia: 0,
        disponible: precio !== null,
        agotado: false,
        tiempo_preparacion: 10,
        activo: true,
        created_at: ahora,
        updated_at: ahora,
        categoria: categoriasIniciales.find(categoria => categoria.id === categoriaId),
        receta: [],
      };
    });

export const cartaYaCargada = (productos: Producto[]) => productos.some(producto => producto.id.startsWith('carta-'));
