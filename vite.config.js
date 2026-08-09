import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  base: './', // Ensures relative assets loading for Electron file:// protocol
  plugins: [
    react(),
    tailwindcss(),
  ],
})
