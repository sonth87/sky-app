/**
 * Core types for the file manager library
 * These types define the shape of data, configuration, and events
 */

/** Base item shape that all items must extend */
export interface FileItem {
  id: string;
  name: string;
  description?: string;
  color?: string;
  tags?: string[];
  createdAt?: number;
  updatedAt?: number;
  [key: string]: any; // Allow custom fields
}

/** Sidebar menu item configuration */
export interface SidebarItem {
  id: string;
  label: string;
  icon?: React.ReactNode;
  badge?: number | string;
  isActive?: boolean;
  onClick?: () => void;
}

/** Context menu item */
export interface ContextMenuItem {
  id: string;
  label: string;
  icon?: React.ReactNode;
  isDanger?: boolean;
  onClick: (itemId: string) => void;
  visible?: (itemId: string) => boolean;
}

/** View mode configuration */
export interface ViewMode {
  id: string;
  icon?: React.ReactNode;
  label: string;
}

/** Filter/Search configuration */
export interface FilterConfig {
  placeholder?: string;
  debounceMs?: number;
  normalizeSearch?: (query: string) => string; // For diacritic-insensitive search
  shouldMatch?: (item: FileItem, query: string) => boolean;
}

/** Selection state */
export interface SelectionState {
  selectedIds: Set<string>;
  lastSelectedId: string | null;
  rangeAnchorId: string | null;
}

/** Size configuration for items */
export interface SizeConfig {
  minSize?: number;   // Minimum size in pixels (default: 120)
  maxSize?: number;   // Maximum size in pixels (default: 320)
  defaultSize?: number;  // Default size in pixels (default: 200)
  step?: number;      // Size increment step (default: 20)
}

/** Library layout configuration */
export interface FileLibraryConfig {
  // App namespace for localStorage isolation (e.g., 'layout-designer', 'template-gallery')
  // Without this, all apps share the same localStorage keys
  appId?: string;

  // Sidebar
  sidebarItems?: SidebarItem[];
  sidebarCollapsedDefault?: boolean;

  // Context menu
  contextMenuItems?: ContextMenuItem[];

  // Header
  showViewToggle?: boolean;
  showSearch?: boolean;
  showSizeControl?: boolean;  // Show size adjustment button (default: true)
  headerButtons?: Array<{
    id: string;
    label: string;
    icon?: React.ReactNode;
    onClick: () => void;
    disabled?: boolean;
  }>;

  // Views
  supportedViews?: ViewMode[];
  defaultView?: string;

  // Filter
  filterConfig?: FilterConfig;

  // Size control
  sizeConfig?: SizeConfig;

  // Keyboard
  enableKeyboardNavigation?: boolean;
  enableDragToSelect?: boolean;

  // Rendering
  itemRenderer?: (item: FileItem, isSelected: boolean) => React.ReactNode;
  emptyState?: React.ReactNode;
  loadingState?: React.ReactNode;

  // Callbacks
  onItemClick?: (itemId: string) => void;
  onItemDoubleClick?: (itemId: string) => void;
  onSelectionChange?: (selectedIds: Set<string>) => void;
  onViewChange?: (viewMode: string) => void;
  onSizeChange?: (size: number) => void;
}

/** Drag box state */
export interface DragBoxState {
  start: { x: number; y: number } | null;
  end: { x: number; y: number } | null;
  containerRect: DOMRect | null;
}

/** Context menu state */
export interface ContextMenuState {
  x: number;
  y: number;
  itemId: string;
}
