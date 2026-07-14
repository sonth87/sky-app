/**
 * Tạo semantic CSS class names để dễ identify elements khi inspect.
 * Format: [ComponentName]__[ElementName]--[Modifier]
 * Ví dụ: DebugMenu__button--primary, DeleteConfirmModal__countdown--active
 */

type ClassNameConfig = {
  component: string;
  element?: string;
  modifier?: string | string[];
};

export function cn(config: ClassNameConfig | string, styles?: string): string {
  if (typeof config === 'string') {
    return config;
  }

  const { component, element, modifier } = config;
  let className = component;

  if (element) {
    className += `__${element}`;
  }

  if (modifier) {
    const modifiers = Array.isArray(modifier) ? modifier : [modifier];
    modifiers.forEach((mod) => {
      className += `--${mod}`;
    });
  }

  if (styles) {
    className += ` ${styles}`;
  }

  return className;
}

// Helper để combine semantic classes với Tailwind
export function semanticClass(semantic: ClassNameConfig, tailwind: string): string {
  const semanticName = cn(semantic);
  return `${semanticName} ${tailwind}`;
}
