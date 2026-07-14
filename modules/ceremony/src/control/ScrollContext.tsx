import { createContext, useCallback, useContext, useRef } from 'react';

type ScrollFn = (msv: string) => void;

interface ScrollContextValue {
  register: (id: string, fn: ScrollFn) => void;
  unregister: (id: string) => void;
  scrollAllTo: (msv: string) => void;
  scrollTo: (id: string, msv: string) => void;
}

const ScrollContext = createContext<ScrollContextValue>({
  register: () => {},
  unregister: () => {},
  scrollAllTo: () => {},
  scrollTo: () => {},
});

export function ScrollProvider({ children }: { children: React.ReactNode }) {
  const registry = useRef<Map<string, ScrollFn>>(new Map());

  const register = useCallback((id: string, fn: ScrollFn) => {
    registry.current.set(id, fn);
  }, []);

  const unregister = useCallback((id: string) => {
    registry.current.delete(id);
  }, []);

  const scrollAllTo = useCallback((msv: string) => {
    registry.current.forEach((fn) => fn(msv));
  }, []);

  const scrollTo = useCallback((id: string, msv: string) => {
    registry.current.get(id)?.(msv);
  }, []);

  return (
    <ScrollContext.Provider value={{ register, unregister, scrollAllTo, scrollTo }}>
      {children}
    </ScrollContext.Provider>
  );
}

export function useScrollContext() {
  return useContext(ScrollContext);
}
