import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal } from './ui/Modal';
import { useSlide } from '../lib/slide';

interface AboutModalProps {
  open: boolean;
  onClose: () => void;
}

export function AboutModal({ open, onClose }: AboutModalProps) {
  const { t } = useTranslation();
  const slide = useSlide('about-version');
  const [version, setVersion] = useState('');

  useEffect(() => {
    if (open) {
      slide?.getAppVersion().then((v) => setVersion(v.version));
    }
  }, [open, slide]);

  return (
    <Modal open={open} onClose={onClose} size="sm">
      <div className="space-y-4 text-sm text-foreground">
        <p className="text-center">
          <span className="block font-semibold text-foreground">{t('about.appName')}</span>
          <span className="block text-xs text-muted-foreground">v{version}</span>
        </p>
        <p className="border-t border-border pt-4 text-center text-xs">
          Skyline
        </p>
      </div>
    </Modal>
  );
}
