import { useEffect, useState } from 'react';
import { Loader2, Plus, Trash2 } from 'lucide-react';
import type { Story, StoryPort, TtsPort } from '@sky-app/service-contracts';
import { AlertDialog } from '../AlertDialog';
import { PromptDialog } from '../PromptDialog';
import { Timeline } from './Timeline';

export interface StoriesTabProps {
  storyPort: StoryPort;
  ttsPort: TtsPort;
}

/**
 * Tab "Câu chuyện" — ghép nhiều lần sinh audio ĐÃ CÓ (từ tab "Sinh giọng") thành 1 timeline
 * nhiều track, trộn ra 1 file WAV hoàn chỉnh. Danh sách Story bên trái (hẹp), Timeline chiếm
 * phần còn lại — bố cục 2 cột giống `VoicePicker`/editor của tab "Sinh giọng".
 */
export function StoriesTab({ storyPort, ttsPort }: StoriesTabProps) {
  const [stories, setStories] = useState<Story[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [showCreatePrompt, setShowCreatePrompt] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const reload = async () => {
    const list = await storyPort.list();
    setStories(list);
    return list;
  };

  useEffect(() => {
    setLoading(true);
    reload()
      .then((list) => {
        setSelectedId((current) => current ?? list[0]?.id ?? null);
      })
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- chỉ load 1 lần lúc mount
  }, []);

  // Bấm nút mở PromptDialog — Electron KHÔNG hỗ trợ window.prompt() (trả null ngay lập tức,
  // không hiện UI gì; đây chính là lý do nút "Story mới" trước đó bấm không thấy phản ứng
  // gì, xem PromptDialog.tsx's docstring). Việc tạo thật nằm ở handleCreateSubmit.
  const handleCreate = () => setShowCreatePrompt(true);

  const handleCreateSubmit = async (name: string) => {
    setShowCreatePrompt(false);
    setCreating(true);
    try {
      const created = await storyPort.create(name);
      await reload();
      setSelectedId(created.id);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : String(err));
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (id: string) => {
    const story = stories.find((s) => s.id === id);
    if (!confirm(`Xoá Story "${story?.name}"? Không thể hoàn tác.`)) return;
    await storyPort.delete(id);
    const list = await reload();
    setSelectedId((current) => (current === id ? (list[0]?.id ?? null) : current));
  };

  return (
    <div className="grid h-full grid-cols-[220px_1fr] overflow-hidden">
      <aside className="flex flex-col gap-1.5 overflow-y-auto border-r border-border p-2">
        <button
          type="button"
          onClick={handleCreate}
          disabled={creating}
          className="flex items-center justify-center gap-1.5 rounded-lg border border-dashed border-border py-1.5 text-2xs text-muted-foreground hover:border-primary hover:text-primary disabled:opacity-50"
        >
          {creating ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />} Story mới
        </button>

        {loading && (
          <div className="flex items-center justify-center py-4 text-2xs text-muted-foreground">
            <Loader2 size={13} className="mr-1.5 animate-spin" /> Đang tải...
          </div>
        )}

        {!loading && stories.length === 0 && (
          <p className="p-2 text-center text-2xs text-muted-foreground">Chưa có Story nào.</p>
        )}

        {stories.map((s) => (
          <div
            key={s.id}
            className={
              selectedId === s.id
                ? 'group flex items-center gap-1 rounded-lg bg-primary/15 px-2 py-1.5 text-primary'
                : 'group flex items-center gap-1 rounded-lg px-2 py-1.5 hover:bg-muted/60'
            }
          >
            <button type="button" onClick={() => setSelectedId(s.id)} className="min-w-0 flex-1 truncate text-left text-2xs">
              {s.name}
            </button>
            <button
              type="button"
              onClick={() => void handleDelete(s.id)}
              className="shrink-0 rounded p-1 text-muted-foreground opacity-0 hover:bg-destructive/15 hover:text-destructive group-hover:opacity-100"
              title="Xoá Story"
            >
              <Trash2 size={12} />
            </button>
          </div>
        ))}
      </aside>

      <main className="min-w-0 overflow-hidden">
        {selectedId ? (
          <Timeline key={selectedId} storyId={selectedId} storyPort={storyPort} ttsPort={ttsPort} />
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            {loading ? '' : 'Chọn hoặc tạo 1 Story để bắt đầu.'}
          </div>
        )}
      </main>

      <PromptDialog
        open={showCreatePrompt}
        title="Tên Story mới"
        placeholder="Vd: Lễ tốt nghiệp K10"
        onSubmit={handleCreateSubmit}
        onCancel={() => setShowCreatePrompt(false)}
      />
      <AlertDialog
        open={errorMessage !== null}
        message={errorMessage ?? ''}
        onClose={() => setErrorMessage(null)}
      />
    </div>
  );
}
