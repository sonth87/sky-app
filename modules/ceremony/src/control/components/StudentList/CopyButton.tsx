import { Copy } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { showSuccessToast } from '../../lib/toast';

export function CopyButton({ text, label }: { text: string; label?: string }) {
  const { t } = useTranslation();
  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!text) return;
    navigator.clipboard.writeText(text);
    showSuccessToast(label ? t('studentList.copiedLabel', { label }) : t('studentList.copiedGeneric'));
  };

  return (
    <button
      onClick={handleCopy}
      className="opacity-0 group-hover:opacity-100 transition-opacity ml-1.5 p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground focus:opacity-100 outline-none inline-flex items-center justify-center shrink-0"
      title={t('studentList.copyTitle')}
    >
      <Copy size={11} />
    </button>
  );
}
