import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import fs from 'fs';
import path from 'path';

const htaccessPlugin = () => ({
  name: 'write-htaccess',
  closeBundle() {
    const content = `Options -MultiViews
RewriteEngine On
RewriteCond %{REQUEST_FILENAME} !-f
RewriteCond %{REQUEST_FILENAME} !-d
RewriteRule ^ index.html [QSA,L]
`;
    fs.writeFileSync(path.resolve(__dirname, 'public_html/.htaccess'), content);
  },
});

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const apiUrl = env.VITE_API_URL && env.VITE_API_URL.trim();

  return {
    plugins: [react(), htaccessPlugin()],
    build: {
      outDir: 'public_html',
      emptyOutDir: true,
    },
    server: {
      port: 3000,
      proxy: {
        '/api': {
          target: 'http://localhost:5000',
          changeOrigin: true,
        },
      },
    },
  };
});
