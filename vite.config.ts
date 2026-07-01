import {defineConfig} from 'vite';
import react from '@vitejs/plugin-react';

const port = Number(process.env.PORT) || 3002;
const backendPort = Number(process.env.BACKEND_PORT) || 3001;

export default defineConfig({
  plugins: [react()],
  publicDir: false,
  server: {
    port: port,
    proxy: {
      '/api': `http://localhost:${backendPort}`,
      '/media': `http://localhost:${backendPort}`,
      '/renders': `http://localhost:${backendPort}`,
    },
  },
});
