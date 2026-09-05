import { describe, expect, it } from 'vitest';
import {
  buildChatBody,
  extractChatText,
  isReasoningModel,
  MODEL_REASONING,
  MODEL_WORKHORSE,
} from './openaiModels';

describe('openaiModels', () => {
  it('gpt-5-mini é reasoning: sem temperature, com max_completion_tokens', () => {
    expect(isReasoningModel(MODEL_REASONING)).toBe(true);
    const body = buildChatBody({
      model: MODEL_REASONING,
      messages: [{ role: 'user', content: 'x' }],
      temperature: 0.2,
      maxTokens: 900,
    });
    expect(body.max_completion_tokens).toBe(900);
    expect(body.max_tokens).toBeUndefined();
    expect(body.temperature).toBeUndefined();
  });

  it('4o-mini usa temperature + max_tokens', () => {
    expect(isReasoningModel(MODEL_WORKHORSE)).toBe(false);
    const body = buildChatBody({
      model: MODEL_WORKHORSE,
      messages: [{ role: 'user', content: 'x' }],
      temperature: 0.25,
      maxTokens: 800,
    });
    expect(body.max_tokens).toBe(800);
    expect(body.temperature).toBe(0.25);
    expect(body.max_completion_tokens).toBeUndefined();
  });

  it('extrai texto de content string ou array', () => {
    expect(extractChatText({ choices: [{ message: { content: '  oi  ' } }] })).toBe('oi');
    expect(
      extractChatText({ choices: [{ message: { content: [{ text: 'a' }, { text: 'b' }] } }] }),
    ).toBe('ab');
  });
});
