import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { buildViteProxy } from './shared/proxyRoutes.js'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    // As mesmas rotas de proxy usadas pelo servidor de producao (server/index.js),
    // para que dev e producao tenham comportamento identico.
    proxy: buildViteProxy(process.env),
  },
})
