import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

import { cloudflare } from "@cloudflare/vite-plugin";

export default defineConfig({
  plugins: [react(), cloudflare()],
  server: {
    host: true,
    port: 8080,
    open: "http://127.0.0.1:8080",
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
})