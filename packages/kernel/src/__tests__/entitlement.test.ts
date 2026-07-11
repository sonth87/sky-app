import { describe, expect, it } from 'vitest';
import { createEntitlementGate, createEntitlementSet } from '../entitlement.js';
import type { AppModule } from '../app-module.js';

function fakeApp(entitlement?: string): AppModule {
  return {
    id: 'x',
    name: 'X App',
    icon: 'lucide:Star',
    requiredCapabilities: [],
    requiredServices: [],
    entitlement,
    render: () => null,
  };
}

describe('EntitlementGate', () => {
  it('app không có entitlement luôn mở được', () => {
    const gate = createEntitlementGate(createEntitlementSet([]));
    expect(gate.canOpen(fakeApp())).toBe(true);
    expect(gate.reason(fakeApp())).toBeNull();
  });

  it('app có entitlement nhưng license thiếu → bị khóa kèm lý do', () => {
    const gate = createEntitlementGate(createEntitlementSet(['app.other']));
    const app = fakeApp('app.ceremony');
    expect(gate.canOpen(app)).toBe(false);
    expect(gate.reason(app)).toContain('app.ceremony');
  });

  it('app có entitlement và license đủ → mở được', () => {
    const gate = createEntitlementGate(createEntitlementSet(['app.ceremony']));
    const app = fakeApp('app.ceremony');
    expect(gate.canOpen(app)).toBe(true);
    expect(gate.reason(app)).toBeNull();
  });
});
