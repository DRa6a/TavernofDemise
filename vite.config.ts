import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// 部署到 GitHub Pages：可通过环境变量指定子路径
// 例如：VITE_BASE_PATH=/ToDgame/ npm run build
export default defineConfig({
  base: process.env.VITE_BASE_PATH || '/',
  plugins: [react()],
})
