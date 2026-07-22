import { app, dialog } from 'electron';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import type { ApiIntegration, CanonicalRecord } from '@sky-app/slide-shared';
import { flattenCanonicalRecord } from '@sky-app/slide-shared';
import { getAwardLocationCode, getApiIntegrations } from './socket-server';
import { getMainWindow, isBackdropOpen } from './windows';

// Request đã build thực tế (URL/headers/body đã interpolate) — lưu lại để UI có thể dựng
// lệnh curl y hệt request đã gửi, khác với `payload` (input thô, dùng để build lại lúc retry).
export interface ApiCallRequest {
  url: string;
  method: string;
  headers: Record<string, string>;
  body?: string;
}

export interface LogEntry {
  id: string;
  timestamp: string;
  studentCode?: string;
  studentName?: string;
  phone?: string;
  major?: string;
  classCode?: string;
  action: string;
  details: string;
  apiStatus?: 'idle' | 'pending' | 'success' | 'failed';
  apiError?: string;
  payload?: any;
  request?: ApiCallRequest;
  retries?: number;
}

// Input thô cho một lần gọi API tích hợp — lưu vào LogEntry.payload để retry có thể
// build lại template (URL/headers/body) với dữ liệu mới nhất thay vì replay bản đã interpolate cũ.
interface ApiCallInput {
  integration: ApiIntegration;
  record: CanonicalRecord | null;
}

function formatLocalTime(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  const yyyy = date.getFullYear();
  const mm = pad(date.getMonth() + 1);
  const dd = pad(date.getDate());
  const hh = pad(date.getHours());
  const min = pad(date.getMinutes());
  const ss = pad(date.getSeconds());
  return `${yyyy}-${mm}-${dd} ${hh}:${min}:${ss}`;
}

interface TemplateContext {
  student?: Record<string, unknown> | null;
  award_location_code: number;
  event: string;
  backdrop_open: boolean;
  logs: any[];
}

// Trả về giá trị thô (chưa ép chuỗi) của một biến {{...}} — dùng chung cho cả interpolate JSON và plain text.
function resolveTemplateVar(key: string, context: TemplateContext): unknown {
  if (key === 'award_location_code') return context.award_location_code;
  if (key === 'event') return context.event;
  if (key === 'backdrop_open') return context.backdrop_open;
  if (key === 'logs') return context.logs || [];
  if (context.student) {
    const cleanKey = key.startsWith('student.') ? key.substring(8) : key;
    return context.student[cleanKey];
  }
  return undefined;
}

// Dùng cho URL/header: chèn giá trị dạng plain text, không escape JSON.
function interpolatePlainText(template: string, context: TemplateContext): string {
  if (!template) return '';
  return template.replace(/\{\{([^}]+)\}\}/g, (_match, path) => {
    const val = resolveTemplateVar(path.trim(), context);
    if (val === undefined || val === null) return '';
    return typeof val === 'object' ? JSON.stringify(val) : String(val);
  });
}

// Dùng cho payload JSON. Hỗ trợ 2 cách đặt biến trong template:
//  - Bên trong cặp dấu " có sẵn (vd. "key_word": "{{student.student_code}}") → escape giá trị và bỏ
//    dấu " bao ngoài của JSON.stringify, để không bị lồng dấu " x2. Áp dụng cho mọi kiểu giá trị,
//    kể cả object/array (vd. {{logs}} dùng trong chuỗi sẽ được nhúng dạng JSON string).
//  - Đứng một mình ở vị trí giá trị JSON (vd. "logs": {{logs}}) → chèn nguyên JSON.stringify(val),
//    để mảng/object giữ đúng kiểu thay vì bị biến thành chuỗi.
// Escape từng giá trị trước khi chèn để tránh vỡ cấu trúc JSON khi tên sinh viên chứa dấu " hoặc xuống dòng.
function interpolateJsonPayload(template: string, context: TemplateContext): string {
  if (!template) return '';
  return template.replace(/(")?\{\{([^}]+)\}\}(")?/g, (_match, openQuote, path, closeQuote) => {
    const val = resolveTemplateVar(path.trim(), context);
    const insideQuotes = Boolean(openQuote && closeQuote);

    if (val === undefined || val === null) return insideQuotes ? `${openQuote}${closeQuote}` : 'null';

    if (insideQuotes) {
      // Nằm trong cặp " có sẵn trong template: escape giá trị (kể cả object) thành nội dung chuỗi JSON.
      const asString = typeof val === 'object' ? JSON.stringify(val) : String(val);
      return JSON.stringify(asString);
    }
    // Đứng một mình: chèn giá trị JSON thật (số/bool giữ nguyên kiểu, object/array giữ cấu trúc).
    return JSON.stringify(val);
  });
}

class ApiLogger {
  private logs: LogEntry[] = [];
  private logFilePath: string = '';
  private autoRetryTimer: NodeJS.Timeout | null = null;
  private isRetrying = false;

  init() {
    this.logFilePath = join(app.getPath('userData'), 'graduation-logs.json');
    this.loadLogs();
    this.startAutoRetry();
    console.log('[ApiLogger] Initialized, file path:', this.logFilePath);
  }

  private loadLogs() {
    if (existsSync(this.logFilePath)) {
      try {
        const content = readFileSync(this.logFilePath, 'utf-8');
        this.logs = JSON.parse(content) as LogEntry[];
      } catch (err) {
        console.error('[ApiLogger] Failed to read log file, resetting logs:', err);
        this.logs = [];
      }
    } else {
      this.logs = [];
    }
  }

  private saveLogs() {
    try {
      const dir = join(app.getPath('userData'));
      mkdirSync(dir, { recursive: true });
      writeFileSync(this.logFilePath, JSON.stringify(this.logs, null, 2), 'utf-8');
      this.notifyClients();
    } catch (err) {
      console.error('[ApiLogger] Failed to save logs:', err);
    }
  }

  private notifyClients() {
    const win = getMainWindow();
    if (win && !win.isDestroyed()) {
      win.webContents.send('logs:changed', this.logs);
    }
  }

  getLogs(): LogEntry[] {
    return this.logs;
  }

  clearLogs() {
    this.logs = [];
    this.saveLogs();
  }

  addLog(entry: Omit<LogEntry, 'id' | 'timestamp'>): LogEntry {
    const newEntry: LogEntry = {
      ...entry,
      id: `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
      timestamp: formatLocalTime(new Date()),
    };
    this.logs.unshift(newEntry);
    if (this.logs.length > 1000) {
      this.logs = this.logs.slice(0, 1000);
    }
    this.saveLogs();
    return newEntry;
  }

  logScan(record: CanonicalRecord) {
    const flat = flattenCanonicalRecord(record);
    this.addLog({
      studentCode: record.identifierCode ?? record.id,
      studentName: record.full_name,
      phone: record.phone,
      major: typeof flat['major_name'] === 'string' ? (flat['major_name'] as string) : undefined,
      classCode: typeof flat['class_code'] === 'string' ? (flat['class_code'] as string) : undefined,
      action: 'scan',
      details: `Quét QR/Thẻ thành công: ${record.full_name} (${record.identifierCode ?? record.id})`,
    });
  }

  logPlay(record: CanonicalRecord) {
    const flat = flattenCanonicalRecord(record);
    this.addLog({
      studentCode: record.identifierCode ?? record.id,
      studentName: record.full_name,
      phone: record.phone,
      major: typeof flat['major_name'] === 'string' ? (flat['major_name'] as string) : undefined,
      classCode: typeof flat['class_code'] === 'string' ? (flat['class_code'] as string) : undefined,
      action: 'play',
      details: `Chạy slide chủ động (Play): ${record.full_name} (${record.identifierCode ?? record.id})`,
    });
  }

  logClear() {
    this.addLog({
      action: 'clear',
      details: 'Hiển thị màn hình chào mừng (Clear backdrop)',
    });
  }

  logChangeLocation(code: number) {
    const locations = ['Quảng trường', 'HTL - GD1', 'HT1- GD2', 'HT2-GD2'];
    const locName = locations[code] || `Hội trường mã ${code}`;
    this.addLog({
      action: 'clear',
      details: `Đổi Hội trường: Thay đổi địa điểm vận hành sang ${locName} (Mã: ${code})`,
    });
  }

  async triggerApiCall(record: CanonicalRecord) {
    this.triggerCustomApi('play_student', record).catch((err) => {
      console.error('[ApiLogger] triggerApiCall custom error:', err);
    });
  }

  async triggerPauseApiCall() {
    this.triggerCustomApi('welcome_screen', null).catch((err) => {
      console.error('[ApiLogger] triggerPauseApiCall custom error:', err);
    });
  }

  async triggerCustomApi(action: string, record?: CanonicalRecord | null): Promise<boolean> {
    const integration = getApiIntegrations().find((i) => i.action === action);
    if (!integration) {
      console.log(`[ApiLogger] No custom API configured for action: ${action}`);
      return false;
    }

    // Lưu integration + input thô (không phải giá trị đã interpolate) để khi retry có thể
    // build lại template với dữ liệu mới nhất (vd. {{logs}} snapshot mới) thay vì replay bản cũ.
    const callInput: ApiCallInput = {
      integration,
      record: record ?? null,
    };

    const flat = record ? flattenCanonicalRecord(record) : null;
    const interpolatedUrl = interpolatePlainText(integration.url, this.buildTemplateContext(callInput));
    const logEntry = this.addLog({
      studentCode: record?.identifierCode ?? record?.id,
      studentName: record?.full_name,
      phone: record?.phone,
      major: flat && typeof flat['major_name'] === 'string' ? (flat['major_name'] as string) : undefined,
      classCode: flat && typeof flat['class_code'] === 'string' ? (flat['class_code'] as string) : undefined,
      action: 'api_call',
      details: `Gọi API Tích hợp [${integration.action}]: ${integration.method} ${interpolatedUrl}...`,
      apiStatus: 'pending',
      payload: callInput,
      retries: 0,
    });

    return this.executeApiCall(logEntry.id, callInput);
  }

  private buildTemplateContext(input: ApiCallInput): TemplateContext {
    return {
      student: input.record ? flattenCanonicalRecord(input.record) : null,
      award_location_code: getAwardLocationCode(),
      event: input.integration.action,
      backdrop_open: isBackdropOpen(),
      logs: this.logs,
    };
  }

  private async executeApiCall(logId: string, input: ApiCallInput): Promise<boolean> {
    const integration = input?.integration;
    if (!integration) {
      // Log cũ từ trước khi migrate sang cấu hình API tích hợp — không còn payload hợp lệ để retry.
      this.updateLogStatus(logId, 'failed', 'Log cũ không tương thích, vui lòng xóa và thử lại thao tác gốc.');
      return false;
    }
    const actionLabel = `[${integration.action}]`;
    try {
      const context = this.buildTemplateContext(input);
      const url = interpolatePlainText(integration.url, context);

      const headers: Record<string, string> = {};
      let hasContentType = false;
      for (const h of integration.headers || []) {
        if (h.key && h.value) {
          const k = h.key.trim();
          headers[k] = interpolatePlainText(h.value, context);
          if (k.toLowerCase() === 'content-type') hasContentType = true;
        }
      }
      if (!hasContentType && integration.method !== 'GET') {
        headers['Content-Type'] = 'application/json';
      }

      const body = integration.method !== 'GET' ? interpolateJsonPayload(integration.payload, context) : undefined;

      this.updateLogRequest(logId, { url, method: integration.method, headers, body });

      console.log(`[ApiLogger] Calling API ${actionLabel}: ${integration.method} ${url}`);

      const response = await fetch(url, {
        method: integration.method,
        headers,
        body,
      });

      if (response.ok) {
        this.updateLogStatus(logId, 'success', `Gọi API ${actionLabel} thành công`);
        return true;
      } else {
        const errText = await response.text().catch(() => 'No details');
        const statusText = response.statusText || '';
        this.updateLogStatus(
          logId,
          'failed',
          `Gọi API ${actionLabel} thất bại: HTTP ${response.status} ${statusText} (${errText})`,
        );
        return false;
      }
    } catch (err: any) {
      this.updateLogStatus(logId, 'failed', `Gọi API ${actionLabel} lỗi kết nối: ${err.message || String(err)}`);
      return false;
    }
  }

  private updateLogRequest(logId: string, request: ApiCallRequest) {
    const idx = this.logs.findIndex((l) => l.id === logId);
    if (idx !== -1) {
      this.logs[idx].request = request;
      this.saveLogs();
    }
  }

  private updateLogStatus(logId: string, status: 'success' | 'failed', details: string) {
    const idx = this.logs.findIndex((l) => l.id === logId);
    if (idx !== -1) {
      this.logs[idx].apiStatus = status;
      this.logs[idx].details = details;
      if (status === 'failed') {
        this.logs[idx].apiError = details;
      } else {
        this.logs[idx].apiError = undefined;
      }
      this.saveLogs();
    }
  }

  private startAutoRetry() {
    if (this.autoRetryTimer) {
      clearInterval(this.autoRetryTimer);
    }
    this.autoRetryTimer = setInterval(() => {
      this.retryAllFailed(true);
    }, 600000); // 10 minutes
  }

  async retrySingleLog(logId: string) {
    try {
      const log = this.logs.find((l) => l.id === logId);
      if (!log || log.apiStatus !== 'failed' || !log.payload) return;

      log.retries = (log.retries || 0) + 1;
      log.apiStatus = 'pending';
      log.details = `Đang thử lại thủ công lần ${log.retries} cho ${log.studentName}...`;
      this.saveLogs();

      await this.executeApiCall(log.id, log.payload);
    } catch (err) {
      console.error('[ApiLogger] Error in retrySingleLog:', err);
    }
  }

  async retryAllFailed(isAuto = false) {
    try {
      if (this.isRetrying) return;

      const failedLogs = this.logs.filter(
        (l) =>
          (l.action === 'api_call' || l.action === 'api_retry') &&
          l.apiStatus === 'failed' &&
          l.payload &&
          (!isAuto || (l.retries || 0) < 3),
      );

      if (failedLogs.length === 0) return;

      this.isRetrying = true;
      const modeStr = isAuto ? 'Tự động' : 'Thủ công';

      const retryLog = this.addLog({
        action: 'api_retry',
        details: `${modeStr} thử lại: Bắt đầu xử lý ${failedLogs.length} yêu cầu lỗi...`,
        apiStatus: 'pending',
      });

      let successCount = 0;
      let failCount = 0;

      for (const log of failedLogs) {
        const idx = this.logs.findIndex((l) => l.id === log.id);
        if (idx !== -1) {
          this.logs[idx].retries = (this.logs[idx].retries || 0) + 1;
          this.logs[idx].apiStatus = 'pending';
          this.logs[idx].details = `Đang thử lại lần ${this.logs[idx].retries} cho ${log.studentName}...`;
          this.saveLogs();

          const success = await this.executeApiCall(log.id, log.payload);
          if (success) {
            successCount++;
          } else {
            failCount++;
            // Wait 1 second between retries to avoid overloading
            await new Promise((r) => setTimeout(r, 1000));
          }
        }
      }

      this.updateLogStatus(
        retryLog.id,
        failCount > 0 ? 'failed' : 'success',
        `${modeStr} thử lại xong: Thành công ${successCount}/${failedLogs.length} yêu cầu.`
      );
    } catch (err) {
      console.error('[ApiLogger] Error in retryAllFailed:', err);
    } finally {
      this.isRetrying = false;
    }
  }

  async exportLogsToTxt(): Promise<{ ok: boolean; message: string }> {
    const win = getMainWindow();
    const { canceled, filePath } = await dialog.showSaveDialog(win ?? undefined!, {
      title: 'Xuất Nhật Ký (.txt)',
      defaultPath: `nhat-ky-ceremony-${new Date().toISOString().slice(0, 10)}.txt`,
      filters: [{ name: 'Text Files', extensions: ['txt'] }],
    });

    if (canceled || !filePath) return { ok: false, message: 'Đã hủy xuất nhật ký' };

    try {
      const textContent = this.logs
        .map((l) => {
          const studentDetails = [];
          if (l.studentName) studentDetails.push(`Tên: ${l.studentName}`);
          if (l.studentCode) studentDetails.push(`MSSV: ${l.studentCode}`);
          if (l.phone) studentDetails.push(`SĐT: ${l.phone}`);
          if (l.major) studentDetails.push(`Ngành: ${l.major}`);
          if (l.classCode) studentDetails.push(`Lớp: ${l.classCode}`);
          const studentInfo = studentDetails.length > 0 ? ` | ${studentDetails.join(', ')}` : '';

          const apiInfo = l.apiStatus ? ` | API: ${l.apiStatus}` : '';
          const retriesInfo = l.retries ? ` | Lượt thử lại: ${l.retries}` : '';
          const errorInfo = l.apiError ? ` | Lỗi: ${l.apiError}` : '';
          return `[${l.timestamp}] [${l.action.toUpperCase()}]${studentInfo}${apiInfo}${retriesInfo}${errorInfo}\n  -> ${l.details}`;
        })
        .join('\n\n');

      writeFileSync(filePath, textContent, 'utf-8');
      return { ok: true, message: `Đã xuất nhật ký ra file thành công: ${filePath}` };
    } catch (err: any) {
      console.error('[ApiLogger] Export error:', err);
      return { ok: false, message: `Lỗi xuất file: ${err.message || String(err)}` };
    }
  }

  async triggerTestApiCall(): Promise<{ ok: boolean; message: string }> {
    try {
      const integration = getApiIntegrations().find((i) => i.action === 'play_student');
      if (!integration) {
        return { ok: false, message: 'Chưa cấu hình API cho sự kiện "Phát slide sinh viên"' };
      }

      const testRecord: CanonicalRecord = {
        id: 'TEST-SV001',
        identifierCode: 'TEST-SV001',
        full_name: 'Sinh Viên Thử Nghiệm API',
        subjectType: 'student',
        extra: {},
      };
      const hallCode = getAwardLocationCode();
      const callInput: ApiCallInput = { integration, record: testRecord };

      const logEntry = this.addLog({
        studentCode: testRecord.identifierCode,
        studentName: testRecord.full_name,
        action: 'api_call',
        details: `Gọi API Test: Đang thử kết nối tới cổng dịch vụ tại Hội trường ${hallCode}...`,
        apiStatus: 'pending',
        payload: callInput,
        retries: 0,
      });

      const success = await this.executeApiCall(logEntry.id, callInput);
      return {
        ok: success,
        message: success ? 'Kết nối API thành công!' : 'Kết nối API thất bại, vui lòng kiểm tra Logs',
      };
    } catch (err: any) {
      console.error('[ApiLogger] Test API error:', err);
      return { ok: false, message: `Lỗi bất ngờ khi gọi test API: ${err.message || String(err)}` };
    }
  }
}

export const apiLogger = new ApiLogger();
