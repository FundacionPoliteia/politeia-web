import { createApp } from './app.js';
import { assertProductionConfig, assertRuntimeConfig, config } from './config.js';

assertRuntimeConfig();
assertProductionConfig();
createApp().listen(config.port, () => {
  console.info(`Quórum API escuchando en ${config.port}`);
});
