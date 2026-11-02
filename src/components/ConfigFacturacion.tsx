import { useEffect, useState } from 'react';
import { Check, FileCheck2 } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { cargarConfigFacturacion, guardarConfigFacturacion, type CondicionEmisor } from '../lib/facturacion';

/** Datos fiscales del local. El certificado de ARCA no se carga acá: va en los secretos de Supabase. */
export default function ConfigFacturacion() {
  const { user } = useAuth();
  const [cuit, setCuit] = useState('');
  const [razonSocial, setRazonSocial] = useState('');
  const [domicilio, setDomicilio] = useState('');
  const [ingresosBrutos, setIngresosBrutos] = useState('');
  const [inicio, setInicio] = useState('');
  const [condicion, setCondicion] = useState<CondicionEmisor>('monotributo');
  const [puntoVenta, setPuntoVenta] = useState('');
  const [alicuota, setAlicuota] = useState('21');
  const [concepto, setConcepto] = useState('1');
  const [umbral, setUmbral] = useState('10000000');
  const [activo, setActivo] = useState(false);
  const [estado, setEstado] = useState<'cargando' | 'listo' | 'guardando' | 'guardado'>('cargando');
  const [error, setError] = useState('');

  useEffect(() => {
    cargarConfigFacturacion()
      .then(config => {
        if (config) {
          setCuit(config.cuit);
          setRazonSocial(config.razon_social);
          setDomicilio(config.domicilio);
          setIngresosBrutos(config.ingresos_brutos);
          setInicio(config.inicio_actividades || '');
          setCondicion(config.condicion_emisor);
          setPuntoVenta(String(config.punto_venta));
          setAlicuota(String(config.alicuota));
          setConcepto(String(config.concepto));
          setUmbral(String(config.umbral_identificacion));
          setActivo(config.activo);
        }
        setEstado('listo');
      })
      .catch(e => {
        setError(e instanceof Error ? e.message : 'No pude leer la configuración.');
        setEstado('listo');
      });
  }, []);

  const cuitLimpio = cuit.replace(/\D/g, '');
  const completo = cuitLimpio.length === 11 && razonSocial.trim() && domicilio.trim() && Number(puntoVenta) >= 1 && Number(umbral) > 0;

  const guardar = async () => {
    if (!user?.local_id) return;
    setError('');
    setEstado('guardando');
    try {
      await guardarConfigFacturacion(user.local_id, {
        cuit: cuitLimpio,
        razon_social: razonSocial.trim(),
        domicilio: domicilio.trim(),
        ingresos_brutos: ingresosBrutos.trim(),
        inicio_actividades: inicio || null,
        condicion_emisor: condicion,
        punto_venta: Number(puntoVenta),
        alicuota: Number(alicuota),
        concepto: Number(concepto),
        umbral_identificacion: Number(umbral),
        activo,
      });
      setEstado('guardado');
      window.setTimeout(() => setEstado('listo'), 2000);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo guardar.');
      setEstado('listo');
    }
  };

  const campo = 'w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-amber-400 bg-white';
  const etiqueta = 'block text-sm font-medium text-slate-700 mb-1.5';

  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-6">
      <div className="flex items-center gap-3 mb-5">
        <div className="w-9 h-9 bg-emerald-100 rounded-xl flex items-center justify-center">
          <FileCheck2 size={18} className="text-emerald-600" />
        </div>
        <div>
          <h3 className="font-semibold text-slate-800">Facturación ARCA</h3>
          <p className="text-xs text-slate-500">Factura electrónica con CAE desde la caja. Revisá estos datos con tu contador.</p>
        </div>
      </div>

      <div className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label htmlFor="arca-cuit" className={etiqueta}>CUIT</label>
            <input id="arca-cuit" value={cuit} onChange={e => setCuit(e.target.value)} placeholder="Solo números" className={campo} disabled={estado === 'cargando'} />
          </div>
          <div>
            <label htmlFor="arca-condicion" className={etiqueta}>Condición frente al IVA</label>
            <select id="arca-condicion" value={condicion} onChange={e => setCondicion(e.target.value as CondicionEmisor)} className={campo}>
              <option value="monotributo">Monotributo (Factura C)</option>
              <option value="responsable_inscripto">Responsable inscripto (Factura A y B)</option>
            </select>
          </div>
        </div>
        <div>
          <label htmlFor="arca-razon" className={etiqueta}>Razón social</label>
          <input id="arca-razon" value={razonSocial} onChange={e => setRazonSocial(e.target.value)} className={campo} />
        </div>
        <div>
          <label htmlFor="arca-domicilio" className={etiqueta}>Domicilio comercial</label>
          <input id="arca-domicilio" value={domicilio} onChange={e => setDomicilio(e.target.value)} className={campo} />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label htmlFor="arca-pv" className={etiqueta}>Punto de venta</label>
            <input id="arca-pv" value={puntoVenta} onChange={e => setPuntoVenta(e.target.value)} type="number" min="1" className={campo} />
          </div>
          <div>
            <label htmlFor="arca-iibb" className={etiqueta}>Ingresos Brutos</label>
            <input id="arca-iibb" value={ingresosBrutos} onChange={e => setIngresosBrutos(e.target.value)} className={campo} />
          </div>
          <div>
            <label htmlFor="arca-inicio" className={etiqueta}>Inicio de actividades</label>
            <input id="arca-inicio" value={inicio} onChange={e => setInicio(e.target.value)} type="date" className={campo} />
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {condicion === 'responsable_inscripto' && (
            <div>
              <label htmlFor="arca-alicuota" className={etiqueta}>Alícuota de IVA</label>
              <select id="arca-alicuota" value={alicuota} onChange={e => setAlicuota(e.target.value)} className={campo}>
                {['21', '10.5', '27', '5', '2.5', '0'].map(a => <option key={a} value={a}>{a}%</option>)}
              </select>
            </div>
          )}
          <div>
            <label htmlFor="arca-concepto" className={etiqueta}>Concepto</label>
            <select id="arca-concepto" value={concepto} onChange={e => setConcepto(e.target.value)} className={campo}>
              <option value="1">Productos</option>
              <option value="2">Servicios</option>
              <option value="3">Productos y servicios</option>
            </select>
          </div>
          <div>
            <label htmlFor="arca-umbral" className={etiqueta}>Identificar cliente desde $</label>
            <input id="arca-umbral" value={umbral} onChange={e => setUmbral(e.target.value)} type="number" min="1" className={campo} />
          </div>
        </div>

        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input type="checkbox" checked={activo} onChange={e => setActivo(e.target.checked)} className="accent-amber-500" />
          Facturar desde la caja
        </label>

        {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
        <button
          onClick={() => void guardar()}
          disabled={estado !== 'listo' || !completo}
          className="flex items-center gap-2 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-white font-semibold px-4 py-2.5 rounded-xl text-sm"
        >
          {estado === 'guardado' ? <><Check size={15} />Guardado</> : estado === 'guardando' ? 'Guardando…' : 'Guardar facturación'}
        </button>
      </div>
    </div>
  );
}
