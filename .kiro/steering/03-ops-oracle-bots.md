---
inclusion: always
---

# Segurança, Oracle VM e bots de streaming

## Dashboard (Pages)
- Sem secrets no bundle; OpenAI só em Pages Function + secret CF
- Auth atual é client-only (localStorage) — gap conhecido; não confiar para dados sensíveis além do já público no Storage EVA
- Nunca logar CPF/telefone completo em insight IA

## Oracle Linux (bots — `3F_ISize_Bot_Processamento/deploy`)
- `setup_oracle.sh`: venv, systemd, DB local
- `cleanup_24h.sh`: retenção 24h, VACUUM SQLite, rotação de log **in-place** (preserva inode)
- Sempre: kill fantasmas, cleanup de deploys antigos, restart com limpeza de memória

Checklist pós-deploy bot:
1. `systemctl restart <servico>`
2. `pgrep -af python` → matar PIDs órfãos do mesmo script
3. Truncar/rotacionar logs sem `mv` que quebra FD
4. Remover artefatos `.old` / builds antigos em `/home/ubuntu/*/dist*` se aplicável
5. Validar `sync_eva_operacao` lock file + atexit

## Scraping / automação (escolhe a ferramenta certa)
| Caso | Preferência | Motivo |
|------|-------------|--------|
| iSize HTML listagens, poucas abas | httpx + parse | Leve, estável no cron |
| Fluxo com JS pesado / login complexo | Playwright | Paralelismo, auto-wait, CI |
| Legado IE/ActiveX / Windows desktop bridge | Selenium (último recurso) | Mais pesado |
| Multi-aba iSize (litab4/6/8) | httpx paralelo controlado | Já validado no sync |

Prioridade: performance + paralelismo com teto de concorrência + cleanup de browser contexts.
