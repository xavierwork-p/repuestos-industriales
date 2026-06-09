import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const config = {
    plugins: [react()],
  }

  if (mode === 'demo') {
    config.base = './'
    config.build = {
      rollupOptions: {
        input: {
          demo: fileURLToPath(new URL('./index-demo.html', import.meta.url)),
        },
      },
    }
  }

  return config
})
