/** Contador de geração: resultado assíncrono (IA/OCR/preparo) só se aplica se ainda for o mais recente. */
export type ContadorGeracao = {
  nova: () => number;
  vigente: (geracao: number) => boolean;
  invalidar: () => void;
};

export function criarContadorGeracao(): ContadorGeracao {
  let atual = 0;
  return {
    nova: () => ++atual,
    vigente: (geracao) => geracao === atual,
    invalidar: () => {
      atual++;
    },
  };
}
