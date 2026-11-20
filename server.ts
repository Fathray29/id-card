import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import { createApiApp } from './server/app.ts';

const PORT = Number(process.env.PORT || 3000);
const HOST = '0.0.0.0';
const IS_PROD = process.env.NODE_ENV === 'production';

async function startServer() {
  const app = createApiApp();

  if (!IS_PROD) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      const indexPath = path.resolve(distDir, 'index.html');
      if (fs.existsSync(indexPath)) {
        res.sendFile(indexPath);
      } else {
        res.status(404).send('Build output not found. Run npm run build first.');
      }
    });
  }

  app.listen(PORT, HOST, () => {
    console.log(`BadgeForge 3D server listening on http://${HOST}:${PORT}`);
  });
}

void startServer();
