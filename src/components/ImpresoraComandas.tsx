import { useEffect } from 'react';
import { usePedidos } from '../lib/demoStore';
import { loadProductos } from '../lib/productosStore';
import {
  cargarImpresas,
  comandasPendientes,
  guardarImpresas,
  htmlComanda,
  imprimirHtml,
  registrarImpresa,
  useImpresionAuto,
} from '../lib/comandaCocina';

/**
 * Corre en cualquier pantalla: si en esta compu está activada la impresión automática,
 * cada comanda que llega a cocina sale sola por la impresora.
 */
export default function ImpresoraComandas() {
  const activa = useImpresionAuto();
  const pedidos = usePedidos();

  useEffect(() => {
    if (!activa) return;
    // Se relee justo antes: si hay dos pestañas abiertas, la segunda ya ve lo que imprimió la primera.
    let registro = cargarImpresas();
    const pendientes = comandasPendientes(pedidos, registro);
    if (!pendientes.length) return;
    pendientes.forEach(comanda => { registro = registrarImpresa(registro, comanda); });
    guardarImpresas(registro);
    const catalogo = loadProductos();
    pendientes.forEach(comanda => { void imprimirHtml(htmlComanda(comanda, catalogo)); });
  }, [activa, pedidos]);

  return null;
}
