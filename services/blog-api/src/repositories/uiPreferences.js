import { db, serializeDoc, serverTimestamp } from '../firestore.js';
import { normalizeEmail } from './users.js';

export const UI_PREFERENCE_TABS = ['blogs', 'newsletter', 'mailing', 'access', 'profiles', 'profile'];

export const UI_SECTION_DEFAULTS = Object.freeze({
  adminUsersOpen: false,
  adminManagerOpen: false,
  notificationPreferencesOpen: false,
  adminProfileClaimsOpen: false,
  adminProfileEditorOpen: true,
  previewCardOpen: true,
  advancedOptionsOpen: false,
  mobilePostsOpen: false,
});

export const UI_HELP_DEFAULTS = Object.freeze({
  completedGuides: Object.freeze({}),
  dismissedHints: Object.freeze([]),
});

const uiPreferences = () => db().collection('userUiPreferences');

export async function getUserUiPreferences(email) {
  const cleanEmail = normalizeEmail(email);
  if (!cleanEmail) return defaultUiPreferences();

  const doc = await uiPreferences().doc(preferenceId(cleanEmail)).get();
  if (!doc.exists) return defaultUiPreferences();
  return toUiPreferences(serializeDoc(doc));
}

export async function updateUserUiPreferences(email, input = {}) {
  const cleanEmail = normalizeEmail(email);
  const current = await getUserUiPreferences(cleanEmail);
  const next = sanitizeUiPreferences(input, current);
  const ref = uiPreferences().doc(preferenceId(cleanEmail));

  await ref.set({
    email: cleanEmail,
    version: next.version,
    lastPanelTab: next.lastPanelTab,
    sections: next.sections,
    help: next.help,
    updatedAt: serverTimestamp(),
  }, { merge: true });

  return toUiPreferences(serializeDoc(await ref.get()));
}

export function sanitizeUiPreferences(input = {}, fallback = defaultUiPreferences()) {
  const source = input && typeof input === 'object' ? input : {};
  const fallbackSections = fallback?.sections || UI_SECTION_DEFAULTS;
  const sourceSections = source.sections && typeof source.sections === 'object'
    ? source.sections
    : {};
  const sections = Object.fromEntries(
    Object.entries(UI_SECTION_DEFAULTS).map(([key, defaultValue]) => [
      key,
      typeof sourceSections[key] === 'boolean'
        ? sourceSections[key]
        : typeof fallbackSections[key] === 'boolean'
          ? fallbackSections[key]
          : defaultValue,
    ])
  );
  const fallbackHelp = sanitizeHelpPreferences(fallback?.help);
  const help = source.help && typeof source.help === 'object'
    ? sanitizeHelpPreferences(source.help, fallbackHelp)
    : fallbackHelp;

  return {
    version: 2,
    lastPanelTab: UI_PREFERENCE_TABS.includes(source.lastPanelTab)
      ? source.lastPanelTab
      : UI_PREFERENCE_TABS.includes(fallback?.lastPanelTab)
        ? fallback.lastPanelTab
        : '',
    sections,
    help,
  };
}

function toUiPreferences(item = {}) {
  return {
    ...sanitizeUiPreferences(item),
    updatedAt: item?.updatedAt || null,
  };
}

function defaultUiPreferences() {
  return {
    version: 2,
    lastPanelTab: '',
    sections: { ...UI_SECTION_DEFAULTS },
    help: sanitizeHelpPreferences(UI_HELP_DEFAULTS),
    updatedAt: null,
  };
}

function sanitizeHelpPreferences(input = {}, fallback = UI_HELP_DEFAULTS) {
  const source = input && typeof input === 'object' ? input : {};
  const fallbackSource = fallback && typeof fallback === 'object' ? fallback : UI_HELP_DEFAULTS;
  const sourceCompleted = source.completedGuides && typeof source.completedGuides === 'object'
    ? source.completedGuides
    : {};
  const fallbackCompleted = fallbackSource.completedGuides && typeof fallbackSource.completedGuides === 'object'
    ? fallbackSource.completedGuides
    : {};
  const completedGuides = {};
  UI_PREFERENCE_TABS.forEach((area) => {
    const value = sourceCompleted[area] ?? fallbackCompleted[area];
    const version = Number(value);
    if (Number.isInteger(version) && version > 0 && version <= 1000) completedGuides[area] = version;
  });

  const dismissedSource = Array.isArray(source.dismissedHints)
    ? source.dismissedHints
    : Array.isArray(fallbackSource.dismissedHints)
      ? fallbackSource.dismissedHints
      : [];
  const dismissedHints = [...new Set(dismissedSource
    .map((item) => String(item || '').trim())
    .filter((item) => /^[a-z0-9][a-z0-9:_-]{0,79}$/i.test(item)))]
    .slice(0, 100);

  return { completedGuides, dismissedHints };
}

function preferenceId(email) {
  return normalizeEmail(email).replaceAll('/', '_');
}
