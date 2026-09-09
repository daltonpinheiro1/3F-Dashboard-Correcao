// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ModalShell } from './ModalShell';

afterEach(() => cleanup());

describe('ModalShell', () => {
  it('expõe semântica de dialog e fecha pelo Escape', () => {
    const onClose = vi.fn();
    render(
      <ModalShell title="Detalhe" subtitle="Resumo" onClose={onClose}>
        Conteúdo
      </ModalShell>,
    );
    const dialog = screen.getByRole('dialog', { name: 'Detalhe' });
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('Escape fecha somente o modal no topo da pilha', () => {
    const first = vi.fn();
    const second = vi.fn();
    render(
      <>
        <ModalShell title="Primeiro" onClose={first}>A</ModalShell>
        <ModalShell title="Segundo" onClose={second}>B</ModalShell>
      </>,
    );
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(second).toHaveBeenCalledTimes(1);
    expect(first).not.toHaveBeenCalled();
  });
});
