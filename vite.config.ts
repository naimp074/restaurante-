import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * Cada build tiene su versión. La app la compara con /version.json: así un celular que dejó
 * el sistema abierto días (o lo instaló como app) se entera de que hay una versión nueva.
 */
const versionApp = new Date().toISOString();

const archivoDeVersion = (): Plugin => ({
  name: 'archivo-de-version',
  generateBundle() {
    this.emitFile({ type: 'asset', fileName: 'version.json', source: JSON.stringify({ version: versionApp }) });
  },
});

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react(), archivoDeVersion()],
  define: {
    __VERSION_APP__: JSON.stringify(versionApp),
  },
  optimizeDeps: {
    exclude: ['lucide-react'],
  },
  build: {
    // Lista de archivos generados: el service worker (public/sw.js) la usa para guardar
    // todas las pantallas y que el sistema abra aunque no haya internet.
    manifest: 'asset-manifest.json',
  },
});
