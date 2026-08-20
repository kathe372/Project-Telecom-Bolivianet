import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
  build: {
    sourcemap: process.env.NODE_ENV !== 'production',
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:5000',
        changeOrigin: true,
      },
      // SignalR WebSocket necesita su propio proxy
      '/hubs': {
        target: 'http://localhost:5000',
        changeOrigin: true,
        ws: true,          // habilitar proxy de WebSocket
      },
    },
  },
});
