import type { Producto } from './types';
import { categoriasIniciales } from './mockData';

type ItemCarta = [nombre: string, precio: number, descripcion?: string];

const inclusoEnPastas = 'Incluye salsa roja, blanca y mixta';

/** Una porción y dos porciones se venden como productos separados. */
const dosPorciones = (nombre: string, una: number, dos: number): ItemCarta[] => [
  [`${nombre} (1 porción)`, una],
  [`${nombre} (2 porciones)`, dos],
];

const carta: ItemCarta[] = [
  // Entradas
  ['Empanadas', 3000, 'Pollo, carne, jamón y queso, humita'],
  ['Chorizo', 5000],
  ['Morcilla', 5000],
  ['Molleja', 15000],
  ['Provoleta', 9000, 'Sola o al orégano'],
  ['Revuelto gramajo', 15000, 'Papas, huevo, jamón, cebolla, morrón y perejil'],
  ['Debresina con puré', 15000],
  // Cerdo
  ['Matambre de cerdo', 27000],
  ['Matambre de cerdo al provenzal', 29000],
  ['Matambre de cerdo a la mostaza', 29000],
  ['Costilla de cerdo con barbacoa', 29000],
  ['Costeleta de cerdo', 23000],
  ['Carré de cerdo con barbacoa', 29000],
  ['Carré de cerdo a la portuguesa', 29000],
  ['Carré de cerdo al champiñón', 29000],
  ['Carré de cerdo a la mostaza', 29000],
  ['Carré de cerdo a la provenzal', 29000],
  // Pollo
  ['Suprema', 19000],
  ['Suprema napolitana', 23000],
  ['Suprema al verdeo', 23000],
  ['Suprema a la Kiev', 28000],
  ['Pamplona con papas a la crema', 28000],
  ['Pinchos de pollo y verdura', 28000],
  ['Pechuga deshuesada', 19000],
  ['Pechuga a la pimienta', 23000],
  ['Pechuga al champiñón', 23000],
  ['Pechuga al roquefort', 25000],
  ['Pechuga a la provenzal', 23000],
  ['Pechuga a la portuguesa', 23000],
  ['Pechuga con crema de cebolla', 23000],
  ['Pata muslo', 19000],
  // Carnes
  ...dosPorciones('Tira de asado', 25000, 45000),
  ['Picana', 33000],
  ['Bife de chorizo', 31000],
  ['Pinchos de carne y verduras', 30000],
  ['Lomo al verdeo', 27000],
  ['Lomo a la pimienta', 27000],
  ['Lomo al champiñón', 28000],
  ['Lomo a la portuguesa', 27000],
  ['Lomo al roquefort', 29000],
  ...dosPorciones('Matambre al verdeo', 25000, 45000),
  ...dosPorciones('Matambre a la portuguesa', 25000, 45000),
  ...dosPorciones('Matambre a la pizza', 25000, 45000),
  ...dosPorciones('Matambre al roquefort', 25000, 45000),
  ...dosPorciones('Matambre con crema de cebolla', 25000, 45000),
  ...dosPorciones('Milanesa', 22000, 40000),
  ...dosPorciones('Milanesa napolitana', 25000, 45000),
  ...dosPorciones('Milanesa al verdeo', 25000, 45000),
  ...dosPorciones('Milanesa a la suiza', 25000, 45000),
  ...dosPorciones('Milanesa con crema de cebolla', 25000, 45000),
  // Guarniciones
  ['Papas fritas', 7000],
  ['Papas a la provenzal', 8000],
  ['Papas con huevo revuelto', 10000],
  ['Puré de papas', 7000],
  ['Puré de calabaza', 7000],
  ['Puré mixto', 8000],
  ['Arroz blanco', 7000],
  ['Arroz primavera', 8000],
  ['Fideos simples', 3000],
  // Pastas
  ['Espaguetis', 17000, inclusoEnPastas],
  ['Tallarines', 17000, inclusoEnPastas],
  ['Tallarines al pesto', 17000, inclusoEnPastas],
  ['Ñoquis', 17000, inclusoEnPastas],
  ['Lasaña', 20000, inclusoEnPastas],
  ['Ravioles', 18000, `Verdura y carne, verdura y pollo, ricota. ${inclusoEnPastas}`],
  ['Sorrentinos', 18000, `Jamón y queso, ricota y jamón, calabaza, espinaca y ricota. ${inclusoEnPastas}`],
  ['Canelones', 20000, `Verdura y pollo, verdura y carne, choclo. ${inclusoEnPastas}`],
  ['Fideos al pesto', 20000, `Albahaca fresca, nueces, queso parmesano, un toque de ajo y aceite de oliva. ${inclusoEnPastas}`],
  // Salsas
  ['Salsa boloñesa', 5000],
  ['Salsa cuatro quesos', 7000],
  ['Salsa roquefort', 7000],
  ['Salsa puerro al vino', 7000],
  ['Salsa parisienne', 6000, 'Salsa blanca, crema de leche, dados de ave, jamón cocido en tiritas y champiñones (opcional)'],
  // Pizzas
  ['Pizza común', 15000],
  ['Pizza especial', 18000],
  ['Pizza fugazzeta', 18000],
  ['Pizza rúcula', 18000],
  ['Pizza ternera', 18000],
  ['Pizza calabresa', 21000],
  ['Pizza napolitana', 18000],
  ['Pizza cuatro quesos', 22000],
  // Ensaladas
  ['Ensalada César', 15000, 'Lechuga, crutones, pollo, queso parmesano rallado y su característico aderezo'],
  ['Ensalada mixta', 6000, 'Lechuga, tomate, cebolla'],
  ['Ensalada mixta especial', 8000, 'Lechuga, tomate, cebolla, zanahoria y huevo'],
  ['Ensalada rúcula y parmesano', 10000],
  ['Ensalada Waldorf', 12000, 'Manzana verde, apio, nueces'],
  ['Agregado de ensalada a elección', 2000, 'Lechuga, tomate, zanahoria, cebolla, choclo, remolacha, huevo, arveja, palmito, papa, aderezo'],
  // Wok
  ['Wok de pollo', 18000],
  ['Wok de carne', 18000],
  ['Arroz oriental', 17000],
  // Tortillas
  ['Tortilla de papa', 13000],
  ['Tortilla española', 16000],
  ['Tortilla de espinaca', 13000],
  ['Omelette de queso', 12000],
  ['Omelette de jamón y queso', 13000],
  ['Omelette de tomate y queso', 13000],
  // Sándwiches calientes
  ['Sándwich de milanesa', 15000],
  ['Sándwich de milanesa especial', 19000],
  ['Sándwich de lomito', 16000],
  ['Sándwich de lomito especial', 20000],
  ['Hamburguesa', 10000],
  ['Hamburguesa cheddar', 12000],
  ['Hamburguesa bacon, jamón y queso', 12000],
  ['Nuggets', 12000],
  ['Menú infantil', 15000],
  // Sándwiches fríos de pan de miga
  ['Miga jamón y queso', 12000],
  ['Miga ternera y queso', 12000],
  ['Miga ternera y verdura', 13000],
  ['Miga jamón crudo y queso', 14000],
  ['Miga pollo y verdura', 13000],
  // Pan baguette
  ['Baguette jamón y queso', 12000],
  ['Baguette ternera y queso', 12000],
  ['Baguette ternera y verdura', 13000],
  ['Baguette jamón crudo y queso', 14000],
  ['Baguette pollo y verdura', 13000],
  ['Baguette cantimpalo y queso', 13000],
  // Tartas
  ['Tarta jamón y queso', 13000],
  ['Tarta pollo y puerro', 13000],
  ['Tarta verduras', 13000],
  ['Tarta verdura y pollo', 13000],
  ['Tarta choclo', 13000],
  ['Tarta jamón, queso y cebolla', 13000],
  // Regionales
  ['Humita al plato', 18000],
  // Platos frescos
  ['Matambre arrollado', 16000],
  ['Tomate relleno', 12000],
  ['Mayonesa de ave', 15000],
  ['Mayonesa de atún', 15000],
  ['Salpicón de ave', 15000],
  ['Salpicón de carne', 15000],
  // Postres
  ['Tiramisú', 10000],
  ['Brownie con helado', 12000],
  ['Cayote con nuez', 12000],
  ['Queso y dulce de batata', 7000],
  ['Budín de pan', 7000],
  ['Flan de leche condensada', 10000],
  ['Durazno al almíbar', 7000],
  ['Ensalada de frutas (postre)', 7000],
  ['Postre Danette casero', 7000],
  ['Panqueque con dulce de leche', 9000],
  ['Panqueque de banana o manzana', 10000],
  ['Chocotorta (porción)', 10000],
  ['Bocha de helado variado', 3000],
  ['Bombón suizo', 6000],
  ['Prestigio de coco', 3000],
  // Bebidas
  ['Coca-Cola 350 cc', 4000],
  ['Coca-Cola 1 L', 8000],
  ['Agua con y sin gas 600 cc', 4000],
  ['Agua saborizada 500 cc', 4000],
  ['Limonada jarra - restaurante', 8000, 'Exprimida en el momento'],
  ['Limonada con menta y jengibre jarra - restaurante', 10000],
  ['Limonada con frutos rojos jarra - restaurante', 10000],
  // Tragos
  ['Gin Tonic', 7500, 'Gin Beefeater y agua tónica'],
  ['Gancia Batido', 7000, 'Gancia, jugo de limón y azúcar'],
  ['Garibaldi', 7000, 'Campari y jugo de naranja'],
  ['Aperol Spritz', 7500, 'Aperol y vino espumante'],
  ['Ramazzotti Spritz', 7500, 'Ramazzotti con vino espumante'],
  ['Ramazzotti tonic', 6500, 'Ramazzotti con agua tónica'],
  ['Vermut', 7000, 'Vermut Rosso con soda'],
  ['Negroni', 7500, 'Gin, Campari y Vermut Rosso'],
  ['Fernet Cola', 7500, 'Fernet Branca y gaseosa'],
  ['Johnnie Walker', 9000, 'Red label'],
  // Vinos blancos
  ['Torrontés. El Esteco, Cafayate', 3000, 'Vino blanco'],
  ['Sauvignon Blanc. Santa Julia Reserva', 3000, 'Vino blanco'],
  ['Chardonnay sin madera. Álamos', 3000, 'Vino blanco'],
  ['Chardonnay con madera. D.V. Catena', 3000, 'Vino blanco'],
  // Vinos tintos
  ['Pinot Noir Humberto Canale Reserva', 3000, 'Vino tinto'],
  ['Malbec joven Portillo', 3000, 'Vino tinto'],
  ['Malbec accesible. Los Intocables', 3000, 'Vino tinto'],
  ['Bonarda Trivento Reserve', 3000, 'Vino tinto'],
  ['Malbec clásico. Rutini', 3000, 'Vino tinto'],
  ['Malbec reserva Luigi Bosca', 3000, 'Vino tinto'],
  ['Malbec alta gama. Angélica Zapata Alta', 3000, 'Vino tinto'],
  ['Cabernet Sauvignon Salentein Reserva', 3000, 'Vino tinto'],
  ['Cabernet Franc. El Enemigo', 3000, 'Vino tinto'],
  ['Merlot Fin del Mundo Postales', 3000, 'Vino tinto'],
  ['Red Blend Luigi Bosca De Sangre', 3000, 'Vino tinto'],
  ['Blend de altura Amalaya Corte Único', 3000, 'Vino tinto'],
  // Vinos rosados
  ['Rosado de Malbec Kaiken Rosé', 3000, 'Vino rosado'],
  ['Rosado blend - Santa Julia Innovación', 3000, 'Vino rosado'],
  // Espumantes
  ['Extra Brut Chandon', 3000, 'Espumante'],
  ['Brut Nature Rutini', 3000, 'Espumante'],
];

const categoria = categoriasIniciales.find(item => item.id === 's-restaurante');

/** Los ids son fijos: cargarla desde dos dispositivos no duplica nada. */
export const armarCartaRestaurante = (ahora = new Date().toISOString()): Producto[] =>
  carta.map(([nombre, precio, descripcion], indice) => {
    const numero = String(indice + 1).padStart(3, '0');
    return {
      id: `rest-${numero}`,
      codigo: `REST-${numero}`,
      nombre,
      descripcion: descripcion || '',
      categoria_id: categoria?.id,
      categoria,
      precio_venta: precio,
      costo_produccion: 0,
      margen_ganancia: 0,
      disponible: true,
      agotado: false,
      tiempo_preparacion: 10,
      activo: true,
      created_at: ahora,
      updated_at: ahora,
      receta: [],
    };
  });

export const cartaRestauranteCargada = (productos: Producto[]) => productos.some(producto => producto.id.startsWith('rest-'));

/** Suma la carta a lo que ya hay: no borra ni cambia ningún producto existente. */
export const agregarCartaRestaurante = (productos: Producto[], ahora?: string): Producto[] => {
  const existentes = new Set(productos.map(producto => producto.id));
  return [...productos, ...armarCartaRestaurante(ahora).filter(producto => !existentes.has(producto.id))];
};
