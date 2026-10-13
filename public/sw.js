/*
  Service worker: deja abrir el sistema aunque se corte el wifi del local.
  - Páginas: primero la red (para tomar la última versión); sin red, la copia guardada.
  - /assets/*: tienen el hash en el nombre, así que la copia guardada nunca queda vieja.
  - Supabase y cualquier otro dominio no pasan por acá: los datos los maneja la cola de sync.
*/
const CACHE = 'burgerpos-v1';
const BASICOS = ['/', '/index.html', '/manifest.webmanifest', '/icono.svg'];
// Importar PDF o Excel requiere internet de todos modos (y son lo más pesado): no se guardan de antemano.
const SOLO_CON_RED = /pdf|xlsx|worker/i;

/** Todas las pantallas, según la lista que genera el build (vite.config.ts). */
const archivosDelBuild = async () => {
  try {
    const respuesta = await fetch('/asset-manifest.json', { cache: 'no-store' });
    if (!respuesta.ok) return [];
    const manifiesto = await respuesta.json();
    const archivos = new Set();
    Object.values(manifiesto).forEach(entrada => {
      if (entrada.file && !SOLO_CON_RED.test(entrada.file)) archivos.add(`/${entrada.file}`);
      (entrada.css || []).forEach(css => archivos.add(`/${css}`));
    });
    return [...archivos];
  } catch {
    return [];
  }
};

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await cache.addAll(BASICOS);
    // Si alguna pantalla no se puede guardar, se guarda la próxima vez que se abra.
    await Promise.all((await archivosDelBuild()).map(archivo => cache.add(archivo).catch(() => undefined)));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(claves => Promise.all(claves.filter(clave => clave !== CACHE).map(clave => caches.delete(clave))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', event => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then(respuesta => {
          const copia = respuesta.clone();
          caches.open(CACHE).then(cache => cache.put('/index.html', copia));
          return respuesta;
        })
        .catch(() => caches.match('/index.html')),
    );
    return;
  }

  if (url.pathname.startsWith('/assets/')) {
    event.respondWith(
      caches.match(request).then(guardada => guardada || fetch(request).then(respuesta => {
        if (respuesta.ok) {
          const copia = respuesta.clone();
          caches.open(CACHE).then(cache => cache.put(request, copia));
        }
        return respuesta;
      })),
    );
  }
});
