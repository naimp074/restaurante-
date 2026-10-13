import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  optimizeDeps: {
    exclude: ['lucide-react'],
  },
  build: {
    // Lista de archivos generados: el service worker (public/sw.js) la usa para guardar
    // todas las pantallas y que el sistema abra aunque no haya internet.
    manifest: 'asset-manifest.json',
  },
});
