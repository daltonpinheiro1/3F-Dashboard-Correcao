# Corte de sessão para cookie HttpOnly

1. Publique o bundle com `/api/auth-login` e `/api/auth-bootstrap`.
2. Mantenha `ALLOW_LEGACY_SESSION_HEADERS=true` por uma janela de 12 horas.
3. Confirme nos logs que não há chamadas relevantes a `/api/auth-bootstrap`.
4. Defina `ALLOW_LEGACY_SESSION_HEADERS=false` no Pages.
5. Valide login, logout, `/api/eva-data` e `/api/cubo-overview`.

O cookie `__Host-3f-dashboard-session` tem precedência sobre os headers legados.
Novos logins nunca recebem o nonce no corpo da resposta. Após o bootstrap, o
cliente também remove o nonce legado da memória.
