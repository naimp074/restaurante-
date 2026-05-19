import { useState } from 'react';
import { Save, Store, CreditCard, Bell, Shield } from 'lucide-react';

export default function Configuracion() {
  const [localNombre, setLocalNombre] = useState('BurgerPOS');
  const [localDireccion, setLocalDireccion] = useState('Av. Corrientes 1234, CABA');
  const [localTelefono, setLocalTelefono] = useState('011-4444-5555');
  const [iva, setIva] = useState('21');
  const [saved, setSaved] = useState(false);

  const handleSave = () => {
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div className="space-y-6 max-w-2xl">
      <div className="bg-white rounded-2xl border border-slate-200 p-6">
        <div className="flex items-center gap-3 mb-5">
          <div className="w-9 h-9 bg-amber-100 rounded-xl flex items-center justify-center">
            <Store size={18} className="text-amber-600" />
          </div>
          <h3 className="font-semibold text-slate-800">Datos del Local</h3>
        </div>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Nombre del establecimiento</label>
            <input
              value={localNombre}
              onChange={e => setLocalNombre(e.target.value)}
              className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-amber-400"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Dirección</label>
            <input
              value={localDireccion}
              onChange={e => setLocalDireccion(e.target.value)}
              className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-amber-400"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Teléfono</label>
              <input
                value={localTelefono}
                onChange={e => setLocalTelefono(e.target.value)}
                className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-amber-400"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">IVA %</label>
              <input
                value={iva}
                onChange={e => setIva(e.target.value)}
                className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-amber-400"
                type="number" min="0" max="100"
              />
            </div>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 p-6">
        <div className="flex items-center gap-3 mb-5">
          <div className="w-9 h-9 bg-blue-100 rounded-xl flex items-center justify-center">
            <Bell size={18} className="text-blue-600" />
          </div>
          <h3 className="font-semibold text-slate-800">Notificaciones</h3>
        </div>
        <div className="space-y-3">
          {[
            { label: 'Avisar cuando el pedido está listo en cocina', enabled: true },
            { label: 'Alerta de stock bajo', enabled: true },
            { label: 'Notificación de nuevas mesas abiertas', enabled: false },
            { label: 'Resumen diario de ventas', enabled: true },
          ].map((n, i) => (
            <div key={i} className="flex items-center justify-between py-2">
              <span className="text-sm text-slate-700">{n.label}</span>
              <div className={`w-10 h-5 rounded-full transition-colors cursor-pointer ${n.enabled ? 'bg-amber-500' : 'bg-slate-200'}`}>
                <div className={`w-4 h-4 bg-white rounded-full shadow mt-0.5 transition-transform ${n.enabled ? 'translate-x-5' : 'translate-x-0.5'}`} />
              </div>
            </div>
          ))}
        </div>
      </div>

      <button
        onClick={handleSave}
        className={`flex items-center gap-2 font-semibold px-6 py-3 rounded-xl transition-all ${
          saved ? 'bg-emerald-500 text-white' : 'bg-amber-500 hover:bg-amber-400 text-white'
        }`}
      >
        <Save size={16} />
        {saved ? 'Guardado!' : 'Guardar Cambios'}
      </button>
    </div>
  );
}
