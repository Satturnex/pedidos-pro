# Pedidos PRO

Aplicação React + TypeScript + Vite conectada ao Supabase Auth e PostgreSQL. O acesso é restrito a perfis ativos `OWNER` e `ADMIN` em `app_users`. Pedidos, itens, produção, inspeções e entregas são lidos e gravados no Supabase; tema é salvo no navegador.

## Desenvolvimento e validação

```bash
npm install
npm run dev
npm run build
```

Configure `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY` em `.env.local`. Use somente a chave pública anon no frontend; nunca inclua `service_role` no bundle.

## Estado de confiabilidade conhecido

- Envios de pedido, produção, inspeção e entrega têm bloqueio contra cliques repetidos na mesma tela enquanto a requisição está ativa.
- As gravações críticas ainda fazem leituras e escritas separadas no cliente. Isso **não** protege de concorrência entre sessões nem de reenvio após timeout com confirmação perdida.
- Criar pedido e primeiro item, e criar entrega e seus itens, precisam de RPC/transação PostgreSQL para atomicidade. A exclusão compensatória atual não é uma transação.
- Saldo de produção, inspeção e entrega é validado no cliente e pode sofrer corrida. Não há histórico/cancelamento implementado nesta base.
- A tela de relato requer a migração `supabase/migrations/202610140001_user_reports.sql`. Ela não foi executada. Relatos não incluem imagem/anexo e não há painel de acompanhamento/status na interface ainda.
- Não há migrações antigas, configuração de testes ou schema Supabase no repositório. Confirme o schema real, constraints e políticas existentes antes de aplicar a proposta.

## Revisão recomendada do banco

Antes de implantar em produção, audite o schema e RLS atuais. Em seguida, projete RPCs transacionais com uma chave UUID de idempotência gerada por operação, persistida junto à operação e reutilizada em retry; validação de saldo e insert devem ocorrer sob bloqueio por item/pedido. Não crie unicidade em número de pedido/item sem confirmar as regras e os dados legados. Permita múltiplas entregas parciais legítimas. Preserve cancelamentos como eventos/status e não apague o histórico.

A migração de relatos é uma proposta independente e revisável, não aplicada automaticamente. As políticas dependem da tabela `app_users` e dos papéis que o app consulta. Usuários autenticados podem enviar e consultar os próprios relatos; OWNER/ADMIN podem consultar e atualizar os relatos.

## Continuidade e melhorias

Para cada relato: registrar etapa e passos sem dados confidenciais, reproduzir com dados não produtivos, corrigir em alteração revisável, executar build e testes disponíveis, revisar SQL/RLS e diff, então publicar após validação autorizada. Manter aqui o histórico e priorizar:

1. Confirmar e versionar o schema real e RLS do Supabase.
2. Implementar RPCs atômicas/idempotentes para pedido+item, produção, inspeção e entrega.
3. Definir cancelamento auditável e corrigir eventuais inconsistências legadas.
4. Criar acompanhamento de relatos para perfis autorizados e testes automatizados com banco isolado.
5. Revisar deployment, variáveis e backup/recuperação antes da publicação.
