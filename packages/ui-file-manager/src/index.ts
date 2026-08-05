// Main component
export { FileLibraryLayout } from './components/FileLibraryLayout';

// Hooks
export { useFileSelection } from './hooks/useFileSelection';
export { useFileKeyboard } from './hooks/useFileKeyboard';
export { useDragToSelect } from './hooks/useDragToSelect';

// Types
export type {
  FileItem,
  SidebarItem,
  ContextMenuItem,
  ViewMode,
  FilterConfig,
  SelectionState,
  FileLibraryConfig,
  DragBoxState,
  ContextMenuState,
} from './types';
