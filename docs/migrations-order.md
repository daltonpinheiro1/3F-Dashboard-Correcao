# Ordem das migrations

As versões `025` e `026` deixaram de ser repetidas: o segundo arquivo de cada
par passou a `0251_portabilidade_diagnostico.sql` e
`0261_portabilidade_rpc_apenas.sql`. O SQL não foi executado de novo; só o
nome mudou para o CLI aceitar a pasta. `012b_advertencias_dashboard.sql`
continua fora do padrão `<número>_nome.sql` e o CLI ignora esse arquivo.

Ordem canônica atual:

1. `001_initial_schema.sql`
2. `002_verify_password_rpc.sql`
3. `003_create_user_rpc.sql`
4. `004_login_rpc.sql`
5. `005_fix_rls_anon_read.sql`
6. `006_fix_views_v2.sql`
7. `007_add_data_venda.sql`
8. `008_list_users_rpc.sql`
9. `009_harden_security.sql`
10. `010_fix_login_search_path.sql`
11. `011_create_user_secure.sql`
12. `012_advertencias.sql`
13. `012b_advertencias_dashboard.sql`
14. `013_session_harden.sql`
15. `014_views_security_invoker.sql`
16. `015_advertencias_notificacao_entrega.sql`
17. `016_advertencias_rls_guard.sql`
18. `017_audit_logout_login_lock.sql`
19. `018_dashboard_users_lock_drop_password_rpcs.sql`
20. `019_advertencias_nivel_solicitado.sql`
21. `020_atestados.sql`
22. `021_atestados_extras.sql`
23. `022_atestados_thumb.sql`
24. `023_atestados_smb_queue.sql`
25. `024_atestados_supervisor.sql`
26. `025_advertencias_supervisor.sql`
27. `0251_portabilidade_diagnostico.sql`
28. `026_portabilidade_funil.sql`
29. `0261_portabilidade_rpc_apenas.sql`
30. `027_portabilidade_cohort_universo.sql`
31. `028_portabilidade_cohort_dedup.sql`
32. `029_rr_alert_acks.sql`
33. `030_operacional_intel.sql`
34. `031_fila_acoes_pendente_unica.sql`
35. `032_rr_actions.sql`
36. `033_private_dashboard_sources.sql`
37. `034_dashboard_analytics_rpc.sql`
38. `035_admin_metas_perfis.sql`
39. `036_fix_abas_ambiguous.sql`
40. `037_toutbox_entrega.sql`
41. `038_aba_mailing.sql`
42. `039_fix_slug_ambiguous.sql`
43. `040_hardening_grants_rls.sql` — Dashboard; só depois do deploy do BFF.
44. `041_login_user_hardening.sql` — Dashboard; depois da 040. O `auth-login`
    envia `p_ip` e repete sem ele enquanto a 041 não estiver aplicada.
45. `042_dashboard_analytics_rpc_por_proposta.sql` — Dashboard.
46. `043_portabilidade_norm_key.sql` — **projeto Qigger** (`hatjmfkjnjbghmolveph`),
    não o Dashboard.
47. `044_atestados_periodo_inss.sql` — Dashboard. O CHECK entra `NOT VALID`;
    sanear os períodos invertidos antes do `VALIDATE`.
48. `045_advertencias_notificacao_claim.sql` — Dashboard.
49. `046_rr_indices.sql` — Dashboard.
50. `047_sms_previo_eficiencia_policies_legadas.sql` — Dashboard; remove as
    policies legadas que deixavam anon/authenticated gravar na tabela.
51. `048_policies_legadas_anon.sql` — Dashboard; remove as policies legadas
    inertes de `correcao_logs`, `dashboard_users` e `sms_eficiencia` e revoga os
    privilégios de anon/authenticated nessas tabelas e nas views.
52. `049_portabilidade_matrix_resumo.sql` — **Qigger** (`hatjmfkjnjbghmolveph`);
    índices por `processed_at`/`created_at`/`executed_at` e a RPC
    `portabilidade_matrix_resumo` (decision matrix exata, por proposta). Sem ela o
    `/api/portabilidade-matrix` usa a leitura paginada antiga (truncada).
53. `050_metas_herda_ultima_competencia.sql` — Dashboard.
54. `051_concurrent_sessions_consulta_tim.sql` — Dashboard; sessões concorrentes
    para conta compartilhada (flag `allow_concurrent_sessions`; liga o
    BackOffice testes). Demais usuários seguem 1 sessão.
55. `052_concurrent_sessions_preserve.sql` — Dashboard; no login concorrente
    preserva o nonce anterior em `dashboard_sessions` (evita derrubar quem já
    estava logado) e sobe o teto para 50 sessões.
56. `053_login_user_nonce_ambiguous.sql` — Dashboard; renomeia variável `nonce`
    → `v_nonce` (ERROR 42702 no ON CONFLICT após a 052).
57. `054_concurrent_sessions_unlimited.sql` — Dashboard; contas com
    `allow_concurrent_sessions` (ex.: bko@teste.com) sem teto de sessões.
58. `055_consulta_tim_access_audit.sql` — Dashboard; trilha append-only de
    acesso à Consulta TIM (IP, UA, e-mail) para tentativas fora da rede.

`033_private_dashboard_sources.sql` é uma migration de corte: aplique somente
depois que o bundle em produção estiver usando `/api/eva-data` e
`/api/cubo-query`/`/api/cubo-overview`. Assim o fechamento do bucket/RLS não cria
indisponibilidade.

`034_dashboard_analytics_rpc.sql` prepara a agregação SQL para um corte futuro.
O endpoint atual agrega no Worker com testes de paridade, portanto a aplicação
da migration não altera imediatamente a fonte usada pela interface.

O gate falha se alguma versão numérica voltar a se repetir. Para uma migration
nova, use uma versão inédita maior que a última existente (`055`).

No projeto Dashboard `ayhrwxsxqddpeukydblz`, o histórico remoto foi preenchido
em 17/11/2026 com `001`–`055` mais `0251` e `0261`, marcados como applied sem
reexecutar o SQL. `043` e `049` também constam nesse histórico para o `db push`
do Dashboard não tentar criar objetos do projeto Qigger. Um `db push` novo só
deve levar arquivo com versão ainda ausente dessa lista.
