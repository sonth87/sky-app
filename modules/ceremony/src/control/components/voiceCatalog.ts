import { useState, useEffect, useMemo } from 'react';
import type { VoiceListItem, VoiceListOrigin } from '@sky-app/voice-catalog-ui';
import { useControlStore } from '../store';
import { usePlatform } from '../PlatformContext';
import type { TtsPort, Voice } from '@sky-app/service-contracts';

const HF_MODEL_URL = 'https://huggingface.co/pnnbao-ump/VieNeu-TTS-v3-Turbo';

/** Giọng registry (đã sẵn sàng synthesize) khi window.slide chưa trả kịp lúc mount. */
const FALLBACK_VOICE_ITEMS: VoiceListItem[] = [
  { source: 'registry', origin: 'system', id: 'vieneu-NF', name: 'Lan Anh', gender: 'female', language: 'Vietnamese', accent: 'northern', category: [], tags: [] },
  { source: 'registry', origin: 'system', id: 'vieneu-NF2', name: 'Ngọc Huyền', gender: 'female', language: 'Vietnamese', accent: 'northern', category: [], tags: [] },
  { source: 'registry', origin: 'system', id: 'vieneu-SF', name: 'Mai Linh', gender: 'female', language: 'Vietnamese', accent: 'southern', category: [], tags: [] },
  { source: 'registry', origin: 'system', id: 'vieneu-NM1', name: 'Minh Quân', gender: 'male', language: 'Vietnamese', accent: 'northern', category: [], tags: [] },
  { source: 'registry', origin: 'system', id: 'vieneu-SM', name: 'Gia Huy', gender: 'male', language: 'Vietnamese', accent: 'southern', category: [], tags: [] },
  { source: 'registry', origin: 'system', id: 'vieneu-ADAM', name: 'Adam', gender: 'male', language: 'Vietnamese', accent: 'northern', category: [], tags: [] },
];

/** @deprecated giữ lại tên export cũ cho code chưa migrate — dùng modelUrl cố định của VieNeu. */
export const HF_VOICE_MODEL_URL = HF_MODEL_URL;

interface RawCatalogEntry {
  id: string;
  name: string;
  language: string;
  gender: string;
  accent: string;
  category: string[];
  tags: string[];
  tagline: string;
  lang: string;
}

function registryVoiceToItem(v: Voice): VoiceListItem {
  // preset (built-in engine) và cloned từ catalog vendor đều là "hệ thống cung cấp
  // sẵn"; chỉ cloned KHÔNG có sourceCatalogId (user tự upload qua VoiceCloneModal)
  // mới là "custom" — chia tab System/Custom trên UI dựa vào field này.
  const origin: VoiceListOrigin = v.type === 'cloned' && !v.sourceCatalogId ? 'custom' : 'system';
  return {
    source: 'registry',
    origin,
    id: v.id.startsWith('vieneu-') ? v.id : `vieneu-${v.id}`,
    name: v.name,
    gender: v.gender === 'male' ? 'male' : 'female',
    language: v.language,
    accent: v.accent,
    category: v.category ?? [],
    tags: v.tags ?? (v.type === 'preset' ? ['builtin'] : []),
  };
}

/**
 * Danh sách hợp nhất: registry voices (đã sẵn sàng, gồm preset/system-cloned/user-custom)
 * + catalog 'hệ thống' chưa từng được chọn dùng. Catalog entry đã có bản registry tương
 * ứng (sourceCatalogId khớp) bị loại khỏi phần catalog — tránh hiện trùng 2 dòng cho
 * cùng 1 giọng (bản registry đã sẵn sàng dùng ngay, nên ưu tiên hiện bản đó).
 */
export function useVoiceCatalog(): VoiceListItem[] {
  const [rawRegistry, setRawRegistry] = useState<Voice[]>([]);
  const [rawCatalog, setRawCatalog] = useState<RawCatalogEntry[]>([]);
  const pythonStatus = useControlStore((s) => s.pythonStatus);
  const nonce = useControlStore((s) => s.voiceCatalogNonce);
  const platform = usePlatform();

  useEffect(() => {
    const tts = platform?.services.get<TtsPort>('tts');
    if (!tts) return;

    // Ở Electron, ta muốn đợi pythonStatus === 'ready' để tránh lỗi log hoặc timeout.
    // Ở Web, pythonStatus có thể không bao giờ chuyển sang 'ready' do thiếu IPC event, nên fetch trực tiếp.
    const isElectron = typeof window !== 'undefined' && !!window.slide;
    if (isElectron && pythonStatus !== 'ready') return;

    tts.listVoices?.().then((list) => {
      setRawRegistry(list ?? []);
    }).catch(() => {});

    tts.listVoiceCatalog?.().then((list) => {
      setRawCatalog((list ?? []) as RawCatalogEntry[]);
    }).catch(() => {});
  }, [platform, pythonStatus, nonce]);

  return useMemo(() => {
    const registryItems = rawRegistry.map(registryVoiceToItem);
    const importedCatalogIds = new Set(
      rawRegistry.map((v) => v.sourceCatalogId).filter((id): id is string => !!id),
    );

    const byId = new Map(FALLBACK_VOICE_ITEMS.map((item) => [item.id, item]));
    for (const item of registryItems) byId.set(item.id, item);

    const catalogItems: VoiceListItem[] = rawCatalog
      .filter((e) => !importedCatalogIds.has(e.id))
      .map((e) => ({
        source: 'catalog',
        origin: 'system',
        id: e.id,
        name: e.name,
        gender: e.gender,
        language: e.language,
        accent: e.accent,
        category: e.category,
        tags: e.tags,
        tagline: e.tagline,
        catalogLang: e.lang,
      }));

    return [...byId.values(), ...catalogItems];
  }, [rawRegistry, rawCatalog]);
}
