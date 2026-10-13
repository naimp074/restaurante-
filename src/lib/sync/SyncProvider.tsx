import { useEffect, type ReactNode } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../supabase';
import { onStoreWrite } from '../storeSync';
import {
  aplicarRegistrosRemotos,
  configurarSesionSync,
  encolarClave,
  hidratarDesdeRemoto,
  programarVaciarCola,
  resetLocalIdSync,
  resolverLocalId,
} from './cliente';
import { loadColaSync, setEstadoSync } from './estado';

export default function SyncProvider({ children }: { children: ReactNode }) {
  const { user, loading, modoDemo } = useAuth();

  useEffect(() => {
    configurarSesionSync({ rol: user?.rol, userId: user?.id });
    onStoreWrite(clave => {
      encolarClave(clave);
      if (navigator.onLine && !modoDemo && user) programarVaciarCola();
    });
    setEstadoSync({ pendiente: loadColaSync().length, online: navigator.onLine });
    return () => onStoreWrite(undefined);
  }, [modoDemo, user]);

  useEffect(() => {
    const activo = Boolean(user) && !modoDemo;
    // Al volver la conexión (o la pestaña) se piden los cambios que pudieron perderse.
    const online = () => {
      setEstadoSync({ online: true });
      if (activo) void hidratarDesdeRemoto();
    };
    const offline = () => setEstadoSync({ online: false });
    const visible = () => {
      if (activo && document.visibilityState === 'visible' && navigator.onLine) void hidratarDesdeRemoto();
    };
    window.addEventListener('online', online);
    window.addEventListener('offline', offline);
    document.addEventListener('visibilitychange', visible);
    return () => {
      window.removeEventListener('online', online);
      window.removeEventListener('offline', offline);
      document.removeEventListener('visibilitychange', visible);
    };
  }, [modoDemo, user]);

  useEffect(() => {
    const client = supabase;
    if (loading || modoDemo || !user || !client) return;
    let cancelado = false;
    let channel: ReturnType<typeof client.channel> | null = null;

    const iniciar = async () => {
      await hidratarDesdeRemoto();
      if (cancelado) return;
      const localId = await resolverLocalId().catch(() => '');
      if (cancelado || !localId) return;
      channel = client
        .channel(`sync-local-${localId}`)
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'sync_registros', filter: `local_id=eq.${localId}` },
          payload => {
            const fila = payload.new as {
              clave?: string;
              registro_id?: string;
              payload?: unknown;
              eliminado?: boolean;
              updated_at?: string;
            } | null;
            if (!fila?.clave || !fila.registro_id) return;
            aplicarRegistrosRemotos(fila.clave, [{
              registro_id: fila.registro_id,
              payload: fila.payload ?? null,
              eliminado: Boolean(fila.eliminado),
              updated_at: fila.updated_at,
            }]);
          },
        )
        .subscribe();
    };

    void iniciar();
    return () => {
      cancelado = true;
      resetLocalIdSync();
      if (channel) void client.removeChannel(channel);
    };
  }, [loading, modoDemo, user]);

  return children;
}
