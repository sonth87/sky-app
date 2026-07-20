import { describe, expect, it } from 'vitest';
import { demoCanonicalSubject } from './demoCanonicalSubject.js';

describe('demoCanonicalSubject', () => {
  it('trả record hợp lệ theo CanonicalSubject — có full_name, subjectType, extra', () => {
    const record = demoCanonicalSubject();
    expect(record.id).toBeTruthy();
    expect(record.full_name).toBeTruthy();
    expect(record.subjectType).toBeTruthy();
    expect(record.extra).toBeTruthy();
    expect(Object.keys(record.extra).length).toBeGreaterThan(0);
  });
});
