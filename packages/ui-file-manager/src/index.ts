// Main component
export { FileLibraryLayout } from './components/FileLibraryLayout';

// Components
export {
  FileHeader,
  FileSidebar,
  FileContextMenu,
  FileGrid,
  FileList,
  FileFilter,
} from './components';

// Hooks
export { useFileSelection } from './hooks/useFileSelection';
export { useFileKeyboard } from './hooks/useFileKeyboard';
export { useDragToSelect } from './hooks/useDragToSelect';
export { useFileSearch } from './hooks/useFileSearch';

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
