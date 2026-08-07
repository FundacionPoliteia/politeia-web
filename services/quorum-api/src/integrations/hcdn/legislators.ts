import { createHash } from 'node:crypto';
import { z } from 'zod';
import { externalLegislatorRecordSchema, type ExternalLegislatorRecord } from '@politeia/quorum-contracts';
import { ApiError } from '../../errors.js';
import { HCDN_LEGISLATORS_SOURCE_ID } from '../registry.js';

const requiredSourceString = z.union([z.string(), z.number()]).transform(String).pipe(z.string().trim().min(1));

const rawDeputySchema = z.object({
  ID: requiredSourceString.pipe(z.string().min(2)),
  APELLIDO: requiredSourceString,
  NOMBRE: requiredSourceString,
  GENERO: z.union([z.string(), z.number()]).transform(String).pipe(z.string().trim()).optional().default(''),
  DISTRITO: requiredSourceString,
  INICIO: requiredSourceString,
  FIN: requiredSourceString,
  JURAMENTO: z.union([z.string(), z.null()]).optional(),
  CESE: z.union([z.string(), z.null()]).optional(),
  BLOQUE: z.union([z.string(), z.null()]).optional(),
  BLOQUE_INICIO: z.union([z.string(), z.null()]).optional(),
  BLOQUE_FIN: z.union([z.string(), z.null()]).optional(),
}).passthrough();

type RawDeputy = z.infer<typeof rawDeputySchema>;

export function normalizeCurrentDeputies(payload: Buffer, snapshotId: string, observedAt: string, minimumExpected = 200) {
  let parsed: unknown;
  try { parsed = JSON.parse(payload.toString('utf8')); }
  catch { throw new ApiError(422, 'hcdn_invalid_json', 'El recurso de Diputados no contiene JSON válido'); }
  if (!Array.isArray(parsed)) throw new ApiError(422, 'hcdn_invalid_shape', 'El recurso de Diputados no contiene una lista');
  const rows = parsed.map((item, index) => {
    const result = rawDeputySchema.safeParse(item);
    if (!result.success) throw new ApiError(422, 'hcdn_schema_changed', `El registro ${index + 1} no cumple el contrato esperado`);
    return result.data;
  });
  const schemaFingerprint = fingerprint([...new Set(parsed.flatMap((item) => item && typeof item === 'object' ? Object.keys(item) : []))].sort());
  const today = observedAt.slice(0, 10);
  const grouped = new Map<string, RawDeputy[]>();
  for (const row of rows) {
    const list = grouped.get(row.ID) || [];
    list.push(row); grouped.set(row.ID, list);
  }
  const records: ExternalLegislatorRecord[] = [];
  for (const [externalId, history] of grouped) {
    const activeMandate = history.filter((row) => {
      const start = date(row.INICIO); const end = date(row.FIN); const cessation = date(row.CESE);
      return Boolean(start && end && start <= today && end >= today && (!cessation || cessation >= today));
    });
    if (!activeMandate.length) continue;
    const current = [...activeMandate].sort((left, right) => (date(right.BLOQUE_INICIO) || '').localeCompare(date(left.BLOQUE_INICIO) || ''))[0];
    const blocHistory = unique(history.map((row) => ({ name: clean(row.BLOQUE), start: date(row.BLOQUE_INICIO), end: date(row.BLOQUE_FIN) })).filter((item) => item.name));
    records.push(externalLegislatorRecordSchema.parse({
      id: `${HCDN_LEGISLATORS_SOURCE_ID}:${snapshotId}:${externalId.toLowerCase()}`,
      sourceId: HCDN_LEGISLATORS_SOURCE_ID,
      externalId,
      snapshotId,
      officialUrl: 'https://datos.hcdn.gob.ar/dataset/legisladores',
      fullName: title(`${current.NOMBRE} ${current.APELLIDO}`),
      givenNames: title(current.NOMBRE),
      familyName: title(current.APELLIDO),
      gender: gender(current.GENERO),
      district: title(current.DISTRITO),
      mandateStart: requiredDate(current.INICIO),
      mandateEnd: requiredDate(current.FIN),
      oathDate: date(current.JURAMENTO),
      cessationDate: date(current.CESE),
      currentBloc: title(clean(current.BLOQUE)),
      blocHistory,
      observedAt,
      rawFingerprint: fingerprint(history),
    }));
  }
  if (records.length < minimumExpected) throw new ApiError(422, 'hcdn_suspicious_record_count', `La fuente sólo produjo ${records.length} diputados vigentes; se requiere revisión manual`);
  return { rows, records: records.sort((a, b) => a.fullName.localeCompare(b.fullName, 'es')), schemaFingerprint };
}

function date(value?: string | null) {
  if (!value) return null;
  const match = String(value).match(/^(\d{4}-\d{2}-\d{2})/);
  return match?.[1] || null;
}
function requiredDate(value: string) { const result = date(value); if (!result) throw new ApiError(422, 'hcdn_invalid_date', 'Diputados informó una fecha obligatoria inválida'); return result; }
function clean(value?: string | null) { return String(value || '').trim(); }
function title(value: string) { return value.toLocaleLowerCase('es-AR').replace(/(^|[\s-])([a-záéíóúüñ])/g, (_match, prefix, letter) => `${prefix}${letter.toLocaleUpperCase('es-AR')}`); }
function gender(value: string): 'F' | 'M' | 'X' | 'unknown' { const cleanValue = value.toUpperCase(); return cleanValue === 'F' || cleanValue === 'M' || cleanValue === 'X' ? cleanValue : 'unknown'; }
function fingerprint(value: unknown) { return createHash('sha256').update(JSON.stringify(value)).digest('hex'); }
function unique(items: Array<{ name: string; start: string | null; end: string | null }>) { return [...new Map(items.map((item) => [`${item.name}|${item.start}|${item.end}`, item])).values()]; }
