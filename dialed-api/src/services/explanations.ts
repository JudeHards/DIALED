import { createHash } from 'node:crypto';
import OpenAI from 'openai';
import { z } from 'zod';
import type { Recommendation, SessionExercise } from '@dialed/shared';
const outputSchema = z.object({ explanation: z.string().min(1).max(500).refine(s => !/\d|https?:|<|>/.test(s)) }).strict();
type Generate = (facts: string) => Promise<unknown>;
export class Explanations {
  private cache = new Map<string, { explanation: string; expires: number }>();
  private windows = new Map<string, { count: number; expires: number }>();
  constructor(private generate?: Generate, private now = () => Date.now()) {}
  async explain(userId: string, exercise: SessionExercise, decision: Recommendation) {
    const fallback = { explanation: decision.reason, source: 'rules' as const };
    if (!this.generate) return fallback;
    // Do not include names, notes, IDs or account details in the model input.
    const facts = JSON.stringify({ equipment: exercise.snapshot.equipment, prescription: exercise.prescription, action: decision.action,
      reason: decision.reason, previousKg: decision.previousKg, proposedKg: decision.proposedKg,
      performances: decision.evidence.map(e => ({ sets: e.sets })) });
    const key = createHash('sha256').update(userId + facts).digest('hex');
    const now = this.now();
    for (const [k, v] of this.cache) if (v.expires <= now) this.cache.delete(k);
    for (const [k, v] of this.windows) if (v.expires <= now) this.windows.delete(k);
    const cached = this.cache.get(key);
    if (cached) return { explanation: cached.explanation, source: 'ai' as const };
    const window = this.windows.get(userId) ?? { count: 0, expires: now + 60_000 };
    if (window.count >= 10) return fallback;
    window.count++; this.windows.set(userId, window);
    try {
      const output = outputSchema.parse(await this.generate(facts));
      if (this.cache.size >= 2000) this.cache.delete(this.cache.keys().next().value!);
      this.cache.set(key, { ...output, expires: now + 3600_000 });
      console.info(JSON.stringify({ event: 'ai_explanation', latencyMs: this.now() - now, fallback: false }));
      return { ...output, source: 'ai' as const };
    } catch {
      console.info(JSON.stringify({ event: 'ai_explanation', latencyMs: this.now() - now, fallback: true }));
      return fallback;
    }
  }
}
export function configuredExplanations() {
  const { OPENAI_API_KEY: apiKey, OPENAI_MODEL: model } = process.env;
  if (!apiKey || !model) return new Explanations();
  const openai = new OpenAI({ apiKey, timeout: 8000, maxRetries: 0 });
  return new Explanations(async facts => {
    const response = await openai.responses.create({ model, store: false, max_output_tokens: 250,
      instructions: 'Explain the supplied deterministic training decision in one or two plain sentences. Do not change the decision or invent evidence. Use no numbers, URLs, medical advice, or new recommendations. Missing effort ratings are unknown. Explain only these supplied facts.',
      input: facts, text: { format: { type: 'json_schema', name: 'explanation', strict: true, schema: { type: 'object', properties: { explanation: { type: 'string' } }, required: ['explanation'], additionalProperties: false } } },
    });
    if (response.status !== 'completed') throw new Error('Incomplete response');
    return JSON.parse(response.output_text);
  });
}
