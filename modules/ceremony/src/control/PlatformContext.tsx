import { createContext, useContext } from 'react';
import type { PlatformContext as KernelPlatformContext } from '@sky-app/kernel';

const PlatformContext = createContext<KernelPlatformContext | undefined>(undefined);

export const PlatformProvider = PlatformContext.Provider;

/** Truy cập PlatformContext của shell (services/capabilities/env) từ component con sâu trong Control UI. */
export function usePlatform(): KernelPlatformContext | undefined {
  return useContext(PlatformContext);
}
