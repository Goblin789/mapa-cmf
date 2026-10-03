import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  root: 'src/cliente',
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    // API_PORTA permite apontar para outro servidor (ex.: uma cópia da BD para testes).
    proxy: { '/api': `http://localhost:${process.env.API_PORTA ?? 8787}` },
  },
  build: { outDir: '../../dist/cliente', emptyOutDir: true },
});
