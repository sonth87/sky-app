# @sky-app/ui-file-manager

A production-ready, fully customizable file manager UI library for React. Built from the ground up to be reusable across different applications and domains.

## Features

✅ **Selection** — Single-click select, Ctrl/Cmd+click toggle, Shift+click range, drag-to-select  
✅ **Keyboard Navigation** — Arrow keys (4-directional in grid, vertical in list), Shift+Arrow range, Enter to open, Delete to trash, Escape to clear  
✅ **Multiple Views** — Grid (auto-fill responsive), List (table format), extensible for Detail, Tiles, etc.  
✅ **Context Menu** — Right-click menu with customizable items, smart positioning  
✅ **Sidebar** — Collapsible with icon-only mode, customizable items, persistent state  
✅ **Search/Filter** — Diacritic-insensitive search, debounced, customizable logic  
✅ **Drag-to-Select** — Visual feedback with drag box, multi-item selection  
✅ **Metadata Display** — Timestamps with time, badges for categories/tags, descriptions  
✅ **Fully Customizable** — Every UI element, menu, button, and behavior is configurable  

## Quick Start

```tsx
import { FileLibraryLayout } from '@sky-app/ui-file-manager';

function MyLibraryScreen() {
  const items = [
    { id: '1', name: 'Item 1', description: 'First item' },
    { id: '2', name: 'Item 2', description: 'Second item' },
  ];

  return (
    <FileLibraryLayout
      items={items}
      config={{
        sidebarItems: [
          { id: 'all', label: 'All Items', isActive: true },
          { id: 'trash', label: 'Trash' },
        ],
        contextMenuItems: [
          { id: 'open', label: 'Open', onClick: (id) => console.log('open', id) },
          { id: 'delete', label: 'Delete', isDanger: true, onClick: (id) => console.log('delete', id) },
        ],
        onItemClick: (id) => console.log('Item clicked:', id),
      }}
    />
  );
}
```

## Documentation

- **[ARCHITECTURE.md](./docs/ARCHITECTURE.md)** — Design, component hierarchy, and data flow
- **[FEATURES.md](./docs/FEATURES.md)** — Complete feature inventory with built-in capabilities
- **[API.md](./docs/API.md)** — Detailed hook and component reference
- **[CONFIGURATION.md](./docs/CONFIGURATION.md)** — All customization options
- **[EXAMPLES.md](./docs/EXAMPLES.md)** — Real-world usage examples
- **[CUSTOMIZATION.md](./docs/CUSTOMIZATION.md)** — How to extend and customize behavior

## Built-in Features (No Need to Reimplement!)

When using this library, you get these out-of-the-box:

### Selection Logic
- Single-click select (set as active)
- Ctrl/Cmd+click toggle (add/remove from selection)
- Shift+click range (select all items between last and current)
- Drag-to-select (visual drag box with overlap detection)
- Smart expand/contract with Shift+Arrow navigation

### Keyboard Navigation
- **Arrow keys**: Navigate up/down/left/right (4-way in grid, vertical in list)
- **Shift+Arrow**: Extend selection range (can be toggled back and forth)
- **Enter**: Open selected item
- **Delete**: Trigger delete action for selected
- **Escape**: Clear selection or close context menu

### Views
- **Grid view**: Auto-fill responsive layout (customizable column width)
- **List view**: Table format with column headers
- **Extensible**: Easy to add Detail, Tiles, or other views

### Context Menu
- Right-click to show menu at cursor position
- Customizable menu items with icons
- Smart positioning (doesn't go off-screen)
- Dismiss on click, Escape, or right-click elsewhere

### Sidebar
- Collapsible (toggle button)
- Icon-only mode (with hover tooltips)
- Custom items with click handlers
- Persistent state in localStorage
- Badge support for item counts

### Search & Filter
- Diacritic-insensitive search (strips accents)
- Debounced input for performance
- Custom filter logic per field
- Works across all views

### Persistence
- View mode preference (grid/list)
- Sidebar collapsed state
- Selection state (localStorage or callback)

## Installation

```bash
npm install @sky-app/ui-file-manager
# or
pnpm add @sky-app/ui-file-manager
```

## Next Steps

1. Read [ARCHITECTURE.md](./docs/ARCHITECTURE.md) to understand the design
2. Check [EXAMPLES.md](./docs/EXAMPLES.md) for your use case
3. Review [API.md](./docs/API.md) for available hooks and components
4. Use [CONFIGURATION.md](./docs/CONFIGURATION.md) to customize behavior

## License

Proprietary — Part of Sky App
