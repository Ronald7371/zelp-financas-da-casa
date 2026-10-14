# Instruções para reconstruir o Zelp no Lovable

Use os arquivos deste projeto como referência para reconstruir o aplicativo Zelp no Lovable. O projeto original está em HTML, CSS e JavaScript puro; não tente importar a pasta como se fosse um projeto Lovable existente. Analise a interface e o comportamento antes de implementar.

## Objetivo

Criar um app de finanças domésticas compartilhado por um casal, responsivo em celular e computador, instalável como PWA pelo navegador. Não exigir publicação em Play Store ou App Store.

## Funcionalidades que precisam ser preservadas

- Entradas e saídas com descrição, valor, data, categoria e pessoa.
- Resumo mensal de entradas, saídas e saldo calculado apenas a partir dos lançamentos.
- Gastos agrupados por categoria, com totais e opção de abrir os lançamentos do grupo.
- Categorias de despesas: Moradia, Alimentação, Financiamento, Carro/Moto, Cartão de crédito, Dízimos/Ofertas, Lazer, Transporte e Outros; permitir categorias existentes que apareçam no código original.
- Checklist de contas do mês com filtros pendentes, pagas e todas; editar valor variável daquele mês e marcar/desmarcar como paga.
- Contas pendentes ordenadas por vencimento, com aviso visual para atrasadas, vencendo hoje ou em breve.
- Contas fixas recorrentes: usar a base atual para gerar os meses seguintes, sem transformar despesas variáveis em recorrentes automaticamente. Ajustar uma ocorrência não deve alterar o valor-base futuro.
- Contas são lembretes e não podem alterar o saldo nem os totais de entradas/saídas. Uma conta só afeta os totais quando registrada como lançamento de saída, conforme o fluxo do app original.
- Importar XML, HTML e PDF localmente, sugerir contas e permitir revisar/editar antes de salvar. Não enviar o arquivo importado a um servidor. Se PDF depender de biblioteca externa, explicar a limitação para uso offline e permitir edição manual.
- Dicas simples de economia calculadas a partir dos maiores gastos.
- Identidade visual e nome “Zelp”, usando o símbolo/cores dos arquivos de ícone incluídos.
- PWA com manifest, ícones, modo standalone e cache essencial offline.
- Login e sincronização entre os dois usuários da casa com acesso restrito aos dados do mesmo grupo familiar.

## Segurança e dados

Use Supabase Auth e banco de dados com políticas RLS para separar os dados por grupo familiar. Não exponha senhas, tokens privados ou chave `service_role` no navegador. O arquivo `backend-config.js` do projeto original tem campos vazios e não contém credenciais. Solicite a configuração do Supabase pelo mecanismo de secrets/variáveis seguras do Lovable e mantenha somente a chave pública apropriada no cliente. Não invente credenciais.

Não afirme que os dados locais antigos foram migrados: os registros locais do navegador não estão incluídos neste pacote. Preserve a lógica e forneça um caminho explícito para importar dados apenas se for possível ler uma exportação feita pelo usuário.

## Diretrizes de implementação

- Primeiro leia `index.html`, `app.js`, `styles.css`, `compact.css`, `manifest.json`, `service-worker.js` e a pasta `supabase/` para mapear o comportamento atual.
- Reproduza a interface mobile-first, com navegação simples, textos em português do Brasil e valores em reais.
- Converta para a arquitetura suportada pelo Lovable sem remover funcionalidades existentes.
- Antes de finalizar, valide login, isolamento dos dados entre usuários, criação/edição/exclusão de lançamentos, marcação de contas pagas, recorrência mensal, importação, atualização do saldo e instalação PWA.
- Mostre claramente quais configurações externas ainda dependem da dona do projeto e não publique nem compartilhe o app sem autorização explícita.

