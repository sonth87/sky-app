# Customization Guide

How to extend and customize the file manager behavior without forking the library.

## Customization Through Configuration

The primary way to customize is through the `config` object. Most customizations don't require code changes:

### Custom Sidebar Items

Define your own sidebar items with any structure:

```typescript
config={{
  sidebarItems: [
    { 
      id: 'all', 
      label: 'All Files',
      icon: <FolderIcon />,
      isActive: true,
      onClick: () => setFilter('all')
    },
    { 
      id: 'recent', 
      label: 'Recent',
      icon: <ClockIcon />,
      onClick: () => setFilter('recent')
    },
    { 
      id: 'starred', 
      label: 'Starred',
      icon: <StarIcon />,
      badge: starredCount,
      onClick: () => setFilter('starred')
    },
  ]
}}
```

**No need to modify the component** — just change what you pass in.

### Custom Context Menu

Define different menu items based on application needs:

```typescript
config={{
  contextMenuItems: [
    // Always available
    { id: 'open', label: 'Open', onClick: (id) => openFile(id) },
    
    // Only show for certain file types
    {
      id: 'edit',
      label: 'Edit',
      onClick: (id) => editFile(id),
      visible: (id) => {
        const file = files.find(f => f.id === id);
        return file && file.type === 'text';
      }
    },
    
    // Destructive actions
    {
      id: 'delete',
      label: 'Delete',
      isDanger: true,
      onClick: (id) => deleteFile(id)
    },
  ]
}}
```

### Custom Search Logic

Override the default search behavior:

```typescript
config={{
  filterConfig: {
    placeholder: 'Search by name or tag...',
    debounceMs: 200,
    
    // Custom normalization (e.g., remove punctuation)
    normalizeSearch: (query) => 
      query
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')  // Remove diacritics
        .replace(/[^\w\s]/g, '')  // Remove punctuation
        .toLowerCase()
        .trim(),
    
    // Custom matching logic
    shouldMatch: (item, query) => {
      return (
        item.name.includes(query) ||
        item.description.includes(query) ||
        (item.tags && item.tags.some(t => t.includes(query))) ||
        (item.author && item.author.includes(query))
      );
    }
  }
}}
```

### Custom Item Rendering

Render items however you want without changing the component:

```typescript
config={{
  itemRenderer: (item, isSelected) => (
    <div className={`custom-card ${isSelected ? 'selected' : ''}`}>
      {/* Your custom HTML */}
      <img src={item.thumbnail} alt={item.name} />
      
      <div className="metadata">
        <h3>{item.name}</h3>
        <p>{item.description}</p>
        
        {/* Custom badges */}
        {item.isPremium && <span className="badge premium">Premium</span>}
        {item.isNew && <span className="badge new">New</span>}
      </div>
      
      {/* Custom actions */}
      <div className="actions">
        <button onClick={() => openInEditor(item.id)}>Edit</button>
        <button onClick={() => shareItem(item.id)}>Share</button>
      </div>
    </div>
  )
}}
```

### Custom Header Buttons

Add any buttons to the header:

```typescript
config={{
  headerButtons: [
    {
      id: 'create',
      label: 'New File',
      icon: <PlusIcon />,
      onClick: () => createNewFile(),
      disabled: readOnly
    },
    {
      id: 'bulk-action',
      label: 'Delete Selected',
      icon: <TrashIcon />,
      onClick: () => deleteSelected(selectedIds),
      disabled: selectedIds.size === 0
    },
  ]
}}
```

## Controlling State

You can control parts of the state from the parent component:

### Selection State

```typescript
const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

<FileLibraryLayout
  items={items}
  config={{
    onSelectionChange: setSelectedIds,  // Callback when selection changes
    // Note: selection state is managed internally, you're just observing
  }}
/>

// Later: use selectedIds in parent
function deleteSelected() {
  Array.from(selectedIds).forEach(id => deleteFile(id));
}
```

### View Mode

```typescript
const [viewMode, setViewMode] = useState('grid');

<FileLibraryLayout
  items={items}
  config={{
    defaultView: viewMode,  // Set initial view
    onViewChange: setViewMode,  // Observe changes
  }}
/>
```

### Current View/Filter

Since the sidebar is fully customizable, you control the "current view":

```typescript
const [currentView, setCurrentView] = useState('all');
const viewedItems = currentView === 'trash' 
  ? items.filter(i => i.trashedAt)
  : items;

<FileLibraryLayout
  items={viewedItems}  // Pass filtered items
  config={{
    sidebarItems: [
      {
        id: 'all',
        label: 'All Files',
        isActive: currentView === 'all',
        onClick: () => setCurrentView('all')
      },
      {
        id: 'trash',
        label: 'Trash',
        isActive: currentView === 'trash',
        onClick: () => setCurrentView('trash')
      },
    ]
  }}
/>
```

## Keyboard Shortcuts

You can add custom keyboard handlers outside the component:

```typescript
useEffect(() => {
  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.ctrlKey && e.key === 'n') {
      e.preventDefault();
      createNewFile();
    }
    if (e.ctrlKey && e.key === 'f') {
      e.preventDefault();
      focusSearchInput();
    }
  };

  window.addEventListener('keydown', handleKeyDown);
  return () => window.removeEventListener('keydown', handleKeyDown);
}, []);
```

The library handles arrow keys, Shift+Arrow, Enter, Delete, Escape. Custom shortcuts fit around this.

## Styling Customization

The component uses Tailwind classes, which are fully customizable:

```typescript
// If you need different colors/sizes, wrap in a div with CSS variables
<div style={{ '--primary-color': '#3b82f6' }}>
  <FileLibraryLayout items={items} config={config} />
</div>
```

Or use CSS modules:

```css
/* customization.module.css */
:global .file-library {
  --item-height: 200px;
  --card-padding: 16px;
}
```

## Advanced: Using Hooks Directly

For complete control, use the hooks directly:

```typescript
import { 
  useFileSelection, 
  useFileKeyboard, 
  useDragToSelect,
  useFileSearch 
} from '@sky-app/ui-file-manager';

export function AdvancedFileManager() {
  const selection = useFileSelection();
  const dragBox = useDragToSelect();
  const search = useFileSearch(items);

  // Now you have direct access to all state and handlers
  return (
    <div>
      {/* Build your own UI from scratch */}
      {search.filtered.map(item => (
        <div
          key={item.id}
          onClick={() => selection.selectId(item.id)}
          className={selection.selectedIds.has(item.id) ? 'selected' : ''}
        >
          {item.name}
        </div>
      ))}
    </div>
  );
}
```

## Common Customization Patterns

### Pattern 1: Conditional Features

Show/hide features based on props:

```typescript
function FileManager({ showTrash, showSearch, allowMultiSelect }) {
  return (
    <FileLibraryLayout
      items={items}
      config={{
        showSearch,
        sidebarItems: showTrash 
          ? [...items, { id: 'trash', label: 'Trash' }]
          : [...items],
        // ... other config
      }}
    />
  );
}
```

### Pattern 2: Role-Based Features

Different menus for different user roles:

```typescript
function FileManager({ userRole }) {
  const contextMenu = {
    admin: [
      { id: 'open', label: 'Open', onClick: handleOpen },
      { id: 'delete', label: 'Delete', isDanger: true, onClick: handleDelete },
    ],
    editor: [
      { id: 'open', label: 'Open', onClick: handleOpen },
      { id: 'download', label: 'Download', onClick: handleDownload },
    ],
    viewer: [
      { id: 'open', label: 'Open', onClick: handleOpen },
    ],
  };

  return (
    <FileLibraryLayout
      items={items}
      config={{ contextMenuItems: contextMenu[userRole] }}
    />
  );
}
```

### Pattern 3: Theme Support

Customize based on theme:

```typescript
function FileManager({ theme }) {
  const config = {
    itemRenderer: (item, isSelected) => (
      <div className={`card card-${theme} ${isSelected ? 'selected' : ''}`}>
        {/* Render based on theme */}
      </div>
    ),
    // ... other config
  };

  return <FileLibraryLayout items={items} config={config} />;
}
```

## When to Extend vs. Fork

**Use configuration** (don't fork) for:
- Custom menus, buttons, sidebar items
- Different rendering per item
- Custom search/filter logic
- Different actions/callbacks
- Theme/styling changes

**Consider a wrapper component** for:
- Complex state management on top
- Multiple file managers coordinating
- Custom hooks injected into children

**Only fork/extend if**:
- You need fundamentally different interaction patterns
- The config doesn't expose what you need
- You're building a specialized variant (3D viewer, map, etc.)

## Reporting Missing Customization

If you can't achieve what you need through configuration:

1. Check ARCHITECTURE.md for design constraints
2. Try using hooks directly (see above)
3. Consider a wrapper component
4. File an issue with your use case

The library is designed to be extremely customizable before extending.
