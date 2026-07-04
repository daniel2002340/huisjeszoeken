import { existsSync } from 'node:fs';
import path from 'node:path';
import fastifyCookie from '@fastify/cookie';
import fastifyStatic from '@fastify/static';
import Fastify, { type FastifyInstance } from 'fastify';
import { config } from '../core/config.js';
import { apiRoutes } from './routes.js';

/**
 * Fastify server: dashboard API under /api plus the built SPA from
 * src/web/dist (PLAN.md §6). Tailnet-only in deployment. The API requires a
 * session cookie: friends log in with the username/password on their profile
 * and only see their own matches; DASHBOARD_PASSWORD is the password for the
 * built-in `admin` user, who sees everything. Static files and /health stay
 * open — the login form is part of the SPA.
 */

const WEB_DIST = path.resolve('src/web/dist');

export interface ServerOptions {
  /** Override for tests; defaults to config.DASHBOARD_PASSWORD. */
  dashboardPassword?: string | undefined;
}

export function buildServer(options: ServerOptions = {}): FastifyInstance {
  const app = Fastify({ logger: true });
  const adminPassword =
    'dashboardPassword' in options ? options.dashboardPassword : config.DASHBOARD_PASSWORD;

  if (!adminPassword) {
    app.log.warn('DASHBOARD_PASSWORD not set — admin login is disabled');
  }

  app.get('/health', async () => ({
    ok: true,
    uptimeSec: Math.round(process.uptime()),
  }));

  void app.register(fastifyCookie);
  void app.register(apiRoutes, { prefix: '/api', adminPassword });

  if (existsSync(WEB_DIST)) {
    void app.register(fastifyStatic, { root: WEB_DIST });
    // SPA fallback: unknown GET paths outside /api serve the app shell.
    app.setNotFoundHandler((req, reply) => {
      if (req.method === 'GET' && !req.url.startsWith('/api')) {
        return reply.sendFile('index.html');
      }
      return reply.code(404).send({ error: 'not found' });
    });
  } else {
    app.get('/', async () => ({
      ok: true,
      note: 'dashboard not built — run `pnpm web:build` (see PLAN.md §6)',
    }));
  }

  return app;
}
