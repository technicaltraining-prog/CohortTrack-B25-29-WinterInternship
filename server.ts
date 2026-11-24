import 'dotenv/config';
import path from 'node:path';
import express, { type Request, type Response } from 'express';
import { createApiApp } from './server/createApp.ts';

const PORT = Number(process.env.PORT) || 3000;
const ROOT_DIR = process.cwd();

async function startServer(): Promise<void> {
  const app = createApiApp();

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(ROOT_DIR, 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`CohortTrack server listening on http://localhost:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start CohortTrack server:', err);
  process.exit(1);
});
