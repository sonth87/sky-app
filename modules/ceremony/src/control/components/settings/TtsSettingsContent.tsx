import { useState, useEffect, useRef, useMemo } from 'react';
import { useControlStore } from '../../store';
import { useSocketRef } from '../../SocketContext';
import { useVoiceCatalog } from '../VoicePickerPopover';
import { VoiceCloneModal } from '../VoiceCloneModal';
import { type Student, type TtsCondition } from '@sky-app/slide-shared';
import { ConfigColumn } from '../TtsModal/ConfigColumn';
import { PregenColumn } from '../TtsModal/PregenColumn';
import { useSlide } from '../../lib/slide';

function getVoiceForStudentLocal(
  student: Student,
  conditions: TtsCondition[],
  fallbackVoice: string
): string {
  for (const cond of conditions) {
    let studentVal = '';
    const attr = cond.attr;
    if (attr === 'Giới tính') {
      studentVal = student.gender || '';
    } else if (attr === 'Xếp loại') {
      studentVal = student.classification || '';
    } else if (attr === 'Ngành') {
      studentVal = student.major_name || '';
    } else if (attr === 'Khoa') {
      studentVal = student.faculty_name || '';
    } else if (attr === 'Lớp') {
      studentVal = student.class_code || '';
    } else if (attr === 'Khóa') {
      studentVal = student.course_code || '';
    } else if (attr === 'Họ tên') {
      studentVal = student.full_name || '';
    }

    if (studentVal.trim().toLowerCase() === cond.val.trim().toLowerCase()) {
      return cond.voice;
    }
  }
  return fallbackVoice;
}

/** Nội dung cấu hình TTS + pre-generation — nhúng làm 1 tab trong SettingsModal. */
export function TtsSettingsContent() {
  const VOICE_CATALOG = useVoiceCatalog();
  const slide = useSlide('pregen');
  const socket = useSocketRef();
  const ttsModel = useControlStore((s) => s.ttsModel);
  const ttsSpeed = useControlStore((s) => s.ttsSpeed);
  const ttsDelay = useControlStore((s) => s.ttsDelay);
  const ttsTemplate = useControlStore((s) => s.ttsTemplate);
  const ttsPlayMode = useControlStore((s) => s.ttsPlayMode);
  const ttsConditions = useControlStore((s) => s.ttsConditions || []);
  const customVariables = useControlStore((s) => s.customVariables || []);
  const openSettingsModal = useControlStore((s) => s.openSettingsModal);
  const ttsVoicePool = useControlStore((s) => s.ttsVoicePool || ['vieneu-NF', 'vieneu-NM1']);
  const pregenStatus = useControlStore((s) => s.pregenStatus);
  const students = useControlStore((s) => s.students);

  const [localModel, setLocalModel] = useState(ttsModel);
  const [localSpeed, setLocalSpeed] = useState(ttsSpeed);
  const [localDelay, setLocalDelay] = useState(ttsDelay);
  const [localTemplate, setLocalTemplate] = useState(ttsTemplate);
  const [localPlayMode, setLocalPlayMode] = useState(ttsPlayMode);
  const [localConditions, setLocalConditions] = useState<TtsCondition[]>(ttsConditions);
  const [localVoicePool, setLocalVoicePool] = useState<string[]>(ttsVoicePool);

  const [pregenRunning, setPregenRunning] = useState(false);
  const [selectedCodes, setSelectedCodes] = useState<Set<string>>(new Set());
  const [showAddVoiceMenu, setShowAddVoiceMenu] = useState(false);
  const [showCloneModal, setShowCloneModal] = useState(false);
  const addVoiceBtnRef = useRef<HTMLButtonElement>(null);

  const progressListenerRef = useRef<(() => void) | null>(null);

  // Đồng bộ từ store khi có thay đổi từ client khác
  useEffect(() => {
    setLocalModel(ttsModel);
    setLocalSpeed(ttsSpeed);
    setLocalDelay(ttsDelay);
    setLocalPlayMode(ttsPlayMode);
    setLocalTemplate(ttsTemplate);
    setLocalConditions(ttsConditions);
    setLocalVoicePool(ttsVoicePool);
  }, [ttsModel, ttsSpeed, ttsDelay, ttsPlayMode, ttsTemplate, ttsConditions, ttsVoicePool]);

  // Subscribe pre-gen progress
  useEffect(() => {
    const unsub = slide?.onPregenProgress((status) => {
      useControlStore.setState({ pregenStatus: status });
    }) ?? (() => {});
    progressListenerRef.current = unsub;
    return () => { unsub(); };
  }, [slide]);

  // Đóng menu thêm giọng khi click ngoài
  useEffect(() => {
    if (!showAddVoiceMenu) return;
    const handler = (e: MouseEvent) => {
      if (addVoiceBtnRef.current && !addVoiceBtnRef.current.contains(e.target as Node)) {
        setShowAddVoiceMenu(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showAddVoiceMenu]);

  // --- Auto-save các trường dạng text / range bằng Debounce ---
  useEffect(() => {
    const timer = setTimeout(() => {
      if (localSpeed !== ttsSpeed) {
        socket.current?.emit('cmd:setTtsSpeed', { speed: localSpeed });
      }
    }, 400);
    return () => clearTimeout(timer);
  }, [localSpeed, ttsSpeed]);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (localDelay !== ttsDelay) {
        socket.current?.emit('cmd:setTtsDelay', { delay: localDelay });
      }
    }, 400);
    return () => clearTimeout(timer);
  }, [localDelay, ttsDelay]);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (localTemplate !== ttsTemplate) {
        socket.current?.emit('cmd:setTtsTemplate', { template: localTemplate });
      }
    }, 400);
    return () => clearTimeout(timer);
  }, [localTemplate, ttsTemplate]);


  const previewStudent = students[0] ?? null;

  // --- Handlers lưu ngay lập tức ---
  const saveConditions = (conds: TtsCondition[]) => {
    socket.current?.emit('cmd:setTtsConditions', { conditions: conds });
  };

  const saveVoicePool = (pool: string[]) => {
    socket.current?.emit('cmd:setTtsVoicePool', { voicePool: pool });
  };

  const handleStartPregen = async (regenerate = false) => {
    if (!slide) return;
    setPregenRunning(true);
    try {
      const result = await slide.pregenStart({
        regenerate,
        config: {
          template: localTemplate,
          ttsModel: localModel,
          ttsSpeed: localSpeed,
          ttsConditions: localConditions,
        },
      });
      if (!result.ok) {
        alert(result.error ?? 'Không thể bắt đầu pre-generate');
      }
    } catch (err) {
      // GĐ7.5 BUG-006: IPC call có thể reject (crash Python engine, timeout, lỗi bất kỳ) —
      // không có try/catch trước đây khiến pregenRunning kẹt ở true vĩnh viễn, nút "Tạo
      // giọng đọc" bị disable tới khi reload toàn bộ Control app.
      console.error('[TtsSettingsContent] pregenStart lỗi:', err);
      alert('Không thể bắt đầu pre-generate (lỗi kết nối)');
    } finally {
      setPregenRunning(false);
    }
  };

  const handleCancelPregen = () => slide?.pregenCancel();

  const handleRequeueSelected = async () => {
    if (!slide) return;
    for (const code of selectedCodes) {
      await slide.pregenRequeue(code);
    }
    setSelectedCodes(new Set());
  };

  // --- Logic quản lý Nhóm Giọng (Voice Pool) ---
  const remainingVoices = VOICE_CATALOG.filter(v => !localVoicePool.includes(v.id));

  const handleAddVoiceToPool = (voiceId: string) => {
    const updated = [...localVoicePool, voiceId];
    setLocalVoicePool(updated);
    saveVoicePool(updated);
    setShowAddVoiceMenu(false);
  };

  const handleRemoveVoiceFromPool = (voiceId: string) => {
    if (localVoicePool.length <= 1) return; // Luôn phải giữ ít nhất 1 giọng
    const updated = localVoicePool.filter(id => id !== voiceId);
    setLocalVoicePool(updated);
    saveVoicePool(updated);

    // Nếu giọng bị xóa trùng với model mặc định, chọn giọng đầu tiên làm thay thế
    let nextModel = localModel;
    if (localModel === voiceId) {
      nextModel = updated[0];
      setLocalModel(nextModel);
      socket.current?.emit('cmd:setTtsModel', { model: nextModel });
    }

    // Cập nhật các điều kiện đang dùng giọng bị xóa
    const updatedConditions = localConditions.map(c => {
      if (c.voice === voiceId) {
        return { ...c, voice: updated[0] };
      }
      return c;
    });
    setLocalConditions(updatedConditions);
    saveConditions(updatedConditions);
  };

  // --- Logic quản lý Điều kiện phân giọng ---
  const getUniqueValuesForAttr = (attr: string): string[] => {
    if (attr === 'Giới tính') return ['Nam', 'Nữ'];
    if (attr === 'Họ tên') return [];

    const fieldMap: Record<string, keyof Student> = {
      'Xếp loại': 'classification',
      'Ngành': 'major_name',
      'Khoa': 'faculty_name',
      'Lớp': 'class_code',
      'Khóa': 'course_code',
    };
    const field = fieldMap[attr];
    if (!field) return [];

    const vals = students
      .map(s => String(s[field] || '').trim())
      .filter(Boolean);
    return Array.from(new Set(vals)).sort();
  };

  const handleAddCondition = () => {
    const nextId = String(Date.now());
    const newCond: TtsCondition = {
      id: nextId,
      attr: 'Giới tính',
      val: 'Nữ',
      voice: localVoicePool[0] || 'vieneu-NF',
    };
    const updated = [...localConditions, newCond];
    setLocalConditions(updated);
    saveConditions(updated);
  };

  const handleRemoveCondition = (id: string | number) => {
    const updated = localConditions.filter(c => c.id !== id);
    setLocalConditions(updated);
    saveConditions(updated);
  };

  const handleUpdateCondition = (id: string | number, patch: Partial<TtsCondition>) => {
    const updated = localConditions.map(c => {
      if (c.id === id) {
        const next = { ...c, ...patch };
        // Reset giá trị so khớp nếu đổi thuộc tính lọc
        if (patch.attr) {
          const vals = getUniqueValuesForAttr(patch.attr);
          next.val = vals[0] || '';
        }
        return next;
      }
      return c;
    });
    setLocalConditions(updated);
    saveConditions(updated);
  };

  const moveCondition = (index: number, direction: 'up' | 'down') => {
    const nextIndex = direction === 'up' ? index - 1 : index + 1;
    if (nextIndex < 0 || nextIndex >= localConditions.length) return;
    const updated = [...localConditions];
    const temp = updated[index];
    updated[index] = updated[nextIndex];
    updated[nextIndex] = temp;
    setLocalConditions(updated);
    saveConditions(updated);
  };

  // --- Tính toán phân bổ giọng đọc realtime ---
  const distribution = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const vId of localVoicePool) {
      counts[vId] = 0;
    }
    if (localModel && counts[localModel] === undefined) {
      counts[localModel] = 0;
    }
    for (const s of students) {
      const voice = getVoiceForStudentLocal(s, localConditions, localModel);
      counts[voice] = (counts[voice] || 0) + 1;
    }
    return Object.entries(counts).map(([vId, count]) => {
      const label = VOICE_CATALOG.find(v => v.id === vId)?.label ?? vId;
      return { id: vId, label, count };
    });
  }, [students, localConditions, localModel, localVoicePool]);

  // --- Thống kê tiến trình pregen ---
  const pgDone = pregenStatus?.done ?? 0;
  const pgTotal = pregenStatus?.total ?? students.length;
  const pgFailed = pregenStatus?.failed ?? 0;
  const isStale = pregenStatus?.configChanged ?? false;

  return (
    <>
      <div className="flex min-h-0 h-full divide-x divide-border -m-6">
        <ConfigColumn
          localModel={localModel}
          onChangeModel={(val) => {
            setLocalModel(val);
            socket.current?.emit('cmd:setTtsModel', { model: val });
          }}
          localSpeed={localSpeed}
          onChangeSpeed={setLocalSpeed}
          localDelay={localDelay}
          onChangeDelay={setLocalDelay}
          localTemplate={localTemplate}
          onChangeTemplate={setLocalTemplate}
          localPlayMode={localPlayMode}
          onChangePlayMode={(val) => {
            setLocalPlayMode(val);
            socket.current?.emit('cmd:setTtsPlayMode', { playMode: val });
          }}
          localConditions={localConditions}
          hasConditions={localConditions.length > 0}
          previewStudent={previewStudent}
          getVoiceForStudent={getVoiceForStudentLocal}
          onOpenCloneModal={() => setShowCloneModal(true)}
          customVariables={customVariables}
          onManageVariables={() => openSettingsModal('variable')}
        />

        <PregenColumn
          voiceCatalog={VOICE_CATALOG}
          localVoicePool={localVoicePool}
          remainingVoices={remainingVoices}
          showAddVoiceMenu={showAddVoiceMenu}
          onToggleAddVoiceMenu={() => setShowAddVoiceMenu((v) => !v)}
          addVoiceBtnRef={addVoiceBtnRef}
          onAddVoiceToPool={handleAddVoiceToPool}
          onRemoveVoiceFromPool={handleRemoveVoiceFromPool}
          localConditions={localConditions}
          students={students}
          onUpdateCondition={handleUpdateCondition}
          onRemoveCondition={handleRemoveCondition}
          onMoveCondition={moveCondition}
          onAddCondition={handleAddCondition}
          localModel={localModel}
          onChangeModel={(val) => {
            setLocalModel(val);
            socket.current?.emit('cmd:setTtsModel', { model: val });
          }}
          distribution={distribution}
          isStale={isStale}
          pregenRunning={pregenRunning}
          onStartPregen={handleStartPregen}
          pgDone={pgDone}
          pgTotal={pgTotal}
          pgFailed={pgFailed}
          pregenStatus={pregenStatus}
          onCancelPregen={handleCancelPregen}
          selectedCodes={selectedCodes}
          setSelectedCodes={setSelectedCodes}
          onRequeueSelected={handleRequeueSelected}
          getVoiceForStudent={getVoiceForStudentLocal}
        />
      </div>
      <VoiceCloneModal open={showCloneModal} onClose={() => setShowCloneModal(false)} />
    </>
  );
}
