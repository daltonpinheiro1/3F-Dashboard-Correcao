# Gates de qualidade

O comando obrigatório é `npm run gate`. Ele executa os guards de regressão,
typecheck, ESLint, testes unitários de `src/lib` e `functions/_lib`, além do
build de produção. A CI executa esse gate após `npm ci`, sem depender de secrets.

## Typecheck incremental de Functions

`tsconfig.functions.json` usa os tipos oficiais de Cloudflare Workers e cobre
os helpers e handlers de `functions/`, exceto quatro handlers com dívida de
tipagem anterior à Fase 6:

- `functions/api/advertencias.ts`
- `functions/api/atestados.ts`
- `functions/api/portabilidade-disparos.ts`
- `functions/api/portabilidade-p0-alert.ts`

As exclusões são explícitas para não esconder novos arquivos. Elas devem ser
removidas individualmente quando cada handler for corrigido em trabalho próprio.

## ESLint incremental

O alvo inicial obrigatório é `functions/_lib/**/*.ts`, mais as configurações
do Vite e do próprio ESLint. Páginas e handlers ficam fora do alvo inicial por
terem dívida preexistente; ampliar o alvo deve ocorrer por diretório depois da
regularização correspondente, sem desabilitar o gate atual.
