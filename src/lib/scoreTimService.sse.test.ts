import { describe, expect, it } from 'vitest';
import { parseSseBlock } from './scoreTimService';

describe('parseSseBlock', () => {
  it('extrai event progress e data JSON', () => {
    const parsed = parseSseBlock(
      'event: progress\ndata: {"query_id":"q1","status":"PROCESSING"}',
    );
    expect(parsed?.event).toBe('progress');
    expect(JSON.parse(parsed!.data).status).toBe('PROCESSING');
  });

  it('default event message', () => {
    const parsed = parseSseBlock('data: {"status":"APPROVED"}');
    expect(parsed?.event).toBe('message');
  });

  it('bloco vazio retorna null', () => {
    expect(parseSseBlock(': heartbeat\n')).toBeNull();
  });
});
