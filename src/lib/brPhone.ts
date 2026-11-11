/**
 * Reexporta identidade BR a partir de `shared/` (fonte única com o BFF).
 */
export {
  DDD_TO_UF,
  brMobileError,
  dddFromPhone,
  formatBrMobile,
  formatBirthMask,
  formatCpfMask,
  isValidBrMobile,
  isValidCpf,
  normalizeBirthDate,
  phoneDigits,
  ufFromPhone,
  birthDateError,
  cpfError,
  clampPersonName,
  BR_UFS,
} from '../../shared/brIdentity';
