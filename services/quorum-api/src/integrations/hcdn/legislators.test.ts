import { describe, expect, it } from 'vitest';
import { ApiError } from '../../errors.js';
import { normalizeCurrentDeputies } from './legislators.js';

const observedAt = '2026-08-03T15:00:00.000Z';

describe('normalización de Diputados', () => {
  it('conserva identidad, mandato e historial y elige el bloque vigente', () => {
    const payload = Buffer.from(JSON.stringify([
      row({ BLOQUE: 'BLOQUE ANTERIOR', BLOQUE_INICIO: '2025-12-10T00:00:00', BLOQUE_FIN: '2026-04-30T00:00:00' }),
      row({ BLOQUE: 'UNION POR LA PATRIA', BLOQUE_INICIO: '2026-05-01T00:00:00', BLOQUE_FIN: '2029-12-09T00:00:00' }),
      row({ ID: 'HCDN0002', APELLIDO: 'HISTORICO', NOMBRE: 'DIPUTADO', INICIO: '2019-12-10T00:00:00', FIN: '2023-12-09T00:00:00', CESE: '2023-12-09T00:00:00' }),
    ]));
    const result = normalizeCurrentDeputies(payload, 'snapshot-1', observedAt, 1);
    expect(result.records).toHaveLength(1);
    expect(result.records[0]).toMatchObject({ externalId: 'HCDN0001', fullName: 'María Pérez', district: 'Buenos Aires', currentBloc: 'Union Por La Patria' });
    expect(result.records[0].blocHistory).toHaveLength(2);
    expect(result.schemaFingerprint).toMatch(/^[a-f0-9]{64}$/);
  });

  it('pone en cuarentena conteos incompatibles con una nómina vigente', () => {
    const payload = Buffer.from(JSON.stringify([row()]));
    expect(() => normalizeCurrentDeputies(payload, 'snapshot-1', observedAt, 2)).toThrowError(ApiError);
    try { normalizeCurrentDeputies(payload, 'snapshot-1', observedAt, 2); } catch (error) { expect((error as ApiError).code).toBe('hcdn_suspicious_record_count'); }
  });

  it('rechaza cambios de contrato en campos obligatorios', () => {
    const payload = Buffer.from(JSON.stringify([{ ID: 'HCDN0001', NOMBRE: 'María' }]));
    try { normalizeCurrentDeputies(payload, 'snapshot-1', observedAt, 1); } catch (error) { expect((error as ApiError).code).toBe('hcdn_schema_changed'); }
  });
});

function row(overrides: Record<string, unknown> = {}) {
  return {
    ID: 'HCDN0001', APELLIDO: 'PÉREZ', NOMBRE: 'MARÍA', GENERO: 'F', DISTRITO: 'BUENOS AIRES',
    INICIO: '2025-12-10T00:00:00', FIN: '2029-12-09T00:00:00', JURAMENTO: '2025-12-03T00:00:00', CESE: null,
    BLOQUE: 'BLOQUE ACTUAL', BLOQUE_INICIO: '2025-12-10T00:00:00', BLOQUE_FIN: '2029-12-09T00:00:00', ...overrides,
  };
}
