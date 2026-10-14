import { projectFieldLabel } from './projectEditorSync';

type ValidationIssue = {
  path?: readonly PropertyKey[];
  code?: string;
  message?: string;
  expected?: string;
  received?: string;
  input?: unknown;
  origin?: string;
  format?: string;
  minimum?: number | bigint;
  maximum?: number | bigint;
};

type ManagementFailure = {
  status: number;
  code: string;
  message?: string;
  serverMessage?: string;
  requestId?: string;
};

const expectedTypes: Record<string, string> = {
  string: 'texto', number: 'número', boolean: 'una opción sí/no', array: 'una lista',
  object: 'un objeto', date: 'una fecha', bigint: 'un número entero',
};

function sizeMessage(origin: string | undefined, value: number | bigint, direction: 'min' | 'max') {
  const amount = String(value);
  if (origin === 'string') {
    if (direction === 'min' && Number(value) <= 1) return 'Este campo no puede quedar vacío.';
    return direction === 'min' ? `Usá al menos ${amount} caracteres.` : `Usá como máximo ${amount} caracteres.`;
  }
  if (origin === 'array') return direction === 'min' ? `Agregá al menos ${amount} elemento(s).` : `Reducí la lista a ${amount} elemento(s) como máximo.`;
  return direction === 'min' ? `El valor debe ser como mínimo ${amount}.` : `El valor debe ser como máximo ${amount}.`;
}

function validationMessage(issue: ValidationIssue) {
  switch (issue.code) {
    case 'invalid_type': {
      const missing = issue.received === 'undefined' || /received undefined/i.test(issue.message || '')
        || (Object.prototype.hasOwnProperty.call(issue, 'input') && issue.input === undefined);
      if (missing) return 'Completá este campo.';
      const expected = issue.expected ? expectedTypes[issue.expected] : undefined;
      return expected ? `Ingresá un valor válido como ${expected}.` : 'El tipo de dato no es válido.';
    }
    case 'too_small':
      return issue.minimum !== undefined ? sizeMessage(issue.origin, issue.minimum, 'min') : 'El valor es demasiado corto o tiene pocos elementos.';
    case 'too_big':
      return issue.maximum !== undefined ? sizeMessage(issue.origin, issue.maximum, 'max') : 'El valor supera el límite permitido.';
    case 'invalid_format': {
      const format = issue.format?.toLowerCase();
      if (format === 'url') return 'Ingresá una URL válida, incluyendo https://.';
      if (format === 'email') return 'Ingresá una dirección de correo válida.';
      if (format === 'uuid') return 'El identificador no tiene un formato válido.';
      if (format === 'date') return 'Ingresá una fecha válida.';
      return 'Revisá el formato de este dato.';
    }
    case 'invalid_value': return 'Elegí una de las opciones disponibles.';
    case 'unrecognized_keys': return 'El formulario contiene campos que el servidor no reconoce. Recargá el gestor e intentá nuevamente.';
    default: {
      const message = issue.message?.trim();
      if (message && !/^(invalid input|too small|too big|invalid string|expected )/i.test(message)) return message;
      return 'Revisá el valor ingresado.';
    }
  }
}

export function describeProjectValidationIssue(issue: ValidationIssue) {
  return `${projectFieldLabel(issue.path || [])}: ${validationMessage(issue)}`;
}

export function describeManagementFailure(failure: ManagementFailure, action = 'guardar los cambios') {
  let message: string;
  switch (failure.code) {
    case 'network_error':
      message = `No pudimos contactar con el servidor para ${action}. Puede ser un corte de conexión; el resultado no se pudo confirmar. Tus cambios siguen en esta pantalla. Sincronizá antes de volver a intentar.`;
      break;
    case 'validation_error':
      message = `El servidor rechazó algunos datos al ${action}. Revisá los campos señalados, corregilos y volvé a intentar; tus cambios siguen en esta pantalla.`;
      break;
    case 'project_draft_changed':
      message = 'No se guardó esta versión: el borrador cambió desde la última sincronización, posiblemente en otra pestaña o sesión. La versión guardada no se sobrescribió y tus cambios siguen en pantalla. Compará ambas versiones y resolvé las diferencias antes de reintentar.';
      break;
    case 'position_conflict':
      message = 'No se guardó esta declaración: cambió en otra sesión. La versión guardada no se reemplazó. Volvé a cargarla, compará el texto y elegí cuál conservar.';
      break;
    case 'publication_review_stale':
      message = 'No se publicó la revisión: el borrador cambió después de comparar las diferencias. Actualizá la comparación y confirmá nuevamente.';
      break;
    case 'project_slug_exists':
    case 'slug_conflict':
      message = 'No se guardó porque ese slug o URL ya está en uso por otro proyecto. Elegí un identificador distinto.';
      break;
    case 'published_slug_locked':
      message = 'No se guardó: un proyecto publicado no permite cambiar su slug o URL.';
      break;
    default:
      if (failure.status === 401) message = 'Tu sesión venció o dejó de ser válida. Volvé a iniciar sesión; mantené esta pestaña abierta para conservar lo que escribiste.';
      else if (failure.status === 403) message = 'Tu cuenta no tiene permiso para completar esta acción. Consultá con una persona administradora; tus cambios siguen en pantalla.';
      else if (failure.status === 404) message = 'No encontramos el proyecto o recurso solicitado. Puede haberse eliminado o archivado; recargá el gestor antes de continuar.';
      else if (failure.status === 409) message = failure.serverMessage || failure.message || 'La información cambió o entra en conflicto con otro registro. No se aplicó el cambio; recargá y revisá el estado actual antes de reintentar.';
      else if (failure.status === 422) message = 'El servidor no aceptó los datos enviados. Revisá los campos señalados y corregilos antes de volver a intentar.';
      else if (failure.status >= 500) message = `El servidor encontró un problema al ${action} y no podemos confirmar el resultado. Tus cambios siguen en esta pantalla. Sincronizá antes de volver a intentar.`;
      else message = failure.serverMessage || failure.message || `No pudimos ${action}. Revisá los datos e intentá nuevamente.`;
  }
  return failure.requestId ? `${message} · referencia ${failure.requestId}` : message;
}
