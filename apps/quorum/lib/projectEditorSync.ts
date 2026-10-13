import type { ProjectInput } from '@politeia/quorum-contracts';

const labels: Record<string, string> = {
  title: 'Título', slug: 'Slug', docketNumber: 'Expediente', entryDate: 'Fecha de ingreso',
  originChamberId: 'Cámara de origen', initiativeTypeId: 'Iniciativa', publicDebate: 'Situación pública',
  workflowId: 'Flujo', workflowVersion: 'Versión del flujo', currentStageId: 'Etapa actual',
  stageExplanationOverrides: 'Explicaciones de etapas', summary: 'Resumen', summaryFormat: 'Formato del resumen',
  impact: '¿Cómo me afecta?', impactFormat: 'Formato de impacto', authorLegislatorId: 'Autor/a',
  signatoryIds: 'Firmantes', votingResults: 'Votaciones', positions: 'A favor / En contra',
  glossaryTermIds: 'Términos del glosario', glossaryEnabled: 'Glosario contextual',
  glossaryExcludedTermIds: 'Términos excluidos', glossaryOccurrenceMode: 'Apariciones del glosario',
  glossaryExcludedOccurrenceIds: 'Apariciones excluidas', documents: 'Documentos oficiales',
  sources: 'Fuentes', updates: 'Cronología', icon: 'Ícono', featured: 'Proyecto destacado', order: 'Orden',
  label: 'Nombre', url: 'URL', id: 'Identificador', date: 'Fecha', subject: 'Qué se votó',
  name: 'Nombre', body: 'Texto', contextualDetail: 'Explicación aplicada',
};

export function sameProjectValue(left: unknown, right: unknown) {
  const canonical = (_key: string, value: unknown) => value && typeof value === 'object' && !Array.isArray(value)
    ? Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)))
    : value;
  return JSON.stringify(left, canonical) === JSON.stringify(right, canonical);
}

export function reconcileProjectInputs(base: ProjectInput, local: ProjectInput, remote: ProjectInput) {
  const merged = { ...remote } as ProjectInput;
  const conflicts: Array<keyof ProjectInput> = [];
  const keys = new Set([...Object.keys(base), ...Object.keys(local), ...Object.keys(remote)] as Array<keyof ProjectInput>);

  for (const key of keys) {
    const localChanged = !sameProjectValue(local[key], base[key]);
    const remoteChanged = !sameProjectValue(remote[key], base[key]);
    if (localChanged && remoteChanged && !sameProjectValue(local[key], remote[key])) conflicts.push(key);
    else if (localChanged) (merged as Record<keyof ProjectInput, unknown>)[key] = local[key];
  }

  return { merged, conflicts };
}

export function projectFieldLabel(path: readonly PropertyKey[]) {
  const first = path.find((part) => typeof part === 'string');
  const label = typeof first === 'string' ? labels[first] || first : 'Proyecto';
  const nested = path.slice(1).map((part) => typeof part === 'number' ? `n.º ${part + 1}` : labels[String(part)] || String(part));
  return [label, ...nested].join(' · ');
}

export function projectValueForReview(value: unknown) {
  const serialized = typeof value === 'string' ? value || '(vacío)' : JSON.stringify(value, null, 2) ?? '(vacío)';
  return serialized.length > 4000 ? `${serialized.slice(0, 4000)}\n…(contenido recortado)` : serialized;
}

export type ProjectEditorRecovery = {
  form: ProjectInput;
  base: ProjectInput;
  createKey: string;
  createSubmission: ProjectInput | null;
  savedAt: number;
};

export type LoadedProjectEditorRecovery = {
  value: ProjectEditorRecovery;
  copiesFound: number;
};

export function projectEditorRecoveryScope(email: string, projectId?: string) {
  return `quorum:project-editor:v2:${encodeURIComponent(email.trim().toLowerCase())}:${encodeURIComponent(projectId || 'new')}:`;
}

export function projectEditorRecoveryKey(email: string, projectId: string | undefined, sessionId: string) {
  return `${projectEditorRecoveryScope(email, projectId)}${encodeURIComponent(sessionId)}`;
}

function parseRecovery(serialized: string): ProjectEditorRecovery | null {
  try {
    const parsed = JSON.parse(serialized) as ProjectEditorRecovery;
    if (!parsed || !Number.isFinite(parsed.savedAt) || parsed.savedAt < Date.now() - 7 * 24 * 60 * 60 * 1000
      || !parsed.form || typeof parsed.form !== 'object' || Array.isArray(parsed.form)
      || !parsed.base || typeof parsed.base !== 'object' || Array.isArray(parsed.base)
      || typeof parsed.createKey !== 'string' || !parsed.createKey) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function writeProjectEditorRecovery(key: string, value: ProjectEditorRecovery | null, legacyKey?: string) {
  try {
    if (value) localStorage.setItem(key, JSON.stringify(value));
    else localStorage.removeItem(key);
  } catch (error) {
    const quotaExceeded = typeof DOMException !== 'undefined' && error instanceof DOMException
      ? error.name === 'QuotaExceededError' || error.code === 22 || error.code === 1014
      : error instanceof Error && /quota|storage.?full/i.test(`${error.name} ${error.message}`);
    if (!value || !quotaExceeded) return false;
    try {
      const expiredKeys: string[] = [];
      for (let index = 0; index < localStorage.length; index += 1) {
        const candidate = localStorage.key(index);
        if (!candidate?.startsWith('quorum:project-editor:v2:')) continue;
        const serialized = localStorage.getItem(candidate);
        let savedAt = NaN;
        try { savedAt = Number((JSON.parse(serialized || 'null') as { savedAt?: unknown } | null)?.savedAt); } catch { /* Keep malformed copies for manual recovery. */ }
        if (Number.isFinite(savedAt) && savedAt < Date.now() - 7 * 24 * 60 * 60 * 1000) expiredKeys.push(candidate);
      }
      for (const expiredKey of expiredKeys) localStorage.removeItem(expiredKey);
      localStorage.setItem(key, JSON.stringify(value));
    } catch { return false; }
  }
  try {
    if (legacyKey) {
      try { sessionStorage.removeItem(legacyKey); } catch { /* The durable copy has already been written. */ }
    }
    return true;
  } catch { return false; }
}

export function clearConfirmedProjectEditorRecoveries(key: string, confirmedForm: ProjectInput) {
  const prefix = key.slice(0, key.lastIndexOf(':') + 1);
  try {
    const confirmedKeys: string[] = [];
    for (let index = 0; index < localStorage.length; index += 1) {
      const candidate = localStorage.key(index);
      if (!candidate?.startsWith(prefix)) continue;
      const serialized = localStorage.getItem(candidate);
      const recovery = serialized ? parseRecovery(serialized) : null;
      if (recovery && sameProjectValue(recovery.form, confirmedForm)) confirmedKeys.push(candidate);
    }
    for (const confirmedKey of confirmedKeys) localStorage.removeItem(confirmedKey);
    return true;
  } catch { return false; }
}

export function readProjectEditorRecovery(key: string, legacyKey?: string): LoadedProjectEditorRecovery | null {
  const prefix = key.slice(0, key.lastIndexOf(':') + 1);
  let matches: ProjectEditorRecovery[] = [];
  try {
    const staleKeys: string[] = [];
    for (let index = 0; index < localStorage.length; index += 1) {
      const candidateKey = localStorage.key(index);
      if (!candidateKey?.startsWith(prefix)) continue;
      const serialized = localStorage.getItem(candidateKey);
      const parsed = serialized ? parseRecovery(serialized) : null;
      if (parsed) matches.push(parsed);
      else staleKeys.push(candidateKey);
    }
    for (const staleKey of staleKeys) localStorage.removeItem(staleKey);
  } catch { /* Continue to the old tab-scoped copy if durable storage is unavailable. */ }
  if (matches.length) return { value: matches.sort((left, right) => right.savedAt - left.savedAt)[0], copiesFound: matches.length };

  // Migrate drafts written by the previous, tab-scoped recovery format.
  try {
    const legacy = legacyKey ? sessionStorage.getItem(legacyKey) : null;
    const parsed = legacy ? parseRecovery(legacy) : null;
    if (parsed) return { value: parsed, copiesFound: 1 };
    if (legacy && legacyKey) sessionStorage.removeItem(legacyKey);
  } catch { /* Both browser storage mechanisms can be disabled by policy. */ }
  return null;
}
