import { pathToFileURL } from 'node:url';
import { glossaryTermSchema, type GlossaryTerm } from '@politeia/quorum-contracts';
import { newId, store } from './store.js';

export async function migrateGlossaryInline(actorEmail = process.env.MIGRATION_ACTOR_EMAIL || 'migration@politeia.ar') {
  const existing = await store().list<Record<string, unknown>>('glossary');
  let updated = 0;
  let unchanged = 0;
  for (const raw of existing) {
    const needsMigration = !Array.isArray(raw.aliases)
      || typeof raw.shortDefinition !== 'string'
      || typeof raw.inlineEnabled !== 'boolean'
      || typeof raw.updatedBy !== 'string';
    if (!needsMigration) { unchanged += 1; continue; }
    const definition = typeof raw.definition === 'string' ? raw.definition : '';
    const item = glossaryTermSchema.parse({
      ...raw,
      aliases: Array.isArray(raw.aliases) ? raw.aliases : [],
      shortDefinition: typeof raw.shortDefinition === 'string' ? raw.shortDefinition : firstSentence(definition),
      inlineEnabled: typeof raw.inlineEnabled === 'boolean' ? raw.inlineEnabled : false,
      updatedBy: typeof raw.updatedBy === 'string' && raw.updatedBy ? raw.updatedBy : actorEmail,
    }) satisfies GlossaryTerm;
    await store().set('glossary', item.id, item);
    const auditId = newId('audit');
    await store().set('audits', auditId, {
      id: auditId, type: 'glossary.inline-fields.migrated', actorEmail, targetId: item.id,
      details: { inlineEnabled: false, aliases: item.aliases.length }, createdAt: new Date().toISOString(),
    });
    updated += 1;
  }
  return { total: existing.length, updated, unchanged };
}

function firstSentence(value: string) {
  const compact = value.replace(/\s+/g, ' ').trim();
  const sentence = compact.match(/^.*?[.!?](?:\s|$)/u)?.[0]?.trim() || compact;
  return sentence.length <= 320 ? sentence : `${sentence.slice(0, 317).trimEnd()}\u2026`;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  migrateGlossaryInline()
    .then((result) => console.log(JSON.stringify(result, null, 2)))
    .catch((error) => { console.error(error); process.exitCode = 1; });
}
