import { describe, expect, it } from 'vitest';
import { ApiError } from '../../errors.js';
import { normalizeCurrentSenators } from './legislators.js';

const observedAt = '2026-08-03T15:00:00.000Z';

describe('normalización del Senado', () => {
  it('normaliza la fuente oficial vigente sin perder acentos', () => {
    const result = normalizeCurrentSenators(payload(), 'snapshot-senate', observedAt, 1);
    expect(result.records).toHaveLength(1);
    expect(result.records[0]).toMatchObject({ externalId: '546', fullName: 'María Pérez', district: 'Córdoba', party: 'Unión Provincial', currentBloc: 'Bloque Federal' });
  });

  it('pone en cuarentena un padrón sospechosamente pequeño', () => {
    expect(() => normalizeCurrentSenators(payload(), 'snapshot-senate', observedAt, 2)).toThrowError(ApiError);
  });
});

function payload() {
  return Buffer.from(JSON.stringify({ table: { rows: [{ ID: '546', BLOQUE: 'BLOQUE FEDERAL', APELLIDO: 'PÉREZ', NOMBRE: 'MARÍA', PROVINCIA: 'CÓRDOBA', 'PARTIDO O ALIANZA': 'UNIÓN PROVINCIAL', D_LEGAL: '2023-12-10', C_LEGAL: '2029-12-09', D_REAL: '2023-12-10', C_REAL: 'Sin Datos' }] } }));
}
