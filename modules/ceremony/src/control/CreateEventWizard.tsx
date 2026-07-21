// CreateEventWizard — Giai đoạn 4a+4b+4c kế hoạch Event (docs/roadmap/plans/layout-designer/
// 17-prompt-claude-design-control.md §"Màn 2/3/4", 22-import-modal.md). Thay modal đơn giản cũ
// trong EventGate.tsx (chỉ tên+ngày) — wizard 3 bước ĐỘNG (Bước 2 CHỈ hiện nếu chọn "Tạo nguồn
// dữ liệu mới" ở Bước 1, bỏ qua thẳng nếu chọn nguồn có sẵn/để sau; Bước 3 luôn tới được từ MỌI
// nhánh Bước 1 — layout là optional nhưng luôn cho phép cấu hình nếu muốn, GĐ4b).
//
// CHẾ ĐỘ SỬA (Giai đoạn 4c mở rộng, 2026-07-20) — truyền `initialEvent` để mở wizard ở chế độ
// sửa: nhảy THẲNG vào Bước 3 (layoutRefs/fieldMap), KHÔNG cho sửa lại Bước 1/2 (tên/dataSource) —
// đúng phạm vi đã chốt "chỉ cần sửa được layoutRefs/customVariables sau khi tạo", không phải
// "sửa toàn bộ Event như tạo lại từ đầu". `finishWizard` gọi eventPort.save() thay vì create(),
// giữ nguyên id/status/dataSourceId/createdAt của Event gốc.

import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Upload } from 'lucide-react';
import type { AssetPort, DataSourcePort, EventPort, LayoutPort } from '@sky-app/service-contracts';
import type {
  CanonicalGroup,
  CanonicalSubject,
  CustomVariable,
  DataSourceSummary,
  EventDocument,
  EventLayoutRef,
  FieldMappingProfile,
  MappingRule,
} from '@sky-app/slide-shared';
import { applyMapping, detectDuplicateNaturalKeys } from '@sky-app/slide-shared';
import { useEventStore } from './eventStore.js';
import { EventFieldMapEditor } from './EventFieldMapEditor.js';
import { parseSpreadsheet, type ParsedSpreadsheet } from './lib/parseSpreadsheet.js';
import { Modal } from './components/ui/Modal.js';
import { ConfirmModal } from './components/ui/ConfirmModal.js';
import { Button } from './components/ui/Button.js';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './components/ui/select.js';
import { showErrorToast, showSuccessToast } from './lib/toast.js';
import { LayoutRuleTable, type LayoutRuleRow } from './LayoutRuleTable.js';
import { WizardStepIndicator } from './WizardStepIndicator.js';

function newId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID()}`;
}

const CORE_FIELDS = ['full_name', 'image_relative_path', 'status'] as const;

type DataSourceChoice = 'new' | 'existing' | 'later';

interface CreateEventWizardProps {
  open: boolean;
  onClose: () => void;
  eventPort: EventPort;
  dataSourcePort: DataSourcePort | undefined;
  layoutPort: LayoutPort | undefined;
  assetPort: AssetPort | undefined;
  dataSources: DataSourceSummary[];
  onCreated: () => void;
  /** Có giá trị → mở wizard ở CHẾ ĐỘ SỬA (nhảy thẳng Bước 3, không cho sửa Bước 1/2). */
  initialEvent?: EventDocument;
}

/** Tách EventLayoutRef[] (đọc từ Event có sẵn) thành rows (LayoutRuleTable) + defaultRef —
 * đảo ngược đúng phép hợp nhất ở finishWizard. Quy ước: ref có selector=undefined (group rỗng/
 * không có) là dòng "Mặc định" — LayoutRuleTable's DefaultRuleRow luôn set selector: undefined
 * (xem LayoutRuleTable.tsx onPick). Nếu có NHIỀU ref selector=undefined (không nên xảy ra qua
 * UI bình thường), lấy ref CUỐI làm default, phần còn lại rơi vào rows — fail-soft, không throw. */
function splitLayoutRefs(layoutRefs: EventLayoutRef[]): { rows: LayoutRuleRow[]; defaultRef: EventLayoutRef | undefined } {
  const withoutSelector = layoutRefs.filter((r) => !r.selector);
  const defaultRef = withoutSelector[withoutSelector.length - 1];
  const rest = layoutRefs.filter((r) => r !== defaultRef);
  return {
    rows: rest.map((ref) => ({ id: newId('rule'), label: '', ref })),
    defaultRef,
  };
}

export function CreateEventWizard({ open, onClose, eventPort, dataSourcePort, layoutPort, assetPort, dataSources, onCreated, initialEvent }: CreateEventWizardProps) {
  const { t } = useTranslation();
  const { createDataSource, importRecords, listFieldMappingProfiles, saveFieldMappingProfile } = useEventStore();
  const isEditMode = initialEvent != null;

  // Bước 1
  const [step, setStep] = useState<1 | 2 | 3 | 4>(isEditMode ? 3 : 1);
  const [name, setName] = useState(initialEvent?.name ?? '');
  const [scheduledAt, setScheduledAt] = useState(initialEvent?.scheduledAt ?? '');
  // Chế độ Sửa: phản ánh ĐÚNG trạng thái dataSource hiện có của Event (readonly, không đổi được
  // sau khi tạo — xem Step1BasicInfo's readOnlyDataSource) thay vì luôn hard-code 'later'.
  const [dataSourceChoice, setDataSourceChoice] = useState<DataSourceChoice>(initialEvent?.dataSourceId ? 'existing' : 'later');
  const [existingDataSourceId, setExistingDataSourceId] = useState<string>(initialEvent?.dataSourceId ?? '');
  const [submitting, setSubmitting] = useState(false);

  // Bước 2 — import
  const [parsed, setParsed] = useState<ParsedSpreadsheet | null>(null);
  const [fileName, setFileName] = useState('');
  const [dsLabel, setDsLabel] = useState('');
  const [subjectType, setSubjectType] = useState('student');
  const [naturalKeyField, setNaturalKeyField] = useState('');
  const [columnMap, setColumnMap] = useState<Record<string, string>>({}); // column → target ('full_name' | 'image_relative_path' | 'status' | '' | 'extra:<key>')
  const [mode, setMode] = useState<'pooled' | 'consumable'>('consumable');
  const [savedProfiles, setSavedProfiles] = useState<FieldMappingProfile[]>([]);
  const [importing, setImporting] = useState(false);

  // Bước 3 — layout theo điều kiện (GĐ4b)
  const initialSplit = initialEvent ? splitLayoutRefs(initialEvent.layoutRefs) : undefined;
  const [layoutRuleRows, setLayoutRuleRows] = useState<LayoutRuleRow[]>(initialSplit?.rows ?? []);
  const [defaultLayoutRef, setDefaultLayoutRef] = useState<EventLayoutRef | undefined>(initialSplit?.defaultRef);
  const [pendingDataSourceId, setPendingDataSourceId] = useState<string | undefined>(initialEvent?.dataSourceId);
  const [attrSuggestions, setAttrSuggestions] = useState<string[]>([]);

  // Bước 4 — ghép biến (fieldMap), Giai đoạn 4c
  const [customVariables, setCustomVariables] = useState<CustomVariable[]>(initialEvent?.customVariables ?? []);

  // Xác nhận trước khi thoát nếu đã có thay đổi (Esc/nút X — click ra ngoài backdrop đã bị chặn
  // hẳn qua closeOnBackdrop=false, xem <Modal> bên dưới). So JSON snapshot lúc mở với state hiện
  // tại — đơn giản hơn so từng field, đủ chính xác vì mọi field liên quan đều là dữ liệu thuần
  // (string/array/object), không có hàm/Date/class instance nào lẫn vào. Snapshot chụp 1 LẦN lúc
  // mount (mỗi phiên mở modal là 1 component instance mới, xem EventGate.tsx's key={editingEvent.id}
  // cho chế độ Sửa, hoặc unmount/mount lại cho chế độ Tạo) — không phụ thuộc `open` đổi giá trị.
  const dirtyFieldsSnapshot = () => JSON.stringify({ name, scheduledAt, dataSourceChoice, existingDataSourceId, layoutRuleRows, defaultLayoutRef, customVariables });
  const initialSnapshotRef = useRef(dirtyFieldsSnapshot());
  const [confirmDiscardOpen, setConfirmDiscardOpen] = useState(false);

  const resetAll = () => {
    setStep(isEditMode ? 3 : 1);
    setName(initialEvent?.name ?? '');
    setScheduledAt(initialEvent?.scheduledAt ?? '');
    setDataSourceChoice(initialEvent?.dataSourceId ? 'existing' : 'later');
    setExistingDataSourceId(initialEvent?.dataSourceId ?? '');
    setParsed(null);
    setFileName('');
    setDsLabel('');
    setSubjectType('student');
    setNaturalKeyField('');
    setColumnMap({});
    setMode('consumable');
    const split = initialEvent ? splitLayoutRefs(initialEvent.layoutRefs) : undefined;
    setLayoutRuleRows(split?.rows ?? []);
    setDefaultLayoutRef(split?.defaultRef);
    setPendingDataSourceId(initialEvent?.dataSourceId);
    setAttrSuggestions([]);
    setCustomVariables(initialEvent?.customVariables ?? []);
  };

  const handleClose = () => {
    resetAll();
    initialSnapshotRef.current = dirtyFieldsSnapshot();
    onClose();
  };

  /** Đóng qua Esc/nút X — hỏi xác nhận trước nếu đã có thay đổi chưa lưu (phản hồi thật,
   * 2026-07-20). Nút "Huỷ bỏ"/"Lưu"/"Hoàn tất" thành công vẫn gọi thẳng handleClose() (không đi
   * qua đây) — huỷ bỏ đã là hành động xác nhận rõ ràng của người dùng, không cần hỏi 2 lần. */
  const requestClose = () => {
    if (dirtyFieldsSnapshot() !== initialSnapshotRef.current) {
      setConfirmDiscardOpen(true);
      return;
    }
    handleClose();
  };

  const buildProfile = (): FieldMappingProfile => {
    const map: Record<string, MappingRule> = {};
    for (const [column, target] of Object.entries(columnMap)) {
      if (!target) continue;
      const key = target.startsWith('extra:') ? target.slice('extra:'.length) : target;
      if (key) map[key] = { kind: 'from', from: column };
    }
    return { id: newId('profile'), label: dsLabel || fileName, subjectType, naturalKeyField, map };
  };

  // KHÔNG phụ thuộc naturalKeyField — preview mapping phải xem được NGAY khi chọn xong cột, để
  // người dùng tự quyết định cột nào phù hợp làm khoá tự nhiên (bug UX thật phát hiện qua test:
  // bản đầu chặn preview cho tới khi chọn khoá, sai thứ tự thao tác tự nhiên của người dùng).
  const mappedRows = useMemo(() => {
    if (!parsed) return [];
    const profile = buildProfile();
    return parsed.rows.map((row) => ({ raw: row, canonical: applyMapping(row, profile) }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [parsed, columnMap, subjectType]);

  const duplicateGroups = useMemo(() => {
    if (!parsed || !naturalKeyField) return [];
    return detectDuplicateNaturalKeys(parsed.rows, naturalKeyField);
  }, [parsed, naturalKeyField]);

  const duplicateCount = duplicateGroups.reduce((sum, group) => sum + group.length, 0);
  const canImport = parsed != null && naturalKeyField !== '' && dsLabel.trim() !== '' && duplicateCount === 0;

  const handleStep1Next = async () => {
    if (dataSourceChoice === 'new') {
      if (dataSourcePort) {
        const profiles = await listFieldMappingProfiles(dataSourcePort);
        setSavedProfiles(profiles);
      }
      setStep(2);
      return;
    }
    const dataSourceId = dataSourceChoice === 'existing' ? existingDataSourceId : undefined;
    await loadAttrSuggestionsFor(dataSourceId);
    setPendingDataSourceId(dataSourceId);
    setStep(3);
  };

  /** Gợi ý field cho RuleBuilder's dropdown "attr" — suy từ FieldMappingProfile.map của
   * DataSource đã chọn (nếu có gắn mappingProfileId). Không có gì để suy → mảng rỗng, RuleBuilder
   * tự cho gõ tự do (đã chốt qua AskUserQuestion 2026-07-19, không chặn cấu hình). */
  const loadAttrSuggestionsFor = async (dataSourceId: string | undefined) => {
    if (!dataSourceId || !dataSourcePort) {
      setAttrSuggestions([]);
      return;
    }
    try {
      const ds = await dataSourcePort.get(dataSourceId);
      if (!ds?.mappingProfileId) {
        setAttrSuggestions([]);
        return;
      }
      const profiles = await listFieldMappingProfiles(dataSourcePort);
      const profile = profiles.find((p) => p.id === ds.mappingProfileId);
      setAttrSuggestions(profile ? Object.keys(profile.map) : []);
    } catch {
      setAttrSuggestions([]);
    }
  };

  // Chế độ SỬA mở thẳng Bước 3 — handleStep1Next (nơi gọi loadAttrSuggestionsFor bình thường)
  // không chạy, nên tự load ở đây khi modal mở.
  useEffect(() => {
    if (open && isEditMode) void loadAttrSuggestionsFor(initialEvent?.dataSourceId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, isEditMode]);

  const finishWizard = async (dataSourceId: string | undefined) => {
    if (!name.trim()) return;
    setSubmitting(true);
    try {
      const layoutRefs: EventLayoutRef[] = [...layoutRuleRows.map((r) => r.ref), ...(defaultLayoutRef ? [defaultLayoutRef] : [])];
      if (isEditMode && initialEvent) {
        // Chế độ SỬA — giữ nguyên id/status/createdAt/dataSourceId của Event gốc, cập nhật
        // name/scheduledAt/layoutRefs/customVariables (Bước 4, Giai đoạn 4c).
        const updated: EventDocument = {
          ...initialEvent,
          name: name.trim(),
          scheduledAt: scheduledAt || undefined,
          layoutRefs,
          customVariables,
          updatedAt: new Date().toISOString(),
        };
        await eventPort.save(updated);
        showSuccessToast(t('eventGate.updateSuccess', { name: updated.name }));
        handleClose();
        onCreated();
        return;
      }
      const doc: Omit<EventDocument, 'createdAt' | 'updatedAt'> = {
        id: newId('event'),
        name: name.trim(),
        status: 'draft',
        scheduledAt: scheduledAt || undefined,
        dataSourceId,
        customVariables,
        layoutRefs,
      };
      await eventPort.create(doc);
      showSuccessToast(t('eventGate.createSuccess', { name: doc.name }));
      handleClose();
      onCreated();
    } catch (err) {
      showErrorToast(t('eventGate.createError', { message: err instanceof Error ? err.message : String(err) }));
    } finally {
      setSubmitting(false);
    }
  };

  const handleFileSelected = async (file: File) => {
    const buffer = await file.arrayBuffer();
    const result = parseSpreadsheet(buffer);
    setParsed(result);
    setFileName(file.name);
    setDsLabel((prev) => prev || file.name.replace(/\.(xlsx|xls|csv)$/i, ''));
    setColumnMap({});
    setNaturalKeyField('');
  };

  const applySavedProfile = (profile: FieldMappingProfile) => {
    setDsLabel(profile.label);
    setSubjectType(profile.subjectType);
    setNaturalKeyField(profile.naturalKeyField);
    const nextMap: Record<string, string> = {};
    for (const [key, rule] of Object.entries(profile.map)) {
      if (rule.kind === 'from') {
        nextMap[rule.from] = (CORE_FIELDS as readonly string[]).includes(key) ? key : `extra:${key}`;
      }
    }
    setColumnMap(nextMap);
  };

  const handleImport = async () => {
    if (!dataSourcePort || !parsed || !naturalKeyField) return;
    setImporting(true);
    try {
      const profile = buildProfile();
      await saveFieldMappingProfile(dataSourcePort, profile);

      const dsId = newId('ds');
      await createDataSource(dataSourcePort, { id: dsId, label: dsLabel.trim(), mode, naturalKeyField, mappingProfileId: profile.id });

      // record.id = giá trị khoá tự nhiên GỐC (lấy trực tiếp từ raw row, chưa qua transform) —
      // đúng thiết kế "record.id sinh ổn định từ giá trị trường khoá tự nhiên" (22-import-modal.md
      // §2) — KHÔNG dùng giá trị đã áp MappingRule (có thể qua concat/computed, không ổn định
      // bằng cột gốc). Dòng thiếu giá trị khoá (rỗng) bị BỎ QUA — đã được chặn từ trước bởi
      // duplicateGroups/canImport (chỉ tính rỗng là "không trùng", không phải "hợp lệ để import"),
      // nhưng lọc lại 1 lần nữa ở đây cho chắc chắn (fail-soft, không throw giữa batch).
      const records: Array<CanonicalSubject | CanonicalGroup> = mappedRows
        .filter((r) => r.raw[naturalKeyField])
        .map((r, index) => ({ ...r.canonical, id: r.raw[naturalKeyField]!, displayOrder: index }));

      const result = await importRecords(dataSourcePort, dsId, records);
      showSuccessToast(t('createEventWizard.importSuccess', { count: result.imported, label: dsLabel.trim() }));

      // GĐ4b: Bước 3 (layout theo điều kiện) LUÔN theo sau import, thay vì tạo Event ngay —
      // profile vừa lưu cung cấp attrSuggestions cho RuleBuilder ngay lập tức, không cần gọi lại
      // DataSourcePort.get() (đã biết mappingProfileId = profile.id vừa tạo ở trên).
      setAttrSuggestions(Object.keys(profile.map));
      setPendingDataSourceId(dsId);
      setStep(3);
    } catch (err) {
      showErrorToast(t('createEventWizard.importError', { message: err instanceof Error ? err.message : String(err) }));
    } finally {
      setImporting(false);
    }
  };

  // Số bước hiệu quả cho title — nhánh "new" đi 1→2→3→4 (4 bước); nhánh existing/later bỏ qua
  // Bước 2, đi thẳng 1→3→4 nhưng vẫn hiện "Bước 2/3" cho step 3 (đúng thứ tự đã đi qua, không
  // đếm bước bị bỏ qua).
  const totalSteps = dataSourceChoice === 'new' ? 4 : 3;
  const step3Ordinal = dataSourceChoice === 'new' ? 3 : 2;

  // Thanh tiến trình trực quan (WizardStepIndicator, 2026-07-20) — phát hiện qua phản hồi thật:
  // chỉ có text "Bước X/Y" trong title KHÔNG đủ để thấy TOÀN CẢNH các bước còn lại (Layout/Ghép
  // biến), user tưởng nhầm chúng biến mất. Nhãn ngắn theo đúng thứ tự hiệu quả (bỏ qua Bước 2 nếu
  // không chọn "new"). Chế độ Sửa CŨNG hiện thanh này (đồng nhất trải nghiệm với lúc Tạo, phản hồi
  // thật 2026-07-20) — không cần tuyến tính tuyệt đối, nút "Xem thông tin cơ bản"/"Xem cấu hình
  // layout" đã cho phép nhảy qua lại giữa các bước đã đi qua.
  const stepLabels = dataSourceChoice === 'new'
    ? [t('createEventWizard.stepLabelBasicInfo'), t('createEventWizard.stepLabelImport'), t('createEventWizard.stepLabelLayout'), t('createEventWizard.stepLabelFieldMap')]
    : [t('createEventWizard.stepLabelBasicInfo'), t('createEventWizard.stepLabelLayout'), t('createEventWizard.stepLabelFieldMap')];
  const stepOrdinal = step === 1 ? 1 : step === 2 ? 2 : step3Ordinal + (step === 4 ? 1 : 0);

  // Popup xác nhận huỷ thay đổi (Esc/nút X, xem requestClose ở trên) — dùng chung ở cả 4 nhánh
  // return theo step, đặt cạnh <Modal> chính trong 1 Fragment vì đây là 4 early-return riêng
  // biệt (không có 1 JSX gốc chung để chèn 1 lần duy nhất).
  const discardConfirmModal = (
    <ConfirmModal
      open={confirmDiscardOpen}
      title={t('createEventWizard.discardConfirmTitle')}
      message={t('createEventWizard.discardConfirmMessage')}
      danger={false}
      confirmLabel={t('createEventWizard.discardConfirmButton') as string}
      onCancel={() => setConfirmDiscardOpen(false)}
      onConfirm={() => {
        setConfirmDiscardOpen(false);
        handleClose();
      }}
    />
  );

  if (step === 1) {
    return (
      <>
        <Modal open={open} onClose={requestClose} title={isEditMode ? t('createEventWizard.editTitle', { name }) : t('createEventWizard.step1Title')} size="md" closeOnBackdrop={false}>
          <WizardStepIndicator labels={stepLabels} currentOrdinal={stepOrdinal} />
          <Step1BasicInfo
            name={name}
            setName={setName}
            scheduledAt={scheduledAt}
            setScheduledAt={setScheduledAt}
            dataSourceChoice={dataSourceChoice}
            setDataSourceChoice={setDataSourceChoice}
            existingDataSourceId={existingDataSourceId}
            setExistingDataSourceId={setExistingDataSourceId}
            dataSources={dataSources}
            submitting={submitting}
            onCancel={handleClose}
            onNext={handleStep1Next}
            isEditMode={isEditMode}
          />
        </Modal>
        {discardConfirmModal}
      </>
    );
  }

  if (step === 2) {
    return (
      <>
      <Modal open={open} onClose={requestClose} title={t('createEventWizard.step2Title')} size="xl" closeOnBackdrop={false}>
        <WizardStepIndicator labels={stepLabels} currentOrdinal={stepOrdinal} />
        <Step2ImportData
          fileName={fileName}
          parsed={parsed}
          onFileSelected={handleFileSelected}
          dsLabel={dsLabel}
          setDsLabel={setDsLabel}
          subjectType={subjectType}
          setSubjectType={setSubjectType}
          naturalKeyField={naturalKeyField}
          setNaturalKeyField={setNaturalKeyField}
          columnMap={columnMap}
          setColumnMap={setColumnMap}
          mode={mode}
          setMode={setMode}
          savedProfiles={savedProfiles}
          applySavedProfile={applySavedProfile}
          mappedRows={mappedRows}
          duplicateGroups={duplicateGroups}
          canImport={canImport}
          importing={importing}
          onBack={() => setStep(1)}
          onImport={handleImport}
        />
      </Modal>
      {discardConfirmModal}
      </>
    );
  }

  if (step === 3) {
    return (
      <>
      <Modal
        open={open}
        onClose={requestClose}
        title={isEditMode ? t('createEventWizard.editTitle', { name }) : t('createEventWizard.step3Title', { ordinal: step3Ordinal, total: totalSteps })}
        size="xl"
        closeOnBackdrop={false}
      >
        <WizardStepIndicator labels={stepLabels} currentOrdinal={stepOrdinal} />
        {layoutPort ? (
          <div className="flex max-h-[70vh] flex-col gap-3 overflow-auto">
            <LayoutRuleTable
              rows={layoutRuleRows}
              onChange={setLayoutRuleRows}
              defaultRef={defaultLayoutRef}
              onChangeDefaultRef={setDefaultLayoutRef}
              layoutPort={layoutPort}
              assetPort={assetPort}
              attrSuggestions={attrSuggestions}
            />
            <div className="mt-2 flex items-center justify-between gap-2">
              {isEditMode ? (
                <Button variant="secondary-outline" size="sm" onClick={() => setStep(1)}>
                  {t('createEventWizard.viewBasicInfoButton')}
                </Button>
              ) : (
                <span />
              )}
              <div className="flex gap-2">
                {!isEditMode && (
                  <Button variant="secondary" onClick={() => setStep(dataSourceChoice === 'new' ? 2 : 1)}>
                    {t('createEventWizard.backButton')}
                  </Button>
                )}
                <Button variant="primary" onClick={() => setStep(4)}>
                  {t('createEventWizard.nextButton')}
                </Button>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <div className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
              {t('createEventWizard.layoutPortUnavailable')}
            </div>
            <div className="mt-2 flex items-center justify-between gap-2">
              {isEditMode ? (
                <Button variant="secondary-outline" size="sm" onClick={() => setStep(1)}>
                  {t('createEventWizard.viewBasicInfoButton')}
                </Button>
              ) : (
                <span />
              )}
              <div className="flex gap-2">
                {!isEditMode && (
                  <Button variant="secondary" onClick={() => setStep(dataSourceChoice === 'new' ? 2 : 1)}>
                    {t('createEventWizard.backButton')}
                  </Button>
                )}
                <Button variant="primary" loading={submitting} onClick={() => void finishWizard(pendingDataSourceId)}>
                  {isEditMode ? t('createEventWizard.saveButton') : t('createEventWizard.finishButton')}
                </Button>
              </div>
            </div>
          </div>
        )}
      </Modal>
      {discardConfirmModal}
      </>
    );
  }

  // Bước 4 — Ghép biến (fieldMap), Giai đoạn 4c. Chỉ tới được đây khi layoutPort tồn tại (nhánh
  // layoutPort undefined ở Bước 3 đã finishWizard thẳng, không có cách trích token).
  return (
    <>
    <Modal
      open={open}
      onClose={requestClose}
      title={isEditMode ? t('createEventWizard.editTitle', { name }) : t('createEventWizard.step4Title', { total: totalSteps })}
      size="xl"
      closeOnBackdrop={false}
    >
      <div className="flex max-h-[70vh] flex-col gap-3 overflow-auto">
        <WizardStepIndicator labels={stepLabels} currentOrdinal={stepOrdinal} />
        {layoutPort && (
          <EventFieldMapEditor
            rows={layoutRuleRows}
            onChangeRows={setLayoutRuleRows}
            defaultRef={defaultLayoutRef}
            onChangeDefaultRef={setDefaultLayoutRef}
            layoutPort={layoutPort}
            attrSuggestions={attrSuggestions}
            customVariables={customVariables}
            onChangeCustomVariables={setCustomVariables}
          />
        )}
        <div className="mt-2 flex items-center justify-between gap-2">
          {isEditMode ? (
            <Button variant="secondary-outline" size="sm" onClick={() => setStep(1)}>
              {t('createEventWizard.viewBasicInfoButton')}
            </Button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => setStep(3)}>
              {t('createEventWizard.backButton')}
            </Button>
            <Button variant="primary" loading={submitting} onClick={() => void finishWizard(pendingDataSourceId)}>
              {isEditMode ? t('createEventWizard.saveButton') : t('createEventWizard.finishButton')}
            </Button>
          </div>
        </div>
      </div>
    </Modal>
    {discardConfirmModal}
    </>
  );
}

interface Step1Props {
  name: string;
  setName: (v: string) => void;
  scheduledAt: string;
  setScheduledAt: (v: string) => void;
  dataSourceChoice: DataSourceChoice;
  setDataSourceChoice: (v: DataSourceChoice) => void;
  existingDataSourceId: string;
  setExistingDataSourceId: (v: string) => void;
  dataSources: DataSourceSummary[];
  submitting: boolean;
  onCancel: () => void;
  onNext: () => void;
  /** Chế độ Sửa — ẨN phần chọn nguồn dữ liệu (radio new/existing/later), chỉ hiện READONLY tên
   * DataSource hiện tại (không đổi được sau khi Event đã tạo, ngoài phạm vi đã chốt Giai đoạn
   * 4c). Nút cuối đổi nhãn "Xem cấu hình layout/biến" thay vì "Tiếp tục", quay lại Bước 3 (đã
   * cấu hình sẵn) thay vì đi Bước 2. */
  isEditMode?: boolean;
}

function Step1BasicInfo({
  name,
  setName,
  scheduledAt,
  setScheduledAt,
  dataSourceChoice,
  setDataSourceChoice,
  existingDataSourceId,
  setExistingDataSourceId,
  dataSources,
  submitting,
  onCancel,
  onNext,
  isEditMode = false,
}: Step1Props) {
  const { t } = useTranslation();
  const canNext = name.trim() !== '' && (dataSourceChoice !== 'existing' || existingDataSourceId !== '');
  const currentDataSourceLabel = dataSources.find((ds) => ds.id === existingDataSourceId)?.label;

  return (
    <div className="flex flex-col gap-4">
      <label className="flex flex-col gap-1 text-sm">
        <span className="text-muted-foreground">{t('createEventWizard.nameLabel')}</span>
        <input
          className="rounded-md border border-input bg-background px-3 py-1.5 text-sm"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={t('createEventWizard.namePlaceholder') as string}
          autoFocus
        />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        <span className="text-muted-foreground">{t('createEventWizard.scheduledAtLabel')}</span>
        <input
          type="date"
          className="rounded-md border border-input bg-background px-3 py-1.5 text-sm"
          value={scheduledAt}
          onChange={(e) => setScheduledAt(e.target.value)}
        />
        <span className="text-xs text-muted-foreground">{t('createEventWizard.scheduledAtHint')}</span>
      </label>

      {isEditMode ? (
        <div className="flex flex-col gap-1">
          <span className="text-sm text-muted-foreground">{t('createEventWizard.dataSourceLabel')}</span>
          <div className="rounded-md border border-border bg-muted/30 px-3 py-2 text-sm text-foreground">
            {dataSourceChoice === 'existing' ? (currentDataSourceLabel ?? existingDataSourceId) : t('createEventWizard.dataSourceOptionLater')}
          </div>
          <span className="text-xs text-muted-foreground">{t('createEventWizard.dataSourceReadOnlyHint')}</span>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          <span className="text-sm text-muted-foreground">{t('createEventWizard.dataSourceLabel')}</span>
          {(['new', 'existing', 'later'] as const).map((choice) => (
            <label key={choice} className="flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm">
              <input type="radio" name="dataSourceChoice" checked={dataSourceChoice === choice} onChange={() => setDataSourceChoice(choice)} />
              {t(`createEventWizard.dataSourceOption${choice === 'new' ? 'New' : choice === 'existing' ? 'Existing' : 'Later'}`)}
            </label>
          ))}
          {dataSourceChoice === 'existing' && (
            <Select value={existingDataSourceId} onValueChange={setExistingDataSourceId}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder={t('createEventWizard.existingDataSourcePlaceholder') as string} />
              </SelectTrigger>
              <SelectContent>
                {dataSources.map((ds) => (
                  <SelectItem key={ds.id} value={ds.id}>
                    {ds.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
      )}

      <div className="mt-2 flex justify-end gap-2">
        <Button variant="secondary" onClick={onCancel}>
          {t('common.cancel')}
        </Button>
        <Button variant="primary" disabled={!canNext} loading={submitting} onClick={onNext}>
          {isEditMode ? t('createEventWizard.viewLayoutConfigButton') : t('createEventWizard.nextButton')}
        </Button>
      </div>
    </div>
  );
}

interface Step2Props {
  fileName: string;
  parsed: ParsedSpreadsheet | null;
  onFileSelected: (file: File) => void;
  dsLabel: string;
  setDsLabel: (v: string) => void;
  subjectType: string;
  setSubjectType: (v: string) => void;
  naturalKeyField: string;
  setNaturalKeyField: (v: string) => void;
  columnMap: Record<string, string>;
  setColumnMap: (v: Record<string, string>) => void;
  mode: 'pooled' | 'consumable';
  setMode: (v: 'pooled' | 'consumable') => void;
  savedProfiles: FieldMappingProfile[];
  applySavedProfile: (profile: FieldMappingProfile) => void;
  mappedRows: Array<{ raw: Record<string, string>; canonical: Omit<CanonicalSubject, 'id' | 'displayOrder'> }>;
  duplicateGroups: number[][];
  canImport: boolean;
  importing: boolean;
  onBack: () => void;
  onImport: () => void;
}

function Step2ImportData({
  fileName,
  parsed,
  onFileSelected,
  dsLabel,
  setDsLabel,
  subjectType,
  setSubjectType,
  naturalKeyField,
  setNaturalKeyField,
  columnMap,
  setColumnMap,
  mode,
  setMode,
  savedProfiles,
  applySavedProfile,
  mappedRows,
  duplicateGroups,
  canImport,
  importing,
  onBack,
  onImport,
}: Step2Props) {
  const { t } = useTranslation();
  const duplicateIndexes = new Set(duplicateGroups.flat());
  const duplicateCount = duplicateIndexes.size;

  if (!parsed) {
    return (
      <div className="flex flex-col gap-4">
        <label className="flex h-48 cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-border text-center text-sm text-muted-foreground hover:border-primary/50">
          <Upload size={28} />
          {t('createEventWizard.uploadPrompt')}
          <input
            type="file"
            accept=".csv,.xlsx,.xls"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) onFileSelected(file);
            }}
          />
        </label>
        <div className="flex justify-end">
          <Button variant="secondary" onClick={onBack}>
            {t('createEventWizard.backButton')}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex max-h-[70vh] flex-col gap-4 overflow-auto">
      <div className="flex items-center justify-between rounded-md border border-border bg-card px-3 py-2 text-sm">
        <span>{t('createEventWizard.uploadedFileLabel', { filename: fileName, rowCount: parsed.rows.length })}</span>
        <label className="cursor-pointer text-xs text-primary underline">
          {t('createEventWizard.changeFileButton')}
          <input
            type="file"
            accept=".csv,.xlsx,.xls"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) onFileSelected(file);
            }}
          />
        </label>
      </div>

      {savedProfiles.length > 0 && (
        <Select onValueChange={(id) => { const p = savedProfiles.find((sp) => sp.id === id); if (p) applySavedProfile(p); }}>
          <SelectTrigger className="w-full">
            <SelectValue placeholder={t('createEventWizard.mappingProfileExistingPlaceholder') as string} />
          </SelectTrigger>
          <SelectContent>
            {savedProfiles.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      <div className="grid grid-cols-2 gap-3">
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-muted-foreground">{t('createEventWizard.mappingLabelInput')}</span>
          <input
            className="rounded-md border border-input bg-background px-3 py-1.5 text-sm"
            value={dsLabel}
            onChange={(e) => setDsLabel(e.target.value)}
            placeholder={t('createEventWizard.mappingLabelPlaceholder') as string}
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-muted-foreground">{t('createEventWizard.mappingSubjectTypeLabel')}</span>
          <select
            className="rounded-md border border-input bg-background px-3 py-1.5 text-sm"
            value={subjectType}
            onChange={(e) => setSubjectType(e.target.value)}
          >
            <option value="student">{t('createEventWizard.mappingSubjectTypeStudent')}</option>
            <option value="employee">{t('createEventWizard.mappingSubjectTypeEmployee')}</option>
            <option value="other">{t('createEventWizard.mappingSubjectTypeOther')}</option>
          </select>
        </label>
      </div>

      <label className="flex flex-col gap-1 text-sm">
        <span className="text-muted-foreground">{t('createEventWizard.mappingNaturalKeyLabel')}</span>
        <select
          className="rounded-md border border-input bg-background px-3 py-1.5 text-sm"
          value={naturalKeyField}
          onChange={(e) => setNaturalKeyField(e.target.value)}
        >
          <option value="">{t('createEventWizard.existingDataSourcePlaceholder')}</option>
          {parsed.columns.map((col) => (
            <option key={col} value={col}>
              {col}
            </option>
          ))}
        </select>
      </label>

      <div className="rounded-md border border-border">
        <table className="w-full text-xs">
          <thead className="bg-card">
            <tr>
              <th className="px-2 py-1.5 text-left font-medium">{t('createEventWizard.mappingColumnHeader')}</th>
              <th className="px-2 py-1.5 text-left font-medium">{t('createEventWizard.mappingFieldHeader')}</th>
            </tr>
          </thead>
          <tbody>
            {parsed.columns.map((col) => (
              <tr key={col} className="border-t border-border">
                <td className="px-2 py-1.5">{col}</td>
                <td className="px-2 py-1.5">
                  <select
                    className="w-full rounded-md border border-input bg-background px-2 py-1 text-xs"
                    value={columnMap[col] ?? ''}
                    onChange={(e) => setColumnMap({ ...columnMap, [col]: e.target.value })}
                  >
                    <option value="">{t('createEventWizard.mappingFieldSkip')}</option>
                    <option value="full_name">{t('createEventWizard.mappingFieldFullName')}</option>
                    <option value="image_relative_path">{t('createEventWizard.mappingFieldImage')}</option>
                    <option value="status">{t('createEventWizard.mappingFieldStatus')}</option>
                    <option value={`extra:${col}`}>{t('createEventWizard.mappingFieldCustom')}</option>
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex flex-col gap-1">
        <span className="text-sm text-muted-foreground">{t('createEventWizard.previewTitle')}</span>
        <div className="max-h-48 overflow-auto rounded-md border border-border">
          <table className="w-full text-xs">
            <thead className="bg-card">
              <tr>
                <th className="px-2 py-1.5 text-left font-medium">{t('createEventWizard.mappingFieldFullName')}</th>
                <th className="px-2 py-1.5 text-left font-medium"> </th>
              </tr>
            </thead>
            <tbody>
              {mappedRows.map((r, i) => (
                <tr key={i} className={`border-t border-border ${duplicateIndexes.has(i) ? 'bg-destructive/10' : ''}`}>
                  <td className="px-2 py-1.5">{r.canonical.full_name}</td>
                  <td className="px-2 py-1.5">
                    {r.canonical.full_name ? t('createEventWizard.previewOk') : t('createEventWizard.previewMissing')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {duplicateCount > 0 && <div className="text-xs text-destructive">{t('createEventWizard.duplicateWarning', { count: duplicateCount })}</div>}
      </div>

      <div className="flex flex-col gap-2">
        <span className="text-sm text-muted-foreground">{t('createEventWizard.usageModeLabel')}</span>
        <label className="flex items-start gap-2 rounded-md border border-border px-3 py-2 text-sm">
          <input type="radio" className="mt-1" name="usageMode" checked={mode === 'pooled'} onChange={() => setMode('pooled')} />
          <div>
            <div className="font-medium">{t('createEventWizard.usageModePooledTitle')}</div>
            <div className="text-xs text-muted-foreground">{t('createEventWizard.usageModePooledDesc')}</div>
          </div>
        </label>
        <label className="flex items-start gap-2 rounded-md border border-border px-3 py-2 text-sm">
          <input type="radio" className="mt-1" name="usageMode" checked={mode === 'consumable'} onChange={() => setMode('consumable')} />
          <div>
            <div className="font-medium">{t('createEventWizard.usageModeConsumableTitle')}</div>
            <div className="text-xs text-muted-foreground">{t('createEventWizard.usageModeConsumableDesc')}</div>
          </div>
        </label>
      </div>

      <div className="mt-2 flex justify-end gap-2">
        <Button variant="secondary" onClick={onBack}>
          {t('createEventWizard.backButton')}
        </Button>
        <Button variant="primary" disabled={!canImport} loading={importing} onClick={onImport}>
          {t('createEventWizard.importButton')}
        </Button>
      </div>
    </div>
  );
}
