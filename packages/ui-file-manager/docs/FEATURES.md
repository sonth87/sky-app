# Built-in Features

This document catalogs all the features already implemented in this library. **Don't rebuild these** — configure them instead.

## Selection Features

### Single-Click Selection
- Click any item to select it
- Deselects previously selected items
- Last-selected item tracked for range operations

### Ctrl/Cmd+Click Toggle
- Hold Ctrl (or Cmd on Mac) and click to toggle item selection
- Add items to selection or remove them
- Maintains previously selected items
- Updates lastSelectedId for range operations

### Shift+Click Range Selection
- Hold Shift and click to select all items between last-selected and clicked item
- Works in both grid and list views
- Expands or contracts selection depending on direction

### Drag-to-Select
- Click and drag to draw selection box over multiple items
- Visual feedback with semi-transparent drag box
- Automatically selects all items overlapping the box
- Works seamlessly with multi-row grids
- Text selection prevented (user-select: none)

### Range Selection State
- Remembers anchor point when using Shift+Arrow
- Can expand/contract selection without re-pressing Shift
- Release Shift to clear anchor and do single selection
- Proper boundary handling at grid edges

## Keyboard Navigation

### 4-Way Navigation (Grid View)
- **Arrow Up**: Move to item above in same column
- **Arrow Down**: Move to item below in same column
- **Arrow Left**: Move to item left in same row
- **Arrow Right**: Move to item right in same row
- Wraps to next/previous row at grid edges
- Smart neighbor detection using position alignment

### Vertical Navigation (List View)
- **Arrow Up/Down**: Navigate up/down rows
- **Arrow Left/Right**: Ignored (no horizontal movement in list)
- Maintains vertical selection flow

### Range Expansion
- **Shift+Arrow (any direction)**: Extend selection from anchor to current
- Works with all 4 directions in grid
- Works with vertical in list
- Can expand and contract by reversing direction
- No need to release Shift between keypresses

### Quick Actions
- **Enter**: Open/activate selected item (callback: `onItemDoubleClick`)
- **Delete**: Trigger delete action (callback: `onDelete`)
- **Escape**: Clear selection, close context menu, dismiss dialogs

## View Modes

### Grid View
- Auto-fill responsive layout using CSS Grid
- Customizable column width (minmax)
- 4-way keyboard navigation
- Hover effects with selection highlight
- Card-based item display with metadata
- Drag-to-select works smoothly across rows

### List View
- Table format with column headers
- Compact row-based layout
- Vertical-only keyboard navigation
- Clear row separators (divide-y)
- Selected row highlighted with left border
- Hover highlight on rows

### Extensible Architecture
- Easy to add new view modes (Detail, Tiles, Kanban, etc.)
- View mode state persisted
- Toggle button in header

## Context Menu

### Right-Click Menu
- Click right mouse button on any item
- Menu appears at cursor position
- Smart positioning (doesn't go off-screen)
- Customizable menu items with icons
- Danger items (red text) for destructive actions

### Menu Dismissal
- Click outside menu → closes
- Right-click elsewhere → closes and opens new menu
- Press Escape → closes
- Click menu item → closes and executes action

### Customizable Menu Items
```typescript
contextMenuItems: [
  { id: 'open', label: 'Open', onClick: (id) => {...} },
  { id: 'delete', label: 'Delete', isDanger: true, onClick: (id) => {...} },
]
```

## Sidebar

### Collapse/Expand
- Toggle button in top-left
- Smooth width transition animation
- Sidebar width: expanded (200px) or collapsed (60px)

### Icon-Only Mode
- When collapsed, shows only icons
- Hover tooltips display full labels
- Icon centering when in icon-only mode

### Custom Menu Items
- Define sidebar items via config
- Each item can be active/inactive
- Click handler for each item
- Badge support (e.g., trash count)

### Persistent State
- Collapsed state saved to localStorage
- Restored on page reload
- Key: `file-manager-sidebar-collapsed`

## Search & Filter

### Diacritic-Insensitive Search
- Built-in string normalization (NFD + strip combining marks)
- Search "vietnam" finds "Việt Nam"
- Works across name, description, category, tags
- Case-insensitive matching

### Debounced Input
- Configurable debounce delay (default: 300ms)
- Reduces re-renders during fast typing
- Smooth UX for large item lists

### Custom Filter Logic
- Override default matching with `shouldMatch` callback
- Filter specific fields
- Complex matching logic (regex, fuzzy, etc.)

### Search State
- Clears selection to show search results
- Filters applied before view rendering
- Empty state when no results

## Metadata Display

### Grid View Card
- Item name (primary)
- Description (secondary, truncated)
- Aspect ratios/categories as badges
- Modified timestamp (with time)
- Hover reveals action buttons

### List View Rows
- Name column (with color indicator)
- Description column (truncated)
- Category + aspects as badges
- Modified date with time (MM/DD HH:MM)
- Hover reveals action buttons (Info, Duplicate)
- Clear row separators

### Timestamp Display
- Format: "Modified: MM/DD HH:MM"
- Shows both date and time for precision
- Only displays if timestamp available
- Placeholder (—) if no timestamp

### Badge Support
- Category badges (blue)
- Aspect/tag badges (gray)
- Flexible styling
- Easily customizable colors

## State Persistence

### View Mode
- User's preference (grid/list) saved
- Restored on page reload
- Key: `file-manager-view-mode`

### Sidebar State
- Collapsed/expanded saved
- Key: `file-manager-sidebar-collapsed`

### Selection State
- Optional: can be managed by parent component
- Optional: can be persisted via callback
- Supports Set<string> format

## Accessibility & UX

### Visual Feedback
- Hover highlight on cards/rows
- Selection highlight (border + background)
- Drag box visual feedback
- Context menu at cursor

### Keyboard Shortcuts
- All major actions have keyboard equivalent
- Tab focus management
- Escape closes overlays

### Performance
- Debounced search (configurable)
- Efficient drag box overlap detection
- Smart neighbor detection using cached rects
- Minimal re-renders via React.memo

### No External Dependencies
- Pure React (peer dependency)
- Uses only @sky-app/ui for styling utilities
- Self-contained, easily vendored

## What's NOT Included (Build These)

- Actual item deletion/trash functionality (provide via callback)
- API/server integration (provide item data)
- Custom item creation/editing (build your own forms)
- Detailed item view/modal (build your own)
- Sidebar navigation to other sections (you define destinations)

These are intentionally left out for maximum flexibility — your app provides the business logic and callbacks.
