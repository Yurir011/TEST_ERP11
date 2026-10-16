import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  // 순수 함수(계산·포맷) 단위 테스트는 node 환경으로, 화면(컴포넌트) 테스트(*.test.tsx)는 파일 첫 줄의
  // `// @vitest-environment jsdom` 으로 브라우저 흉내 환경에서 실행한다.
  test: {
    environment: 'node',
    include: ['src/**/*.test.{ts,tsx}'],
  },
  server: {
    host: true, // 같은 네트워크의 다른 PC에서도 접속 가능하게 0.0.0.0으로 바인딩
    proxy: {
      '/api': 'http://localhost:8000',
    },
  },
})
