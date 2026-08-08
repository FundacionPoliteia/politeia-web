import { createHash } from 'node:crypto';
import { z } from 'zod';
import { externalLegislatorRecordSchema, type ExternalLegislatorRecord } from '@politeia/quorum-contracts';
import { ApiError } from '../../errors.js';
import { SENATE_LEGISLATORS_SOURCE_ID } from '../registry.js';

const sourceString = z.union([z.string(), z.number()]).transform(String).pipe(z.string().trim());
const requiredSourceString = sourceString.pipe(z.string().min(1));
const rawSenatorSchema = z.object({
  ID: requiredSourceString,
  BLOQUE: sourceString.default(''),
  APELLIDO: requiredSourceString,
  NOMBRE: requiredSourceString,
  PROVINCIA: requiredSourceString,
  'PARTIDO O ALIANZA': sourceString.default(''),
  D_LEGAL: requiredSourceString,
  C_LEGAL: requiredSourceString,
  D_REAL: sourceString.default(''),
  C_REAL: sourceString.default(''),
}).passthrough();

export function normalizeCurrentSenators(payload: Buffer, snapshotId: string, observedAt: string, minimumExpected = 70) {
  let parsed: unknown;
  try { parsed = JSON.parse(payload.toString('utf8')); }
  catch { throw new ApiError(422, 'senate_invalid_json', 'El recurso del Senado no contiene JSON UTF-8 válido'); }
  const rawRows = parsed && typeof parsed === 'object' && 'table' in parsed
    ? (parsed as { table?: { rows?: unknown } }).table?.rows
    : null;
  if (!Array.isArray(rawRows)) throw new ApiError(422, 'senate_invalid_shape', 'El recurso del Senado no contiene table.rows');
  const rows = rawRows.map((item, index) => {
    const result = rawSenatorSchema.safeParse(item);
    if (!result.success) throw new ApiError(422, 'senate_schema_changed', `El registro ${index + 1} no cumple el contrato esperado`);
    return result.data;
  });
  const schemaFingerprint = fingerprint([...new Set(rawRows.flatMap((item) => item && typeof item === 'object' ? Object.keys(item) : []))].sort());
  const records: ExternalLegislatorRecord[] = rows.map((row) => {
    const externalId = row.ID;
    const mandateStart = requiredDate(row.D_LEGAL);
    const mandateEnd = requiredDate(row.C_LEGAL);
    const bloc = title(row.BLOQUE);
    return externalLegislatorRecordSchema.parse({
      id: `${SENATE_LEGISLATORS_SOURCE_ID}:${snapshotId}:${externalId.toLowerCase()}`,
      sourceId: SENATE_LEGISLATORS_SOURCE_ID, externalId, snapshotId,
      officialUrl: `https://www.senado.gob.ar/senadores/senador/${encodeURIComponent(externalId)}`,
      fullName: title(`${row.NOMBRE} ${row.APELLIDO}`), givenNames: title(row.NOMBRE), familyName: title(row.APELLIDO),
      gender: 'unknown', district: title(row.PROVINCIA), mandateStart, mandateEnd,
      oathDate: date(row.D_REAL), cessationDate: date(row.C_REAL), party: title(row['PARTIDO O ALIANZA']), currentBloc: bloc,
      blocHistory: bloc ? [{ name: bloc, start: mandateStart, end: mandateEnd }] : [],
      observedAt, rawFingerprint: fingerprint(row),
    });
  });
  if (records.length < minimumExpected) throw new ApiError(422, 'senate_suspicious_record_count', `La fuente sólo produjo ${records.length} senadores vigentes; se requiere revisión manual`);
  if (new Set(records.map((item) => item.externalId)).size !== records.length) throw new ApiError(422, 'senate_duplicate_ids', 'El Senado informó identificadores duplicados');
  return { rows, records: records.sort((a, b) => a.fullName.localeCompare(b.fullName, 'es')), schemaFingerprint };
}

function date(value: string) { return value.match(/^(\d{4}-\d{2}-\d{2})/)?.[1] || null; }
function requiredDate(value: string) { const result = date(value); if (!result) throw new ApiError(422, 'senate_invalid_date', 'El Senado informó una fecha obligatoria inválida'); return result; }
function title(value: string) { return value.trim().toLocaleLowerCase('es-AR').replace(/(^|[\s-])([a-záéíóúüñ])/g, (_match, prefix, letter) => `${prefix}${letter.toLocaleUpperCase('es-AR')}`); }
function fingerprint(value: unknown) { return createHash('sha256').update(JSON.stringify(value)).digest('hex'); }
