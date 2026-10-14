# Zelp — PWA de finanças da casa

Aplicativo web responsivo em HTML, CSS e JavaScript puro. Não precisa de Play Store ou App Store. O manifest configura a instalação como aplicativo e o service worker guarda os arquivos da interface para abrir sem internet depois da primeira visita.

## Estrutura

```text
pwa/
├── index.html          Tela, formulários e navegação
├── styles.css          Layout mobile-first e estilos
├── compact.css         Lista de lançamentos compacta
├── app.js              Lançamentos, contas, resumos e armazenamento local
├── backend-config.js   URL e chave pública do backend (sem senha)
├── manifest.json       Nome, ícones, cores e modo standalone
├── service-worker.js   Cache offline dos arquivos essenciais
├── supabase/schema.sql Segurança da tabela e permissões RLS
└── icons/
    ├── icon.svg
    ├── icon-192.png
    └── icon-512.png
```

## O que já funciona

- Registrar entradas e saídas com data, categoria e pessoa.
- Ver entradas, saídas e saldo por mês, além das categorias com maior gasto.
- Consultar todos os lançamentos do mês agrupados por categoria, com quantidade e subtotais; abrir um grupo para ver cada registro.
- Categorizar gastos com Alimentação, Financiamento, Carro/Moto, Cartão de crédito, Dízimos/Ofertas e Lazer.
- Ver todas as contas pendentes em ordem de vencimento, da data mais próxima para a mais distante.
- Separar contas pagas e pendentes com checklist, e criar contas recorrentes que aparecem automaticamente nos meses seguintes.
- Acompanhar o total previsto que ainda falta pagar no resumo e gerenciar contas e movimentações no mesmo painel. As contas são lembretes: o saldo e os totais continuam considerando somente lançamentos de entrada e saída.
- Excluir contas do checklist; ao excluir uma recorrente, ela deixa de aparecer nos meses futuros.
- Converter uma conta já cadastrada em recorrente a partir do mês seguinte, ou cadastrar uma nova conta já como mensal.
- Usar um lançamento de saída existente como base para uma conta fixa mensal futura; ajustar o valor de cada ocorrência do mês sem alterar o valor-base dos meses seguintes.
- Cadastrar contas com vencimento; contas atrasadas, que vencem hoje ou nos próximos cinco dias recebem um destaque visual.
- Marcar conta como paga e receber dicas simples calculadas a partir da categoria com maior gasto.
- Importar arquivos XML, HTML e PDF e revisar sugestões de contas antes de adicioná-las ao checklist; contas selecionadas podem virar uma base recorrente mensal.
- Guardar dados localmente primeiro e sincronizar com a conta autenticada quando o backend estiver configurado.
- Abrir a interface em cache quando estiver offline, depois da primeira visita online.

## Importante sobre dados e sincronização

O login e a sincronização usam Supabase Auth e uma tabela protegida por Row Level Security. Usem a mesma conta da casa nos dois aparelhos. Antes da configuração, o app continua em modo local. Siga `supabase/README.md` para criar o backend e preencher `backend-config.js`. A planilha Google não é lida nem alterada por esta versão.

O plano grátis do Supabase inclui autenticação e banco de dados dentro dos limites publicados, mas projetos gratuitos podem pausar após uma semana sem atividade. A hospedagem PWA também deve ser HTTPS; por exemplo, Cloudflare Pages oferece um plano gratuito com limites publicados. Confira os planos e limites atuais antes de depender deles continuamente.

## Servir e instalar

O endereço `file:///.../index.html` não serve para instalar um PWA. Sirva a pasta `pwa` por HTTPS (ou use `localhost` durante desenvolvimento). Abra o endereço no navegador e instale pelo menu do navegador. No iPhone/iPad, use **Compartilhar → Adicionar à Tela de Início** no Safari. O service worker só registra em HTTPS ou localhost.

## Offline e alertas

O cache offline cobre os arquivos da interface. Com uma sessão autenticada aberta, alterações são salvas neste aparelho; se a conexão cair, o app tenta enviá-las quando a internet voltar. O app carrega os dados mais recentes ao abrir e recebe atualizações em tempo real se a tabela estiver habilitada no Supabase. Os avisos de vencimento aparecem dentro do app; notificações em segundo plano exigem serviço adicional.

## Importação de contas

XML e HTML são lidos localmente no navegador. A importação sugere linhas que contenham descrição, valor e vencimento; confira e edite cada sugestão antes de salvar. O usuário escolhe se cada item entra como conta do mês ou como modelo recorrente mensal. O arquivo não é enviado para um servidor. A extração de texto de PDF usa PDF.js carregado por HTTPS, então requer que o app esteja hospedado em HTTPS; não funciona quando aberto diretamente por `file://`. PDFs digitalizados como imagem precisam de OCR, que ainda não está incluído.

