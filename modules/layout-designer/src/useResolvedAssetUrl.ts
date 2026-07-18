// Hook resolve relativePath ảnh (đã lưu trong LayoutItem.src) thành URL hiển thị được. BẮT BUỘC
// qua bước resolve vì src có thể là "key blob" (WASM fallback, KHÔNG PHẢI URL — xem
// docs/roadmap/plans/layout-designer/06-luu-tru-va-giao-tiep.md §"Ảnh nền & asset"), không thể
// dùng thẳng làm CSS url()/img src như Electron (ceremony-asset://...) hay data-service (path
// tương đối) — 2 tầng đó tình cờ resolve đồng bộ được nhưng vẫn nên qua chung 1 cơ chế async.

import { useEffect, useState } from 'react';

export function useResolvedAssetUrl(relativePath: string | undefined, resolveAssetUrl?: (path: string) => Promise<string>): string {
  const [url, setUrl] = useState('');

  useEffect(() => {
    if (!relativePath) {
      setUrl('');
      return;
    }
    if (!resolveAssetUrl) {
      // Không có AssetPort (VD preview độc lập không qua AppModule) — coi relativePath là URL
      // sẵn dùng được (fail-soft, khớp nguyên tắc LayoutRenderer's resolveAssetSafe identity fallback).
      setUrl(relativePath);
      return;
    }
    let cancelled = false;
    resolveAssetUrl(relativePath).then((resolved) => {
      if (!cancelled) setUrl(resolved);
    });
    return () => {
      cancelled = true;
    };
  }, [relativePath, resolveAssetUrl]);

  return url;
}
