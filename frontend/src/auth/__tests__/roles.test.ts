import { describe, expect, it } from 'vitest';
import { ROLE_CHOICE_OPTIONS, rolesForChoice } from '../roles';

describe('role choices', () => {
  it('maps producer, buyer and both to business roles', () => {
    expect(rolesForChoice('producer')).toEqual(['producer']);
    expect(rolesForChoice('buyer')).toEqual(['buyer']);
    expect(rolesForChoice('both')).toEqual(['producer', 'buyer']);
  });

  it('offers only producer, buyer and both in public signup', () => {
    const values = ROLE_CHOICE_OPTIONS.map((option) => option.value);
    expect(values).toEqual(['producer', 'buyer', 'both']);
    expect(JSON.stringify(ROLE_CHOICE_OPTIONS).toLowerCase()).not.toContain('admin');
  });
});
