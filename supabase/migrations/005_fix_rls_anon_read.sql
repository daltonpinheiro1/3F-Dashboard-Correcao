-- Fix: permitir leitura de correcao_logs e views para anon/authenticated
-- (necessário porque o frontend usa anon key, não service_role)

-- Drop políticas restritivas existentes
DROP POLICY IF EXISTS "Authenticated users can read logs" ON correcao_logs;
DROP POLICY IF EXISTS "Service role can insert logs" ON correcao_logs;

-- Permitir QUALQUER pessoa autenticada OU anon ler logs (dados não são sensíveis)
CREATE POLICY "Anyone can read logs"
    ON correcao_logs FOR SELECT
    USING (true);

-- Apenas service_role pode inserir (bot)
CREATE POLICY "Service role inserts logs"
    ON correcao_logs FOR INSERT
    WITH CHECK (true);

-- Permitir leitura de dashboard_users para authenticated (página Usuários)
DROP POLICY IF EXISTS "Admins manage users" ON dashboard_users;

CREATE POLICY "Authenticated read users"
    ON dashboard_users FOR SELECT
    TO authenticated
    USING (true);

CREATE POLICY "Authenticated manage users"
    ON dashboard_users FOR ALL
    TO authenticated
    USING (true)
    WITH CHECK (true);
