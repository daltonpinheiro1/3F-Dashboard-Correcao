export type ContractResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: string };

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function contractError<T = never>(error: string): ContractResult<T> {
  return { ok: false, error };
}

export function contractOk<T>(value: T): ContractResult<T> {
  return { ok: true, value };
}
