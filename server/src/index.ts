import { config } from './config';
import { createApp } from './app';
import { migrate } from './db/migrate';

await migrate(config.migrationUrl, { quiet: true });
createApp().listen(config.port, () => {
  console.log(`Nexo Business API em http://localhost:${config.port} (${config.env})`);
});
