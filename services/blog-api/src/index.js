import { createApp } from './app.js';
import { config } from './config.js';

process.on('unhandledRejection', (err) => {
  console.error(JSON.stringify({
    severity: 'ERROR',
    message: 'Unhandled promise rejection',
    error: err?.message || String(err),
  }));
});

const app = createApp();

app.listen(config.port, () => {
  console.log(JSON.stringify({
    severity: 'INFO',
    message: 'blog-api listening',
    port: config.port,
  }));
});
