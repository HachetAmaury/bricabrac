import { createContext, useContext, type ReactNode } from 'react';

type Chrome = { openMenu: () => void };

const ChromeCtx = createContext<Chrome | null>(null);

export function ChromeProvider({ openMenu, children }: Chrome & { children: ReactNode }) {
  return <ChromeCtx.Provider value={{ openMenu }}>{children}</ChromeCtx.Provider>;
}

export function useChrome(): Chrome {
  const ctx = useContext(ChromeCtx);
  if (!ctx) throw new Error('useChrome must be used inside <ChromeProvider>');
  return ctx;
}
