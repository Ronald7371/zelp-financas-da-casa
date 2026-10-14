# Configurar login e sincronização

O app usa Supabase Auth e uma linha JSON por conta. Os dois celulares devem entrar com o mesmo e-mail e senha da conta da casa. A linha é protegida por Row Level Security e só pode ser lida ou alterada pelo usuário autenticado correspondente.

## Criar e configurar o projeto

1. Crie um projeto no Supabase e guarde a senha do banco em um gerenciador de senhas. Essa senha não é usada no app.
2. No painel do Supabase, abra **SQL Editor**, cole `schema.sql` e execute.
3. Em **Authentication → Providers → Email**, habilite e-mail/senha. Para a primeira conta, a confirmação de e-mail pode permanecer habilitada.
4. Em **Database → Publications**, habilite `household_data` na publicação `supabase_realtime` para atualizar o outro celular enquanto o app estiver aberto.
5. Em **Project Settings → API**, copie o **Project URL** e a chave pública **publishable** (ou `anon` legado) para `backend-config.js`:

   ```js
   window.NOSSO_MES_BACKEND = {
     url: 'https://SEU-PROJETO.supabase.co',
     anonKey: 'SUA_CHAVE_PUBLICA'
   };
   ```

6. Publique a pasta `pwa` em HTTPS. Uma forma sem loja de apps é **Cloudflare Pages → Create application → Pages → Direct Upload** e enviar os arquivos da pasta `pwa`; a documentação descreve esse fluxo de arrastar e soltar. Não use `file:///` para login, sincronização ou instalação PWA.
7. Em **Authentication → URL Configuration**, defina a URL publicada como **Site URL** e inclua-a em **Redirect URLs**.
8. Abra o endereço HTTPS em cada celular, crie uma conta no primeiro e use o mesmo e-mail e senha no segundo.
9. No iPhone, abra o endereço no Safari, toque em **Compartilhar → Adicionar à Tela de Início**. No Android, abra no Chrome e escolha **Instalar app** ou **Adicionar à tela inicial**.

## Segurança e dados existentes

- A senha é enviada ao Supabase Auth e não é gravada no JavaScript nem na tabela de dados.
- A chave `publishable`/`anon` é pública por projeto e pode estar no navegador; a proteção é feita pelas políticas RLS do `schema.sql`. Nunca use `service_role` no navegador.
- No primeiro acesso, se ainda não houver dados na nuvem, o app envia a cópia local existente. Se já houver dados na nuvem, o app guarda um backup local em `localStorage` com a chave `nosso-mes:data:v1:backup-before-cloud` e carrega os dados da nuvem.
- O Supabase Free pode pausar projetos inativos por uma semana. Consulte o plano vigente antes de depender do serviço sem interrupções.

Os dados são gravados primeiro neste aparelho e enviados à nuvem automaticamente quando há conexão. Se a conexão cair enquanto o app estiver aberto, ele tenta sincronizar novamente quando a internet voltar. A atualização do outro aparelho ocorre em tempo real quando ambos estão conectados; ao reabrir o app, ele também carrega o estado mais recente.

