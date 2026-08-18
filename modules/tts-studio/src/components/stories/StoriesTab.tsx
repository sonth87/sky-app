import { useState } from 'react';
import type { EffectPresetPort, Story, StoryPort, TtsEnginePort, TtsPort } from '@sky-app/service-contracts';
import { StoryContent } from './StoryContent';
import { StoryList } from './StoryList';

export interface StoriesTabProps {
  storyPort: StoryPort;
  ttsPort: TtsPort;
  enginePort?: TtsEnginePort;
  effectPresetPort?: EffectPresetPort;
  assetUrl: (path: string) => string;
}

/**
 * Tab "Câu chuyện" — ghép nhiều lần sinh audio ĐÃ CÓ (từ tab "Sinh giọng") thành 1 timeline
 * nhiều track, trộn ra 1 file WAV hoàn chỉnh. `StoryList` (trái, tự quản CRUD/search/dialog)
 * + `StoryContent` (phải — list dọc sortable + panel editor waveform/zoom docked ở đáy) —
 * mirror voicebox's tách StoryList/StoryContent/StoryTrackEditor.
 */
export function StoriesTab({ storyPort, ttsPort, enginePort, effectPresetPort, assetUrl }: StoriesTabProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [hasStories, setHasStories] = useState<boolean | null>(null); // null = chưa biết (đang tải lần đầu)

  const handleStoriesChange = (stories: Story[]) => {
    setHasStories(stories.length > 0);
    setSelectedId((current) => {
      if (current && stories.some((s) => s.id === current)) return current;
      return stories[0]?.id ?? null;
    });
  };

  return (
    <div className="grid h-full grid-cols-[220px_1fr] overflow-hidden">
      <StoryList
        storyPort={storyPort}
        selectedId={selectedId}
        onSelect={setSelectedId}
        onStoriesChange={handleStoriesChange}
      />

      <main className="min-w-0 overflow-hidden">
        {selectedId ? (
          <StoryContent
            key={selectedId}
            storyId={selectedId}
            storyPort={storyPort}
            ttsPort={ttsPort}
            enginePort={enginePort}
            effectPresetPort={effectPresetPort}
            assetUrl={assetUrl}
          />
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            {hasStories === null ? '' : 'Chọn hoặc tạo 1 Story để bắt đầu.'}
          </div>
        )}
      </main>
    </div>
  );
}
