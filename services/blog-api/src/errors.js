import { config } from './config.js';

export class HttpError extends Error {
  constructor(status, message, details = undefined) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

export function notFoundHandler(req, res, next) {
  next(new HttpError(404, 'Not found'));
}

export function errorHandler(err, req, res, _next) {
  const cloudCredentialsError = isGoogleCloudCredentialsError(err);
  const status = err.status || 500;
  const exposeDetails = config.nodeEnv !== 'production';
  const body = {
    error: {
      message: errorMessage(err, status, cloudCredentialsError, exposeDetails),
      requestId: req.requestId,
    },
  };

  if (err.details) body.error.details = err.details;
  if (exposeDetails && status === 500 && err.message) body.error.details = { message: err.message };

  console.error(JSON.stringify({
    severity: status >= 500 ? 'ERROR' : 'WARNING',
    requestId: req.requestId,
    method: req.method,
    path: req.path,
    status,
    message: err.message,
    code: err.code,
    details: err.details,
  }));

  res.status(status).json(body);
}

function errorMessage(err, status, cloudCredentialsError, exposeDetails) {
  if (cloudCredentialsError) {
    return 'Faltan credenciales locales validas de Google Cloud. Ejecuta npm.cmd run blog-api:cloud:auth, npm.cmd run blog-api:cloud:project y npm.cmd run blog-api:cloud:quota-project para usar Firestore/Cloud Storage reales desde el backend local.';
  }

  if (exposeDetails && status === 500) return err.message || 'Internal server error';

  return status === 500 ? 'Internal server error' : err.message;
}

function isGoogleCloudCredentialsError(err) {
  return /Could not load the default credentials|NO_ADC_FOUND|Application Default Credentials|refreshing your current auth tokens|quota project|invalid_grant|invalid_rapt/i.test(err?.message || '');
}
