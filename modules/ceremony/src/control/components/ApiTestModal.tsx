import { useState, useEffect } from 'react';
import { X, Send, Copy, Check, Terminal, Globe, Key, FileJson, Play } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useControlStore } from '../store';
import { showSuccessToast, showErrorToast } from '../lib/toast';

interface ApiTestModalProps {
  open: boolean;
  onClose: () => void;
}

export function ApiTestModal({ open, onClose }: ApiTestModalProps) {
  const { t } = useTranslation();
  const awardLocationCode = useControlStore((s) => s.awardLocationCode ?? 0);
  const students = useControlStore((s) => s.students || []);

  const [url, setUrl] = useState('https://openapi.dainam.edu.vn/api/v1/graduation-batch-student/update-registration-status');
  const [apiKey, setApiKey] = useState('');
  const [studentKeyword, setStudentKeyword] = useState('');
  const [regStatus, setRegStatus] = useState('on_stage');
  const [locationCode, setLocationCode] = useState(awardLocationCode);

  const [isLoading, setIsLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [response, setResponse] = useState<any>(null);

  // Cập nhật locationCode khi awardLocationCode đổi ngoài UI chính
  useEffect(() => {
    if (open) {
      setLocationCode(awardLocationCode);
      if (students.length > 0 && !studentKeyword) {
        setStudentKeyword(students[0].student_code);
      }
    }
  }, [open, awardLocationCode, students]);

  // Sinh payload JSON thời gian thực
  const payload = {
    key_word: studentKeyword,
    registration_status: regStatus,
    award_location_code: locationCode,
  };

  const jsonString = JSON.stringify(payload, null, 2);

  const handleSend = async () => {
    setIsLoading(true);
    setResponse(null);
    try {
      const res = await window.slide.apiRequest({
        url,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
        },
        body: payload,
      });
      setResponse(res);
      if (res.ok) {
        showSuccessToast(t('apiTestModal.sendSuccess'));
      } else {
        showErrorToast(t('apiTestModal.sendErrorStatus', { status: res.status }));
      }
    } catch (err: any) {
      setResponse({
        ok: false,
        status: 0,
        statusText: 'Network Error',
        body: err.message || String(err),
      });
      showErrorToast(t('apiTestModal.sendError'));
    } finally {
      setIsLoading(false);
    }
  };

  const handleCopyJson = () => {
    navigator.clipboard.writeText(jsonString);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const loadRandomStudent = () => {
    if (students.length === 0) return;
    const rand = students[Math.floor(Math.random() * students.length)];
    setStudentKeyword(rand.student_code);
    showSuccessToast(t('apiTestModal.loadedStudent', { name: rand.full_name }));
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/70 backdrop-blur-md p-4 animate-fade-in" onClick={onClose}>
      <div
        className="w-[960px] max-w-[95%] h-[85vh] rounded-2xl bg-card shadow-2xl flex flex-col border border-border overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="border-b border-border bg-muted px-6 py-4 flex items-center justify-between select-none">
          <div className="flex items-center gap-2.5">
            <div className="rounded-lg bg-info/15 p-2 text-info">
              <Terminal size={20} />
            </div>
            <div>
              <h2 className="text-base font-bold text-foreground">
                {t('apiTestModal.headerTitle')}
              </h2>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                {t('apiTestModal.headerSubtitle')}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 hover:bg-muted text-muted-foreground hover:text-foreground transition-colors cursor-pointer">
            <X size={18} />
          </button>
        </div>

        {/* Body Split */}
        <div className="flex-1 flex min-h-0 divide-x divide-border">
          {/* Cột trái: Request Form */}
          <div className="w-[50%] p-6 overflow-y-auto flex flex-col gap-5">
            <div className="flex items-center gap-1.5 border-b border-border pb-2">
              <Globe className="h-4 w-4 text-info" />
              <h3 className="text-xs font-bold uppercase tracking-wider text-foreground">{t('apiTestModal.requestSection')}</h3>
            </div>

            {/* HTTP Method + URL */}
            <div className="flex flex-col gap-1.5">
              <label className="text-[11px] font-bold uppercase text-muted-foreground">{t('apiTestModal.methodAndUrl')}</label>
              <div className="flex gap-2">
                <span className="rounded-lg bg-info px-3 py-2 text-xs font-extrabold text-info-foreground flex items-center select-none">
                  POST
                </span>
                <input
                  type="text"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder={t('apiTestModal.urlPlaceholder')}
                  className="flex-1 rounded-lg border border-border px-3 py-2 text-xs text-foreground outline-none focus:border-info focus:ring-1 focus:ring-info font-mono"
                />
              </div>
            </div>

            {/* Headers */}
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-1.5">
                <Key className="h-3.5 w-3.5 text-muted-foreground" />
                <label className="text-[11px] font-bold uppercase text-muted-foreground">Headers</label>
              </div>
              <div className="rounded-xl border border-border bg-muted/50 p-3 flex flex-col gap-2.5">
                <div className="flex justify-between items-center text-xs">
                  <span className="font-mono text-muted-foreground">Content-Type</span>
                  <span className="font-mono text-foreground font-semibold bg-muted px-2 py-0.5 rounded">application/json</span>
                </div>
                <div className="flex flex-col gap-1">
                  <span className="font-mono text-xs text-muted-foreground">x-api-key</span>
                  <input
                    type="text"
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    placeholder={t('apiTestModal.apiKeyPlaceholder')}
                    className="rounded-lg border border-border bg-card px-3 py-1.5 text-xs text-foreground outline-none focus:border-info focus:ring-1 focus:ring-info font-mono"
                  />
                </div>
              </div>
            </div>

            {/* Parameters Form */}
            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <label className="text-[11px] font-bold uppercase text-muted-foreground">Payload Parameters</label>
                <button
                  type="button"
                  onClick={loadRandomStudent}
                  className="text-[10px] font-semibold text-info hover:underline flex items-center gap-1 cursor-pointer"
                >
                  <Play className="h-2.5 w-2.5 fill-current" /> {t('apiTestModal.loadRandomStudent')}
                </button>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="flex flex-col gap-1">
                  <span className="text-[11px] font-semibold text-foreground">{t('apiTestModal.keyWordLabel')}</span>
                  <input
                    type="text"
                    value={studentKeyword}
                    onChange={(e) => setStudentKeyword(e.target.value)}
                    placeholder={t('apiTestModal.keyWordPlaceholder')}
                    className="rounded-lg border border-border px-3 py-1.5 text-xs text-foreground outline-none focus:border-info focus:ring-1 focus:ring-info font-mono"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <span className="text-[11px] font-semibold text-foreground">award_location_code</span>
                  <select
                    value={locationCode}
                    onChange={(e) => setLocationCode(parseInt(e.target.value, 10))}
                    className="rounded-lg border border-border bg-card px-3 py-1.5 text-xs text-foreground outline-none focus:border-info focus:ring-1 focus:ring-info cursor-pointer"
                  >
                    <option value={0}>{t('apiTestModal.locations.square')}</option>
                    <option value={1}>{t('apiTestModal.locations.htlGd1')}</option>
                    <option value={2}>{t('apiTestModal.locations.ht1Gd2')}</option>
                    <option value={3}>{t('apiTestModal.locations.ht2Gd2')}</option>
                  </select>
                </div>
              </div>

              <div className="flex flex-col gap-1">
                <span className="text-[11px] font-semibold text-foreground">registration_status</span>
                <input
                  type="text"
                  value={regStatus}
                  onChange={(e) => setRegStatus(e.target.value)}
                  className="rounded-lg border border-border px-3 py-1.5 text-xs text-foreground outline-none focus:border-info focus:ring-1 focus:ring-info font-mono"
                />
              </div>
            </div>

            {/* JSON Request Preview */}
            <div className="flex flex-col gap-1.5 mt-1">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold uppercase text-muted-foreground">{t('apiTestModal.jsonRequestBody')}</span>
                <button
                  onClick={handleCopyJson}
                  className="text-muted-foreground hover:text-foreground p-1 hover:bg-muted rounded transition-colors"
                  title={t('apiTestModal.copyJsonTitle')}
                >
                  {copied ? <Check className="h-3.5 w-3.5 text-success" /> : <Copy className="h-3.5 w-3.5" />}
                </button>
              </div>
              <pre className="rounded-xl bg-foreground p-4 text-[11px] text-muted-foreground font-mono overflow-x-auto border border-border shadow-inner">
                {jsonString}
              </pre>
            </div>
          </div>

          {/* Cột phải: Response Pane */}
          <div className="w-[50%] p-6 bg-muted/50 overflow-y-auto flex flex-col gap-5">
            <div className="flex items-center gap-1.5 border-b border-border pb-2">
              <FileJson className="h-4 w-4 text-success" />
              <h3 className="text-xs font-bold uppercase tracking-wider text-foreground">{t('apiTestModal.responseSection')}</h3>
            </div>

            {!response && !isLoading && (
              <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground text-xs py-20 select-none">
                <Send className="h-10 w-10 mb-2 opacity-35 animate-bounce" />
                <p>{t('apiTestModal.emptyResponseHint')}</p>
              </div>
            )}

            {isLoading && (
              <div className="flex-1 flex flex-col items-center justify-center text-foreground text-xs py-20 select-none">
                <div className="animate-spin rounded-full h-8 w-8 border-2 border-info border-t-transparent mb-3" />
                <p className="font-semibold">{t('apiTestModal.contactingServer')}</p>
              </div>
            )}

            {response && !isLoading && (
              <div className="flex flex-col gap-4">
                {/* Status Bar */}
                <div className="flex items-center justify-between border border-border bg-card rounded-xl p-3 shadow-sm select-none">
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] font-semibold text-muted-foreground">Status:</span>
                    <span className={`rounded px-2 py-0.5 text-xs font-extrabold ${
                      response.ok ? 'bg-success/15 text-success' : 'bg-destructive/15 text-destructive'
                    }`}>
                      {response.status} {response.statusText}
                    </span>
                  </div>
                </div>

                {/* Response Headers */}
                {response.headers && Object.keys(response.headers).length > 0 && (
                  <div className="flex flex-col gap-1.5">
                    <span className="text-[11px] font-bold uppercase text-muted-foreground select-none">{t('apiTestModal.responseHeaders')}</span>
                    <div className="rounded-xl border border-border bg-card p-3 font-mono text-[10px] text-foreground flex flex-col gap-1 shadow-sm max-h-32 overflow-y-auto">
                      {Object.entries(response.headers).map(([key, val]) => (
                        <div key={key} className="flex justify-between border-b border-border py-0.5">
                          <span className="font-bold text-muted-foreground">{key}</span>
                          <span className="text-foreground truncate max-w-xs">{String(val)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Response Body */}
                <div className="flex flex-col gap-1.5">
                  <span className="text-[11px] font-bold uppercase text-muted-foreground select-none">{t('apiTestModal.responseBody')}</span>
                  <pre className="rounded-xl bg-foreground p-4 text-[11px] text-muted-foreground font-mono overflow-x-auto border border-border shadow-inner max-h-80">
                    {typeof response.body === 'object'
                      ? JSON.stringify(response.body, null, 2)
                      : String(response.body || t('apiTestModal.noResponseBody'))}
                  </pre>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Footer actions */}
        <div className="border-t border-border bg-muted px-6 py-4 flex items-center justify-between select-none">
          <div className="text-[10px] text-muted-foreground font-medium">
            {t('apiTestModal.corsNote')}
          </div>
          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="rounded-xl border border-border bg-card px-4 py-2 text-xs font-bold text-foreground hover:bg-muted cursor-pointer active:scale-95 transition-transform"
            >
              {t('apiTestModal.cancel')}
            </button>
            <button
              onClick={handleSend}
              disabled={isLoading || !url}
              className="flex items-center gap-1.5 rounded-xl bg-info px-5 py-2 text-xs font-bold text-info-foreground hover:bg-info/90 active:scale-95 transition-transform disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
            >
              <Send className="h-3.5 w-3.5" />
              {t('apiTestModal.sendRequest')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
