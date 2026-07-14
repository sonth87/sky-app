import { useSlide } from '../control/lib/slide';

/** Resolve asset tương đối thành URL custom-protocol do main phục vụ */
export function resolveAsset(relativePath: string): string {
  const slide = useSlide('asset-url');
  return slide?.assetUrl(relativePath) ?? relativePath;
}
