import 'dotenv/config';
import { createApp } from './server/app.ts';
import { initDatabase } from './server/db/database.ts';

initDatabase();

async function startServer() {
  const PORT = Number(process.env.PORT) || 3000;
  const isProd = process.env.NODE_ENV === 'production';
  const app = await createApp({
    enableVite: !isProd,
    serveStaticDist: isProd,
  });

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`CLIMATO Geospatial Core v2.0 running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
