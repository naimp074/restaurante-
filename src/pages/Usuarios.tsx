import { useEffect, useState } from 'react';
import { Plus, CreditCard as Edit2, X, Check, Shield, Users as UsersIcon } from 'lucide-react';
import type { Profile, Rol } from '../lib/types';
import { loadUsuarios, saveUsuarios } from '../lib/usuariosStore';

const rolConfig: Record<Rol, { label: string; color: string; desc: string }> = {
  admin: { label: 'Administrador', color: 'bg-red-100 text-red-700', desc: 'Acceso completo al sistema' },
  encargado: { label: 'Encargado', color: 'bg-amber-100 text-amber-700', desc: 'Gestión del local y reportes' },
  cajero: { label: 'Cajero', color: 'bg-blue-100 text-blue-700', desc: 'Caja, cobros y comandas' },
  moza: { label: 'Moza/Mozo', color: 'bg-emerald-100 text-emerald-700', desc: 'Mesas y comandas' },
  cocina: { label: 'Cocina', color: 'bg-orange-100 text-orange-700', desc: 'Pantalla de cocina' },
};

const rolesPermissions: Record<Rol, string[]> = {
  admin: ['Dashboard', 'Mesas', 'Comandas', 'Cocina', 'Caja del día', 'Arqueos', 'Cobros', 'Productos', 'Stock', 'Costos', 'Reportes', 'Usuarios', 'Configuración'],
  encargado: ['Dashboard', 'Mesas', 'Comandas', 'Cocina', 'Caja del día', 'Arqueos', 'Cobros', 'Productos', 'Stock', 'Costos', 'Reportes'],
  cajero: ['Mesas', 'Comandas', 'Caja del día', 'Arqueos', 'Cobros', 'Dashboard'],
  moza: ['Mesas', 'Comandas'],
  cocina: ['Cocina'],
};

export default function Usuarios() {
  const [usuarios, setUsuarios] = useState<Profile[]>(loadUsuarios);
  const [showForm, setShowForm] = useState(false);
  const [editUser, setEditUser] = useState<Partial<Profile & { email?: string; password?: string }> | null>(null);
  const [editId, setEditId] = useState<string | null>(null);
  const [selectedRol, setSelectedRol] = useState<Rol | null>(null);

  useEffect(() => {
    saveUsuarios(usuarios);
  }, [usuarios]);

  const openEdit = (u: Profile) => {
    setEditUser({ ...u });
    setEditId(u.id);
    setShowForm(true);
  };

  const openNew = () => {
    setEditUser({ nombre: '', apellido: '', rol: 'moza', activo: true });
    setEditId(null);
    setShowForm(true);
  };

  const saveUser = () => {
    if (!editUser?.nombre) return;
    if (editId) {
      setUsuarios(prev => prev.map(u => u.id === editId ? { ...u, ...editUser } as Profile : u));
    } else {
      const newUser: Profile = {
        id: `emp-${Date.now()}`,
        nombre: editUser.nombre || '',
        apellido: editUser.apellido || '',
        rol: editUser.rol || 'moza',
        activo: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      setUsuarios(prev => [...prev, newUser]);
    }
    setShowForm(false);
  };

  const toggleActivo = (id: string) => {
    setUsuarios(prev => prev.map(u => u.id === id ? { ...u, activo: !u.activo } : u));
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {(Object.entries(rolConfig) as [Rol, typeof rolConfig[Rol]][]).map(([rol, cfg]) => {
          const count = usuarios.filter(u => u.rol === rol && u.activo).length;
          return (
            <button
              key={rol}
              onClick={() => setSelectedRol(selectedRol === rol ? null : rol)}
              className={`p-4 rounded-xl border-2 text-left transition-all ${
                selectedRol === rol ? 'border-amber-400 bg-amber-50' : 'border-slate-100 bg-white hover:border-slate-200'
              }`}
            >
              <p className="text-2xl font-bold text-slate-800 mb-1">{count}</p>
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${cfg.color}`}>{cfg.label}</span>
            </button>
          );
        })}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
            <div className="flex items-center justify-between p-5 border-b border-slate-100">
              <h3 className="font-semibold text-slate-800">Personal del Local</h3>
              <button
                onClick={openNew}
                className="flex items-center gap-2 bg-amber-500 hover:bg-amber-400 text-white font-medium px-3 py-2 rounded-xl text-sm transition-colors"
              >
                <Plus size={14} />
                Nuevo Usuario
              </button>
            </div>
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/50">
                  <th className="text-left py-3 px-4 text-xs font-semibold text-slate-500 uppercase tracking-wide">Usuario</th>
                  <th className="text-center py-3 px-4 text-xs font-semibold text-slate-500 uppercase tracking-wide">Rol</th>
                  <th className="text-center py-3 px-4 text-xs font-semibold text-slate-500 uppercase tracking-wide">Estado</th>
                  <th className="text-center py-3 px-4 text-xs font-semibold text-slate-500 uppercase tracking-wide">Permisos</th>
                  <th className="text-center py-3 px-4 text-xs font-semibold text-slate-500 uppercase tracking-wide"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {usuarios.filter(u => !selectedRol || u.rol === selectedRol).length === 0 && (
                  <tr>
                    <td colSpan={5} className="py-12 text-center">
                      <UsersIcon size={28} className="mx-auto text-slate-300 mb-2" />
                      <p className="text-sm font-medium text-slate-600">Todavía no cargaste personal</p>
                      <p className="text-xs text-slate-400 mt-1">
                        Agregá a tus mozas, cajeros y cocina para poder asignarlos a mesas y comandas
                      </p>
                    </td>
                  </tr>
                )}
                {usuarios
                  .filter(u => !selectedRol || u.rol === selectedRol)
                  .map(u => {
                    const cfg = rolConfig[u.rol];
                    const perms = rolesPermissions[u.rol];
                    return (
                      <tr key={u.id} className={`hover:bg-slate-50 transition-colors ${!u.activo ? 'opacity-50' : ''}`}>
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-3">
                            <div className="w-9 h-9 bg-amber-100 rounded-full flex items-center justify-center text-amber-700 font-bold text-sm">
                              {u.nombre[0]}{u.apellido[0]}
                            </div>
                            <div>
                              <p className="font-medium text-slate-800 text-sm">{u.nombre} {u.apellido}</p>
                            </div>
                          </div>
                        </td>
                        <td className="py-3 px-4 text-center">
                          <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${cfg.color}`}>{cfg.label}</span>
                        </td>
                        <td className="py-3 px-4 text-center">
                          <button
                            onClick={() => toggleActivo(u.id)}
                            className={`text-xs px-2.5 py-1 rounded-full font-medium transition-colors ${
                              u.activo ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                            }`}
                          >
                            {u.activo ? 'Activo' : 'Inactivo'}
                          </button>
                        </td>
                        <td className="py-3 px-4 text-center">
                          <span className="text-xs text-slate-400">{perms.length} módulos</span>
                        </td>
                        <td className="py-3 px-4 text-center">
                          <button
                            onClick={() => openEdit(u)}
                            className="p-1.5 rounded-lg text-slate-400 hover:bg-amber-50 hover:text-amber-600 transition-colors"
                          >
                            <Edit2 size={14} />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 p-5">
          <h3 className="font-semibold text-slate-800 mb-4 flex items-center gap-2">
            <Shield size={18} className="text-amber-600" />
            Permisos por Rol
          </h3>
          <div className="space-y-4">
            {(Object.entries(rolConfig) as [Rol, typeof rolConfig[Rol]][]).map(([rol, cfg]) => (
              <div key={rol}>
                <div className="flex items-center gap-2 mb-2">
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${cfg.color}`}>{cfg.label}</span>
                  <span className="text-xs text-slate-400">{cfg.desc}</span>
                </div>
                <div className="flex flex-wrap gap-1">
                  {rolesPermissions[rol].map(perm => (
                    <span key={perm} className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-md">{perm}</span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {showForm && editUser && (
        <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-50 p-0 sm:p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
            <div className="flex items-center justify-between p-6 border-b border-slate-100">
              <h3 className="font-bold text-slate-800">{editId ? 'Editar Usuario' : 'Nuevo Usuario'}</h3>
              <button onClick={() => setShowForm(false)}><X size={18} className="text-slate-400" /></button>
            </div>
            <div className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Nombre *</label>
                  <input
                    value={editUser.nombre || ''}
                    onChange={e => setEditUser(u => ({ ...u, nombre: e.target.value }))}
                    className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-amber-400"
                    placeholder="Nombre"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Apellido</label>
                  <input
                    value={editUser.apellido || ''}
                    onChange={e => setEditUser(u => ({ ...u, apellido: e.target.value }))}
                    className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-amber-400"
                    placeholder="Apellido"
                  />
                </div>
              </div>
              {!editId && (
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Email</label>
                  <input
                    type="email"
                    value={(editUser as { email?: string }).email || ''}
                    onChange={e => setEditUser(u => ({ ...u, email: e.target.value }))}
                    className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-amber-400"
                    placeholder="usuario@burger.com"
                  />
                </div>
              )}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Rol *</label>
                <div className="grid grid-cols-1 gap-2">
                  {(Object.entries(rolConfig) as [Rol, typeof rolConfig[Rol]][]).map(([rol, cfg]) => (
                    <button
                      key={rol}
                      onClick={() => setEditUser(u => ({ ...u, rol }))}
                      className={`flex items-center gap-3 px-4 py-2.5 rounded-xl border-2 transition-all text-left ${
                        editUser.rol === rol
                          ? 'border-amber-400 bg-amber-50'
                          : 'border-slate-100 hover:border-slate-200'
                      }`}
                    >
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium flex-shrink-0 ${cfg.color}`}>{cfg.label}</span>
                      <span className="text-xs text-slate-500">{cfg.desc}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <div className="flex gap-3 p-6 border-t border-slate-100">
              <button onClick={() => setShowForm(false)} className="flex-1 py-2.5 border border-slate-200 rounded-xl text-slate-600 text-sm">Cancelar</button>
              <button onClick={saveUser} className="flex-1 py-2.5 bg-amber-500 text-white rounded-xl text-sm font-semibold hover:bg-amber-400 flex items-center justify-center gap-2">
                <Check size={16} />Guardar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
