import { config } from '../config.js';
import { recordApiRequest } from '../repositories/operations.js';

export function apiRequestLogger(req, res, next) {
  if (
    !config.apiRequestConsoleLogsEnabled
    && !config.apiRequestFirestoreLogsEnabled
    && !config.apiRequestLogsEnabled
  ) return next();
  const startedAt = process.hrtime.bigint();
  let completed = false;

  const complete = (aborted = false) => {
    if (completed) return;
    completed = true;
    const durationMs = Number(process.hrtime.bigint() - startedAt) / 1e6;
    const status = aborted && !res.writableFinished ? 499 : res.statusCode;
    const entry = {
      requestId: req.requestId,
      method: req.method,
      path: req.originalUrl || req.path,
      queryKeys: Object.keys(req.query || {}),
      status,
      durationMs,
      responseBytes: Number(res.getHeader('content-length') || 0),
      actorEmail: req.user?.email || '',
      origin: req.get('origin') || '',
      errorMessage: res.locals.apiErrorMessage || '',
      aborted,
    };

    if (config.apiRequestConsoleLogsEnabled) {
      console.info(JSON.stringify({
        severity: status >= 500 ? 'ERROR' : status >= 400 ? 'WARNING' : 'INFO',
        message: 'api request completed',
        requestId: entry.requestId,
        method: entry.method,
        path: String(entry.path || '').split('?')[0],
        status,
        durationMs: Math.round(durationMs),
        actorEmail: entry.actorEmail,
        originHost: safeOriginHost(entry.origin),
        errorMessage: entry.errorMessage,
      }));
    }

    if (config.apiRequestFirestoreLogsEnabled || config.apiRequestLogsEnabled) recordApiRequest(entry).catch((err) => {
      console.error(JSON.stringify({
        severity: 'ERROR',
        message: 'api request log persistence failed',
        requestId: entry.requestId,
        error: err?.message || 'Unknown log persistence error',
      }));
    });
  };

  res.once('finish', () => complete(false));
  res.once('close', () => {
    if (!res.writableFinished) complete(true);
  });
  next();
}

function safeOriginHost(value = '') {
  try {
    return new URL(value).host;
  } catch {
    return '';
  }
}
