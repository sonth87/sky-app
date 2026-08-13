import { Lock } from 'lucide-react';
import { useTranslation } from 'react-i18next';

/**
 * Ghi chú "an toàn khi hành lễ" hiện trong modal quản lý engine.
 *
 * Ở lại Ceremony chứ KHÔNG vào @sky-app/tts-engine-ui: nội dung nói về việc nhường tài
 * nguyên khi có sinh viên lên sân khấu — hoàn toàn vô nghĩa với TTS Studio. Package
 * dùng chung nhận nó qua prop `notice`.
 */
export function CeremonySafetyNote() {
  const { t } = useTranslation();
  return (
    <p className="flex items-start gap-1.5 rounded-lg bg-muted px-3 py-2 text-xxs text-muted-foreground">
      <Lock size={13} className="mt-0.5 shrink-0 text-muted-foreground" />
      <span dangerouslySetInnerHTML={{ __html: t('engineManager.ceremonySafetyNote') }} />
    </p>
  );
}
