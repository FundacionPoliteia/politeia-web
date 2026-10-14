import { describe, expect, it } from 'vitest';
import { describeManagementFailure, describeProjectValidationIssue } from '../../lib/managementErrors';

describe('mensajes accionables del gestor editorial', () => {
  it('explica qué significa un conflicto de versión y conserva la referencia para soporte', () => {
    const message = describeManagementFailure({
      status: 409,
      code: 'project_draft_changed',
      requestId: 'request-123',
      serverMessage: 'Mensaje interno anterior',
    }, 'guardar el borrador');

    expect(message).toContain('el borrador cambió desde la última sincronización');
    expect(message).toContain('La versión guardada no se sobrescribió');
    expect(message).toContain('referencia request-123');
  });

  it('da instrucciones claras ante un error de conexión sin asumir un entorno local', () => {
    const message = describeManagementFailure({ status: 0, code: 'network_error' }, 'guardar el borrador');

    expect(message).toContain('No pudimos contactar con el servidor');
    expect(message).toContain('Sincronizá antes de volver a intentar');
    expect(message).not.toContain('backend local');
  });

  it('traduce errores estructurados de validación a instrucciones por campo', () => {
    expect(describeProjectValidationIssue({
      path: ['title'], code: 'invalid_type', expected: 'string', received: 'undefined',
      message: 'Invalid input: expected string, received undefined',
    })).toBe('Título: Completá este campo.');

    expect(describeProjectValidationIssue({
      path: ['title'], code: 'invalid_type', expected: 'string', received: 'number',
      message: 'Invalid input: expected string, received number',
    })).toBe('Título: Ingresá un valor válido como texto.');

    expect(describeProjectValidationIssue({
      path: ['sources', 1, 'url'], code: 'invalid_format', format: 'url', message: 'Invalid URL',
    })).toBe('Fuentes · n.º 2 · URL: Ingresá una URL válida, incluyendo https://.');
  });

  it('evita perder el error del campo cuando el servidor devuelve límites de longitud', () => {
    expect(describeProjectValidationIssue({ path: ['title'], code: 'too_small', origin: 'string', minimum: 5 }))
      .toBe('Título: Usá al menos 5 caracteres.');
  });

  it('explica errores internos como inciertos y conserva el identificador de seguimiento', () => {
    const message = describeManagementFailure({ status: 500, code: 'internal_error', requestId: 'request-500' }, 'guardar el borrador');

    expect(message).toContain('no podemos confirmar el resultado');
    expect(message).toContain('Sincronizá antes de volver a intentar');
    expect(message).toContain('referencia request-500');
  });
});
