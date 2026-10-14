import { afterEach, describe, expect, it, vi } from 'vitest';
import { normalizeSmbBridgePushUrl, pushArquivoToSmbBridge, SMB_BRIDGE_TIMEOUT_MS } from './atestadosSmbPush';

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

describe('pushArquivoToSmbBridge', () => {
  afterEach(() => vi.restoreAllMocks());

  it('usa AbortSignal.timeout de 15s e devolve erro sem lançar', async () => {
    const timeoutSpy = vi.spyOn(AbortSignal, 'timeout');
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new DOMException('timeout', 'TimeoutError'));
    const r = await pushArquivoToSmbBridge(
      { ATESTADOS_SMB_BRIDGE_URL: 'https://bridge', ATESTADOS_SMB_BRIDGE_SECRET: 's' },
      { path: 'Atestados/x.jpg', bytes: new Uint8Array([1]), mime: 'image/jpeg' },
    );
    expect(SMB_BRIDGE_TIMEOUT_MS).toBe(15_000);
    expect(timeoutSpy).toHaveBeenCalledWith(15_000);
    expect(fetchSpy.mock.calls[0][1]?.signal).toBeInstanceOf(AbortSignal);
    expect(r.ok).toBe(false);
  });
});
