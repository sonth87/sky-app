# Usage Examples

Real-world examples showing how to use the file manager library.

## Example 1: Layout Designer (Simple)

```typescript
import { FileLibraryLayout } from '@sky-app/ui-file-manager';
import { useEffect, useState } from 'react';

export function LayoutDesigner() {
  const [layouts, setLayouts] = useState([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    // Load layouts from API
    fetchLayouts().then(setLayouts);
  }, []);

  return (
    <FileLibraryLayout
      items={layouts}
      config={{
        sidebarItems: [
          { id: 'all', label: 'All Layouts', isActive: true },
          { id: 'trash', label: 'Trash', badge: 2 },
        ],
        contextMenuItems: [
          { id: 'open', label: 'Open', onClick: handleOpen },
          { id: 'duplicate', label: 'Duplicate', onClick: handleDuplicate },
          { id: 'download', label: 'Download', onClick: handleDownload },
          { id: 'delete', label: 'Delete', isDanger: true, onClick: handleDelete },
        ],
        onItemClick: (id) => openLayout(id),
        onSelectionChange: setSelectedIds,
      }}
    />
  );
}

function handleOpen(id: string) {
  // Open layout in editor
}

function handleDuplicate(id: string) {
  // Copy layout
}

function handleDownload(id: string) {
  // Download layout as JSON
}

function handleDelete(id: string) {
  // Move to trash (soft delete)
}
```

## Example 2: Template Gallery (With Custom Render)

```typescript
import { FileLibraryLayout } from '@sky-app/ui-file-manager';

export function TemplateGallery() {
  const [templates, setTemplates] = useState([]);

  return (
    <FileLibraryLayout
      items={templates}
      config={{
        supportedViews: [
          { id: 'grid', label: 'Grid' },
          { id: 'list', label: 'List' },
        ],
        defaultView: 'grid',
        
        showSearch: true,
        filterConfig: {
          placeholder: 'Search templates...',
          debounceMs: 300,
        },

        itemRenderer: (template, isSelected) => (
          <div className={`template-card ${isSelected ? 'selected' : ''}`}>
            <img 
              src={template.preview} 
              alt={template.name}
              className="w-full aspect-video object-cover"
            />
            <div className="p-3">
              <h3 className="font-bold">{template.name}</h3>
              <p className="text-sm text-gray-600">{template.category}</p>
              <div className="flex gap-2 mt-2">
                <span className="text-xs bg-blue-100 text-blue-900 px-2 py-1 rounded">
                  {template.aspectRatio}
                </span>
              </div>
            </div>
          </div>
        ),

        contextMenuItems: [
          { id: 'use', label: 'Use Template', onClick: (id) => createFromTemplate(id) },
          { id: 'preview', label: 'Preview', onClick: (id) => previewTemplate(id) },
          { id: 'share', label: 'Share', onClick: (id) => shareTemplate(id) },
        ],

        onItemClick: (id) => previewTemplate(id),
        onItemDoubleClick: (id) => createFromTemplate(id),
      }}
    />
  );
}
```

## Example 3: Font Manager (With Search Override)

```typescript
import { FileLibraryLayout } from '@sky-app/ui-file-manager';

export function FontManager() {
  const [fonts, setFonts] = useState([]);

  return (
    <FileLibraryLayout
      items={fonts}
      config={{
        showViewToggle: false,  // Only list view
        defaultView: 'list',

        filterConfig: {
          placeholder: 'Search by font name or family...',
          debounceMs: 200,
          // Custom search: match font name, family, or tags
          shouldMatch: (font, query) => {
            const q = query.toLowerCase();
            return (
              font.name.toLowerCase().includes(q) ||
              font.family.toLowerCase().includes(q) ||
              font.tags.some(t => t.toLowerCase().includes(q))
            );
          },
        },

        contextMenuItems: [
          { id: 'use', label: 'Use in Design', onClick: (id) => addFontToDesign(id) },
          { id: 'preview', label: 'Preview', onClick: (id) => previewFont(id) },
          { id: 'details', label: 'View Details', onClick: (id) => showFontDetails(id) },
          { id: 'remove', label: 'Remove', isDanger: true, onClick: (id) => removeFont(id) },
        ],

        itemRenderer: (font, isSelected) => (
          <div style={{ fontFamily: font.family }} className={`${isSelected ? 'bg-blue-100' : ''}`}>
            <div className="font-bold text-lg">{font.name}</div>
            <div className="text-sm text-gray-600">{font.family}</div>
          </div>
        ),

        onItemClick: (id) => previewFont(id),
        onItemDoubleClick: (id) => addFontToDesign(id),
      }}
    />
  );
}
```

## Example 4: File Manager (All Features)

```typescript
import { FileLibraryLayout } from '@sky-app/ui-file-manager';
import { useState, useCallback } from 'react';

export function FileManager() {
  const [files, setFiles] = useState([]);
  const [currentView, setCurrentView] = useState('all');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [filteredFiles, setFilteredFiles] = useState(files);

  const handleDelete = useCallback((ids: string[]) => {
    // Soft delete: move to trash
    const remaining = files.filter(f => !ids.includes(f.id));
    const trashed = files.filter(f => ids.includes(f.id));
    
    setFiles(remaining);
    setSelectedIds(new Set());
  }, [files]);

  const handleRestore = useCallback((ids: string[]) => {
    // Restore from trash
    setFiles(files.map(f => 
      ids.includes(f.id) ? { ...f, trashedAt: null } : f
    ));
  }, [files]);

  const viewedFiles = currentView === 'trash' 
    ? files.filter(f => f.trashedAt)
    : files.filter(f => !f.trashedAt);

  return (
    <FileLibraryLayout
      items={viewedFiles}
      config={{
        // Sidebar: different views
        sidebarItems: [
          {
            id: 'all',
            label: 'All Files',
            isActive: currentView === 'all',
            onClick: () => setCurrentView('all'),
          },
          {
            id: 'images',
            label: 'Images',
            badge: files.filter(f => f.type === 'image').length,
            isActive: currentView === 'images',
            onClick: () => setCurrentView('images'),
          },
          {
            id: 'documents',
            label: 'Documents',
            badge: files.filter(f => f.type === 'document').length,
            isActive: currentView === 'documents',
            onClick: () => setCurrentView('documents'),
          },
          {
            id: 'trash',
            label: 'Trash',
            badge: files.filter(f => f.trashedAt).length,
            isActive: currentView === 'trash',
            onClick: () => setCurrentView('trash'),
          },
        ],

        // Context menu: conditional based on view
        contextMenuItems: [
          ...(currentView === 'trash'
            ? [
                { id: 'restore', label: 'Restore', onClick: (id) => handleRestore([id]) },
                { id: 'delete', label: 'Delete Permanently', isDanger: true, onClick: (id) => handleDelete([id]) },
              ]
            : [
                { id: 'download', label: 'Download', onClick: (id) => downloadFile(id) },
                { id: 'share', label: 'Share', onClick: (id) => shareFile(id) },
                { id: 'delete', label: 'Delete', isDanger: true, onClick: (id) => handleDelete([id]) },
              ]),
        ],

        // Header buttons
        headerButtons: [
          {
            id: 'upload',
            label: 'Upload',
            onClick: () => openUploadDialog(),
            disabled: currentView === 'trash',
          },
        ],

        // Search with custom logic
        filterConfig: {
          placeholder: 'Search files...',
          debounceMs: 300,
          shouldMatch: (file, query) => {
            const q = query.toLowerCase();
            return (
              file.name.toLowerCase().includes(q) ||
              file.type.toLowerCase().includes(q) ||
              (file.tags && file.tags.some(t => t.toLowerCase().includes(q)))
            );
          },
        },

        // Custom rendering
        itemRenderer: (file, isSelected) => (
          <div className={`file-card ${isSelected ? 'selected' : ''}`}>
            <div className="file-icon">{getFileIcon(file.type)}</div>
            <div className="file-info">
              <div className="font-bold">{file.name}</div>
              <div className="text-sm text-gray-600">{file.size}</div>
            </div>
          </div>
        ),

        // Callbacks
        onItemClick: (id) => openFile(id),
        onItemDoubleClick: (id) => downloadFile(id),
        onSelectionChange: setSelectedIds,
        onViewChange: (mode) => console.log('View changed to:', mode),
      }}
    />
  );
}
```

## Example 5: Photo Gallery (Minimal Config)

```typescript
import { FileLibraryLayout } from '@sky-app/ui-file-manager';

export function PhotoGallery({ photos }) {
  return (
    <FileLibraryLayout
      items={photos}
      config={{
        showSearch: true,
        defaultView: 'grid',
        onItemClick: (id) => viewPhoto(id),
        onItemDoubleClick: (id) => downloadPhoto(id),
      }}
    />
  );
}
```

## Hooks (Advanced)

If you need more control, use the hooks directly:

```typescript
import { 
  useFileSelection, 
  useFileKeyboard, 
  useDragToSelect 
} from '@sky-app/ui-file-manager';

export function CustomFileManager() {
  const items = [...];
  
  // Selection state
  const selection = useFileSelection();
  
  // Keyboard handling
  const keyboard = useFileKeyboard({
    items,
    selection,
    viewMode: 'grid',
    onOpen: (id) => console.log('Open:', id),
    onDelete: (ids) => console.log('Delete:', ids),
  });
  
  // Drag-to-select
  const dragBox = useDragToSelect();

  return (
    <div
      ref={dragBox.containerRef}
      onMouseDown={dragBox.handleMouseDown}
    >
      {/* Your custom UI here */}
    </div>
  );
}
```

## Testing

```typescript
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FileLibraryLayout } from '@sky-app/ui-file-manager';

describe('FileLibraryLayout', () => {
  it('displays items in grid view', () => {
    const items = [
      { id: '1', name: 'Item 1' },
      { id: '2', name: 'Item 2' },
    ];

    render(
      <FileLibraryLayout items={items} config={{}} />
    );

    expect(screen.getByText('Item 1')).toBeInTheDocument();
    expect(screen.getByText('Item 2')).toBeInTheDocument();
  });

  it('calls onItemClick when item is clicked', async () => {
    const handleClick = jest.fn();
    const items = [{ id: '1', name: 'Item 1' }];

    render(
      <FileLibraryLayout 
        items={items} 
        config={{ onItemClick: handleClick }}
      />
    );

    await userEvent.click(screen.getByText('Item 1'));
    expect(handleClick).toHaveBeenCalledWith('1');
  });

  it('supports Ctrl+click multi-select', async () => {
    const handleSelectionChange = jest.fn();
    const items = [
      { id: '1', name: 'Item 1' },
      { id: '2', name: 'Item 2' },
    ];

    render(
      <FileLibraryLayout 
        items={items} 
        config={{ onSelectionChange: handleSelectionChange }}
      />
    );

    const item1 = screen.getByText('Item 1');
    await userEvent.click(item1);
    await userEvent.click(screen.getByText('Item 2'), { ctrlKey: true });

    const lastCall = handleSelectionChange.mock.calls[handleSelectionChange.mock.calls.length - 1];
    expect(lastCall[0].size).toBe(2);
  });
});
```
