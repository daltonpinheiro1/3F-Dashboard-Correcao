/**
 * Identidade BR compartilhada (Pages Functions + Vite).
 * DDD→UF espelha Score_TIM `uf_pdv_mapper._DDD_TO_UF`.
 */

export const DDD_TO_UF: Readonly<Record<string, string>> = {
  '11': 'SP', '12': 'SP', '13': 'SP', '14': 'SP', '15': 'SP',
  '16': 'SP', '17': 'SP', '18': 'SP', '19': 'SP',
  '21': 'RJ', '22': 'RJ', '24': 'RJ',
  '27': 'ES', '28': 'ES',
  '31': 'MG', '32': 'MG', '33': 'MG', '34': 'MG', '35': 'MG',
  '37': 'MG', '38': 'MG',
  '41': 'PR', '42': 'PR', '43': 'PR', '44': 'PR', '45': 'PR', '46': 'PR',
  '47': 'SC', '48': 'SC', '49': 'SC',
  '51': 'RS', '53': 'RS', '54': 'RS', '55': 'RS',
  '61': 'DF',
  '62': 'GO', '64': 'GO',
  '63': 'TO',
  '65': 'MT', '66': 'MT',
  '67': 'MS',
  '68': 'AC',
  '69': 'RO',
  '71': 'BA', '73': 'BA', '74': 'BA', '75': 'BA', '77': 'BA',
  '79': 'SE',
  '81': 'PE', '87': 'PE',
  '82': 'AL',
  '83': 'PB',
  '84': 'RN',
  '85': 'CE', '88': 'CE',
  '86': 'PI', '89': 'PI',
  '91': 'PA', '93': 'PA', '94': 'PA',
  '92': 'AM', '97': 'AM',
  '95': 'RR',
  '96': 'AP',
  '98': 'MA', '99': 'MA',
};

export const BR_UFS = [
  'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG',
  'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO',
] as const;

export type BrUf = (typeof BR_UFS)[number];

export function digitsOnly(value: string, max = 32): string {
  return value.replace(/\D/g, '').slice(0, max);
}

export function phoneDigits(value: string): string {
  return digitsOnly(value, 11);
}

export function dddFromPhone(value: string): string | null {
  const d = phoneDigits(value);
  return d.length >= 2 ? d.slice(0, 2) : null;
}

export function ufFromPhone(value: string): BrUf | null {
  const ddd = dddFromPhone(value);
  if (!ddd) return null;
  const uf = DDD_TO_UF[ddd];
  return (uf as BrUf | undefined) ?? null;
}

/** Celular BR: 11 dígitos, DDD conhecido, 3º dígito = 9. */
export function isValidBrMobile(value: string): boolean {
  const d = phoneDigits(value);
  if (d.length !== 11 || d[2] !== '9') return false;
  return Boolean(DDD_TO_UF[d.slice(0, 2)]);
}

export function formatBrMobile(value: string): string {
  const d = phoneDigits(value);
  if (d.length === 0) return '';
  if (d.length <= 2) return `(${d}`;
  if (d.length <= 7) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

export function brMobileError(value: string): string | null {
  const d = phoneDigits(value);
  if (!d) return 'Informe o celular com DDD.';
  if (d.length < 11) return 'Celular incompleto. Use DDD + 9 dígitos.';
  if (d[2] !== '9') return 'Use celular com 9 dígitos (ex.: 9XXXX-XXXX).';
  if (!DDD_TO_UF[d.slice(0, 2)]) return 'DDD inválido.';
  return null;
}

export function formatCpfMask(value: string): string {
  const d = digitsOnly(value, 11);
  if (d.length <= 3) return d;
  if (d.length <= 6) return `${d.slice(0, 3)}.${d.slice(3)}`;
  if (d.length <= 9) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6)}`;
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
}

function cpfCheckDigit(base: string, factorStart: number): number {
  let sum = 0;
  for (let i = 0; i < base.length; i++) {
    sum += Number(base[i]) * (factorStart - i);
  }
  const mod = (sum * 10) % 11;
  return mod === 10 ? 0 : mod;
}

/** CPF com 11 dígitos e dígitos verificadores válidos (rejeita sequências 000…/111…). */
export function isValidCpf(value: string): boolean {
  const d = digitsOnly(value, 11);
  if (d.length !== 11) return false;
  if (/^(\d)\1{10}$/.test(d)) return false;
  const d1 = cpfCheckDigit(d.slice(0, 9), 10);
  if (d1 !== Number(d[9])) return false;
  const d2 = cpfCheckDigit(d.slice(0, 10), 11);
  return d2 === Number(d[10]);
}

export function cpfError(value: string): string | null {
  const d = digitsOnly(value, 11);
  if (!d) return 'Informe o CPF.';
  if (d.length !== 11) return 'Informe um CPF com 11 dígitos.';
  if (!isValidCpf(d)) return 'CPF inválido. Confira os dígitos.';
  return null;
}

export function formatBirthMask(value: string): string {
  const d = digitsOnly(value, 8);
  if (d.length <= 2) return d;
  if (d.length <= 4) return `${d.slice(0, 2)}/${d.slice(2)}`;
  return `${d.slice(0, 2)}/${d.slice(2, 4)}/${d.slice(4)}`;
}

/**
 * Aceita DD/MM/AAAA (ou só dígitos). Retorna normalizado ou null.
 * Janela: idade 16–100 anos a partir de hoje.
 */
export function normalizeBirthDate(value: string): string | null {
  const raw = value.trim();
  let ddStr: string;
  let mmStr: string;
  let yyyyStr: string;
  const slash = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (slash) {
    [, ddStr, mmStr, yyyyStr] = slash;
  } else {
    const d = digitsOnly(raw, 8);
    if (d.length !== 8) return null;
    ddStr = d.slice(0, 2);
    mmStr = d.slice(2, 4);
    yyyyStr = d.slice(4);
  }
  const dd = Number(ddStr);
  const mm = Number(mmStr);
  const yyyy = Number(yyyyStr);
  if (mm < 1 || mm > 12 || dd < 1 || dd > 31) return null;
  const dt = new Date(yyyy, mm - 1, dd);
  if (dt.getFullYear() !== yyyy || dt.getMonth() !== mm - 1 || dt.getDate() !== dd) {
    return null;
  }
  const now = new Date();
  const ageMs = now.getTime() - dt.getTime();
  const ageYears = ageMs / (365.25 * 24 * 3600 * 1000);
  if (ageYears < 16 || ageYears > 100) return null;
  return `${ddStr}/${mmStr}/${yyyyStr}`;
}

export function birthDateError(value: string): string | null {
  if (!value.trim()) return 'Informe a data de nascimento.';
  if (!normalizeBirthDate(value)) {
    return 'Data inválida. Use DD/MM/AAAA (idade entre 16 e 100 anos).';
  }
  return null;
}

export function clampPersonName(value: string, max = 120): string {
  return value.trim().replace(/\s+/g, ' ').slice(0, max);
}
