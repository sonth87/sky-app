export interface SkyBridge {
  invoke(channel: string, ...args: unknown[]): Promise<unknown>;
  /** Subscribe tới 1 shell-level event channel (main→renderer push, khác
   * invoke() request/response). Trả hàm unsubscribe. */
  on(channel: string, cb: (...args: unknown[]) => void): () => void;
}

declare global {
  interface Window {
    sky: SkyBridge;
  }
}
