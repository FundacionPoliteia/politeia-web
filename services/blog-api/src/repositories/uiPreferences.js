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

  return {
    version: 1,
    lastPanelTab: UI_PREFERENCE_TABS.includes(source.lastPanelTab)
      ? source.lastPanelTab
      : UI_PREFERENCE_TABS.includes(fallback?.lastPanelTab)
        ? fallback.lastPanelTab
        : '',
    sections,
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
    version: 1,
    lastPanelTab: '',
    sections: { ...UI_SECTION_DEFAULTS },
    updatedAt: null,
  };
}

function preferenceId(email) {
  return normalizeEmail(email).replaceAll('/', '_');
}
