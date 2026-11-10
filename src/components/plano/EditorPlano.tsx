import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Check, Copy, Grid3x3, LayoutGrid, Map as MapaIcono, Plus, RotateCcw, RotateCw, Shapes, Trash2, Undo2, X,
} from 'lucide-react';
import { loadDemoPedidos } from '../../lib/demoStore';
import { estadoMesaConfig } from '../../lib/estadoMesa';
import { nuevoId } from '../../lib/ids';
import {
  crearMesa,
  loadMesas,
  loadSectores,
  mesaTienePedidoAbierto,
  saveMesas,
  saveSectores,
  siguienteNumeroMesa,
  type SectorOption,
} from '../../lib/mesasStore';
import {
  analizarPlantilla,
  elementosDePlantilla,
  elementosDisponibles,
  layoutNuevo,
  layoutValido,
  limitar,
  medidasPorForma,
  mismoLayout,
  MINIMO_ELEMENTO,
  MINIMO_MESA,
  nombresForma,
  normalizarRotacion,
  planoValido,
  reorganizarEnGrilla,
  ubicarSinLugar,
  type AnalisisPlantilla,
  type PlantillaPlano,
} from '../../lib/planoMesas';
import { plantillasPlano } from '../../lib/plantillasPlano';
import { withStoreTransaction } from '../../lib/storeSync';
import type { ElementoPlano, FormaMesa, Mesa, Pedido, PlanoMesa, PlanoSector, Sector } from '../../lib/types';
import { armarMesaEnPlano, nombreDeMesa } from './datosPlano';
import PlanoInteractivo, { type SeleccionPlano } from './PlanoInteractivo';

type Props = {
  sector: SectorOption;
  /** Todas las mesas del local, en vivo: mientras se edita siguen cambiando de estado. */
  mesas: Mesa[];
  pedidos: Pedido[];
  onSalir: () => void;
};

/** Lo que se toca en el editor. Nada se guarda hasta "Guardar plano". */
type Borrador = {
  plano: PlanoSector;
  layouts: Record<string, PlanoMesa>;
  nuevas: Mesa[];
  /** Mesas de otro apartado que la plantilla trajo a este. */
  traidas: string[];
  eliminadas: string[];
};

const PASO_GRILLA = 20;
const conTexto = new Set<ElementoPlano['tipo']>(['ingreso', 'cocina', 'bano', 'barra', 'zona', 'etiqueta']);
const formas: FormaMesa[] = ['cuadrada', 'rectangular', 'redonda', 'box', 'alta'];

const Numero = ({ label, value, min, max, onChange }: { label: string; value: number; min: number; max: number; onChange: (v: number) => void }) => (
  <label className="block">
    <span className="mb-1 block text-xs font-medium text-slate-600">{label}</span>
    <div className="flex items-center gap-2">
      <input type="range" min={min} max={max} value={Math.round(value)} onChange={e => onChange(Number(e.target.value))} className="w-full accent-amber-500" />
      <input
        type="number"
        min={min}
        max={max}
        value={Math.round(value)}
        onChange={e => onChange(limitar(Number(e.target.value) || min, min, max))}
        className="w-16 rounded-lg border border-slate-200 px-2 py-1 text-xs text-slate-700 outline-none focus:border-amber-400"
      />
    </div>
  </label>
);

export default function EditorPlano({ sector, mesas, pedidos, onSalir }: Props) {
  const [borrador, setBorrador] = useState<Borrador>(() => {
    const plano = planoValido(sector.plano);
    const delSector = mesas.filter(mesa => mesa.sector === sector.id);
    const ubicadas = delSector.filter(mesa => layoutValido(mesa.plano));
    const layouts: Record<string, PlanoMesa> = Object.fromEntries(ubicadas.map(mesa => [mesa.id, mesa.plano as PlanoMesa]));
    ubicarSinLugar(delSector.filter(mesa => !layoutValido(mesa.plano)), plano, [...Object.values(layouts), ...plano.elementos])
      .forEach((layout, id) => { layouts[id] = layout; });
    return { plano, layouts, nuevas: [], traidas: [], eliminadas: [] };
  });
  const [historial, setHistorial] = useState<Borrador[]>([]);
  const [seleccion, setSeleccion] = useState<SeleccionPlano>(null);
  const [grilla, setGrilla] = useState(true);
  const [menuElementos, setMenuElementos] = useState(false);
  const [plantilla, setPlantilla] = useState<PlantillaPlano | null>(null);
  const [eligiendoPlantilla, setEligiendoPlantilla] = useState(false);
  const [traerOtras, setTraerOtras] = useState(false);
  const [crearFaltantes, setCrearFaltantes] = useState(false);
  const arrastrando = useRef(false);
  const ahora = Date.now();

  // El borrador también vive en una ref: un arrastre manda varios cambios antes de volver a dibujar.
  const borradorRef = useRef(borrador);
  borradorRef.current = borrador;

  /** Cada cambio guarda el paso anterior para poder deshacer. */
  const cambiar = (fn: (b: Borrador) => Borrador, registrar = true) => {
    const actual = borradorRef.current;
    const siguiente = fn(actual);
    borradorRef.current = siguiente;
    if (registrar) setHistorial(h => [...h.slice(-49), actual]);
    setBorrador(siguiente);
  };

  const deshacer = () => {
    if (!historial.length) return;
    const previo = historial[historial.length - 1];
    borradorRef.current = previo;
    setBorrador(previo);
    setHistorial(historial.slice(0, -1));
  };

  const { plano, layouts, nuevas, traidas, eliminadas } = borrador;

  const visibles = useMemo(() => [
    ...mesas.filter(mesa => (mesa.sector === sector.id || traidas.includes(mesa.id)) && !eliminadas.includes(mesa.id)),
    ...nuevas,
  ], [mesas, sector.id, traidas, eliminadas, nuevas]);

  // Una mesa que crearon desde otra pantalla mientras se editaba también aparece.
  const layoutsCompletos = useMemo(() => {
    const faltan = visibles.filter(mesa => !layouts[mesa.id]);
    const todos = new Map(Object.entries(layouts));
    if (faltan.length) {
      ubicarSinLugar(faltan, plano, [...Object.values(layouts), ...plano.elementos]).forEach((layout, id) => todos.set(id, layout));
    }
    return todos;
  }, [visibles, layouts, plano]);

  const enPlano = visibles.map(mesa => armarMesaEnPlano(mesa, layoutsCompletos.get(mesa.id)!, pedidos, ahora));

  const mesaSeleccionada = seleccion?.tipo === 'mesa' ? visibles.find(mesa => mesa.id === seleccion.id) : undefined;
  const layoutSeleccionado = mesaSeleccionada ? layoutsCompletos.get(mesaSeleccionada.id) : undefined;
  const elementoSeleccionado = seleccion?.tipo === 'elemento' ? plano.elementos.find(el => el.id === seleccion.id) : undefined;

  const cambiarLayout = (id: string, layout: PlanoMesa, registrar = true) =>
    cambiar(b => ({ ...b, layouts: { ...b.layouts, [id]: layout } }), registrar);

  const cambiarElemento = (id: string, elemento: ElementoPlano, registrar = true) =>
    cambiar(b => ({ ...b, plano: { ...b.plano, elementos: b.plano.elementos.map(el => (el.id === id ? elemento : el)) } }), registrar);

  // Un arrastre entero es un solo paso de deshacer.
  const alArrastrar = <T,>(aplicar: (registrar: boolean) => T) => {
    const registrar = !arrastrando.current;
    arrastrando.current = true;
    return aplicar(registrar);
  };

  const agregarMesa = () => {
    const numero = siguienteNumeroMesa([...loadMesas(), ...nuevas]);
    const ocupados = [...layoutsCompletos.values(), ...plano.elementos.filter(el => el.tipo !== 'zona' && el.tipo !== 'etiqueta')];
    const mesa = crearMesa(numero, sector.id);
    const layout = ubicarSinLugar([mesa], plano, ocupados).get(mesa.id) ?? layoutNuevo('cuadrada', plano.ancho / 2, plano.alto / 2);
    cambiar(b => ({ ...b, nuevas: [...b.nuevas, mesa], layouts: { ...b.layouts, [mesa.id]: layout } }));
    setSeleccion({ tipo: 'mesa', id: mesa.id });
  };

  const eliminarMesa = (mesa: Mesa) => {
    const esNueva = nuevas.some(n => n.id === mesa.id);
    if (!esNueva && mesaTienePedidoAbierto(mesa.id, loadDemoPedidos())) {
      window.alert('No se puede borrar: hay una comanda abierta en esta mesa.');
      return;
    }
    if (!window.confirm(`¿Querés borrar ${nombreDeMesa(mesa)}? Se borra del sistema al guardar el plano.`)) return;
    cambiar(b => (esNueva
      ? { ...b, nuevas: b.nuevas.filter(n => n.id !== mesa.id) }
      : { ...b, eliminadas: [...b.eliminadas, mesa.id] }));
    setSeleccion(null);
  };

  const agregarElemento = (tipo: ElementoPlano['tipo']) => {
    const modelo = elementosDisponibles.find(el => el.tipo === tipo)!;
    const elemento: ElementoPlano = {
      id: nuevoId('elemento'),
      tipo,
      x: plano.ancho / 2,
      y: plano.alto / 2,
      ancho: modelo.ancho,
      alto: modelo.alto,
      rotacion: 0,
      texto: modelo.texto,
    };
    cambiar(b => ({ ...b, plano: { ...b.plano, elementos: [...b.plano.elementos, elemento] } }));
    setSeleccion({ tipo: 'elemento', id: elemento.id });
    setMenuElementos(false);
  };

  const duplicarElemento = (elemento: ElementoPlano) => {
    const copia = { ...elemento, id: nuevoId('elemento'), x: limitar(elemento.x + 30, 0, plano.ancho), y: limitar(elemento.y + 30, 0, plano.alto) };
    cambiar(b => ({ ...b, plano: { ...b.plano, elementos: [...b.plano.elementos, copia] } }));
    setSeleccion({ tipo: 'elemento', id: copia.id });
  };

  const quitarElemento = (id: string) => {
    cambiar(b => ({ ...b, plano: { ...b.plano, elementos: b.plano.elementos.filter(el => el.id !== id) } }));
    setSeleccion(null);
  };

  const reorganizar = () => {
    if (!window.confirm('Se van a acomodar todas las mesas de este apartado en una grilla, por número. Las paredes y demás elementos quedan como están. ¿Seguimos?')) return;
    const grillaNueva = reorganizarEnGrilla(visibles, plano);
    cambiar(b => ({ ...b, layouts: { ...b.layouts, ...Object.fromEntries(grillaNueva) } }));
  };

  // Para analizar una plantilla se miran las mesas como quedarían con el borrador actual.
  const mesasConBorrador = useMemo(() => [
    ...mesas
      .filter(mesa => !eliminadas.includes(mesa.id))
      .map(mesa => (traidas.includes(mesa.id) ? { ...mesa, sector: sector.id as Sector } : mesa)),
    ...nuevas,
  ], [mesas, eliminadas, traidas, nuevas, sector.id]);

  const analisis: AnalisisPlantilla | null = plantilla ? analizarPlantilla(plantilla, sector.id, mesasConBorrador) : null;

  const aplicarPlantilla = () => {
    if (!plantilla || !analisis) return;
    const planoNuevo: PlanoSector = {
      ancho: plantilla.ancho,
      alto: plantilla.alto,
      elementos: elementosDePlantilla(plantilla, () => nuevoId('elemento')),
    };
    const layoutsNuevos: Record<string, PlanoMesa> = {};
    analisis.enSector.forEach(({ mesa, layout }) => { layoutsNuevos[mesa.id] = layout; });
    const traidasNuevas = traerOtras ? analisis.enOtroSector.map(({ mesa }) => mesa.id) : [];
    if (traerOtras) analisis.enOtroSector.forEach(({ mesa, layout }) => { layoutsNuevos[mesa.id] = layout; });

    const creadas: Mesa[] = [];
    if (crearFaltantes) {
      let proximo = siguienteNumeroMesa([...loadMesas(), ...nuevas]);
      analisis.faltantes.forEach(({ ref, capacidad, ...layout }) => {
        const mesa = typeof ref === 'number'
          ? crearMesa(ref, sector.id, { capacidad: capacidad ?? 4 })
          : crearMesa(proximo++, sector.id, { nombre: ref, capacidad: capacidad ?? 4 });
        creadas.push(mesa);
        layoutsNuevos[mesa.id] = layout;
      });
    }

    // Las del apartado que la plantilla no nombra van a un hueco libre: no se pierde ninguna.
    const ocupados = [...Object.values(layoutsNuevos), ...planoNuevo.elementos.filter(el => el.tipo !== 'zona' && el.tipo !== 'etiqueta')];
    ubicarSinLugar(analisis.sobrantes, planoNuevo, ocupados).forEach((layout, id) => { layoutsNuevos[id] = layout; });

    cambiar(b => ({
      ...b,
      plano: planoNuevo,
      layouts: { ...b.layouts, ...layoutsNuevos },
      nuevas: [...b.nuevas, ...creadas],
      traidas: [...new Set([...b.traidas, ...traidasNuevas])],
    }));
    setPlantilla(null);
    setEligiendoPlantilla(false);
    setSeleccion(null);
  };

  const hayCambios = historial.length > 0;

  const cancelar = () => {
    if (hayCambios && !window.confirm('Hay cambios sin guardar en el plano. ¿Salir sin guardarlos?')) return;
    onSalir();
  };

  const guardar = () => {
    const momento = new Date().toISOString();
    const pedidosActuales = loadDemoPedidos();
    // Una comanda pudo abrirse mientras se editaba: esa mesa no se borra.
    const bloqueadas = eliminadas.filter(id => mesaTienePedidoAbierto(id, pedidosActuales));
    const borrar = new Set(eliminadas.filter(id => !bloqueadas.includes(id)));

    withStoreTransaction(() => {
      const actuales = loadMesas();
      const siguientes: Mesa[] = actuales
        .filter(mesa => !borrar.has(mesa.id))
        .map(mesa => {
          const traida = traidas.includes(mesa.id);
          if (mesa.sector !== sector.id && !traida) return mesa;
          const layout = layoutsCompletos.get(mesa.id);
          const sectorFinal = (traida ? sector.id : mesa.sector) as Sector;
          if (!layout || (mismoLayout(layout, mesa.plano) && sectorFinal === mesa.sector)) return mesa;
          return { ...mesa, sector: sectorFinal, plano: layout, posicion_x: Math.round(layout.x), posicion_y: Math.round(layout.y), updated_at: momento };
        });
      nuevas.forEach(mesa => {
        const layout = layoutsCompletos.get(mesa.id);
        siguientes.push({ ...mesa, plano: layout, posicion_x: Math.round(layout?.x ?? 0), posicion_y: Math.round(layout?.y ?? 0), created_at: momento, updated_at: momento });
      });
      saveMesas(siguientes);
      saveSectores(loadSectores().map(s => (s.id === sector.id ? { ...s, plano: { ...plano, actualizado_at: momento } } : s)));
    });

    if (bloqueadas.length) window.alert('Algunas mesas no se borraron porque abrieron una comanda mientras editabas el plano.');
    onSalir();
  };

  // Atajos: Supr borra un elemento, flechas lo mueven, Ctrl+Z deshace.
  const atajos = useRef<(e: KeyboardEvent) => void>(() => undefined);
  atajos.current = (evento: KeyboardEvent) => {
    const destino = evento.target as HTMLElement | null;
    if (destino && ['INPUT', 'TEXTAREA', 'SELECT'].includes(destino.tagName)) return;
    if ((evento.ctrlKey || evento.metaKey) && evento.key.toLowerCase() === 'z') {
      evento.preventDefault();
      deshacer();
      return;
    }
    if (evento.key === 'Escape') { setSeleccion(null); return; }
    if ((evento.key === 'Delete' || evento.key === 'Backspace') && elementoSeleccionado) {
      evento.preventDefault();
      quitarElemento(elementoSeleccionado.id);
      return;
    }
    const flechas: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
    const flecha = flechas[evento.key];
    if (!flecha) return;
    const paso = evento.shiftKey ? 1 : grilla ? PASO_GRILLA / 2 : 5;
    if (mesaSeleccionada && layoutSeleccionado) {
      evento.preventDefault();
      cambiarLayout(mesaSeleccionada.id, { ...layoutSeleccionado, x: limitar(layoutSeleccionado.x + flecha[0] * paso, 0, plano.ancho), y: limitar(layoutSeleccionado.y + flecha[1] * paso, 0, plano.alto) });
    } else if (elementoSeleccionado) {
      evento.preventDefault();
      cambiarElemento(elementoSeleccionado.id, { ...elementoSeleccionado, x: limitar(elementoSeleccionado.x + flecha[0] * paso, 0, plano.ancho), y: limitar(elementoSeleccionado.y + flecha[1] * paso, 0, plano.alto) });
    }
  };
  useEffect(() => {
    const escuchar = (evento: KeyboardEvent) => atajos.current(evento);
    window.addEventListener('keydown', escuchar);
    return () => window.removeEventListener('keydown', escuchar);
  }, []);

  const rotarSeleccion = (grados: number) => {
    if (mesaSeleccionada && layoutSeleccionado) cambiarLayout(mesaSeleccionada.id, { ...layoutSeleccionado, rotacion: normalizarRotacion(layoutSeleccionado.rotacion + grados) });
    else if (elementoSeleccionado) cambiarElemento(elementoSeleccionado.id, { ...elementoSeleccionado, rotacion: normalizarRotacion(elementoSeleccionado.rotacion + grados) });
  };

  const botonBarra = 'flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50 disabled:opacity-40';

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-amber-200 bg-amber-50/60 p-2">
        <span className="px-2 text-xs font-semibold uppercase tracking-wide text-amber-700">Editando · {sector.label}</span>
        <button type="button" onClick={agregarMesa} className={botonBarra}><Plus size={14} />Mesa</button>
        <div className="relative">
          <button type="button" onClick={() => setMenuElementos(v => !v)} className={botonBarra} aria-expanded={menuElementos}>
            <Shapes size={14} />Elemento
          </button>
          {menuElementos && (
            <div className="absolute left-0 top-full z-20 mt-1 grid w-56 grid-cols-2 gap-1 rounded-xl border border-slate-200 bg-white p-2 shadow-lg">
              {elementosDisponibles.map(item => (
                <button key={item.tipo} type="button" onClick={() => agregarElemento(item.tipo)} className="rounded-lg px-2 py-2 text-left text-xs text-slate-700 hover:bg-amber-50">
                  {item.label}
                </button>
              ))}
            </div>
          )}
        </div>
        <button type="button" onClick={() => setGrilla(v => !v)} className={`${botonBarra} ${grilla ? 'border-amber-300 bg-amber-100 text-amber-800' : ''}`} aria-pressed={grilla}>
          <Grid3x3 size={14} />Grilla
        </button>
        <button type="button" onClick={deshacer} disabled={!hayCambios} className={botonBarra}><Undo2 size={14} />Deshacer</button>
        <button type="button" onClick={() => setEligiendoPlantilla(true)} className={botonBarra}><MapaIcono size={14} />Plano de referencia</button>
        <button type="button" onClick={reorganizar} className={botonBarra}><LayoutGrid size={14} />Reorganizar</button>
        <div className="ml-auto flex gap-2">
          <button type="button" onClick={cancelar} className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50">
            <X size={15} />Cancelar
          </button>
          <button type="button" onClick={guardar} className="flex items-center gap-1.5 rounded-xl bg-amber-500 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-400">
            <Check size={15} />Guardar plano
          </button>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_280px]">
        <PlanoInteractivo
          plano={plano}
          mesas={enPlano}
          editando
          grilla={grilla ? PASO_GRILLA : 0}
          seleccion={seleccion}
          onSeleccionar={setSeleccion}
          onCambiarMesa={(id, layout) => alArrastrar(registrar => cambiarLayout(id, layout, registrar))}
          onCambiarElemento={(id, elemento) => alArrastrar(registrar => cambiarElemento(id, elemento, registrar))}
          onFinCambio={() => { arrastrando.current = false; }}
          altoMaximo="70vh"
        />

        <aside className="space-y-4 rounded-2xl border border-slate-200 bg-white p-4">
          {mesaSeleccionada && layoutSeleccionado ? (
            <>
              <div>
                <p className="text-sm font-semibold text-slate-800">{nombreDeMesa(mesaSeleccionada)}</p>
                <p className={`text-xs ${estadoMesaConfig[enPlano.find(m => m.id === mesaSeleccionada.id)?.estado ?? 'libre'].color}`}>
                  {estadoMesaConfig[enPlano.find(m => m.id === mesaSeleccionada.id)?.estado ?? 'libre'].label}
                  {nuevas.some(n => n.id === mesaSeleccionada.id) && ' · se crea al guardar'}
                </p>
              </div>
              <div>
                <span className="mb-1.5 block text-xs font-medium text-slate-600">Forma</span>
                <div className="grid grid-cols-2 gap-1.5">
                  {formas.map(forma => (
                    <button
                      key={forma}
                      type="button"
                      onClick={() => cambiarLayout(mesaSeleccionada.id, { ...layoutSeleccionado, forma, ...medidasPorForma[forma] })}
                      className={`rounded-lg border px-2 py-1.5 text-xs ${layoutSeleccionado.forma === forma ? 'border-amber-400 bg-amber-50 font-semibold text-amber-800' : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`}
                    >
                      {nombresForma[forma]}
                    </button>
                  ))}
                </div>
              </div>
              <Numero label="Ancho" value={layoutSeleccionado.ancho} min={MINIMO_MESA} max={400} onChange={v => cambiarLayout(mesaSeleccionada.id, { ...layoutSeleccionado, ancho: v })} />
              <Numero label="Largo" value={layoutSeleccionado.alto} min={MINIMO_MESA} max={400} onChange={v => cambiarLayout(mesaSeleccionada.id, { ...layoutSeleccionado, alto: v })} />
              <Numero label="Giro (grados)" value={layoutSeleccionado.rotacion} min={0} max={359} onChange={v => cambiarLayout(mesaSeleccionada.id, { ...layoutSeleccionado, rotacion: v })} />
              <div className="flex gap-1.5">
                <button type="button" onClick={() => rotarSeleccion(-15)} className={botonBarra}><RotateCcw size={13} />15°</button>
                <button type="button" onClick={() => rotarSeleccion(15)} className={botonBarra}><RotateCw size={13} />15°</button>
                <button type="button" onClick={() => rotarSeleccion(90)} className={botonBarra}><RotateCw size={13} />90°</button>
              </div>
              <p className="text-[11px] text-slate-500">El nombre, la capacidad y la moza se cambian tocando la mesa fuera del editor.</p>
              <button type="button" onClick={() => eliminarMesa(mesaSeleccionada)} className="flex w-full items-center justify-center gap-2 rounded-xl border border-red-100 py-2 text-sm font-medium text-red-600 hover:bg-red-50">
                <Trash2 size={14} />Borrar mesa
              </button>
            </>
          ) : elementoSeleccionado ? (
            <>
              <p className="text-sm font-semibold text-slate-800">{elementosDisponibles.find(e => e.tipo === elementoSeleccionado.tipo)?.label}</p>
              {conTexto.has(elementoSeleccionado.tipo) && (
                <label className="block">
                  <span className="mb-1 block text-xs font-medium text-slate-600">Texto</span>
                  <input
                    value={elementoSeleccionado.texto || ''}
                    onChange={e => cambiarElemento(elementoSeleccionado.id, { ...elementoSeleccionado, texto: e.target.value })}
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-amber-400"
                  />
                </label>
              )}
              <Numero label="Ancho" value={elementoSeleccionado.ancho} min={MINIMO_ELEMENTO} max={Math.max(plano.ancho, plano.alto) * 1.5} onChange={v => cambiarElemento(elementoSeleccionado.id, { ...elementoSeleccionado, ancho: v })} />
              <Numero label="Alto" value={elementoSeleccionado.alto} min={MINIMO_ELEMENTO} max={Math.max(plano.ancho, plano.alto) * 1.5} onChange={v => cambiarElemento(elementoSeleccionado.id, { ...elementoSeleccionado, alto: v })} />
              <Numero label="Giro (grados)" value={elementoSeleccionado.rotacion} min={0} max={359} onChange={v => cambiarElemento(elementoSeleccionado.id, { ...elementoSeleccionado, rotacion: v })} />
              <div className="flex gap-1.5">
                <button type="button" onClick={() => rotarSeleccion(-15)} className={botonBarra}><RotateCcw size={13} />15°</button>
                <button type="button" onClick={() => rotarSeleccion(45)} className={botonBarra}><RotateCw size={13} />45°</button>
                <button type="button" onClick={() => rotarSeleccion(90)} className={botonBarra}><RotateCw size={13} />90°</button>
              </div>
              <div className="flex gap-2">
                <button type="button" onClick={() => duplicarElemento(elementoSeleccionado)} className={`${botonBarra} flex-1 justify-center`}><Copy size={13} />Duplicar</button>
                <button type="button" onClick={() => quitarElemento(elementoSeleccionado.id)} className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-red-100 px-3 py-2 text-xs font-medium text-red-600 hover:bg-red-50">
                  <Trash2 size={13} />Quitar
                </button>
              </div>
            </>
          ) : (
            <>
              <div>
                <p className="text-sm font-semibold text-slate-800">Plano de {sector.label}</p>
                <p className="mt-1 text-xs text-slate-500">
                  Arrastrá las mesas y los elementos. Tocá uno para elegir su forma, tamaño y giro; con la manija cuadrada
                  cambiás el tamaño y con la redonda lo girás.
                </p>
              </div>
              <Numero label="Ancho del plano" value={plano.ancho} min={300} max={3000} onChange={v => cambiar(b => ({ ...b, plano: { ...b.plano, ancho: v } }))} />
              <Numero label="Largo del plano" value={plano.alto} min={300} max={3000} onChange={v => cambiar(b => ({ ...b, plano: { ...b.plano, alto: v } }))} />
              <ul className="space-y-1 text-[11px] text-slate-500">
                <li>{visibles.length} mesas en este apartado{nuevas.length ? ` (${nuevas.length} nuevas)` : ''}</li>
                {eliminadas.length > 0 && <li className="text-red-600">{eliminadas.length} para borrar al guardar</li>}
                <li>Flechas: mover · Supr: quitar elemento · Ctrl+Z: deshacer</li>
              </ul>
            </>
          )}
        </aside>
      </div>

      {eligiendoPlantilla && (
        <div className="fixed inset-0 z-50 flex items-end justify-center overflow-y-auto bg-black/50 p-0 sm:items-center sm:p-4">
          <div className="w-full max-w-lg rounded-2xl bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-100 p-5">
              <div>
                <h3 className="font-bold text-slate-800">Plano de referencia</h3>
                <p className="text-xs text-slate-500">Ubica las mesas que ya tenés según el plano del local. Nada se guarda hasta "Guardar plano".</p>
              </div>
              <button type="button" onClick={() => { setEligiendoPlantilla(false); setPlantilla(null); }} className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100" aria-label="Cerrar">
                <X size={16} />
              </button>
            </div>
            <div className="space-y-4 p-5">
              <div className="grid gap-2">
                {plantillasPlano.map(item => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => { setPlantilla(item); setTraerOtras(false); setCrearFaltantes(false); }}
                    className={`rounded-xl border-2 p-3 text-left transition-colors ${plantilla?.id === item.id ? 'border-amber-400 bg-amber-50' : 'border-slate-100 hover:border-slate-200'}`}
                  >
                    <p className="text-sm font-semibold text-slate-800">{item.nombre}</p>
                    <p className="text-xs text-slate-500">{item.descripcion}</p>
                  </button>
                ))}
              </div>

              {analisis && (
                <div className="space-y-2 rounded-xl bg-slate-50 p-3 text-xs text-slate-600">
                  <p><strong className="text-slate-800">{analisis.enSector.length}</strong> mesas de {sector.label} se ubican en su lugar.</p>
                  {analisis.sobrantes.length > 0 && (
                    <p>{analisis.sobrantes.length} mesas de {sector.label} no están en este plano ({analisis.sobrantes.map(nombreDeMesa).join(', ')}): quedan en un hueco libre.</p>
                  )}
                  {analisis.enOtroSector.length > 0 && (
                    <label className="flex items-start gap-2">
                      <input type="checkbox" checked={traerOtras} onChange={e => setTraerOtras(e.target.checked)} className="mt-0.5 accent-amber-500" />
                      <span>Traer a {sector.label} las que hoy están en otro apartado: {analisis.enOtroSector.map(({ mesa }) => nombreDeMesa(mesa)).join(', ')}.</span>
                    </label>
                  )}
                  {analisis.faltantes.length > 0 && (
                    <label className="flex items-start gap-2">
                      <input type="checkbox" checked={crearFaltantes} onChange={e => setCrearFaltantes(e.target.checked)} className="mt-0.5 accent-amber-500" />
                      <span>
                        Crear las que no existen en el sistema: {analisis.faltantes.map(f => (typeof f.ref === 'number' ? `Mesa ${f.ref}` : f.ref)).join(', ')}.
                      </span>
                    </label>
                  )}
                  <p className="text-amber-700">Las paredes y elementos actuales de {sector.label} se reemplazan por los del plano elegido.</p>
                </div>
              )}
            </div>
            <div className="flex gap-3 border-t border-slate-100 p-5">
              <button type="button" onClick={() => { setEligiendoPlantilla(false); setPlantilla(null); }} className="flex-1 rounded-xl border border-slate-200 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-50">
                Cancelar
              </button>
              <button type="button" onClick={aplicarPlantilla} disabled={!plantilla} className="flex-1 rounded-xl bg-amber-500 py-2.5 text-sm font-semibold text-white hover:bg-amber-400 disabled:opacity-50">
                Usar este plano
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
