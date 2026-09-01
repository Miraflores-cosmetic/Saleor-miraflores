import { describe, expect, it } from 'vitest';
import { isAllowedAdminBackendPath } from '@miraflores/admin-sections';

describe('isAllowedAdminBackendPath', () => {
  it('разрешает gift-certificates/admin', () => {
    expect(isAllowedAdminBackendPath(['gift-certificates', 'admin'])).toBe(true);
    expect(isAllowedAdminBackendPath(['gift-certificates', 'admin', 'issue'])).toBe(true);
  });

  it('разрешает orders/blog как раньше', () => {
    expect(isAllowedAdminBackendPath(['orders', 'admin'])).toBe(true);
    expect(isAllowedAdminBackendPath(['blog', 'admin'])).toBe(true);
    expect(isAllowedAdminBackendPath(['cms', 'admin'])).toBe(true);
    expect(isAllowedAdminBackendPath(['reviews', 'admin'])).toBe(true);
    expect(isAllowedAdminBackendPath(['reviews', 'admin', 'x', 'publish'])).toBe(true);
  });

  it('разрешает quiz и assistant admin', () => {
    expect(isAllowedAdminBackendPath(['quiz', 'admin'])).toBe(true);
    expect(isAllowedAdminBackendPath(['assistant', 'admin', 'chat'])).toBe(true);
  });

  it('отклоняет чужие пути', () => {
    expect(isAllowedAdminBackendPath(['gift-certificates'])).toBe(false);
    expect(isAllowedAdminBackendPath(['gift-certificates', 'public'])).toBe(false);
    expect(isAllowedAdminBackendPath(['hack', 'admin'])).toBe(false);
  });
});
