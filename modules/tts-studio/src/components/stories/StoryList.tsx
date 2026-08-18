import { useEffect, useMemo, useState } from 'react';
import { Loader2, MoreHorizontal, Pencil, Plus, Search, Trash2 } from 'lucide-react';
import type { Story, StoryPort } from '@sky-app/service-contracts';
import { AlertDialog } from '../AlertDialog';
import { ConfirmDialog } from '../ConfirmDialog';
import { DropdownMenu } from '../DropdownMenu';
import { StoryFormDialog } from './StoryFormDialog';

export interface StoryListProps {
  storyPort: StoryPort;
  selectedId: string | null;
  onSelect: (id: string) => void;
  /** Gọi mỗi khi danh sách đổi (tạo/sửa/xoá) — cha cần biết để tự chọn lại Story khi cái đang
   *  chọn vừa bị xoá, hoặc để chọn luôn Story vừa tạo. */
  onStoriesChange: (stories: Story[]) => void;
}

function formatUpdatedAt(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return `${dd}/${mm}/${d.getFullYear()}`;
}

export function StoryList({ storyPort, selectedId, onSelect, onStoriesChange }: StoryListProps) {
  const [stories, setStories] = useState<Story[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [creating, setCreating] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [editingStory, setEditingStory] = useState<Story | null>(null);
  const [deletingStory, setDeletingStory] = useState<Story | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const reload = async () => {
    const list = await storyPort.list();
    setStories(list);
    onStoriesChange(list);
    return list;
  };

  useEffect(() => {
    setLoading(true);
    reload().finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- chỉ load 1 lần lúc mount
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return stories;
    return stories.filter((s) =>
      s.name.toLowerCase().includes(q) || (s.description ?? '').toLowerCase().includes(q));
  }, [search, stories]);

  const handleCreateSubmit = async (name: string, description: string) => {
    setShowCreate(false);
    setCreating(true);
    try {
      const created = await storyPort.create(name, description || undefined);
      await reload();
      onSelect(created.id);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : String(err));
    } finally {
      setCreating(false);
    }
  };

  const handleEditSubmit = async (name: string, description: string) => {
    if (!editingStory) return;
    const id = editingStory.id;
    setEditingStory(null);
    try {
      await storyPort.update(id, { name, description: description || undefined });
      await reload();
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : String(err));
    }
  };

  const handleDeleteConfirm = async () => {
    if (!deletingStory) return;
    const id = deletingStory.id;
    setDeletingStory(null);
    try {
      await storyPort.delete(id);
      const list = await reload();
      if (selectedId === id) onSelect(list[0]?.id ?? '');
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <aside className="flex h-full flex-col overflow-hidden border-r border-border">
      <div className="flex-none space-y-1.5 p-2">
        <button
          type="button"
          onClick={() => setShowCreate(true)}
          disabled={creating}
          className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-border py-1.5 text-2xs text-muted-foreground hover:border-primary hover:text-primary disabled:opacity-50"
        >
          {creating ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />} Story mới
        </button>
        {stories.length > 0 && (
          <div className="relative">
            <Search size={12} className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Tìm Story..."
              className="w-full rounded-lg border border-border bg-card py-1 pl-6 pr-2 text-2xs outline-none focus:border-primary"
            />
          </div>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
        {loading && (
          <div className="flex items-center justify-center py-4 text-2xs text-muted-foreground">
            <Loader2 size={13} className="mr-1.5 animate-spin" /> Đang tải...
          </div>
        )}

        {!loading && stories.length === 0 && (
          <p className="p-2 text-center text-2xs text-muted-foreground">Chưa có Story nào.</p>
        )}

        {!loading && stories.length > 0 && filtered.length === 0 && (
          <p className="p-2 text-center text-2xs text-muted-foreground">Không tìm thấy Story nào khớp &quot;{search}&quot;.</p>
        )}

        <div className="space-y-1">
          {filtered.map((s) => {
            const isActive = selectedId === s.id;
            return (
              <div
                key={s.id}
                className={
                  isActive
                    ? 'group relative rounded-lg bg-primary/15 px-2 py-1.5 text-primary'
                    : 'group relative rounded-lg px-2 py-1.5 hover:bg-muted/60'
                }
              >
                <button type="button" onClick={() => onSelect(s.id)} className="block w-full min-w-0 pr-6 text-left">
                  <div className="flex items-center gap-1.5">
                    <span className="min-w-0 flex-1 truncate text-2xs font-medium">{s.name}</span>
                    <span className="shrink-0 text-2xs text-muted-foreground">{formatUpdatedAt(s.updatedAt)}</span>
                  </div>
                  {s.description && (
                    <p className="mt-0.5 truncate text-2xs text-muted-foreground">{s.description}</p>
                  )}
                </button>
                <DropdownMenu
                  triggerLabel={`Tuỳ chọn Story "${s.name}"`}
                  triggerClassName="absolute right-1 top-1.5 rounded p-1 text-muted-foreground opacity-0 hover:bg-muted hover:text-foreground group-hover:opacity-100"
                  trigger={<MoreHorizontal size={13} />}
                  items={[
                    { label: 'Sửa', icon: <Pencil size={12} />, onClick: () => setEditingStory(s) },
                    { label: 'Xoá', icon: <Trash2 size={12} />, destructive: true, onClick: () => setDeletingStory(s) },
                  ]}
                />
              </div>
            );
          })}
        </div>
      </div>

      <StoryFormDialog
        open={showCreate}
        title="Story mới"
        onSubmit={handleCreateSubmit}
        onCancel={() => setShowCreate(false)}
      />
      <StoryFormDialog
        open={editingStory !== null}
        title="Sửa Story"
        initialName={editingStory?.name}
        initialDescription={editingStory?.description ?? ''}
        onSubmit={handleEditSubmit}
        onCancel={() => setEditingStory(null)}
      />
      <ConfirmDialog
        open={deletingStory !== null}
        title={`Xoá Story "${deletingStory?.name}"?`}
        message="Không thể hoàn tác — mọi đoạn audio trong Story này sẽ mất theo."
        onConfirm={() => void handleDeleteConfirm()}
        onCancel={() => setDeletingStory(null)}
      />
      <AlertDialog
        open={errorMessage !== null}
        message={errorMessage ?? ''}
        onClose={() => setErrorMessage(null)}
      />
    </aside>
  );
}
