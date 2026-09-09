# Ordem das migrations

Este repositório tem versões históricas repetidas (`025` e `026`) e uma versão
alfanumérica (`012b`). Elas podem já ter sido aplicadas. Portanto, não devem ser
renomeadas sem conferir primeiro a tabela de histórico do ambiente Supabase.

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
27. `025_portabilidade_diagnostico.sql`
28. `026_portabilidade_funil.sql`
29. `026_portabilidade_rpc_apenas.sql`
30. `027_portabilidade_cohort_universo.sql`
31. `028_portabilidade_cohort_dedup.sql`
32. `029_rr_alert_acks.sql`
33. `030_operacional_intel.sql`
34. `031_fila_acoes_pendente_unica.sql`
35. `032_rr_actions.sql`
36. `033_private_dashboard_sources.sql`
37. `034_dashboard_analytics_rpc.sql`

`033_private_dashboard_sources.sql` é uma migration de corte: aplique somente
depois que o bundle em produção estiver usando `/api/eva-data` e
`/api/cubo-query`/`/api/cubo-overview`. Assim o fechamento do bucket/RLS não cria
indisponibilidade.

`034_dashboard_analytics_rpc.sql` prepara a agregação SQL para um corte futuro.
O endpoint atual agrega no Worker com testes de paridade, portanto a aplicação
da migration não altera imediatamente a fonte usada pela interface.

O gate aceita somente os dois conjuntos duplicados acima e falha se surgir
outra versão repetida ou se esses conjuntos mudarem. Para uma migration nova,
use uma versão inédita maior que a última existente. Antes de qualquer correção
do histórico, compare esta lista com as migrations registradas no projeto
Supabase `ayhrwxsxqddpeukydblz`.
