import { buildServer } from './api/server.js';
import { startAlertMonitor } from './core/alerts.js';
import { config } from './core/config.js';
import { startScheduler } from './core/scheduler.js';
import { runMigrations } from './db/migrate.js';
import { appartementdelft } from './scrapers/appartementdelft.js';
import { bjornd } from './scrapers/bjornd.js';
import { buurtje } from './scrapers/buurtje.js';
import { directwonen } from './scrapers/directwonen.js';
import { funda } from './scrapers/funda.js';
import { huure } from './scrapers/huure.js';
import { huurwoningen } from './scrapers/huurwoningen.js';
import { huislijn } from './scrapers/huislijn.js';
import { huizenvinder } from './scrapers/huizenvinder.js';
import { huurstunt } from './scrapers/huurstunt.js';
import { huurwoningportaal } from './scrapers/huurwoningportaal.js';
import { ikwilhuren } from './scrapers/ikwilhuren.js';
import { marktplaats } from './scrapers/marktplaats.js';
import { oudedelft } from './scrapers/oudedelft.js';
import { pararius } from './scrapers/pararius.js';
import { rent } from './scrapers/rent.js';
import { rentfinder } from './scrapers/rentfinder.js';
import { rentola } from './scrapers/rentola.js';
import { rentumo } from './scrapers/rentumo.js';
import { roommatch } from './scrapers/roommatch.js';
import { trovit } from './scrapers/trovit.js';
import { vbt } from './scrapers/vbt.js';
import { woonnethaaglanden } from './scrapers/woonnethaaglanden.js';

runMigrations();

const app = buildServer();
await app.listen({ port: config.PORT, host: config.HOST });

if (!config.SCRAPERS_ENABLED) {
  console.log('[scheduler] SCRAPERS_ENABLED=false — not polling any sources');
}
const scheduler = startScheduler(
  config.SCRAPERS_ENABLED
    ? [
        { ...pararius, intervalSec: config.POLL_INTERVAL_PARARIUS_SEC },
        { ...huurwoningen, intervalSec: config.POLL_INTERVAL_HUURWONINGEN_SEC },
        { ...funda, intervalSec: config.POLL_INTERVAL_FUNDA_SEC },
        { ...huure, intervalSec: config.POLL_INTERVAL_HUURE_SEC },
        { ...appartementdelft, intervalSec: config.POLL_INTERVAL_APPARTEMENTDELFT_SEC },
        { ...bjornd, intervalSec: config.POLL_INTERVAL_BJORND_SEC },
        { ...oudedelft, intervalSec: config.POLL_INTERVAL_OUDEDELFT_SEC },
        { ...ikwilhuren, intervalSec: config.POLL_INTERVAL_IKWILHUREN_SEC },
        { ...huurwoningportaal, intervalSec: config.POLL_INTERVAL_HUURWONINGPORTAAL_SEC },
        { ...rentfinder, intervalSec: config.POLL_INTERVAL_RENTFINDER_SEC },
        { ...huislijn, intervalSec: config.POLL_INTERVAL_HUISLIJN_SEC },
        { ...huizenvinder, intervalSec: config.POLL_INTERVAL_HUIZENVINDER_SEC },
        { ...rent, intervalSec: config.POLL_INTERVAL_RENT_SEC },
        { ...directwonen, intervalSec: config.POLL_INTERVAL_DIRECTWONEN_SEC },
        { ...vbt, intervalSec: config.POLL_INTERVAL_VBT_SEC },
        { ...marktplaats, intervalSec: config.POLL_INTERVAL_MARKTPLAATS_SEC },
        { ...huurstunt, intervalSec: config.POLL_INTERVAL_HUURSTUNT_SEC },
        { ...rentumo, intervalSec: config.POLL_INTERVAL_RENTUMO_SEC },
        { ...rentola, intervalSec: config.POLL_INTERVAL_RENTOLA_SEC },
        { ...buurtje, intervalSec: config.POLL_INTERVAL_BUURTJE_SEC },
        { ...trovit, intervalSec: config.POLL_INTERVAL_TROVIT_SEC },
        { ...woonnethaaglanden, intervalSec: config.POLL_INTERVAL_WOONNET_SEC },
        { ...roommatch, intervalSec: config.POLL_INTERVAL_ROOMMATCH_SEC },
      ]
    : [],
);
const alertMonitor = startAlertMonitor();

console.log(`huisjeszoeken up on http://${config.HOST}:${config.PORT} (DRY_RUN=${config.DRY_RUN})`);

let shuttingDown = false;
async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`\n${signal} received — stopping scheduler and API...`);
  scheduler.stop();
  alertMonitor.stop();
  await app.close();
  process.exit(0);
}

process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));
