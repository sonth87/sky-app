/**
 * Capability — những gì môi trường (Electron/Web) có thể cung cấp.
 * Xem docs/reference/contract-reference.md §Capability.
 */
export type Capability =
  | 'network'
  | 'fs'
  | 'tts'
  | 'tts-local'
  | 'card-reader'
  | 'secondary-display'
  | 'keystore';

export interface CapabilitySet {
  has(capability: Capability): boolean;
  list(): Capability[];
}

export function createCapabilitySet(granted: Iterable<Capability>): CapabilitySet {
  const set = new Set<Capability>(granted);
  return {
    has(capability) {
      return set.has(capability);
    },
    list() {
      return Array.from(set);
    },
  };
}
