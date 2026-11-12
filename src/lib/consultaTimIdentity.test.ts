import { describe, expect, it } from 'vitest';
import {
  applyCpfIdentityChange,
  applyPhoneIdentityChange,
  type ConsultaTimIdentityForm,
} from './consultaTimIdentity';

const empty: ConsultaTimIdentityForm = {
  telefone: '',
  cpf: '',
  nome: '',
  data_nascimento: '',
  nome_mae: '',
};

const isValidPhone = (v: string) => v.replace(/\D/g, '').length === 11;

describe('consultaTimIdentity', () => {
  it('preenchimento inicial: digita celular depois CPF sem apagar o número', () => {
    let lastPhone = '';
    let lastCpf = '';
    const withPhone = applyPhoneIdentityChange({
      prev: empty,
      nextFormatted: '(84) 99800-6099',
      nextDigits: '84998006099',
      prevDigits: '',
      identityBound: false,
      lastCompletePhone: lastPhone,
      lastCompleteCpf: lastCpf,
      isValidPhone,
    });
    lastPhone = withPhone.lastCompletePhone;
    expect(withPhone.form.telefone).toContain('6099');
    expect(withPhone.form.cpf).toBe('');

    const withCpf = applyCpfIdentityChange({
      prev: withPhone.form,
      nextFormatted: '111.033.394-35',
      nextDigits: '11103339435',
      prevDigits: '',
      identityBound: false,
      lastCompleteCpf: lastCpf,
      lastCompletePhone: lastPhone,
    });
    expect(withCpf.form.telefone).toBe(withPhone.form.telefone);
    expect(withCpf.form.cpf).toBe('111.033.394-35');
  });

  it('após consulta, trocar CPF zera o celular', () => {
    const r = applyCpfIdentityChange({
      prev: {
        telefone: '(84) 99800-6099',
        cpf: '111.033.394-35',
        nome: 'A',
        data_nascimento: '01/01/2000',
        nome_mae: 'B',
      },
      nextFormatted: '006.612.155-8',
      nextDigits: '0066121558',
      prevDigits: '11103339435',
      identityBound: true,
      lastCompleteCpf: '11103339435',
      lastCompletePhone: '84998006099',
    });
    expect(r.identityBound).toBe(false);
    expect(r.form.telefone).toBe('');
    expect(r.form.nome).toBe('');
  });

  it('typo no CPF completo: editar e voltar não zera celular; outro CPF completo zera', () => {
    const base = {
      telefone: '(84) 99800-6099',
      cpf: '111.033.394-35',
      nome: 'A',
      data_nascimento: '01/01/2000',
      nome_mae: 'B',
    };
    const editing = applyCpfIdentityChange({
      prev: base,
      nextFormatted: '111.033.394-3',
      nextDigits: '1110333943',
      prevDigits: '11103339435',
      identityBound: false,
      lastCompleteCpf: '11103339435',
      lastCompletePhone: '84998006099',
    });
    expect(editing.form.telefone).toBe('(84) 99800-6099');
    expect(editing.lastCompleteCpf).toBe('11103339435');

    const other = applyCpfIdentityChange({
      prev: editing.form,
      nextFormatted: '006.612.155-80',
      nextDigits: '00661215580',
      prevDigits: '1110333943',
      identityBound: false,
      lastCompleteCpf: editing.lastCompleteCpf,
      lastCompletePhone: editing.lastCompletePhone,
    });
    expect(other.form.telefone).toBe('');
    expect(other.form.cpf).toBe('006.612.155-80');
    expect(other.lastCompleteCpf).toBe('00661215580');
  });

  it('apagar celular completo zera CPF', () => {
    const r = applyPhoneIdentityChange({
      prev: {
        telefone: '(84) 99800-6099',
        cpf: '111.033.394-35',
        nome: 'A',
        data_nascimento: '01/01/2000',
        nome_mae: 'B',
      },
      nextFormatted: '',
      nextDigits: '',
      prevDigits: '84998006099',
      identityBound: false,
      lastCompletePhone: '84998006099',
      lastCompleteCpf: '11103339435',
      isValidPhone,
    });
    expect(r.form.cpf).toBe('');
    expect(r.form.telefone).toBe('');
  });

  it('trocar de um celular completo para outro completo zera CPF', () => {
    const r = applyPhoneIdentityChange({
      prev: {
        telefone: '(84) 99800-6099',
        cpf: '111.033.394-35',
        nome: 'A',
        data_nascimento: '01/01/2000',
        nome_mae: 'B',
      },
      nextFormatted: '(11) 98765-4321',
      nextDigits: '11987654321',
      prevDigits: '84998006099',
      identityBound: false,
      lastCompletePhone: '84998006099',
      lastCompleteCpf: '11103339435',
      isValidPhone,
    });
    expect(r.form.cpf).toBe('');
    expect(r.form.telefone).toContain('98765');
  });
});
