(() => {
  const STORE_KEY = 'nosso-mes:data:v1';
  const CLOUD_OWNER_KEY = `${STORE_KEY}:cloud-owner`;
  const money = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
  const today = new Date();
  const isoToday = localDate(today);
  const byId = id => document.getElementById(id);
  const emptyState = () => ({ transactions: [], bills: [], recurringBills: [], billPayments: {}, billAmounts: {} });
  let state = loadState();
  let billFilter = 'pending';
  let installPrompt = null;
  let toastTimer;
  let importFile = null;
  let pendingImports = [];
  let cloud = null;
  let cloudUser = null;
  let authMode = 'signin';
  let cloudTimer = null;
  let cloudChannel = null;
  let cloudBusy = false;

  function localDate(date) {
    const y = date.getFullYear(); const m = String(date.getMonth() + 1).padStart(2, '0'); const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  function loadState() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORE_KEY));
      const transactions = (saved.transactions || []).map(item => {
        if (item.type !== 'expense') return item;
        const description = String(item.description || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR');
        let category = item.category;
        if (/^financiamento\b/.test(description)) category = 'Financiamento';
        else if (/^alimentacao\b/.test(description)) category = 'Alimentação';
        else if (/^(dizimo|oferta)\b/.test(description)) category = 'Dízimos/Ofertas';
        else if (/\b(carro|moto)\b/.test(description)) category = 'Carro/Moto';
        else if (/^cartao\b/.test(description)) category = 'Cartão de crédito';
        return category === item.category ? item : { ...item, category };
      });
      return { ...emptyState(), ...saved, transactions, bills: Array.isArray(saved.bills) ? saved.bills : [], recurringBills: saved.recurringBills || [], billPayments: saved.billPayments || {}, billAmounts: saved.billAmounts || {} };
    }
    catch { return emptyState(); }
  }
  function saveState() {
    localStorage.setItem(STORE_KEY, JSON.stringify(state)); render();
    if (cloud && cloudUser) {
      clearTimeout(cloudTimer);
      cloudTimer = setTimeout(() => syncCloudState(), 450);
      setSyncStatus('Salvo neste aparelho…');
    }
  }
  function setSyncStatus(message) { byId('sync-status').innerHTML = `<i></i>${escapeHtml(message)}`; }
  function normalizeCloudState(data) {
    if (!data || typeof data !== 'object') return emptyState();
    return { ...emptyState(), ...data, transactions: Array.isArray(data.transactions) ? data.transactions : [], bills: Array.isArray(data.bills) ? data.bills : [], recurringBills: Array.isArray(data.recurringBills) ? data.recurringBills : [], billPayments: data.billPayments && typeof data.billPayments === 'object' ? data.billPayments : {}, billAmounts: data.billAmounts && typeof data.billAmounts === 'object' ? data.billAmounts : {} };
  }
  async function storeCloudState(snapshot = state) {
    if (!cloud || !cloudUser) return;
    const { error } = await cloud.from('household_data').upsert({ user_id: cloudUser.id, data: snapshot, updated_at: new Date().toISOString() });
    if (error) throw error;
  }
  async function syncCloudState() {
    if (!cloud || !cloudUser) return;
    if (cloudBusy) { cloudTimer = setTimeout(() => syncCloudState(), 500); return; }
    cloudBusy = true;
    const snapshot = JSON.parse(JSON.stringify(state));
    try {
      await storeCloudState(snapshot);
      setSyncStatus('Sincronizado');
    } catch (error) {
      setSyncStatus('Aguardando conexão');
      console.error('Falha ao sincronizar:', error);
    } finally { cloudBusy = false; }
  }
  async function resetAppData() {
    const confirmed = confirm('Apagar todos os lançamentos, contas do mês, contas recorrentes e registros de pagamento? Essa ação não pode ser desfeita.');
    if (!confirmed) return;

    clearTimeout(cloudTimer);
    while (cloudBusy) await new Promise(resolve => setTimeout(resolve, 50));
    clearTimeout(cloudTimer);

    state = emptyState();
    localStorage.setItem(STORE_KEY, JSON.stringify(state));
    for (const key of Object.keys(localStorage)) {
      if (key.startsWith(`${STORE_KEY}:backup`)) localStorage.removeItem(key);
    }
    render();

    if (cloud && cloudUser) {
      try {
        await storeCloudState(state);
        setSyncStatus('Sincronizado');
        toast('Dados apagados neste aparelho e na conta compartilhada.');
      } catch (error) {
        setSyncStatus('Falha ao sincronizar');
        toast('Apaguei os dados deste aparelho, mas não consegui limpar a cópia online. Conecte-se e tente novamente.');
        console.error('Falha ao limpar dados sincronizados:', error);
      }
    } else {
      toast('Dados deste aparelho apagados.');
    }
  }
  async function loadCloudState() {
    const { data: row, error } = await cloud.from('household_data').select('data').eq('user_id', cloudUser.id).maybeSingle();
    if (error) throw error;
    const storedOwner = localStorage.getItem(CLOUD_OWNER_KEY);
    let local = loadState();
    if (storedOwner && storedOwner !== cloudUser.id) {
      const backupKey = `${STORE_KEY}:backup-user-${storedOwner}`;
      if ((local.transactions.length || local.bills.length || local.recurringBills.length) && !localStorage.getItem(backupKey)) {
        localStorage.setItem(backupKey, JSON.stringify(local));
      }
      local = emptyState();
    }
    if (row?.data) {
      if (local.transactions.length || local.bills.length || local.recurringBills.length) {
        const backupKey = `${STORE_KEY}:backup-before-cloud`;
        if (!localStorage.getItem(backupKey)) localStorage.setItem(backupKey, JSON.stringify(local));
      }
      state = normalizeCloudState(row.data);
      localStorage.setItem(STORE_KEY, JSON.stringify(state));
      render();
    } else {
      state = normalizeCloudState(local);
      await storeCloudState(state);
      localStorage.setItem(STORE_KEY, JSON.stringify(state));
    }
    localStorage.setItem(CLOUD_OWNER_KEY, cloudUser.id);
    setSyncStatus('Sincronizado');
    byId('account-button').textContent = 'Sair';
    document.body.classList.remove('auth-required');
    byId('auth-dialog').close();
    subscribeCloud();
  }
  function subscribeCloud() {
    if (cloudChannel) cloud.removeChannel(cloudChannel);
    cloudChannel = cloud.channel(`household-${cloudUser.id}`).on('postgres_changes', { event: '*', schema: 'public', table: 'household_data', filter: `user_id=eq.${cloudUser.id}` }, async () => {
      if (cloudTimer || cloudBusy) return;
      const { data: row, error } = await cloud.from('household_data').select('data').eq('user_id', cloudUser.id).maybeSingle();
      if (!error && row?.data) {
        const incoming = normalizeCloudState(row.data);
        if (JSON.stringify(incoming) !== JSON.stringify(state)) {
          state = incoming; localStorage.setItem(STORE_KEY, JSON.stringify(state)); render();
        }
        setSyncStatus('Sincronizado');
      }
    }).subscribe();
  }
  async function initializeCloud() {
    const config = window.NOSSO_MES_BACKEND || {};
    if (!config.url || !config.anonKey) { setSyncStatus('Só neste aparelho'); byId('privacy-note').textContent = 'Modo local: os dados ficam neste aparelho. Configure o backend para compartilhar entre celulares.'; return; }
    byId('privacy-note').textContent = 'Os dados são salvos neste aparelho e sincronizados com a conta da casa quando você entra e está conectado à internet.';
    document.body.classList.add('auth-required');
    byId('auth-close').hidden = true;
    if (!window.supabase?.createClient) { setSyncStatus('Backend indisponível'); byId('auth-message').textContent = 'Não foi possível carregar o serviço de login. Verifique a conexão com a internet e recarregue.'; byId('auth-dialog').showModal(); return; }
    try { cloud = window.supabase.createClient(config.url, config.anonKey); }
    catch (error) { setSyncStatus('Configuração inválida'); byId('auth-message').textContent = error instanceof Error ? error.message : 'Confira o Project URL no backend-config.js.'; byId('auth-dialog').showModal(); return; }
    setSyncStatus('Verificando acesso…');
    const { data, error } = await cloud.auth.getSession();
    if (error) { setSyncStatus('Erro de conexão'); byId('auth-message').textContent = 'Não consegui verificar sua sessão. Confira a internet e tente entrar novamente.'; byId('auth-dialog').showModal(); return; }
    if (data.session) {
      cloudUser = data.session.user;
      try { await loadCloudState(); }
      catch (loadError) { setSyncStatus('Falha ao carregar'); byId('auth-message').textContent = 'Não consegui acessar a tabela do app. Confira o SQL de configuração no arquivo supabase/README.md.'; byId('auth-dialog').showModal(); console.error(loadError); }
    } else {
      byId('auth-dialog').showModal();
      setSyncStatus('Entre para sincronizar');
    }
  }
  function parseAmount(value) {
    const raw = String(value || '').trim().replace(/\s/g, '');
    const hasComma = raw.includes(',');
    const hasDot = raw.includes('.');
    let normalized = raw;
    if (hasComma && hasDot) normalized = raw.lastIndexOf(',') > raw.lastIndexOf('.') ? raw.replace(/\./g, '').replace(',', '.') : raw.replace(/,/g, '');
    else if (hasComma) normalized = raw.replace(/\./g, '').replace(',', '.');
    else if (hasDot && /^\d{1,3}(?:\.\d{3})+$/.test(raw)) normalized = raw.replace(/\./g, '');
    const amount = Number(normalized);
    return Number.isFinite(amount) && amount > 0 ? amount : NaN;
  }
  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);
  }
  function formatDate(date) {
    if (!date) return '';
    const [y, m, d] = date.split('-');
    return `${d}/${m}`;
  }
  function daysUntil(dateString) {
    const target = new Date(`${dateString}T12:00:00`);
    const now = new Date(); now.setHours(12, 0, 0, 0);
    return Math.round((target - now) / 86400000);
  }
  function monthKey(date) { return date.slice(0, 7); }
  function nextMonthKey(month) {
    const [year, monthNumber] = month.split('-').map(Number);
    const next = new Date(year, monthNumber, 1);
    return `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}`;
  }
  function nextAvailableMonth(date) {
    const afterBase = nextMonthKey(monthKey(date));
    const afterCurrent = nextMonthKey(monthKey(isoToday));
    return afterBase > afterCurrent ? afterBase : afterCurrent;
  }
  function formatMonth(month) { const [year, number] = month.split('-'); return `${number}/${year}`; }
  function selectedMonth() { return byId('month-picker').value || monthKey(isoToday); }
  function toast(message) {
    const box = byId('toast'); box.textContent = message; box.classList.add('show');
    clearTimeout(toastTimer); toastTimer = setTimeout(() => box.classList.remove('show'), 2600);
  }
  function escapeSelector(value) { return CSS.escape(value); }

  function render() {
    const people = [...new Set(['Casa', ...state.transactions.map(item => item.person), ...state.bills.map(item => item.person), ...state.recurringBills.map(item => item.person)].filter(Boolean))];
    let peopleOptions = byId('people-options');
    if (!peopleOptions) {
      peopleOptions = document.createElement('datalist');
      peopleOptions.id = 'people-options';
      document.body.appendChild(peopleOptions);
    }
    document.querySelectorAll('select[name="person"]').forEach(select => {
      const input = document.createElement('input');
      input.name = 'person'; input.value = 'Casa'; input.maxLength = 70;
      input.setAttribute('list', 'people-options');
      input.placeholder = 'Digite ou escolha um nome';
      select.replaceWith(input);
    });
    peopleOptions.innerHTML = people.map(person => `<option value="${escapeHtml(person)}"></option>`).join('');
    const month = selectedMonth();
    const txs = state.transactions.filter(item => monthKey(item.date) === month).sort((a, b) => b.date.localeCompare(a.date));
    const incomes = txs.filter(item => item.type === 'income').reduce((sum, item) => sum + item.amount, 0);
    const expenses = txs.filter(item => item.type === 'expense').reduce((sum, item) => sum + item.amount, 0);
    byId('income-value').textContent = money.format(incomes);
    byId('expense-value').textContent = money.format(expenses);
    byId('balance-value').textContent = money.format(incomes - expenses);
    byId('balance-note').textContent = incomes - expenses < 0 ? 'Atenção: saídas acima das entradas' : 'Entradas menos saídas';

    const monthBills = billsForMonth(month);
    const paidBills = monthBills.filter(item => item.paid === true);
    const pendingBills = monthBills.filter(item => item.paid !== true);
    const pendingAmount = pendingBills.reduce((sum, item) => sum + (Number(item.amount) || 0), 0);
    byId('pending-bills-summary').textContent = `Falta pagar: ${money.format(pendingAmount)} · ${pendingBills.length} conta${pendingBills.length === 1 ? '' : 's'}`;
    const bills = (billFilter === 'all' ? monthBills : billFilter === 'paid' ? paidBills : pendingBills)
      .slice().sort((a, b) => a.dueDate.localeCompare(b.dueDate) || a.name.localeCompare(b.name, 'pt-BR'));
    document.querySelectorAll('[data-bill-filter]').forEach(button => button.classList.toggle('active', button.dataset.billFilter === billFilter));
    const billsList = byId('bills-list');
    byId('bills-count').textContent = `${paidBills.length} de ${monthBills.length} pagas · ${pendingBills.length} pendentes`;
    if (!bills.length) billsList.innerHTML = `<div class="empty-state"><strong>${monthBills.length ? 'Nenhuma conta nesta lista.' : 'Nenhuma conta cadastrada para este mês.'}</strong>${monthBills.length ? 'Troque o filtro para ver as outras contas.' : 'Adicione uma conta e marque a opção mensal para repetir.'}</div>`;
    else billsList.innerHTML = bills.map(bill => {
      const days = daysUntil(bill.dueDate);
      const status = bill.paid ? '<span class="status-pill paid">Paga</span>' : days < 0 ? `<span class="status-pill late">Atrasada ${Math.abs(days)}d</span>` : days === 0 ? '<span class="status-pill soon">Vence hoje</span>' : days <= 5 ? `<span class="status-pill soon">Em ${days} dia${days === 1 ? '' : 's'}</span>` : `<span class="status-pill">Vence ${formatDate(bill.dueDate)}</span>`;
      const key = bill.recurring ? `repeat:${bill.templateId}:${month}` : `bill:${bill.id}`;
      const amount = `<input class="bill-amount-input" type="number" min="0" step="0.01" inputmode="decimal" data-bill-amount="${escapeHtml(key)}" value="${bill.amount ? Number(bill.amount).toFixed(2) : ''}" aria-label="Valor de ${escapeHtml(bill.name)}" placeholder="0,00">`;
      const recurrence = bill.recurring ? ' · mensal' : bill.repeatsAsId ? ` · mensal a partir de ${formatMonth(state.recurringBills.find(item => item.id === bill.repeatsAsId)?.startMonth || month)}` : '';
      const makeRecurring = !bill.recurring && !bill.repeatsAsId ? `<button class="repeat-button" data-repeat-bill="${escapeHtml(bill.id)}">Tornar mensal</button>` : '';
      const deleteKey = bill.recurring ? `data-delete-recurring-bill="${escapeHtml(bill.templateId)}"` : `data-delete-bill="${escapeHtml(bill.id)}"`;
      return `<div class="bill-row ${bill.paid ? 'bill-paid' : ''}"><label class="paid-check"><input type="checkbox" data-paid-toggle="${escapeHtml(key)}" ${bill.paid ? 'checked' : ''} aria-label="Marcar ${escapeHtml(bill.name)} como paga"><span aria-hidden="true"></span></label><div class="item-details"><strong>${escapeHtml(bill.name)}</strong><small>${escapeHtml(bill.person)} · vence ${formatDate(bill.dueDate)}${recurrence}</small>${makeRecurring}</div><div class="item-value">${amount}<small>${status}</small></div><button class="pay-button bill-delete" ${deleteKey} aria-label="Excluir conta ${escapeHtml(bill.name)}">Apagar</button></div>`;
    }).join('');

    const txList = byId('transactions-list');
    if (!txs.length) txList.innerHTML = '<div class="empty-state"><strong>Seu mês começa com um registro.</strong>Inclua uma entrada ou saída para ver o resumo.</div>';
    else {
      const groups = new Map();
      txs.forEach(item => {
        if (!groups.has(item.category)) groups.set(item.category, []);
        groups.get(item.category).push(item);
      });
      const orderedGroups = [...groups.entries()].sort((a, b) => {
        const totalA = a[1].reduce((sum, item) => sum + item.amount, 0);
        const totalB = b[1].reduce((sum, item) => sum + item.amount, 0);
        return totalB - totalA;
      });
      txList.innerHTML = orderedGroups.map(([category, items]) => {
        const spent = items.filter(item => item.type === 'expense').reduce((sum, item) => sum + item.amount, 0);
        const received = items.filter(item => item.type === 'income').reduce((sum, item) => sum + item.amount, 0);
        const totalsLabel = [spent ? `− ${money.format(spent)}` : '', received ? `+ ${money.format(received)}` : ''].filter(Boolean).join(' · ');
        const rows = items.map(item => {
          const recurringAction = item.type !== 'expense' ? '' : item.repeatAccountId
            ? '<small class="fixed-note">Conta fixa mensal</small>'
            : `<button class="repeat-button" data-repeat-transaction="${escapeHtml(item.id)}">Usar como conta fixa mensal</button>`;
          return `<div class="transaction-row"><span class="item-icon ${item.type}" aria-hidden="true">${item.type === 'income' ? '↗' : '↘'}</span><div class="item-details"><strong>${escapeHtml(item.description)}</strong><small>${escapeHtml(item.person)} · ${formatDate(item.date)}</small>${recurringAction}</div><div class="item-value">${item.type === 'income' ? '+' : '−'} ${money.format(item.amount)}</div><button class="pay-button" data-delete="${escapeHtml(item.id)}" aria-label="Excluir lançamento ${escapeHtml(item.description)}">Excluir</button></div>`;
        }).join('');
        return `<details class="transaction-group"><summary><span class="group-name">${escapeHtml(category)}</span><span class="group-count">${items.length} lançamento${items.length === 1 ? '' : 's'}</span><span class="group-total">${totalsLabel}</span></summary><div class="transaction-group-items">${rows}</div></details>`;
      }).join('');
    }
    byId('transactions-count').textContent = `${txs.length} lançamento${txs.length === 1 ? '' : 's'} incluído${txs.length === 1 ? '' : 's'} nos totais`;

    const totals = new Map();
    txs.filter(item => item.type === 'expense').forEach(item => totals.set(item.category, (totals.get(item.category) || 0) + item.amount));
    const spending = [...totals.entries()].sort((a, b) => b[1] - a[1]);
    const spendingList = byId('spending-list');
    if (!spending.length) spendingList.innerHTML = '<div class="empty-state">Seus gastos por categoria aparecem aqui.</div>';
    else spendingList.innerHTML = spending.slice(0, 5).map(([category, amount]) => `<div class="spending-row"><div class="spending-label"><span>${escapeHtml(category)}</span><span>${money.format(amount)}</span></div><div class="progress-track"><div class="progress-fill" style="width:${Math.max(5, Math.round(amount / spending[0][1] * 100))}%"></div></div></div>`).join('');
    renderTip(spending, expenses, incomes);
  }

  function billsForMonth(month) {
    const oneOff = state.bills.filter(item => monthKey(item.dueDate) === month).map(item => ({ ...item, paid: Boolean(item.paid), recurring: false }));
    const recurring = state.recurringBills
      .filter(item => month >= item.startMonth)
      .map(item => {
        const [year, monthNumber] = month.split('-').map(Number);
        const lastDay = new Date(year, monthNumber, 0).getDate();
        const day = Math.min(item.dueDay, lastDay);
        const dueDate = `${month}-${String(day).padStart(2, '0')}`;
        const key = `repeat:${item.id}:${month}`;
        return { ...item, templateId: item.id, id: key, dueDate, amount: Object.prototype.hasOwnProperty.call(state.billAmounts, key) ? state.billAmounts[key] : item.amount, recurring: true, paid: Boolean(state.billPayments[key]) };
      });
    return [...oneOff, ...recurring];
  }

  function parseImportedDate(text) {
    let match = text.match(/\b(20\d{2})[-/](\d{1,2})[-/](\d{1,2})\b/);
    let year; let month; let day;
    if (match) [, year, month, day] = match;
    else {
      match = text.match(/\b(\d{1,2})[/.\-](\d{1,2})(?:[/.\-](\d{2,4}))?\b/);
      if (!match) return null;
      [, day, month, year] = match;
      year = year ? (year.length === 2 ? `20${year}` : year) : String(new Date().getFullYear());
    }
    const y = Number(year); const m = Number(month); const d = Number(day);
    const date = new Date(y, m - 1, d);
    return date.getFullYear() === y && date.getMonth() === m - 1 && date.getDate() === d ? `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}` : null;
  }
  function parseImportedAmount(text) {
    const currency = text.match(/R\$\s*([\d.]+(?:,\d{2})?)/i);
    const number = currency || text.match(/\b(?:\d{1,3}(?:\.\d{3})+|\d+)(?:,\d{2}|\.\d{2})\b/);
    if (!number) return null;
    const token = currency ? currency[1] : number[0];
    const amount = token.includes(',') ? parseAmount(token) : Number(token.replace(/,/g, ''));
    return Number.isFinite(amount) && amount > 0 ? amount : null;
  }
  function textIsBillRow(text) { return Boolean(parseImportedDate(text) && parseImportedAmount(text)); }
  function candidateFromText(text, filename) {
    const amount = parseImportedAmount(text);
    const dueDate = parseImportedDate(text);
    if (!amount || !dueDate) return null;
    const currency = text.match(/R\$\s*[\d.]+(?:,\d{2})?/i)?.[0] || text.match(/\b(?:\d{1,3}(?:\.\d{3})+|\d+)(?:,\d{2}|\.\d{2})\b/)?.[0] || '';
    const dateText = text.match(/\b(?:20\d{2}[-/]\d{1,2}[-/]\d{1,2}|\d{1,2}[/.\-]\d{1,2}(?:[/.\-]\d{2,4})?)\b/)?.[0] || '';
    const name = text.replace(currency, ' ').replace(dateText, ' ').replace(/\b(vencimento|venc|due date|valor|total|a pagar|conta|fatura|data)\b/gi, ' ').replace(/R\$/gi, ' ').replace(/[|:;\s]+/g, ' ').trim();
    const fallback = filename.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim();
    return { id: crypto.randomUUID(), name: (name || fallback || 'Conta importada').slice(0, 70), amount, dueDate, person: 'Casa', recurring: false, include: true };
  }
  function normalizeAccountTitle(value) {
    return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR').replace(/[^a-z0-9]+/g, ' ').trim();
  }
  function parseCsvLine(line, delimiter) {
    const cells = []; let value = ''; let quoted = false;
    for (let index = 0; index < line.length; index++) {
      const char = line[index];
      if (char === '"' && quoted && line[index + 1] === '"') { value += '"'; index++; }
      else if (char === '"') quoted = !quoted;
      else if (char === delimiter && !quoted) { cells.push(value.trim()); value = ''; }
      else value += char;
    }
    cells.push(value.trim());
    return cells;
  }
  function parseCsvCandidates(source) {
    const lines = source.replace(/^\uFEFF/, '').split(/\r?\n/).map(line => line.trim()).filter(line => line && !line.startsWith('#'));
    if (lines.length < 2) throw new Error('O CSV precisa ter o cabeçalho e ao menos uma linha de conta.');
    const firstLine = lines[0];
    const delimiter = firstLine.includes(';') ? ';' : firstLine.includes('\t') ? '\t' : ',';
    const headers = parseCsvLine(firstLine, delimiter).map(value => normalizeAccountTitle(value).replace(/\s+/g, ''));
    const findColumn = (...names) => headers.findIndex(header => names.includes(header));
    const nameIndex = findColumn('nome', 'conta', 'titulo', 'descricao');
    const amountIndex = findColumn('valor', 'valorprevisto', 'amount');
    const dateIndex = findColumn('vencimento', 'datavencimento', 'data', 'duedate');
    const personIndex = findColumn('responsavel', 'quem', 'pessoa');
    const recurringIndex = findColumn('recorrente', 'mensal', 'repetir', 'contafixa');
    if (nameIndex < 0 || amountIndex < 0 || dateIndex < 0) throw new Error('Confira o cabeçalho do modelo: nome;valor;vencimento;responsavel;recorrente.');
    const candidates = [];
    for (const line of lines.slice(1)) {
      const cells = parseCsvLine(line, delimiter);
      const name = String(cells[nameIndex] || '').trim();
      const amountText = String(cells[amountIndex] || '').trim();
      const dateText = String(cells[dateIndex] || '').trim();
      const dueDate = parseImportedDate(dateText);
      if (!name || !dueDate) continue;
      let amount = 0;
      if (amountText) {
        const normalized = amountText.replace(/\s/g, '').replace(/^R\$/i, '');
        const parsed = parseAmount(normalized);
        if (Number.isFinite(parsed)) amount = parsed;
        else if (/^0+(?:[,.]0+)?$/.test(normalized)) amount = 0;
        else continue;
      }
      const responsible = String(cells[personIndex] || '').trim();
      const person = responsible.slice(0, 70) || 'Casa';
      const recurrence = normalizeAccountTitle(cells[recurringIndex] || '');
      candidates.push({ id: crypto.randomUUID(), name: name.slice(0, 70), amount, dueDate, person, recurring: ['sim', 's', 'yes', 'true', '1', 'mensal', 'fixo', 'fixa'].includes(recurrence), include: true });
    }
    return candidates;
  }
  function collectXmlRows(xmlDocument) {
    const nodes = [...xmlDocument.getElementsByTagName('*')];
    const rowNodes = nodes.filter(node => node.children.length > 0).map(node => ({
      node,
      text: [...node.children].map(child => `${child.localName || child.tagName}: ${child.textContent.trim()}`).join(' | ')
    })).filter(item => textIsBillRow(item.text));
    const rowSet = new Set(rowNodes.map(item => item.node));
    return rowNodes.filter(item => ![...item.node.querySelectorAll('*')].some(child => rowSet.has(child))).map(item => item.text);
  }
  async function readPdfLines(file) {
    if (location.protocol === 'file:') throw new Error('Para ler PDF, abra o app por um endereço HTTPS. XML e HTML podem ser lidos nesta página local.');
    const pdfjs = await import('https://cdnjs.cloudflare.com/ajax/libs/pdf.js/6.3.289/pdf.min.mjs');
    pdfjs.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/6.3.289/pdf.worker.min.mjs';
    const pdf = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
    if (pdf.numPages > 80) throw new Error('Este PDF tem mais de 80 páginas. Separe as contas em um arquivo menor.');
    const lines = [];
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
      const page = await pdf.getPage(pageNumber);
      const content = await page.getTextContent();
      const items = content.items.filter(item => typeof item.str === 'string' && item.str.trim()).map(item => ({ text: item.str.trim(), x: item.transform?.[4] || 0, y: item.transform?.[5] || 0 }));
      items.sort((a, b) => b.y - a.y || a.x - b.x);
      const pageLines = [];
      for (const item of items) {
        let line = pageLines.find(entry => Math.abs(entry.y - item.y) < 3);
        if (!line) { line = { y: item.y, parts: [] }; pageLines.push(line); }
        line.parts.push(item);
      }
      pageLines.sort((a, b) => b.y - a.y).forEach(line => lines.push(line.parts.sort((a, b) => a.x - b.x).map(item => item.text).join(' ')));
    }
    return lines;
  }
  async function extractFileRows(file) {
    const extension = file.name.split('.').pop().toLowerCase();
    if (extension === 'pdf') return readPdfLines(file);
    const source = await file.text();
    if (extension === 'csv') return parseCsvCandidates(source);
    if (extension === 'html' || extension === 'htm') {
      const parsed = new DOMParser().parseFromString(source, 'text/html');
      const tableRows = [...parsed.querySelectorAll('tr')].map(row => [...row.querySelectorAll('th,td')].map(cell => cell.textContent.trim()).join(' | ')).filter(Boolean);
      return tableRows.length ? tableRows : (parsed.body.innerText || parsed.body.textContent || '').split(/[\r\n]+/).map(line => line.trim()).filter(Boolean);
    }
    const parsed = new DOMParser().parseFromString(source, 'application/xml');
    if (parsed.querySelector('parsererror')) throw new Error('Não consegui abrir este XML. Confira se o arquivo está íntegro.');
    const xmlRows = collectXmlRows(parsed);
    return xmlRows.length ? xmlRows : [parsed.documentElement.textContent];
  }
  function renderImportCandidates() {
    const list = byId('import-candidates');
    list.innerHTML = pendingImports.map((item, index) => `<article class="import-candidate" data-import-index="${index}"><label class="candidate-select"><input type="checkbox" data-import-include ${item.include ? 'checked' : ''}><span>Adicionar</span></label><label>Conta<input data-import-name maxlength="70" value="${escapeHtml(item.name)}"></label><div class="form-row"><label>Valor (R$)<input data-import-amount type="number" min="0" step="0.01" value="${Number(item.amount).toFixed(2)}"></label><label>Vencimento<input data-import-date type="date" value="${escapeHtml(item.dueDate)}"></label></div><label>Responsável<input data-import-person list="people-options" maxlength="70" value="${escapeHtml(item.person)}" placeholder="Digite ou escolha um nome"></label><label class="form-check"><input data-import-recurring type="checkbox" ${item.recurring ? 'checked' : ''}><span>Guardar título como conta mensal</span></label></article>`).join('');
    byId('import-summary').textContent = `${pendingImports.length} sugest${pendingImports.length === 1 ? 'ão encontrada' : 'ões encontradas'}. Confira descrição, valor e vencimento; escolha quais devem se repetir.`;
    byId('import-results').hidden = false;
  }

  function renderTip(spending, expenses, incomes) {
    if (!spending.length) {
      byId('tip-title').textContent = 'Pequenos passos contam.';
      byId('tip-copy').textContent = 'Registre entradas e saídas para receber sugestões com base nos gastos da casa.';
      return;
    }
    const [category, value] = spending[0];
    const share = expenses ? Math.round(value / expenses * 100) : 0;
    byId('tip-title').textContent = `${category} é o maior gasto.`;
    byId('tip-copy').textContent = `Representa ${share}% das saídas deste mês. Revise compras recorrentes nessa categoria e definam juntos um limite para o próximo mês.`;
    if (incomes > 0 && expenses > incomes) byId('tip-copy').textContent += ' As saídas já passaram das entradas; vale conferir os lançamentos e priorizar as contas essenciais.';
  }

  document.querySelectorAll('[data-open]').forEach(button => button.addEventListener('click', () => {
    const dialog = byId(button.dataset.open);
    const form = dialog.querySelector('form');
    if (form) form.reset();
    if (form?.id === 'transaction-form') form.elements.date.value = isoToday;
    if (form?.id === 'bill-form') form.elements.dueDate.value = isoToday;
    if (dialog.id === 'import-dialog') {
      importFile = null; pendingImports = [];
      byId('import-file').value = ''; byId('import-file-name').textContent = 'Nenhum arquivo escolhido.';
      byId('read-file-button').disabled = true; byId('import-message').textContent = '';
      byId('import-results').hidden = true;
    }
    dialog.showModal();
  }));
  document.querySelectorAll('[data-close]').forEach(button => button.addEventListener('click', () => button.closest('dialog').close()));
  document.querySelectorAll('dialog').forEach(dialog => dialog.addEventListener('click', event => { if (event.target === dialog && !(dialog.id === 'auth-dialog' && document.body.classList.contains('auth-required'))) dialog.close(); }));
  byId('auth-dialog').addEventListener('cancel', event => { if (document.body.classList.contains('auth-required')) event.preventDefault(); });
  byId('account-button').addEventListener('click', async () => {
    if (cloudUser) {
      const { error } = await cloud.auth.signOut();
      if (error) { toast('Não foi possível sair da conta.'); return; }
      if (cloudChannel) cloud.removeChannel(cloudChannel);
      cloudUser = null; cloudChannel = null;
      authMode = 'signin';
      document.body.classList.add('auth-required');
      byId('auth-title').textContent = 'Entrar'; byId('auth-submit').textContent = 'Entrar';
      byId('auth-mode-toggle').textContent = 'Criar conta da casa'; byId('auth-message').textContent = '';
      byId('account-button').textContent = 'Entrar'; byId('auth-dialog').showModal();
      setSyncStatus('Sessão encerrada');
      return;
    }
    if (!cloud) { toast('O login será ativado depois de configurar o backend seguro.'); return; }
    byId('auth-dialog').showModal();
  });
  byId('auth-mode-toggle').addEventListener('click', () => {
    authMode = authMode === 'signin' ? 'signup' : 'signin';
    byId('auth-title').textContent = authMode === 'signup' ? 'Criar conta da casa' : 'Entrar';
    byId('auth-submit').textContent = authMode === 'signup' ? 'Criar conta' : 'Entrar';
    byId('auth-password').autocomplete = authMode === 'signup' ? 'new-password' : 'current-password';
    byId('auth-mode-toggle').textContent = authMode === 'signup' ? 'Já tenho uma conta' : 'Criar conta da casa';
    byId('auth-message').textContent = '';
  });
  byId('auth-form').addEventListener('submit', async event => {
    event.preventDefault();
    if (!cloud) { byId('auth-message').textContent = 'O backend ainda não está configurado. Consulte o arquivo supabase/README.md.'; return; }
    const button = byId('auth-submit');
    const email = byId('auth-email').value.trim(); const password = byId('auth-password').value;
    button.disabled = true; byId('auth-message').textContent = 'Conectando…';
    try {
      const result = authMode === 'signup'
        ? await cloud.auth.signUp({ email, password, options: { emailRedirectTo: location.origin } })
        : await cloud.auth.signInWithPassword({ email, password });
      if (result.error) throw result.error;
      if (!result.data.session) {
        byId('auth-message').textContent = 'Conta criada. Confirme o e-mail enviado e depois entre com sua senha.';
        return;
      }
      cloudUser = result.data.user;
      setSyncStatus('Carregando dados…');
      await loadCloudState();
      toast('Conta conectada e dados sincronizados.');
    } catch (error) {
      byId('auth-message').textContent = error instanceof Error ? error.message : 'Não foi possível entrar.';
    } finally { button.disabled = false; }
  });

  byId('month-picker').value = monthKey(isoToday);
  byId('month-picker').addEventListener('change', render);
  document.querySelectorAll('[data-bill-filter]').forEach(button => button.addEventListener('click', () => {
    billFilter = button.dataset.billFilter;
    document.querySelectorAll('[data-bill-filter]').forEach(item => item.classList.toggle('active', item === button));
    render();
  }));
  byId('transaction-form').addEventListener('submit', event => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const amount = parseAmount(data.get('amount'));
    if (!Number.isFinite(amount)) { toast('Digite um valor maior que zero.'); return; }
    state.transactions.push({ id: crypto.randomUUID(), type: data.get('type'), description: String(data.get('description')).trim(), amount, date: data.get('date'), category: data.get('category'), person: String(data.get('person') || '').trim() || 'Casa' });
    saveState(); form.closest('dialog').close(); toast('Lançamento salvo neste aparelho.');
  });
  byId('bill-form').addEventListener('submit', event => {
    event.preventDefault();
    const form = event.currentTarget; const data = new FormData(form);
    const amountValue = String(data.get('amount') || '').trim();
    const amount = amountValue ? parseAmount(amountValue) : 0;
    if (amountValue && !Number.isFinite(amount)) { toast('Confira o valor da conta.'); return; }
    const dueDate = data.get('dueDate');
    if (data.get('recurring')) {
      state.recurringBills.push({ id: crypto.randomUUID(), name: String(data.get('name')).trim(), amount, dueDay: Number(dueDate.slice(8, 10)), startMonth: monthKey(dueDate), person: String(data.get('person') || '').trim() || 'Casa' });
    } else {
      state.bills.push({ id: crypto.randomUUID(), name: String(data.get('name')).trim(), amount, dueDate, person: String(data.get('person') || '').trim() || 'Casa', paid: false });
    }
    saveState(); form.closest('dialog').close(); toast('Conta e vencimento salvos.');
  });
  byId('import-file').addEventListener('change', event => {
    importFile = event.target.files?.[0] || null;
    byId('import-file-name').textContent = importFile ? importFile.name : 'Nenhum arquivo escolhido.';
    byId('read-file-button').disabled = !importFile;
    byId('import-message').textContent = '';
    byId('import-results').hidden = true;
  });
  byId('read-file-button').addEventListener('click', async () => {
    if (!importFile) return;
    if (importFile.size > 15 * 1024 * 1024) { byId('import-message').textContent = 'O arquivo deve ter até 15 MB.'; return; }
    const button = byId('read-file-button');
    button.disabled = true; button.textContent = 'Lendo arquivo…';
    byId('import-message').textContent = '';
    try {
      const rows = await extractFileRows(importFile);
      const unique = new Map();
      const candidates = importFile.name.toLowerCase().endsWith('.csv') ? rows : rows.map(row => candidateFromText(row, importFile.name)).filter(Boolean);
      candidates.forEach(item => unique.set(`${normalizeAccountTitle(item.name)}|${item.amount}|${item.dueDate}`, item));
      pendingImports = [...unique.values()];
      if (!pendingImports.length) {
        byId('import-message').textContent = 'Não encontrei linhas com descrição, valor e vencimento. Se o PDF for digitalizado como imagem, será necessário OCR ou digitar os dados.';
        byId('import-results').hidden = true;
      } else renderImportCandidates();
    } catch (error) {
      byId('import-message').textContent = error instanceof Error ? error.message : 'Não foi possível ler este arquivo.';
      byId('import-results').hidden = true;
    } finally {
      button.disabled = false; button.textContent = 'Ler arquivo e sugerir contas';
    }
  });
  byId('save-imported-button').addEventListener('click', () => {
    const candidates = [...byId('import-candidates').querySelectorAll('.import-candidate')];
    let savedCount = 0; let recurringCount = 0; let updatedCount = 0; let skippedCount = 0;
    candidates.forEach(card => {
      if (!card.querySelector('[data-import-include]').checked) return;
      const name = card.querySelector('[data-import-name]').value.trim();
      const amount = Number(card.querySelector('[data-import-amount]').value);
      const dueDate = card.querySelector('[data-import-date]').value;
      const person = card.querySelector('[data-import-person]').value.trim() || 'Casa';
      if (!name || !Number.isFinite(amount) || amount < 0 || !dueDate) { skippedCount++; return; }
      if (card.querySelector('[data-import-recurring]').checked) {
        const titleKey = normalizeAccountTitle(name);
        const existing = state.recurringBills.find(item => normalizeAccountTitle(item.name) === titleKey);
        if (existing) {
          const dueMonth = monthKey(dueDate);
          existing.name = name; existing.amount = amount; existing.dueDay = Number(dueDate.slice(8, 10)); existing.person = person;
          if (dueMonth < existing.startMonth) existing.startMonth = dueMonth;
          state.billAmounts[`repeat:${existing.id}:${dueMonth}`] = amount;
          updatedCount++;
        } else state.recurringBills.push({ id: crypto.randomUUID(), name, amount, dueDay: Number(dueDate.slice(8, 10)), startMonth: monthKey(dueDate), person });
        recurringCount++;
      } else state.bills.push({ id: crypto.randomUUID(), name, amount, dueDate, person, paid: false });
      savedCount++;
    });
    if (!savedCount) { byId('import-message').textContent = skippedCount ? 'Revise os valores e as datas das contas selecionadas.' : 'Selecione ao menos uma conta para adicionar.'; return; }
    billFilter = 'pending';
    document.querySelectorAll('[data-bill-filter]').forEach(button => button.classList.toggle('active', button.dataset.billFilter === billFilter));
    saveState();
    byId('import-message').textContent = `${savedCount} conta${savedCount === 1 ? '' : 's'} processada${savedCount === 1 ? '' : 's'}${updatedCount ? `; ${updatedCount} título${updatedCount === 1 ? '' : 's'} recorrente${updatedCount === 1 ? ' atualizado' : 's atualizados'}` : ''}${skippedCount ? `; ${skippedCount} ignorada${skippedCount === 1 ? '' : 's'} por dados inválidos` : ''}.`;
    toast(recurringCount ? 'Contas adicionadas e títulos mensais guardados.' : 'Contas adicionadas ao checklist.');
    pendingImports = [];
    byId('import-results').hidden = true;
  });
  document.addEventListener('change', event => {
    const amountInput = event.target.closest('[data-bill-amount]');
    if (amountInput) {
      const amount = amountInput.value === '' ? 0 : Number(amountInput.value);
      if (!Number.isFinite(amount) || amount < 0) { toast('Informe um valor válido para a conta.'); render(); return; }
      const key = amountInput.dataset.billAmount;
      if (key.startsWith('repeat:')) state.billAmounts[key] = amount;
      else {
        const bill = state.bills.find(item => `bill:${item.id}` === key);
        if (bill) bill.amount = amount;
      }
      saveState(); toast('Valor deste mês atualizado.');
      return;
    }
    const checkbox = event.target.closest('[data-paid-toggle]');
    if (!checkbox) return;
    const key = checkbox.dataset.paidToggle;
    if (key.startsWith('repeat:')) state.billPayments[key] = checkbox.checked;
    else {
      const bill = state.bills.find(item => `bill:${item.id}` === key);
      if (bill) bill.paid = checkbox.checked;
    }
    saveState(); toast(checkbox.checked ? 'Conta marcada como paga.' : 'Conta voltou para pendentes.');
  });
  document.addEventListener('click', event => {
    const repeatButton = event.target.closest('[data-repeat-bill]');
    if (repeatButton) {
      const bill = state.bills.find(item => item.id === repeatButton.dataset.repeatBill);
      if (bill && !bill.repeatsAsId) {
        const recurring = { id: crypto.randomUUID(), name: bill.name, amount: bill.amount, dueDay: Number(bill.dueDate.slice(8, 10)), startMonth: nextAvailableMonth(bill.dueDate), person: bill.person };
        state.recurringBills.push(recurring);
        bill.repeatsAsId = recurring.id;
        saveState();
        toast(`Conta adicionada aos recorrentes a partir de ${formatMonth(recurring.startMonth)}.`);
      }
      return;
    }
    const repeatTransaction = event.target.closest('[data-repeat-transaction]');
    if (repeatTransaction) {
      const transaction = state.transactions.find(item => item.id === repeatTransaction.dataset.repeatTransaction);
      if (transaction && transaction.type === 'expense' && !transaction.repeatAccountId) {
        const recurring = { id: crypto.randomUUID(), name: transaction.description, amount: transaction.amount, dueDay: Number(transaction.date.slice(8, 10)), startMonth: nextAvailableMonth(transaction.date), person: transaction.person, sourceTransactionId: transaction.id };
        state.recurringBills.push(recurring);
        transaction.repeatAccountId = recurring.id;
        saveState();
        toast(`Conta fixa mensal criada a partir de ${formatMonth(recurring.startMonth)}.`);
      }
      return;
    }
    const deleteBill = event.target.closest('[data-delete-bill]');
    if (deleteBill) {
      state.bills = state.bills.filter(item => item.id !== deleteBill.dataset.deleteBill);
      saveState(); toast('Conta removida do checklist.');
      return;
    }
    const deleteRecurringBill = event.target.closest('[data-delete-recurring-bill]');
    if (deleteRecurringBill) {
      const id = deleteRecurringBill.dataset.deleteRecurringBill;
      const bill = state.recurringBills.find(item => item.id === id);
      if (bill && confirm(`Apagar “${bill.name}” das contas recorrentes? Ela deixará de aparecer nos próximos meses.`)) {
        state.recurringBills = state.recurringBills.filter(item => item.id !== id);
        for (const key of Object.keys(state.billPayments)) if (key.startsWith(`repeat:${id}:`)) delete state.billPayments[key];
        for (const key of Object.keys(state.billAmounts)) if (key.startsWith(`repeat:${id}:`)) delete state.billAmounts[key];
        saveState(); toast('Conta recorrente removida dos próximos meses.');
      }
      return;
    }
    const deleteButton = event.target.closest('[data-delete]');
    if (deleteButton) { state.transactions = state.transactions.filter(item => item.id !== deleteButton.dataset.delete); saveState(); toast('Lançamento excluído.'); }
  });
  byId('nav-bills').addEventListener('click', event => { event.preventDefault(); document.querySelector('.bills-panel').scrollIntoView({ behavior: 'smooth' }); });
  byId('reset-data-button').addEventListener('click', resetAppData);

  window.addEventListener('beforeinstallprompt', event => {
    event.preventDefault(); installPrompt = event; byId('install-button').hidden = false;
  });
  byId('install-button').addEventListener('click', async () => {
    if (!installPrompt) { toast('No iPhone: abra Compartilhar e escolha “Adicionar à Tela de Início”.'); return; }
    installPrompt.prompt(); await installPrompt.userChoice; installPrompt = null; byId('install-button').hidden = true;
  });
  window.addEventListener('appinstalled', () => toast('Zelp foi instalado.'));
  window.addEventListener('online', () => { if (cloudUser) syncCloudState(); });
  if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) navigator.serviceWorker.register('./service-worker.js').catch(() => {});
  render();
  initializeCloud();
})();

