/**
 * FsPort — đọc/ghi file trừu tượng. Electron: fs thật.
 * Web: OPFS/IndexedDB hoặc proxy qua backend.
 */
export interface FsPort {
  readFile(path: string): Promise<Uint8Array>;
  writeFile(path: string, data: Uint8Array): Promise<void>;
  exists(path: string): Promise<boolean>;
}
