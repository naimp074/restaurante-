import { useEffect, useState } from 'react';

/** La versión con la que se armó lo que está corriendo en este equipo. */
export const versionActual = typeof __VERSION_APP__ === 'string' ? __VERSION_APP__ : '';

const cadaMs = 60_000;

/** "2026-11-18T22:10:05.000Z" → "18/11 19:10". */
export const textoVersion = (version: string) => {
  const fecha = new Date(version);
  return Number.isNaN(fecha.getTime())
    ? version || 'desarrollo'
    : fecha.toLocaleString('es-AR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
};

/** Hay versión nueva si el servidor publica otra distinta de la que corre acá. */
export const esVersionNueva = (publicada: unknown, actual = versionActual) =>
  typeof publicada === 'string' && publicada !== '' && actual !== '' && publicada !== actual;

const consultarPublicada = async () => {
  try {
    const respuesta = await fetch(`/version.json?t=${Date.now()}`, { cache: 'no-store' });
    if (!respuesta.ok) return '';
    const datos = await respuesta.json() as { version?: unknown };
    return typeof datos.version === 'string' ? datos.version : '';
  } catch {
    return '';
  }
};

/**
 * Avisa cuando se publicó una versión nueva. Un celular con el sistema abierto (o instalado como app)
 * puede seguir días con la versión vieja: ve distinto y sincroniza distinto que la computadora.
 * Si el equipo estuvo en segundo plano (pantalla apagada) y vuelve, se actualiza solo: nadie está
 * a mitad de algo. Lo pendiente de subir queda guardado y se sube después de recargar.
 */
export const useVersionNueva = () => {
  const [nueva, setNueva] = useState(false);

  useEffect(() => {
    if (!import.meta.env.PROD) return;
    let activo = true;
    let estuvoOculto = false;

    const revisar = async () => {
      const publicada = await consultarPublicada();
      if (!activo || !esVersionNueva(publicada)) return false;
      setNueva(true);
      // El service worker también se renueva, para no servir pantallas viejas sin internet.
      void navigator.serviceWorker?.getRegistration().then(registro => registro?.update()).catch(() => undefined);
      return true;
    };

    const alCambiarVisibilidad = async () => {
      if (document.visibilityState === 'hidden') { estuvoOculto = true; return; }
      if (await revisar() && estuvoOculto) window.location.reload();
      estuvoOculto = false;
    };

    void revisar();
    const intervalo = window.setInterval(() => { void revisar(); }, cadaMs);
    document.addEventListener('visibilitychange', alCambiarVisibilidad);
    window.addEventListener('online', revisar);
    return () => {
      activo = false;
      window.clearInterval(intervalo);
      document.removeEventListener('visibilitychange', alCambiarVisibilidad);
      window.removeEventListener('online', revisar);
    };
  }, []);

  return nueva;
};
