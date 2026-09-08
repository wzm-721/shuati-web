import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// base: './' 让构建产物可部署到任意静态托管的子路径下
export default defineConfig({
  plugins: [react()],
  base: './',
});
