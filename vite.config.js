import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss()
  ],
  optimizeDeps: {
    include: ['react-is']
  },
  envPrefix: ['VITE_', 'SUPABASE_', 'PURCHASE_', 'PRODUCTION_', 'ORDER_', 'SALES_OF_RAW_MATERIAL_']
})
