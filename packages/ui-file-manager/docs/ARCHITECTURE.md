# Architecture

## Design Philosophy

This library implements a **Ports & Adapters** pattern where the UI layer is completely decoupled from business logic. The library provides the UI framework and state management; your application provides the data and callbacks.

## Component Hierarchy

```
FileLibraryLayout (main container)
├── Header
│   ├── Search/Filter input
│   ├── View toggle (grid/list)
│   └── Custom header buttons
├── Main Content Area
│   ├── Sidebar
│   │   ├── Menu items (customizable)
│   │   └── Collapse toggle
│   └── Grid/List View
│       ├── Items (rendered via itemRenderer)
│       ├── Drag box (selection)
│       └── Empty/Loading states
└── Overlays
    └── Context Menu
```

## Core Hooks

These hooks encapsulate different concerns and can be used independently:

### `useFileSelection`
Manages selection state (single, multi-select, range, drag-to-select).

**State:**
- `selectedIds: Set<string>`
- `lastSelectedId: string | null`
- `rangeAnchorId: string | null`

**Methods:**
- `selectId(id: string)` — Single select
- `toggleId(id: string)` — Ctrl/Cmd+click
- `selectRange(id: string)` — Shift+click
- `selectByDragBox(ids: string[])` — Drag-to-select
- `clear()` — Clear all selection

### `useFileKeyboard`
Handles all keyboard interactions (arrow navigation, Shift+Arrow range, Enter, Delete, Escape).

**Requires:**
- `items: FileItem[]`
- `selectedIds, lastSelectedId, rangeAnchorId` (from useFileSelection)
- `cardRectsRef` (for 4-way grid navigation)
- `viewMode` (grid vs list)
- Callbacks for actions (onOpen, onDelete)

### `useDragToSelect`
Handles drag box rendering and item overlap detection.

**State:**
- `dragStart, dragEnd` (mouse positions)
- `containerRect` (for offset calculation)

**Detects:**
- Items overlapping drag box
- Smart boundary detection

## State Management Strategy

```
App Component (owns data & callbacks)
        ↓
FileLibraryLayout (receives config)
        ├── useFileSelection (→ selectedIds state)
        ├── useFileKeyboard (→ actions)
        ├── useDragToSelect (→ drag box)
        └── Callbacks (→ onItemClick, onDelete, etc.)
```

**Parent owns:**
- Item data
- Business logic (delete, create, edit)
- Persistence (if desired)

**Library owns:**
- Selection state
- View preferences (grid/list, sidebar collapse)
- Keyboard handling
- Drag-to-select

## Data Flow

### Selection Flow
```
User clicks item
        ↓
handleCardClick (with event modifiers)
        ↓
useFileSelection.selectId() / toggleId() / selectRange()
        ↓
setSelectedIds() state update
        ↓
Component re-render (highlight changes)
        ↓
onSelectionChange callback (optional parent sync)
```

### Context Menu Flow
```
User right-clicks item
        ↓
onContextMenu event
        ↓
setContextMenu({ x, y, layoutId })
        ↓
Context menu rendered at position
        ↓
User clicks menu item → callback fires → menu closes
```

### Keyboard Navigation Flow
```
User presses Arrow key
        ↓
useFileKeyboard listener
        ↓
Find neighbor (grid) or next item (list)
        ↓
setSelectedIds() to new item
        ↓
Optional scroll-into-view
```

## View Abstraction

Each view mode is a self-contained component:

```
FileGrid
├── Grid container (CSS Grid)
├── Item card × N
│   ├── Preview/thumbnail
│   ├── Name + description
│   └── Badges + metadata
└── Drag box overlay

FileList
├── Table header
├── Table rows × N
│   ├── Name column
│   ├── Description column
│   ├── Badges column
│   └── Date column
└── Empty state
```

Both views:
- Use same selection logic
- Use same keyboard handling
- Use same item data shape
- Support same customizations

## Customization Layer

Configuration object allows runtime customization without code changes:

```typescript
config = {
  sidebarItems: [...],      // Define your sidebar
  contextMenuItems: [...],  // Define your actions
  headerButtons: [...],     // Add custom buttons
  itemRenderer: (item) => <CustomCard item={item} />,
  onItemClick: (id) => {...}, // Handle clicks
  filterConfig: {...},      // Custom search logic
}
```

This eliminates the need to fork or wrap the component for minor customizations.

## Performance Considerations

1. **Debounced search** — Prevents excessive filtering
2. **useRef for position tracking** — Avoids re-render loops in drag-to-select
3. **Memoized neighbor detection** — Only recalculates when items change
4. **Lazy rendering** — Views render only visible items (with virtualization available)
5. **Smart cache invalidation** — Rects updated only when items change

## Testing Strategy

Each hook can be tested independently:
- `useFileSelection` — Pure selection logic, no components
- `useFileKeyboard` — Keyboard handlers with mocked dependencies
- `useDragToSelect` — Overlap detection with mock rects

View components tested with:
- Rendered output (grid/list structure)
- Selection highlighting
- Keyboard navigation (with mocked hook)
- Context menu positioning

Integration tests verify:
- Multi-select with Shift+Arrow
- Drag-to-select across rows
- Context menu actions
- Sidebar collapse/expand
