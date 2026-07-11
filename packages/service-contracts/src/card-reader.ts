/**
 * CardReaderPort — stream sự kiện quét thẻ/QR. Electron: native HID/serial.
 * Web: WebHID nếu trình duyệt hỗ trợ, hoặc không khả dụng (capability tắt).
 */
export interface CardScanEvent {
  raw: string;
  scannedAt: number;
}

export interface CardReaderPort {
  onScan(handler: (event: CardScanEvent) => void): () => void;
}
