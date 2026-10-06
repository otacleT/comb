import { describe, expect, it } from 'vitest';
import {
  defaultPrefix,
  isRequirementId,
  nextRequirementId,
  parseRequirementHeading,
  prefixOf,
} from '../../../src/core/spec/ids.js';

describe('requirement ids', () => {
  it('validates the REQ-<PREFIX>-<NNN> format', () => {
    expect(isRequirementId('REQ-ORDER-001')).toBe(true);
    expect(isRequirementId('REQ-A2-1234')).toBe(true);
    expect(isRequirementId('REQ-order-001')).toBe(false);
    expect(isRequirementId('REQ-ORDER-01')).toBe(false);
    expect(prefixOf('REQ-ORDER-001')).toBe('ORDER');
    expect(prefixOf('nope')).toBeNull();
  });

  it('parses requirement headings', () => {
    expect(parseRequirementHeading('Requirement: REQ-ORDER-001 注文の作成')).toEqual({ id: 'REQ-ORDER-001', title: '注文の作成' });
    expect(parseRequirementHeading('Requirement: REQ-ORDER-010')).toEqual({ id: 'REQ-ORDER-010', title: '' });
    expect(parseRequirementHeading('Requirement:')).toEqual({ id: '', title: '' });
    expect(parseRequirementHeading('Scenario: x')).toBeNull();
  });

  it('computes the next id from used ids of the same prefix', () => {
    expect(nextRequirementId('ORDER', ['REQ-ORDER-001', 'REQ-ORDER-010', 'REQ-PAY-099'])).toBe('REQ-ORDER-011');
    expect(nextRequirementId('PAY', [])).toBe('REQ-PAY-001');
  });

  it('derives a default prefix from the capability name', () => {
    expect(defaultPrefix('order-lifecycle')).toBe('ORDER');
    expect(defaultPrefix('2fa-login')).toBe('C2FA');
  });
});
