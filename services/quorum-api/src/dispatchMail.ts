import { dispatchPendingMail } from './mail.js';

const results = await dispatchPendingMail(100);
console.info(JSON.stringify({ processed: results.length, results }, null, 2));
