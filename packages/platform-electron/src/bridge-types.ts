export interface SkyBridge {
  invoke(channel: string, ...args: unknown[]): Promise<unknown>;
}

declare global {
  interface Window {
    sky: SkyBridge;
  }
}
