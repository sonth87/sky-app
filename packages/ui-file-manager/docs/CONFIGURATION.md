# Configuration Guide

Complete reference for all customization options in FileLibraryConfig.

## App Namespace (appId)

For multi-app environments, use `appId` to isolate localStorage:

```typescript
{
  appId: 'layout-designer',  // or 'template-gallery', 'font-manager', etc.
}
```

**Without appId**: All apps share the same localStorage keys
- `file-manager-view-mode` (layout-designer and template-gallery both use this)
- Closing layout-designer with list view affects template-gallery's stored view

**With appId**: Each app has separate keys
- `file-manager-layout-designer-view-mode`
- `file-manager-layout-designer-item-size`
- `file-manager-template-gallery-view-mode`
- `file-manager-template-gallery-item-size`

This ensures:
- Layout-designer remembers grid view + large size
- Template-gallery remembers list view + small size
- No interference between apps

## Sidebar Configuration

```typescript
{
  sidebarItems?: SidebarItem[];  // Array of menu items
  sidebarCollapsedDefault?: boolean;  // Start collapsed? (default: false)
}
```

**SidebarItem shape:**
```typescript
{
  id: string;              // Unique identifier
  label: string;           // Display text
  icon?: React.ReactNode;  // Icon to show (left of label)
  badge?: number | string; // Badge text/count (top-right)
  isActive?: boolean;      // Highlight as active
  onClick?: () => void;    // Click handler
}
```

**Example:**
```typescript
sidebarItems: [
  { id: 'all', label: 'All Layouts', isActive: true, onClick: () => setView('all') },
  { id: 'favorites', label: 'Favorites', badge: 5, onClick: () => setView('favorites') },
  { id: 'trash', label: 'Trash', badge: 2, onClick: () => setView('trash') },
]
```

## Context Menu Configuration

```typescript
{
  contextMenuItems?: ContextMenuItem[];  // Array of menu items
}
```

**ContextMenuItem shape:**
```typescript
{
  id: string;                                    // Unique identifier
  label: string;                                 // Display text
  icon?: React.ReactNode;                        // Icon
  isDanger?: boolean;                            // Red text for destructive actions
  onClick: (itemId: string) => void;            // Click handler (receives item ID)
  visible?: (itemId: string) => boolean;        // Optional: hide for certain items
}
```

**Example:**
```typescript
contextMenuItems: [
  { id: 'open', label: 'Open', onClick: (id) => handleOpen(id) },
  { id: 'download', label: 'Download', onClick: (id) => handleDownload(id) },
  { id: 'duplicate', label: 'Duplicate', onClick: (id) => handleDuplicate(id) },
  { id: 'delete', label: 'Delete', isDanger: true, onClick: (id) => handleDelete(id) },
]
```

## Header Configuration

```typescript
{
  showViewToggle?: boolean;        // Show grid/list toggle (default: true)
  showSearch?: boolean;            // Show search input (default: true)
  headerButtons?: HeaderButton[];  // Custom buttons in header
}
```

**HeaderButton shape:**
```typescript
{
  id: string;
  label: string;
  icon?: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
}
```

## View Configuration

```typescript
{
  supportedViews?: ViewMode[];  // Available views (grid, list, etc.)
  defaultView?: string;         // Which view on load (default: 'grid')
}
```

**ViewMode shape:**
```typescript
{
  id: string;           // 'grid', 'list', 'detail', etc.
  icon?: React.ReactNode;
  label: string;
}
```

## Size Control Configuration

```typescript
{
  showSizeControl?: boolean;  // Show size button (default: true)
  sizeConfig?: SizeConfig;    // Customize size behavior
}
```

**SizeConfig shape:**
```typescript
{
  minSize?: number;      // Minimum pixel width (default: 120)
  maxSize?: number;      // Maximum pixel width (default: 320)
  defaultSize?: number;  // Initial size (default: 200)
  step?: number;         // Slider increment (default: 20)
}
```

**Example:**
```typescript
sizeConfig: {
  minSize: 100,        // Slider starts at 100px
  maxSize: 400,        // Slider goes up to 400px
  defaultSize: 250,    // Reset button sets to 250px
  step: 10,            // Increment by 10px each step
}
```

**Effects:**
- Grid view: Changes grid column width (minmax(size, 1fr))
- List view: Changes row height
- Size persisted per app to localStorage

## Filter Configuration

```typescript
{
  filterConfig?: FilterConfig;
}
```

**FilterConfig shape:**
```typescript
{
  placeholder?: string;  // Search input placeholder
  debounceMs?: number;   // Debounce delay (default: 300)
  normalizeSearch?: (query: string) => string;  // Custom normalization
  shouldMatch?: (item: FileItem, query: string) => boolean;  // Custom matching
}
```

**Example (diacritic-insensitive search):**
```typescript
filterConfig: {
  placeholder: 'Search layouts...',
  debounceMs: 300,
  normalizeSearch: (query) => 
    query.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim(),
  shouldMatch: (item, query) => 
    item.name.includes(query) || item.tags.some(t => t.includes(query)),
}
```

## View Mode Configuration

```typescript
{
  enableKeyboardNavigation?: boolean;  // Allow arrow keys, Escape, etc. (default: true)
  enableDragToSelect?: boolean;        // Allow drag-to-select (default: true)
}
```

## Item Rendering

```typescript
{
  itemRenderer?: (item: FileItem, isSelected: boolean) => React.ReactNode;
  emptyState?: React.ReactNode;
  loadingState?: React.ReactNode;
}
```

**Example custom renderer:**
```typescript
itemRenderer: (item, isSelected) => (
  <div className={isSelected ? 'selected' : ''}>
    <img src={item.thumbnail} alt={item.name} />
    <h3>{item.name}</h3>
    <p>{item.description}</p>
  </div>
)
```

## Callbacks

```typescript
{
  onItemClick?: (itemId: string) => void;
  onItemDoubleClick?: (itemId: string) => void;
  onSelectionChange?: (selectedIds: Set<string>) => void;
  onViewChange?: (viewMode: string) => void;
  onDelete?: (itemIds: string[]) => void;  // Called when Delete key pressed
  onContextMenu?: (itemId: string, x: number, y: number) => void;
}
```

## Complete Example

```typescript
<FileLibraryLayout
  items={layouts}
  config={{
    // App namespace for isolated localStorage
    appId: 'layout-designer',  // Each app keeps separate preferences
    
    // Sidebar
    sidebarItems: [
      { id: 'all', label: 'All Layouts', isActive: true, onClick: () => {} },
      { id: 'trash', label: 'Trash', badge: trashCount, onClick: () => {} },
    ],
    
    // Context menu
    contextMenuItems: [
      { id: 'open', label: 'Open', onClick: handleOpen },
      { id: 'download', label: 'Download', onClick: handleDownload },
      { id: 'delete', label: 'Delete', isDanger: true, onClick: handleDelete },
    ],
    
    // Header
    showViewToggle: true,
    showSearch: true,
    showSizeControl: true,
    headerButtons: [
      { id: 'create', label: 'New', onClick: handleCreate },
    ],
    
    // Views
    supportedViews: [
      { id: 'grid', label: 'Grid' },
      { id: 'list', label: 'List' },
    ],
    defaultView: 'grid',
    
    // Filter
    filterConfig: {
      placeholder: 'Search layouts...',
      debounceMs: 300,
    },
    
    // Size control
    sizeConfig: {
      minSize: 120,
      maxSize: 300,
      defaultSize: 200,
      step: 20,
    },
    
    // Rendering
    itemRenderer: (item, isSelected) => <LayoutCard item={item} selected={isSelected} />,
    emptyState: <div>No layouts found</div>,
    loadingState: <div>Loading...</div>,
    
    // Callbacks
    onItemClick: (id) => handleOpen(id),
    onSelectionChange: (ids) => setSelectedIds(ids),
    onViewChange: (mode) => setViewMode(mode),
    onSizeChange: (size) => console.log('Size changed to:', size),
  }}
/>
```

## Minimal Configuration

If you just want the defaults, pass an empty config:

```typescript
<FileLibraryLayout items={items} config={{}} />
```

This gives you:
- Grid view with selection logic
- No sidebar
- No context menu
- Search enabled
- View toggle enabled
- Default item rendering
