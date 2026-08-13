import { existsSync, readFileSync, renameSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import type { OperatingMode, SessionState } from '@sky-app/slide-shared';
import { ceremonyDataDir, sessionJsonPath } from './data/paths';

const DEFAULT_SESSION: SessionState = {
  current_on_stage_id: null,
  pending_id: null,
  mode: 'manual',
  last_scan_id: null,
  last_scan_ts: null,
  broadcast_count: 0,
  sync_queue: [],
};

/**
 * Quản lý SessionState — trạng thái VẬN HÀNH của buổi lễ.
 * Ghi atomic (file tạm + rename) sau mỗi thay đổi để phục hồi sau crash.
 * Xem docs/data-sync.md.
 */
class SessionStore {
  private state: SessionState = { ...DEFAULT_SESSION };

  /** Khởi tạo: ưu tiên session.json trên đĩa, nếu không có/hỏng thì dùng mặc định.
   * KHÔNG còn nhận `fromBundle` (giai đoạn "bỏ Student", 2026-07-22) — CeremonyBundle không
   * còn tồn tại, session độc lập hoàn toàn với ceremony/config. */
  init() {
    const p = sessionJsonPath();
    if (existsSync(p)) {
      try {
        this.state = JSON.parse(readFileSync(p, 'utf-8')) as SessionState;
        return;
      } catch {
        // file hỏng → rơi xuống dùng default
      }
    }
    this.state = { ...DEFAULT_SESSION };
    this.persist();
  }

  get(): SessionState {
    return this.state;
  }

  update(patch: Partial<SessionState>): SessionState {
    this.state = { ...this.state, ...patch };
    this.persist();
    return this.state;
  }

  setMode(mode: OperatingMode) {
    return this.update({ mode });
  }

  incBroadcast() {
    return this.update({ broadcast_count: this.state.broadcast_count + 1 });
  }

  clear() {
    this.state = { ...DEFAULT_SESSION };
    this.persist();
  }

  private persist() {
    mkdirSync(ceremonyDataDir(), { recursive: true });
    const target = sessionJsonPath();
    const tmp = `${target}.tmp`;
    writeFileSync(tmp, JSON.stringify(this.state, null, 2), 'utf-8');
    // rename là atomic trên cùng filesystem
    mkdirSync(dirname(target), { recursive: true });
    renameSync(tmp, target);
  }
}

export const sessionStore = new SessionStore();
