/**
 * Entitlement — quyền sử dụng app/feature theo license.
 * Xem docs/reference/contract-reference.md §EntitlementSet & EntitlementGate,
 * docs/guides/licensing-entitlement.md.
 */
import type { AppModule } from './app-module.js';

export interface EntitlementSet {
  has(entitlement: string): boolean;
  list(): string[];
}

export function createEntitlementSet(granted: Iterable<string>): EntitlementSet {
  const set = new Set<string>(granted);
  return {
    has(entitlement) {
      return set.has(entitlement);
    },
    list() {
      return Array.from(set);
    },
  };
}

/** EntitlementSet cho phép mọi thứ — hữu ích khi chưa cài licensing thật (dev, mock app). */
export function createAllowAllEntitlementSet(): EntitlementSet {
  return {
    has: () => true,
    list: () => [],
  };
}

export interface EntitlementGate {
  /** App có được mở không, dựa trên AppModule.entitlement */
  canOpen(app: AppModule): boolean;
  /** Lý do bị khóa (hiển thị cho người dùng), null nếu không bị khóa */
  reason(app: AppModule): string | null;
}

export function createEntitlementGate(entitlements: EntitlementSet): EntitlementGate {
  return {
    canOpen(app) {
      if (!app.entitlement) return true;
      return entitlements.has(app.entitlement);
    },
    reason(app) {
      if (!app.entitlement) return null;
      if (entitlements.has(app.entitlement)) return null;
      return `Thiếu quyền "${app.entitlement}" — cần nâng cấp license để mở "${app.name}".`;
    },
  };
}
