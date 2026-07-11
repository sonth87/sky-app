/**
 * DisplayPort — điều khiển màn phụ (Backdrop kiosk). Chỉ khả dụng khi
 * capability 'secondary-display' bật (thường chỉ Electron).
 */
export interface DisplayInfo {
  id: string;
  label: string;
  bounds: { x: number; y: number; width: number; height: number };
  isPrimary: boolean;
}

export interface DisplayPort {
  listDisplays(): Promise<DisplayInfo[]>;
  open(displayId?: string): Promise<void>;
  close(): Promise<void>;
  isOpen(): Promise<boolean>;
  setFullscreen(fullscreen: boolean): Promise<void>;
}
