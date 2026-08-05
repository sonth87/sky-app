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

/** Library layout configuration */
export interface FileLibraryConfig {
  // Sidebar
  sidebarItems?: SidebarItem[];
  sidebarCollapsedDefault?: boolean;

  // Context menu
  contextMenuItems?: ContextMenuItem[];

  // Header
  showViewToggle?: boolean;
  showSearch?: boolean;
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
