import { defineConfig } from 'vite';

/**
 * Vite 构建配置
 * 功能描述: 配置开发服务器与构建选项
 * 参数: 无 (Vite 自动注入)
 * 返回值: Vite 配置对象
 * 注意事项: base 使用相对路径以便部署到任意子路径
 */
export default defineConfig({
  base: './',
  server: {
    port: 5173,
    open: false,
    host: true,
  },
  build: {
    target: 'es2020',
    outDir: 'dist',
    assetsInlineLimit: 4096,
  },
  optimizeDeps: {
    include: ['three', 'simplex-noise'],
  },
});
