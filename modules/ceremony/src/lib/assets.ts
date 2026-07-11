/** Resolve asset tương đối thành URL custom-protocol do main phục vụ */
export function resolveAsset(relativePath: string): string {
  return window.slide.assetUrl(relativePath);
}
