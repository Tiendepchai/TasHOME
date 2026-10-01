import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'node:path';
import type { Plugin } from 'vite';
import type { ServerResponse } from 'node:http';

function deviceProxyPlugin(): Plugin {
  return {
    name: 'device-proxy',
    configureServer(server) {
      server.middlewares.use(async (req, res: ServerResponse, next) => {
        const match = req.url?.match(/^\/device-proxy\/([^/?]+)(\/[^?]*)?(\?.*)?$/);
        if (!match) return next();

        const deviceIp = match[1];
        const urlPath = match[2] || '/';
        const query = match[3] || '';
        const targetUrl = `http://${deviceIp}${urlPath}${query}`;

        try {
          let reqBody: Buffer | undefined;
          if (req.method && req.method !== 'GET' && req.method !== 'HEAD') {
            const chunks: Buffer[] = [];
            for await (const chunk of req) chunks.push(chunk as Buffer);
            reqBody = Buffer.concat(chunks);
          }

          const controller = new AbortController();
          const timer = setTimeout(() => controller.abort(), 8000);

          const upstream = await fetch(targetUrl, {
            method: req.method || 'GET',
            signal: controller.signal,
            headers: {
              Accept: 'application/json',
              ...(reqBody ? { 'Content-Type': req.headers['content-type'] || 'application/json' } : {})
            },
            body: reqBody ? new Uint8Array(reqBody) : undefined
          });
          clearTimeout(timer);

          const body = await upstream.arrayBuffer();

          res.writeHead(upstream.status, {
            'Content-Type': upstream.headers.get('Content-Type') || 'application/json',
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
            'Access-Control-Allow-Private-Network': 'true',
            'Cache-Control': 'no-cache'
          });
          res.end(Buffer.from(body));
        } catch (err: any) {
          const msg = err instanceof Error ? err.message : String(err);
          const isAbort = msg.includes('abort') || msg.includes('The operation was aborted');
          const code = isAbort ? 504 : 502;
          res.writeHead(code, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: isAbort ? 'timeout' : 'network', detail: msg }));
        }
      });
    }
  };
}

export default defineConfig({
  plugins: [
    deviceProxyPlugin(),
    react(),
    tailwindcss()
  ],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname || '.', './src')
    }
  },
  server: {
    port: 5173,
    host: true,
    proxy: {
      '/api': {
        target: 'http://localhost:8888',
        changeOrigin: true
      }
    }
  }
});
