import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { ProjectInput } from '@politeia/quorum-contracts';
import { clearConfirmedProjectEditorRecoveries, projectEditorRecoveryKey, readProjectEditorRecovery, writeProjectEditorRecovery, type ProjectEditorRecovery } from '../../lib/projectEditorSync';

class MemoryStorage implements Storage {
  private values = new Map<string, string>();
  get length() { return this.values.size; }
  clear() { this.values.clear(); }
  getItem(key: string) { return this.values.get(key) ?? null; }
  key(index: number) { return [...this.values.keys()][index] ?? null; }
  removeItem(key: string) { this.values.delete(key); }
  setItem(key: string, value: string) { this.values.set(key, String(value)); }
}

const originalLocalStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
const originalSessionStorage = Object.getOwnPropertyDescriptor(globalThis, 'sessionStorage');
let local: MemoryStorage;
let session: MemoryStorage;

function restoreStorage(name: 'localStorage' | 'sessionStorage', descriptor: PropertyDescriptor | undefined) {
  if (descriptor) Object.defineProperty(globalThis, name, descriptor);
  else Reflect.deleteProperty(globalThis, name);
}

function recovery(title: string, savedAt = Date.now()): ProjectEditorRecovery {
  const form = { title } as ProjectInput;
  return { form, base: { title: 'base' } as ProjectInput, createKey: 'stable-idempotency-key', createSubmission: null, savedAt };
}

describe('recuperación local del editor de proyectos', () => {
  beforeEach(() => {
    local = new MemoryStorage();
    session = new MemoryStorage();
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: local });
    Object.defineProperty(globalThis, 'sessionStorage', { configurable: true, value: session });
  });

  afterEach(() => {
    restoreStorage('localStorage', originalLocalStorage);
    restoreStorage('sessionStorage', originalSessionStorage);
  });

  it('mantiene las copias de cada sesión separadas y recupera la más reciente', () => {
    const first = projectEditorRecoveryKey('Editor@politeia.ar', 'proyecto-1', 'sesion-1');
    const second = projectEditorRecoveryKey('editor@politeia.ar', 'proyecto-1', 'sesion-2');
    const reader = projectEditorRecoveryKey('EDITOR@politeia.ar', 'proyecto-1', 'sesion-3');
    writeProjectEditorRecovery(first, recovery('cambio de la primera sesión', Date.now() - 1000));
    writeProjectEditorRecovery(second, recovery('cambio de la segunda sesión'));

    const restored = readProjectEditorRecovery(reader);
    expect(restored?.value.form.title).toBe('cambio de la segunda sesión');
    expect(restored?.copiesFound).toBe(2);

    clearConfirmedProjectEditorRecoveries(reader, { title: 'cambio de la segunda sesión' } as ProjectInput);
    expect(local.getItem(second)).toBeNull();
    expect(local.getItem(first)).not.toBeNull();
    expect(readProjectEditorRecovery(reader)?.value.form.title).toBe('cambio de la primera sesión');
  });

  it('migra un borrador anterior de sessionStorage y sólo lo borra tras persistirlo', () => {
    const key = projectEditorRecoveryKey('editor@politeia.ar', 'proyecto-1', 'sesion-nueva');
    const legacyKey = 'quorum:project-editor:v1:editor%40politeia.ar:proyecto-1';
    session.setItem(legacyKey, JSON.stringify(recovery('borrador heredado')));

    const restored = readProjectEditorRecovery(key, legacyKey);
    expect(restored?.value.form.title).toBe('borrador heredado');
    expect(session.getItem(legacyKey)).not.toBeNull();
    expect(writeProjectEditorRecovery(key, restored!.value, legacyKey)).toBe(true);
    expect(session.getItem(legacyKey)).toBeNull();
    expect(readProjectEditorRecovery(key)?.value.form.title).toBe('borrador heredado');
  });

  it('expira copias viejas y reporta fallos de almacenamiento', () => {
    const key = projectEditorRecoveryKey('editor@politeia.ar', 'proyecto-1', 'sesion-1');
    writeProjectEditorRecovery(key, recovery('vencido', Date.now() - 8 * 24 * 60 * 60 * 1000));
    expect(readProjectEditorRecovery(key)).toBeNull();
    expect(local.getItem(key)).toBeNull();

    const expiredKey = projectEditorRecoveryKey('editor@politeia.ar', 'otro-proyecto', 'sesion-vieja');
    const freshKey = projectEditorRecoveryKey('editor@politeia.ar', 'proyecto-1', 'sesion-nueva');
    local.setItem(expiredKey, JSON.stringify(recovery('viejo', Date.now() - 8 * 24 * 60 * 60 * 1000)));
    const normalSetItem = local.setItem.bind(local);
    local.setItem = (candidate, value) => {
      if (local.length > 0) throw new DOMException('quota exceeded', 'QuotaExceededError');
      normalSetItem(candidate, value);
    };
    expect(writeProjectEditorRecovery(freshKey, recovery('nuevo'))).toBe(true);
    expect(local.getItem(expiredKey)).toBeNull();
    expect(local.getItem(freshKey)).not.toBeNull();

    local.setItem = () => { throw new DOMException('quota exceeded', 'QuotaExceededError'); };
    expect(writeProjectEditorRecovery(key, recovery('no persistido'))).toBe(false);
  });
});
