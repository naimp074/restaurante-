import { useEffect, type ReactNode } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../supabase';
import { onStoreWrite } from '../storeSync';
import { aplicarDocumentoRemoto, encolarClave, hidratarDesdeRemoto, programarVaciarCola, resetLocalIdSync, resolverLocalId, vaciarColaSync } from './cliente';
import { loadColaSync, setEstadoSync } from './estado';

export default function SyncProvider({ children }: { children: ReactNode }) {
  const { user, loading, modoDemo } = useAuth();

  useEffect(() => {
    onStoreWrite(clave => {
      encolarClave(clave);
      if (navigator.onLine && !modoDemo && user) programarVaciarCola();
    });
    setEstadoSync({ pendiente: loadColaSync().length, online: navigator.onLine });
    return () => onStoreWrite(undefined);
  }, [modoDemo, user]);

  useEffect(() => {
    const online = () => {
      setEstadoSync({ online: true });
      if (user && !modoDemo) void vaciarColaSync();
    };
    const offline = () => setEstadoSync({ online: false });
    window.addEventListener('online', online);
    window.addEventListener('offline', offline);
    return () => {
      window.removeEventListener('online', online);
      window.removeEventListener('offline', offline);
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
      const localId = await resolverLocalId();
      channel = client
        .channel(`sync-local-${localId}`)
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'sync_documentos', filter: `local_id=eq.${localId}` },
          payload => {
            const fila = payload.new as { clave?: string; payload?: unknown } | null;
            if (fila?.clave) aplicarDocumentoRemoto({ clave: fila.clave, payload: fila.payload });
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
