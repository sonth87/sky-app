# API Reference

Quick reference for the main component and hooks.

## Main Component

### `FileLibraryLayout`

The primary component for displaying a file/item manager.

```typescript
<FileLibraryLayout
  items={FileItem[]}           // Array of items to display
  config={FileLibraryConfig}   // Configuration (see CONFIGURATION.md)
/>
```

**Props:**
- `items` — Array of items with at least `id` and `name`
- `config` — Configuration object (all properties optional)

**Example:**
```typescript
<FileLibraryLayout
  items={layouts}
  config={{
    sidebarItems: [...],
    contextMenuItems: [...],
    onItemClick: (id) => console.log('Clicked:', id),
  }}
/>
```

See [CONFIGURATION.md](./CONFIGURATION.md) for all config options.

## Hooks (Advanced)

These hooks provide fine-grained control over selection, keyboard, and drag-to-select logic.

### `useFileSelection()`

Manages selection state (single, multi-select, range).

```typescript
const selection = useFileSelection();
```

**Returns:**
```typescript
{
  selectedIds: Set<string>;
  lastSelectedId: string | null;
  rangeAnchorId: string | null;
  
  selectId: (id: string) => void;              // Single select
  toggleId: (id: string) => void;              // Ctrl+click toggle
  selectRange: (id: string) => void;           // Shift+click range
  selectByDragBox: (ids: string[]) => void;   // Drag-to-select
  clear: () => void;                           // Clear all
}
```

**Usage:**
```typescript
const selection = useFileSelection();

function handleItemClick(id: string, event: MouseEvent) {
  if (event.ctrlKey) {
    selection.toggleId(id);
  } else if (event.shiftKey) {
    selection.selectRange(id);
  } else {
    selection.selectId(id);
  }
}
```

### `useFileKeyboard(options)`

Handles arrow keys, Shift+Arrow range, Enter, Delete, Escape.

```typescript
useFileKeyboard({
  items: FileItem[];
  selection: ReturnType<typeof useFileSelection>;
  viewMode: 'grid' | 'list';
  cardRectsRef: React.MutableRefObject<Map<string, DOMRect>>;
  
  onOpen?: (id: string) => void;
  onDelete?: (ids: string[]) => void;
  onSelectionChange?: (ids: Set<string>) => void;
});
```

**Keyboard Bindings:**
- **Arrow keys** — Navigate (4-way in grid, vertical in list)
- **Shift+Arrow** — Extend selection range
- **Enter** — Open (calls onOpen)
- **Delete** — Delete (calls onDelete with selected)
- **Escape** — Clear selection

**Usage:**
```typescript
const cardRectsRef = useRef<Map<string, DOMRect>>(new Map());

useFileKeyboard({
  items,
  selection,
  viewMode: 'grid',
  cardRectsRef,
  onOpen: (id) => openFile(id),
  onDelete: (ids) => deleteFiles(ids),
});
```

### `useDragToSelect(containerRef)`

Handles drag-to-select box rendering and overlap detection.

```typescript
const dragBox = useDragToSelect(containerRef);
```

**Returns:**
```typescript
{
  start: { x: number; y: number } | null;
  end: { x: number; y: number } | null;
  containerRect: DOMRect | null;
  
  handleMouseDown: (e: MouseEvent) => void;
  handleMouseMove: (e: MouseEvent) => void;
  handleMouseUp: (e: MouseEvent) => void;
  
  // Helper to check if rect overlaps drag box
  isOverlapping: (rect: DOMRect) => boolean;
}
```

**Usage:**
```typescript
const containerRef = useRef<HTMLDivElement>(null);
const dragBox = useDragToSelect(containerRef);

return (
  <div
    ref={containerRef}
    onMouseDown={dragBox.handleMouseDown}
  >
    {/* Items */}
    {dragBox.start && dragBox.end && (
      <div style={{ /* drag box styling */ }}>
        {/* Drag box overlay */}
      </div>
    )}
  </div>
);
```

## Types

See [src/types.ts](../src/types.ts) for full type definitions.

### FileItem
```typescript
interface FileItem {
  id: string;
  name: string;
  description?: string;
  color?: string;
  tags?: string[];
  createdAt?: number;
  updatedAt?: number;
  [key: string]: any;  // Custom fields
}
```

### FileLibraryConfig
```typescript
interface FileLibraryConfig {
  sidebarItems?: SidebarItem[];
  contextMenuItems?: ContextMenuItem[];
  headerButtons?: HeaderButton[];
  showViewToggle?: boolean;
  showSearch?: boolean;
  supportedViews?: ViewMode[];
  defaultView?: string;
  filterConfig?: FilterConfig;
  itemRenderer?: (item: FileItem, isSelected: boolean) => React.ReactNode;
  onItemClick?: (itemId: string) => void;
  onItemDoubleClick?: (itemId: string) => void;
  onSelectionChange?: (selectedIds: Set<string>) => void;
  onViewChange?: (viewMode: string) => void;
}
```

### SidebarItem
```typescript
interface SidebarItem {
  id: string;
  label: string;
  icon?: React.ReactNode;
  badge?: number | string;
  isActive?: boolean;
  onClick?: () => void;
}
```

### ContextMenuItem
```typescript
interface ContextMenuItem {
  id: string;
  label: string;
  icon?: React.ReactNode;
  isDanger?: boolean;
  onClick: (itemId: string) => void;
  visible?: (itemId: string) => boolean;
}
```

### FilterConfig
```typescript
interface FilterConfig {
  placeholder?: string;
  debounceMs?: number;
  normalizeSearch?: (query: string) => string;
  shouldMatch?: (item: FileItem, query: string) => boolean;
}
```

## Exports

```typescript
// Main component
export { FileLibraryLayout };

// Hooks
export { useFileSelection };
export { useFileKeyboard };
export { useDragToSelect };

// Types
export type {
  FileItem,
  SidebarItem,
  ContextMenuItem,
  ViewMode,
  FilterConfig,
  FileLibraryConfig,
  SelectionState,
  DragBoxState,
  ContextMenuState,
};
```

## Learn More

- [ARCHITECTURE.md](./ARCHITECTURE.md) — Design and data flow
- [FEATURES.md](./FEATURES.md) — What's built-in
- [CONFIGURATION.md](./CONFIGURATION.md) — All config options
- [EXAMPLES.md](./EXAMPLES.md) — Real-world usage
- [CUSTOMIZATION.md](./CUSTOMIZATION.md) — How to extend
