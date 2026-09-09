import { contractError, contractOk, isRecord, type ContractResult } from './runtime';

export function parseRowsResponse<T>(input: unknown): ContractResult<T[]> {
  if (!isRecord(input)) return contractError('Resposta da API deve ser um objeto.');
  if (!Array.isArray(input.rows)) return contractError('Resposta da API sem lista rows.');
  if (!input.rows.every((row) => isRecord(row))) {
    return contractError('Resposta da API contém uma linha inválida.');
  }
  return contractOk(input.rows as T[]);
}

export type LoginSuccess = {
  success: true;
  email: string;
  full_name: string;
  role: string;
  perfil_slug: string;
  abas: string[];
  session_expires_at: string | null;
};

export function parseLoginSuccess(input: unknown): ContractResult<LoginSuccess> {
  if (!isRecord(input) || input.success !== true) return contractError('Login sem confirmação.');
  if (typeof input.email !== 'string' || !input.email.includes('@')) {
    return contractError('Login sem e-mail válido.');
  }
  if (typeof input.role !== 'string' || !input.role.trim()) {
    return contractError('Login sem perfil de acesso.');
  }
  if (
    input.session_expires_at !== null &&
    typeof input.session_expires_at !== 'string'
  ) {
    return contractError('Expiração da sessão inválida.');
  }
  const abas = Array.isArray(input.abas) ? input.abas.map((a) => String(a)) : [];
  return contractOk({
    success: true,
    email: input.email,
    full_name: typeof input.full_name === 'string' ? input.full_name : '',
    role: input.role,
    perfil_slug: typeof input.perfil_slug === 'string' ? input.perfil_slug : input.role,
    abas,
    session_expires_at: input.session_expires_at,
  });
}
