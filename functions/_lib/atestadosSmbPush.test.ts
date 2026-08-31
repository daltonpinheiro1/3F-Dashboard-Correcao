import { describe, expect, it } from 'vitest';
import { normalizeSmbBridgePushUrl } from './atestadosSmbPush';

describe('normalizeSmbBridgePushUrl', () => {
  it('anexa /push quando só a base é informada', () => {
    expect(normalizeSmbBridgePushUrl('https://bridge.example:8788')).toBe(
      'https://bridge.example:8788/push',
    );
    expect(normalizeSmbBridgePushUrl('https://bridge.example:8788/')).toBe(
      'https://bridge.example:8788/push',
    );
  });

  it('preserva path /push ou alias da API', () => {
    expect(normalizeSmbBridgePushUrl('https://x/push')).toBe('https://x/push');
    expect(normalizeSmbBridgePushUrl('https://x/api/atestados-smb-push')).toBe(
      'https://x/api/atestados-smb-push',
    );
  });

  it('vazio permanece vazio', () => {
    expect(normalizeSmbBridgePushUrl('')).toBe('');
    expect(normalizeSmbBridgePushUrl('   ')).toBe('');
  });
});
