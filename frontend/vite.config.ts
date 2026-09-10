import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    host: true, // 같은 네트워크의 다른 PC에서도 접속 가능하게 0.0.0.0으로 바인딩
    proxy: {
      '/api': 'http://localhost:8000',
    },
  },
})
