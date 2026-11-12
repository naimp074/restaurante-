import { useState } from 'react';
import { Save, Store, Bell, Trash2, EyeOff } from 'lucide-react';
import type { PageId } from '../lib/types';
import { loadMenuOculto, pantallasOcultables } from '../lib/menuOculto';
import { useAuth } from '../contexts/AuthContext';
import { copiaAntesDeEmpezar, empezarDeCero } from '../lib/empezarDeCero';
import { readStore, writeStore } from '../lib/storeSync';
import { dayKey, horaCortePorDefecto } from '../lib/fechas';
import ConfigPedidosYa from '../components/ConfigPedidosYa';
import ConfigFacturacion from '../components/ConfigFacturacion';

export const configStorageKey = 'restaurant-config-local';
export const configUpdatedEvent = 'restaurant-config-local-updated';

type ConfigLocal = {
  nombre: string;
  direccion: string;
  telefono: string;
  iva: string;
  /** Hora (0 a 12) en la que termina la jornada comercial. Ver fechas.ts. */
  hora_corte: number;
  /** A dónde avisar si en el cierre de caja falta plata. */
  gmail_admin: string;
};

const configPorDefecto: ConfigLocal = {
  nombre: '', direccion: '', telefono: '', iva: '21', hora_corte: horaCortePorDefecto, gmail_admin: '',
};

const loadConfig = (): ConfigLocal => ({
  ...configPorDefecto,
  ...readStore<Partial<ConfigLocal>>(configStorageKey, {}),
});

export default function Configuracion() {
  const { hasRole, modoDemo } = useAuth();
  const configInicial = loadConfig();
  const [localNombre, setLocalNombre] = useState(configInicial.nombre);
  const [localDireccion, setLocalDireccion] = useState(configInicial.direccion);
  const [localTelefono, setLocalTelefono] = useState(configInicial.telefono);
  const [iva, setIva] = useState(configInicial.iva);
  const [horaCorte, setHoraCorte] = useState(String(configInicial.hora_corte));
  const [gmailAdmin, setGmailAdmin] = useState(configInicial.gmail_admin || '');
  const [gmailError, setGmailError] = useState('');
  const [menuOculto, setMenuOculto] = useState<PageId[]>(loadMenuOculto);
  const [saved, setSaved] = useState(false);
  const [reiniciado, setReiniciado] = useState(false);

  const handleSave = () => {
    const gmail = gmailAdmin.trim().toLowerCase();
    if (gmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(gmail)) {
      setGmailError('El Gmail no es válido.');
      return;
    }
    setGmailError('');
    writeStore(
      configStorageKey,
      {
        nombre: localNombre,
        direccion: localDireccion,
        telefono: localTelefono,
        iva,
        hora_corte: Math.min(12, Math.max(0, Math.round(Number(horaCorte) || 0))),
        gmail_admin: gmail,
        menu_oculto: menuOculto,
      },
      configUpdatedEvent,
    );
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  /** Baja una copia antes: el borrado llega a todos los dispositivos y no se puede deshacer. */
  const reiniciarDatos = () => {
    const respuesta = window.prompt('Esto borra ventas, caja, cobros, cuenta corriente, stock, gastos y proveedores en todos los dispositivos, y pone las cuentas de dinero en cero. La carta queda. Se descarga una copia. Escribí EMPEZAR para confirmar.');
    if (respuesta?.trim().toUpperCase() !== 'EMPEZAR') return;

    const enlace = document.createElement('a');
    enlace.href = URL.createObjectURL(new Blob([JSON.stringify(copiaAntesDeEmpezar(), null, 2)], { type: 'application/json' }));
    enlace.download = `copia-antes-de-empezar-${dayKey()}.json`;
    enlace.click();
    URL.revokeObjectURL(enlace.href);

    empezarDeCero();
    setReiniciado(true);
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
              placeholder="Nombre de tu local"
              className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-amber-400"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Dirección</label>
            <input
              value={localDireccion}
              onChange={e => setLocalDireccion(e.target.value)}
              placeholder="Calle, número y ciudad"
              className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-amber-400"
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Teléfono</label>
              <input
                value={localTelefono}
                onChange={e => setLocalTelefono(e.target.value)}
                placeholder="Teléfono de contacto"
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
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Fin de la jornada</label>
            <select
              value={horaCorte}
              onChange={e => setHoraCorte(e.target.value)}
              className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-amber-400 bg-white"
            >
              {Array.from({ length: 13 }, (_, hora) => (
                <option key={hora} value={hora}>
                  {hora === 0 ? 'Medianoche (día calendario)' : `${String(hora).padStart(2, '0')}:00 del día siguiente`}
                </option>
              ))}
            </select>
            <p className="text-xs text-slate-500 mt-1.5">
              Las ventas y la caja abiertas después de medianoche siguen contando para el día anterior hasta esta hora.
            </p>
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
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Gmail del administrador</label>
            <input
              type="email"
              value={gmailAdmin}
              onChange={e => { setGmailAdmin(e.target.value); setGmailError(''); }}
              placeholder="admin@gmail.com"
              className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-amber-400"
            />
            {gmailError && <p role="alert" className="text-sm text-red-600 mt-1.5">{gmailError}</p>}
            <p className="text-xs text-slate-500 mt-1.5">
              Si en el cierre falta más de $5.000, se avisa a este Gmail. Si sobra plata, el mail solo dice que se cerró la caja.
            </p>
          </div>
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

      {hasRole('admin') && <div className="bg-white rounded-2xl border border-slate-200 p-6">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-9 h-9 bg-slate-100 rounded-xl flex items-center justify-center">
            <EyeOff size={18} className="text-slate-600" />
          </div>
          <h3 className="font-semibold text-slate-800">Pantallas que todavía no uso</h3>
        </div>
        <p className="text-sm text-slate-500 mb-4">
          Lo que tildes no aparece en el menú de nadie. No se borra nada: destildalo cuando lo quieras usar.
        </p>
        <div className="space-y-2">
          {pantallasOcultables.map(pantalla => {
            const oculta = pantalla.paginas.every(p => menuOculto.includes(p));
            return (
              <label key={pantalla.label} className="flex items-center gap-3 py-1.5 text-sm text-slate-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={oculta}
                  onChange={() => setMenuOculto(prev => (oculta
                    ? prev.filter(p => !pantalla.paginas.includes(p))
                    : [...new Set([...prev, ...pantalla.paginas])]))}
                  className="w-4 h-4 accent-amber-500"
                />
                {pantalla.label}
              </label>
            );
          })}
        </div>
        <p className="text-xs text-slate-400 mt-3">Se aplica al tocar Guardar Cambios.</p>
      </div>}

      {hasRole('admin') && !modoDemo && <ConfigFacturacion />}

      {hasRole('admin') && !modoDemo && <ConfigPedidosYa />}

      {hasRole('admin') && <div className="bg-white rounded-2xl border border-red-100 p-6">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-9 h-9 bg-red-100 rounded-xl flex items-center justify-center">
            <Trash2 size={18} className="text-red-600" />
          </div>
          <h3 className="font-semibold text-slate-800">Empezar de cero</h3>
        </div>
        <p className="text-sm text-slate-500 mb-4">
          Borra ventas, comandas, caja, cobros, cuenta corriente, stock, gastos y proveedores en todos los
          dispositivos, y pone las cuentas de dinero en cero. Quedan la carta, las categorías, los usuarios, las
          mesas, las listas de precios y la configuración. No se puede deshacer.
        </p>
        {reiniciado && <p role="status" className="text-sm text-emerald-700 bg-emerald-50 rounded-lg px-3 py-2 mb-3">Listo: el sistema empezó de cero y la carta quedó cargada.</p>}
        <button
          onClick={reiniciarDatos}
          className="border border-red-200 text-red-600 hover:bg-red-50 text-sm font-semibold px-4 py-2 rounded-xl transition-colors"
        >
          Empezar de cero y conservar la carta
        </button>
      </div>}

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
