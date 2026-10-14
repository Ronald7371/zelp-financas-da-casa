# Configurar login e sincronização

O app usa Supabase Auth e uma linha JSON por conta. Os dois celulares devem entrar com o mesmo e-mail e senha da conta da casa. A linha é protegida por Row Level Security e só pode ser lida ou alterada pelo usuário autenticado correspondente.

## Criar e configurar o projeto

1. Crie um projeto no Supabase e guarde a senha do banco em um gerenciador de senhas. Essa senha não é usada no app.
2. No painel do Supabase, abra **SQL Editor**, cole `schema.sql` e execute.
3. Em **Authentication → Providers → Email**, habilite e-mail/senha e mantenha **Confirm email** ativado. A pessoa confirma pelo link recebido e depois entra com a senha.
4. Em **Database → Publications**, habilite `household_data` na publicação `supabase_realtime` para atualizar o outro celular enquanto o app estiver aberto.
5. Em **Project Settings → API**, copie o **Project URL** e a chave pública **publishable** (ou `anon` legado) para `backend-config.js`:

   ```js
   window.NOSSO_MES_BACKEND = {
     url: 'https://SEU-PROJETO.supabase.co',
     anonKey: 'SUA_CHAVE_PUBLICA'
   };
   ```

6. Publique a pasta `pwa` em um endereço HTTPS. Para publicar atualizações automaticamente a partir do GitHub, conecte o repositório privado `Ronald7371/zelp-financas-da-casa` ao Cloudflare Pages e configure a raiz de saída como `/` (os arquivos do app estão na raiz do repositório publicado). Não use `file:///` para login, sincronização ou instalação PWA.
7. Em **Authentication → URL Configuration**, defina o endereço HTTPS publicado como **Site URL** e inclua também `https://SEU-ENDERECO/**` em **Redirect URLs** para os links de confirmação voltarem ao app.
8. Abra o endereço HTTPS em cada celular, crie uma conta no primeiro e use o mesmo e-mail e senha no segundo.
9. No iPhone, abra o endereço no Safari, toque em **Compartilhar → Adicionar à Tela de Início**. No Android, abra no Chrome e escolha **Instalar app** ou **Adicionar à tela inicial**.

## Cadastro por e-mail e privacidade

- Cada e-mail cria uma conta Supabase separada, com seus próprios lançamentos, contas e pagamentos. Uma conta não enxerga os dados de outra.
- Para a mesma pessoa consultar e editar em vários aparelhos, ela entra em todos com o mesmo e-mail e senha. Se duas pessoas quiserem compartilhar os mesmos dados entre e-mails diferentes, será necessário implementar convite e associação de membros da casa; isso não está habilitado nesta versão.
- Configure um servidor SMTP próprio em **Authentication → SMTP Settings** antes de convidar amigos e familiares. O remetente padrão do Supabase tem limites de envio e normalmente só entrega para endereços previamente autorizados no projeto; sem SMTP, a confirmação pode não chegar aos testadores.
- Use um remetente de e-mail que você controla e faça um teste de cadastro, confirmação e reenvio antes de compartilhar o link.

## Segurança e dados existentes

- A senha é enviada ao Supabase Auth e não é gravada no JavaScript nem na tabela de dados.
- A chave `publishable`/`anon` é pública por projeto e pode estar no navegador; a proteção é feita pelas políticas RLS do `schema.sql`. Nunca use `service_role` no navegador.
- No primeiro acesso, se ainda não houver dados na nuvem, o app pode importar os dados locais deste aparelho para a primeira conta que o utilizar. Ao trocar de conta no aparelho, dados pertencentes à conta anterior ficam separados e a nova conta começa vazia. Se já houver dados na nuvem, o app carrega essa cópia e guarda localmente um backup quando aplicável.
- O Supabase Free pode pausar projetos inativos por uma semana. Consulte o plano vigente antes de depender do serviço sem interrupções.

Os dados são gravados primeiro neste aparelho e enviados à nuvem automaticamente quando há conexão. Se a conexão cair enquanto o app estiver aberto, ele tenta sincronizar novamente quando a internet voltar. A atualização do outro aparelho ocorre em tempo real quando ambos estão conectados; ao reabrir o app, ele também carrega o estado mais recente.
