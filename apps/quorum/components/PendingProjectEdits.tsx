'use client';
import { createContext, useContext, useEffect, useId } from 'react';

export const PendingProjectEdits = createContext<(id: string, pending: boolean) => void>(() => {});

export function usePendingProjectEdit(pending: boolean) {
  const register = useContext(PendingProjectEdits);
  const id = useId();
  useEffect(() => { register(id, pending); return () => register(id, false); }, [register, id, pending]);
}
