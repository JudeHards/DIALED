import { describe, expect, it, vi } from 'vitest';
import { recommend } from '@dialed/shared';
import { Explanations } from '../src/services/explanations';
import { userA, userB, workout } from './fixtures';

describe('AI explanations are optional and isolated from numeric decisions', () => {
  const exercise = workout().exercises[0];
  const decision = recommend(exercise, []);
  it('works without credentials and falls back on errors, refusals or invalid model output', async () => {
    const fallback = { explanation: decision.reason, source: 'rules' };
    expect(await new Explanations().explain(userA, exercise, decision)).toEqual(fallback);
    for (const generate of [
      async () => { throw new Error('timeout'); },
      async () => ({ refusal: 'no' }), async () => ({ explanation: 'Try 999 kilograms.' }),
      async () => ({ explanation: '<script>bad</script>' }), async () => ({ explanation: '' }),
    ]) {
      expect(await new Explanations(generate).explain(userA, exercise, decision)).toEqual(fallback);
    }
  });
  it('caches by account, evidence and settings while sending no account or exercise identifiers', async () => {
    const generate = vi.fn(async () => ({ explanation: 'Log a session to establish your baseline.' }));
    const service = new Explanations(generate);
    expect((await service.explain(userA, exercise, decision)).source).toBe('ai');
    await service.explain(userA, exercise, decision);
    expect(generate).toHaveBeenCalledOnce();
    await service.explain(userB, exercise, decision);
    expect(generate).toHaveBeenCalledTimes(2);
    const changed = structuredClone(exercise); changed.prescription.repMax = 15;
    await service.explain(userA, changed, decision);
    expect(generate).toHaveBeenCalledTimes(3);
    const sent = generate.mock.calls[0] as unknown as [string];
    expect(sent[0]).not.toContain(userA); expect(sent[0]).not.toContain(exercise.id);
    expect(sent[0]).not.toContain(exercise.snapshot.name); expect(sent[0]).not.toContain(exercise.exerciseId);
    expect(JSON.parse(sent[0])).toMatchObject({ equipment: 'barbell', action: 'baseline' });
  });
  it('caps generation per account and resets its window without blocking rules', async () => {
    let now = 0; const generate = vi.fn(async () => ({ explanation: 'Keep building consistent reps.' }));
    const service = new Explanations(generate, () => now);
    for (let i = 0; i < 10; i++) await service.explain(userA, exercise, { ...decision, proposedKg: i });
    expect((await service.explain(userA, exercise, { ...decision, proposedKg: 11 })).source).toBe('rules');
    expect(generate).toHaveBeenCalledTimes(10);
    expect((await service.explain(userB, exercise, { ...decision, proposedKg: 11 })).source).toBe('ai');
    now = 60_001;
    expect((await service.explain(userA, exercise, { ...decision, proposedKg: 11 })).source).toBe('ai');
    expect(generate).toHaveBeenCalledTimes(12);
  });
});
