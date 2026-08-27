/**
 * The portal's copy of the services figure, and its parity with the pipeline's.
 *
 * Until 2026-08-27 all three of BriefView's metrics bar, BriefView's whitespace
 * section and Territory's column did `services.length * 125000` — stacking the
 * same engagement per trigger, and pricing it at a constant the ARR floor
 * overtakes above $500K ARR. The section then RENDERED the real floor in a row
 * beneath, which its own total did not include. Three surfaces, three answers.
 */
import { describe, it, expect } from 'vitest';
import { SERVICES_MINIMUM, servicesArrFloor, foundServiceTriggers, servicesContribution } from './services-value';

const trig = (name: string, value?: number) => ({
  trigger: name, found: true, engagement_label: `${name} advisory`, ...(value == null ? {} : { value }),
});

describe('servicesContribution', () => {
  it('counts three found triggers as one engagement', () => {
    const ws = {
      current_arr: 22260, services_arr_floor: 125000,
      services_opportunities: [trig('design_system'), trig('dev_mode_rollout'), trig('ai_adoption')],
    };
    expect(foundServiceTriggers(ws)).toHaveLength(3);
    expect(servicesContribution(ws)).toBe(125000);
    expect(servicesContribution(ws)).not.toBe(375000);
  });

  it('ignores svc.value even when the stored brief carries one', () => {
    // Deloitte: M1.5 wrote the whole floor into each trigger.
    const ws = {
      current_arr: 3782923, services_arr_floor: 945731,
      services_opportunities: [trig('a', 945731), trig('b', 945731), trig('c', 945731)],
    };
    expect(servicesContribution(ws)).toBe(945731);
  });

  it('leaves a single-trigger account unchanged', () => {
    const ws = { current_arr: 58020, services_arr_floor: 125000, services_opportunities: [trig('dev_mode_rollout')] };
    expect(servicesContribution(ws)).toBe(125000);
  });

  it('contributes nothing when no trigger fired', () => {
    const ws = { services_arr_floor: 125000, services_opportunities: [{ trigger: 'ai_adoption', found: false }] };
    expect(servicesContribution(ws)).toBe(0);
  });
});

describe('servicesArrFloor', () => {
  it('is max(ARR x 0.25, 125000)', () => {
    expect(servicesArrFloor({ current_arr: 100000 })).toBe(SERVICES_MINIMUM);
    expect(servicesArrFloor({ current_arr: 500000 })).toBe(SERVICES_MINIMUM);
    expect(servicesArrFloor({ current_arr: 4000000 })).toBe(1000000);
    expect(servicesArrFloor({ services_arr_floor: 945731, current_arr: 1 })).toBe(945731);
    expect(servicesArrFloor(null)).toBe(SERVICES_MINIMUM);
  });

  it('exceeds $125K on any account above $500K ARR, which is why no label may assert $125K', () => {
    for (const arr of [509220, 845412, 3782923, 10269015]) {
      expect(servicesArrFloor({ current_arr: arr })).toBeGreaterThan(125000);
    }
  });
});
