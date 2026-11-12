/**
 * Regras de identidade Consulta TIM (segurança + UX de preenchimento).
 *
 * - Preenchimento inicial: celular e CPF convivem.
 * - Após consulta (identityBound) ou troca entre identidades já vistas/completas:
 *   mudar um zera o outro (não reaproveitar telefone fixo com vários CPFs).
 * - Editar um campo completo (apagar dígitos) não zera o outro imediatamente;
 *   ao fechar outro CPF/telefone completo diferente do último completo, quebra o par.
 */

export type ConsultaTimIdentityForm = {
  telefone: string;
  cpf: string;
  nome: string;
  data_nascimento: string;
  nome_mae: string;
};

export type IdentityChangeResult = {
  form: ConsultaTimIdentityForm;
  identityBound: boolean;
  lastCompleteCpf: string;
  lastCompletePhone: string;
  /** Limpar resultado/poll/alertas na UI. */
  clearUi: boolean;
};

function emptyCadastro(
  base: Pick<ConsultaTimIdentityForm, 'telefone' | 'cpf'>,
): ConsultaTimIdentityForm {
  return {
    telefone: base.telefone,
    cpf: base.cpf,
    nome: '',
    data_nascimento: '',
    nome_mae: '',
  };
}

export function applyPhoneIdentityChange(input: {
  prev: ConsultaTimIdentityForm;
  nextFormatted: string;
  nextDigits: string;
  prevDigits: string;
  identityBound: boolean;
  lastCompletePhone: string;
  lastCompleteCpf: string;
  isValidPhone: (value: string) => boolean;
}): IdentityChangeResult {
  const {
    prev,
    nextFormatted,
    nextDigits,
    prevDigits,
    identityBound,
    lastCompletePhone,
    lastCompleteCpf,
    isValidPhone,
  } = input;

  if (nextDigits === prevDigits) {
    return {
      form: { ...prev, telefone: nextFormatted },
      identityBound,
      lastCompletePhone,
      lastCompleteCpf,
      clearUi: false,
    };
  }

  const prevComplete = isValidPhone(prev.telefone);
  const nextComplete = isValidPhone(nextFormatted);
  const nextEmpty = nextDigits.length === 0;
  const switchedComplete =
    nextComplete &&
    Boolean(lastCompletePhone) &&
    nextDigits !== lastCompletePhone;

  const breakPair =
    identityBound ||
    (prevComplete && (nextEmpty || nextComplete)) ||
    switchedComplete;

  const nextLastPhone = nextComplete ? nextDigits : nextEmpty ? '' : lastCompletePhone;
  const nextLastCpf = breakPair ? '' : lastCompleteCpf;

  if (breakPair) {
    return {
      form: emptyCadastro({ telefone: nextFormatted, cpf: '' }),
      identityBound: false,
      lastCompletePhone: nextLastPhone,
      lastCompleteCpf: nextLastCpf,
      clearUi: true,
    };
  }

  return {
    form: { ...prev, telefone: nextFormatted },
    identityBound,
    lastCompletePhone: nextLastPhone,
    lastCompleteCpf,
    clearUi: true,
  };
}

export function applyCpfIdentityChange(input: {
  prev: ConsultaTimIdentityForm;
  nextFormatted: string;
  nextDigits: string;
  prevDigits: string;
  identityBound: boolean;
  lastCompleteCpf: string;
  lastCompletePhone: string;
}): IdentityChangeResult {
  const {
    prev,
    nextFormatted,
    nextDigits,
    prevDigits,
    identityBound,
    lastCompleteCpf,
    lastCompletePhone,
  } = input;

  if (nextDigits === prevDigits) {
    return {
      form: { ...prev, cpf: nextFormatted },
      identityBound,
      lastCompleteCpf,
      lastCompletePhone,
      clearUi: false,
    };
  }

  const prevComplete = prevDigits.length === 11;
  const nextComplete = nextDigits.length === 11;
  const nextEmpty = nextDigits.length === 0;
  const switchedComplete =
    nextComplete && Boolean(lastCompleteCpf) && nextDigits !== lastCompleteCpf;

  const breakPair =
    identityBound ||
    (prevComplete && (nextEmpty || nextComplete)) ||
    switchedComplete;

  const nextLastCpf = nextComplete ? nextDigits : nextEmpty ? '' : lastCompleteCpf;
  const nextLastPhone = breakPair ? '' : lastCompletePhone;

  if (breakPair) {
    return {
      form: emptyCadastro({ cpf: nextFormatted, telefone: '' }),
      identityBound: false,
      lastCompleteCpf: nextLastCpf,
      lastCompletePhone: nextLastPhone,
      clearUi: true,
    };
  }

  return {
    form: emptyCadastro({ telefone: prev.telefone, cpf: nextFormatted }),
    identityBound,
    lastCompleteCpf: nextLastCpf,
    lastCompletePhone,
    clearUi: true,
  };
}
