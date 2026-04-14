import { auth, db, ADMIN_EMAIL } from './firebase-config.js';
import { onAuthStateChanged, signOut, getIdTokenResult } from 'https://www.gstatic.com/firebasejs/12.12.0/firebase-auth.js';
import { collection, doc, getDocs, serverTimestamp, setDoc, updateDoc, deleteDoc, onSnapshot, query, orderBy, writeBatch } from 'https://www.gstatic.com/firebasejs/12.12.0/firebase-firestore.js';

const sections = {
  dashboard: document.getElementById('dashboardSection'),
  finance: document.getElementById('financeSection'),
  sales: document.getElementById('salesSection'),
  receipts: document.getElementById('receiptsSection'),
  expenses: document.getElementById('expensesSection'),
  clients: document.getElementById('clientsSection'),
  users: document.getElementById('usersSection'),
  plans: document.getElementById('plansSection')
};

const labels = {
  dashboard: ['Dashboard', 'Resumo geral do sistema e do financeiro'],
  finance: ['Financeiro', 'Visão consolidada do faturamento e lucro'],
  sales: ['Vendas', 'Planos vendidos, pagos ou pendentes'],
  receipts: ['Recebimentos', 'Entradas confirmadas no caixa'],
  expenses: ['Despesas', 'Custos do projeto e do site'],
  clients: ['Clientes', 'Histórico financeiro por cliente'],
  users: ['Usuários', 'Gerencie usuários e planos ativos'],
  plans: ['Planos', 'Cadastre e edite planos do sistema']
};

const signOutBtn = document.getElementById('signOutBtn');
const refreshBtn = document.getElementById('refreshBtn');
const newPlanBtn = document.getElementById('newPlanBtn');
const newSaleBtn = document.getElementById('newSaleBtn');
const newReceiptBtn = document.getElementById('newReceiptBtn');
const newExpenseBtn = document.getElementById('newExpenseBtn');

const plansList = document.getElementById('plansList');
const usersList = document.getElementById('usersList');
const salesList = document.getElementById('salesList');
const receiptsList = document.getElementById('receiptsList');
const expensesList = document.getElementById('expensesList');
const clientsList = document.getElementById('clientsList');
const alertsList = document.getElementById('alertsList');
const dashboardCharts = document.getElementById('dashboardCharts');
const mobileMenuBtn = document.getElementById('mobileMenuBtn');
const mobileSidebarBackdrop = document.getElementById('mobileSidebarBackdrop');
const sidebar = document.getElementById('sidebar');
const appShell = document.getElementById('app');
const sidebarToggleBtn = document.getElementById('sidebarToggleBtn');

const chartInstances = new Map();

const planModal = document.getElementById('planModal');
const userPlanModal = document.getElementById('userPlanModal');
const saleModal = document.getElementById('saleModal');
const receiptModal = document.getElementById('receiptModal');
const expenseModal = document.getElementById('expenseModal');

const planForm = document.getElementById('planForm');
const userPlanForm = document.getElementById('userPlanForm');
const saleForm = document.getElementById('saleForm');
const receiptForm = document.getElementById('receiptForm');
const expenseForm = document.getElementById('expenseForm');

const targetUsePlanDuration = document.getElementById('targetUsePlanDuration');
const targetPlanEnd = document.getElementById('targetPlanEnd');
const removeUserPlanBtn = document.getElementById('removeUserPlanBtn');

let unsubPlans = null;
let unsubUsers = null;
let unsubSales = null;
let unsubReceipts = null;
let unsubExpenses = null;

let plansCache = [];
let usersCache = [];
let salesCache = [];
let receiptsCache = [];
let expensesCache = [];

const DEFAULT_PLANS = [
  { id: 'plano-free', nome: 'Plano Free', valor: 0, duracaoQuantidade: 2, duracaoUnidade: 'hours', descricao: 'Plano inicial automático do sistema.', ativo: true, ocultoNaEscolha: true, fixo: true },
  { id: 'plano-semanal', nome: 'Plano Semanal', valor: 10, duracaoQuantidade: 7, duracaoUnidade: 'days', descricao: 'Plano semanal padrão.', ativo: true, ocultoNaEscolha: false, fixo: false },
  { id: 'plano-mensal', nome: 'Plano Mensal', valor: 25, duracaoQuantidade: 30, duracaoUnidade: 'days', descricao: 'Plano mensal padrão.', ativo: true, ocultoNaEscolha: false, fixo: false },
  { id: 'plano-trimestral', nome: 'Plano Trimestral', valor: 60, duracaoQuantidade: 90, duracaoUnidade: 'days', descricao: 'Plano trimestral padrão.', ativo: true, ocultoNaEscolha: false, fixo: false }
];

signOutBtn?.addEventListener('click', async () => {
  await signOut(auth);
  location.replace('index.html');
});

refreshBtn?.addEventListener('click', () => renderAll());
newPlanBtn?.addEventListener('click', () => openPlanModal());
newSaleBtn?.addEventListener('click', () => openSaleModal());
newReceiptBtn?.addEventListener('click', () => openReceiptModal());
newExpenseBtn?.addEventListener('click', () => openExpenseModal());

planForm?.addEventListener('submit', savePlan);
userPlanForm?.addEventListener('submit', saveUserPlan);
saleForm?.addEventListener('submit', saveSale);
receiptForm?.addEventListener('submit', saveReceipt);
expenseForm?.addEventListener('submit', saveExpense);
removeUserPlanBtn?.addEventListener('click', removeUserPlan);
mobileMenuBtn?.addEventListener('click', toggleMobileMenu);
mobileSidebarBackdrop?.addEventListener('click', closeMobileMenu);
sidebarToggleBtn?.addEventListener('click', toggleSidebarCollapse);

targetUsePlanDuration?.addEventListener('change', () => {
  targetPlanEnd.disabled = targetUsePlanDuration.checked;
});

document.querySelectorAll('[data-close-modal]').forEach((button) => {
  button.addEventListener('click', () => closeModal(button.dataset.closeModal));
});

document.getElementById('navMenu')?.addEventListener('click', (event) => {
  const button = event.target.closest('.nav-btn');
  if (!button) return;
  setSection(button.dataset.view);
  closeMobileMenu();
});

document.querySelectorAll('.nav-btn').forEach((btn) => {
  const text = (btn.textContent || '').trim();
  btn.dataset.short = text ? text[0].toUpperCase() : '•';
});

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    stopListeners();
    location.replace('index.html');
    return;
  }
  try {
    await user.getIdToken(true);
    const token = await getIdTokenResult(user);
    const email = (user.email || token?.claims?.email || '').toLowerCase();
    if (email !== ADMIN_EMAIL.toLowerCase()) {
      await signOut(auth);
      location.replace('acesso-negado.html');
      return;
    }
    document.getElementById('adminPhoto').src = user.photoURL || '';
    document.getElementById('adminName').textContent = user.displayName || 'Administrador';
    document.getElementById('adminEmail').textContent = user.email || '';
    setSection('dashboard');
    await ensureDefaultPlans();
    startListeners();
  } catch (error) {
    console.error('Erro ao validar sessão do ADM:', error);
    await signOut(auth);
    location.replace('index.html');
  }
});

async function ensureDefaultPlans() {
  const snapshot = await getDocs(collection(db, 'planos'));
  if (!snapshot.empty) return;
  for (const plan of DEFAULT_PLANS) {
    await setDoc(doc(db, 'planos', plan.id), { ...plan, criadoEm: serverTimestamp(), atualizadoEm: serverTimestamp() });
  }
}

function startListeners() {
  stopListeners();
  unsubPlans = onSnapshot(query(collection(db, 'planos'), orderBy('nome')), (snapshot) => {
    plansCache = snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
    renderAll();
  });
  unsubUsers = onSnapshot(query(collection(db, 'usuarios')), (snapshot) => {
    usersCache = snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
    renderAll();
  });
  unsubSales = onSnapshot(query(collection(db, 'vendas_planos')), (snapshot) => {
    salesCache = snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
    renderAll();
  });
  unsubReceipts = onSnapshot(query(collection(db, 'recebimentos')), (snapshot) => {
    receiptsCache = snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
    renderAll();
  });
  unsubExpenses = onSnapshot(query(collection(db, 'despesas')), (snapshot) => {
    expensesCache = snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
    renderAll();
  });
}

function stopListeners() {
  [unsubPlans, unsubUsers, unsubSales, unsubReceipts, unsubExpenses].forEach((fn) => fn && fn());
  unsubPlans = unsubUsers = unsubSales = unsubReceipts = unsubExpenses = null;
  plansCache = []; usersCache = []; salesCache = []; receiptsCache = []; expensesCache = [];
}

function renderAll() {
  renderPlans();
  renderUsers();
  renderSales();
  renderReceipts();
  renderExpenses();
  renderClients();
  updateStats();
  renderAlerts();
  renderDashboardCharts();
}

function setSection(name) {
  Object.entries(sections).forEach(([key, element]) => element.classList.toggle('active-section', key === name));
  document.querySelectorAll('.nav-btn').forEach((btn) => btn.classList.toggle('active', btn.dataset.view === name));
  document.getElementById('viewTitle').textContent = labels[name][0];
  document.getElementById('viewSubtitle').textContent = labels[name][1];
}

function renderPlans() {
  plansList.innerHTML = plansCache.length ? '' : `<div class="card empty-state">Nenhum plano cadastrado.</div>`;
  for (const plan of plansCache) {
    const article = document.createElement('article');
    article.className = 'card plan-card';
    article.innerHTML = `
      <div class="card-head">
        <div>
          <h4>${escapeHtml(plan.nome || 'Sem nome')}</h4>
          <p>${escapeHtml(plan.descricao || 'Sem descrição.')}</p>
        </div>
        <span class="badge ${plan.ativo ? 'ok' : 'off'}">${plan.ativo ? 'Ativo' : 'Inativo'}</span>
      </div>
      <div class="meta-grid">
        <div class="meta-item"><small>Valor</small><strong>${formatBRL(plan.valor || 0)}</strong></div>
        <div class="meta-item"><small>Duração</small><strong>${plan.duracaoQuantidade || 0} ${plan.duracaoUnidade === 'hours' ? 'hora(s)' : 'dia(s)'}</strong></div>
        <div class="meta-item"><small>Oculto na escolha</small><strong>${plan.ocultoNaEscolha ? 'Sim' : 'Não'}</strong></div>
        <div class="meta-item"><small>Tipo</small><strong>${plan.fixo ? 'Fixo do sistema' : 'Editável'}</strong></div>
      </div>
      <div class="card-actions">
        <button class="btn btn-secondary" data-edit-plan="${plan.id}">Editar</button>
        ${plan.fixo ? '' : `<button class="btn btn-danger" data-delete-plan="${plan.id}">Excluir</button>`}
      </div>`;
    plansList.appendChild(article);
  }
  plansList.querySelectorAll('[data-edit-plan]').forEach((button) => button.addEventListener('click', () => {
    const plan = plansCache.find((item) => item.id === button.dataset.editPlan);
    if (plan) openPlanModal(plan);
  }));
  plansList.querySelectorAll('[data-delete-plan]').forEach((button) => button.addEventListener('click', async () => {
    if (!confirm('Excluir este plano?')) return;
    await deleteDoc(doc(db, 'planos', button.dataset.deletePlan));
  }));
}

function renderUsers() {
  usersList.innerHTML = usersCache.length ? '' : `<div class="card empty-state">Nenhum usuário cadastrado ainda.</div>`;
  for (const user of usersCache) {
    const status = resolvePlanStatus(user);
    const article = document.createElement('article');
    article.className = 'card user-card';
    article.innerHTML = `
      <div class="card-head">
        <div>
          <h4>${escapeHtml(user.nome || user.email || 'Usuário sem nome')}</h4>
          <p>${escapeHtml(user.email || '')}</p>
        </div>
        <span class="badge ${status.className}">${status.label}</span>
      </div>
      <div class="meta-grid">
        <div class="meta-item"><small>Telefone</small><strong>${escapeHtml(user.telefone || '-')}</strong></div>
        <div class="meta-item"><small>Cidade / Estado</small><strong>${escapeHtml([user.cidade, user.estado].filter(Boolean).join(' / ') || '-')}</strong></div>
        <div class="meta-item"><small>Plano atual</small><strong>${escapeHtml(user.planoAtualNome || 'Sem plano')}</strong></div>
        <div class="meta-item"><small>Valor do plano</small><strong>${formatBRL(user.planoValor || 0)}</strong></div>
        <div class="meta-item"><small>Início</small><strong>${formatDate(user.planoInicio)}</strong></div>
        <div class="meta-item"><small>Fim</small><strong>${formatDate(user.planoFim)}</strong></div>
      </div>
      <div class="card-actions">
        <button class="btn btn-primary" data-manage-user-plan="${user.id}">Gerenciar plano</button>
        <button class="btn btn-danger-outline" data-delete-user="${user.id}">Excluir usuário</button>
      </div>`;
    usersList.appendChild(article);
  }
  usersList.querySelectorAll('[data-manage-user-plan]').forEach((button) => button.addEventListener('click', () => {
    const user = usersCache.find((item) => item.id === button.dataset.manageUserPlan);
    if (user) openUserPlanModal(user);
  }));
  usersList.querySelectorAll('[data-delete-user]').forEach((button) => button.addEventListener('click', async () => {
    const user = usersCache.find((item) => item.id === button.dataset.deleteUser);
    if (!user) return;
    const label = user.nome || user.email || 'este usuário';
    if (!confirm(`Excluir ${label}? Isso remove o cadastro do site e os registros financeiros vinculados no Firestore.`)) return;
    await deleteUserAndRelatedData(user.id);
  }));
}

function renderSales() {
  const ordered = [...salesCache].sort((a,b) => (new Date(b.dataVenda || b.criadoEm || 0)) - (new Date(a.dataVenda || a.criadoEm || 0)));
  salesList.innerHTML = ordered.length ? '' : `<div class="card empty-state">Nenhuma venda registrada.</div>`;
  for (const sale of ordered) {
    const article = document.createElement('article');
    article.className = 'card sale-card';
    article.innerHTML = `
      <div class="card-head">
        <div>
          <h4>${escapeHtml(sale.clienteNome || 'Cliente não informado')}</h4>
          <p>${escapeHtml(sale.planoNome || 'Plano não informado')}</p>
        </div>
        <span class="badge ${sale.status === 'pago' ? 'ok' : sale.status === 'cancelado' ? 'danger' : 'warn'}">${capitalize(sale.status || 'pendente')}</span>
      </div>
      <div class="meta-grid">
        <div class="meta-item"><small>Valor vendido</small><strong>${formatBRL(sale.valor || 0)}</strong></div>
        <div class="meta-item"><small>Forma de pagamento</small><strong>${escapeHtml(sale.formaPagamento || '-')}</strong></div>
        <div class="meta-item"><small>Data da venda</small><strong>${formatDate(sale.dataVenda)}</strong></div>
        <div class="meta-item"><small>Data do pagamento</small><strong>${formatDate(sale.dataPagamento)}</strong></div>
      </div>
      <div class="card-actions">
        <button class="btn btn-secondary" data-edit-sale="${sale.id}">Editar</button>
        ${sale.status !== 'pago' ? `<button class="btn btn-primary" data-sale-paid="${sale.id}">Marcar como pago</button>` : ''}
        <button class="btn btn-danger" data-delete-sale="${sale.id}">Excluir</button>
      </div>`;
    salesList.appendChild(article);
  }
  salesList.querySelectorAll('[data-edit-sale]').forEach((button) => button.addEventListener('click', () => {
    const sale = salesCache.find((item) => item.id === button.dataset.editSale);
    if (sale) openSaleModal(sale);
  }));
  salesList.querySelectorAll('[data-delete-sale]').forEach((button) => button.addEventListener('click', async () => {
    if (!confirm('Excluir esta venda?')) return;
    await deleteDoc(doc(db, 'vendas_planos', button.dataset.deleteSale));
  }));
  salesList.querySelectorAll('[data-sale-paid]').forEach((button) => button.addEventListener('click', async () => {
    const sale = salesCache.find((item) => item.id === button.dataset.salePaid);
    if (!sale) return;
    const paymentDate = new Date().toISOString();
    await updateDoc(doc(db, 'vendas_planos', sale.id), { status: 'pago', dataPagamento: paymentDate, atualizadoEm: serverTimestamp() });
    await setDoc(doc(collection(db, 'recebimentos')), {
      vendaId: sale.id,
      clienteNome: sale.clienteNome || '',
      valorRecebido: Number(sale.valor || 0),
      metodoPagamento: sale.formaPagamento || 'Outro',
      dataRecebimento: paymentDate,
      observacao: 'Recebimento gerado automaticamente ao marcar venda como paga.',
      criadoEm: serverTimestamp(),
      atualizadoEm: serverTimestamp()
    });
  }));
}

function renderReceipts() {
  const ordered = [...receiptsCache].sort((a,b) => (new Date(b.dataRecebimento || b.criadoEm || 0)) - (new Date(a.dataRecebimento || a.criadoEm || 0)));
  receiptsList.innerHTML = ordered.length ? '' : `<div class="card empty-state">Nenhum recebimento registrado.</div>`;
  for (const receipt of ordered) {
    const article = document.createElement('article');
    article.className = 'card receipt-card';
    article.innerHTML = `
      <div class="card-head">
        <div>
          <h4>${escapeHtml(receipt.clienteNome || 'Cliente não informado')}</h4>
          <p>${escapeHtml(receipt.observacao || 'Sem observação.')}</p>
        </div>
        <span class="badge ok">Recebido</span>
      </div>
      <div class="meta-grid">
        <div class="meta-item"><small>Valor recebido</small><strong>${formatBRL(receipt.valorRecebido || 0)}</strong></div>
        <div class="meta-item"><small>Método</small><strong>${escapeHtml(receipt.metodoPagamento || '-')}</strong></div>
        <div class="meta-item"><small>Data</small><strong>${formatDate(receipt.dataRecebimento)}</strong></div>
        <div class="meta-item"><small>Venda vinculada</small><strong>${escapeHtml(receipt.vendaId || '-')}</strong></div>
      </div>
      <div class="card-actions">
        <button class="btn btn-secondary" data-edit-receipt="${receipt.id}">Editar</button>
        <button class="btn btn-danger" data-delete-receipt="${receipt.id}">Excluir</button>
      </div>`;
    receiptsList.appendChild(article);
  }
  receiptsList.querySelectorAll('[data-edit-receipt]').forEach((button) => button.addEventListener('click', () => {
    const receipt = receiptsCache.find((item) => item.id === button.dataset.editReceipt);
    if (receipt) openReceiptModal(receipt);
  }));
  receiptsList.querySelectorAll('[data-delete-receipt]').forEach((button) => button.addEventListener('click', async () => {
    if (!confirm('Excluir este recebimento?')) return;
    await deleteDoc(doc(db, 'recebimentos', button.dataset.deleteReceipt));
  }));
}

function renderExpenses() {
  const ordered = [...expensesCache].sort((a,b) => (new Date(b.data || b.criadoEm || 0)) - (new Date(a.data || a.criadoEm || 0)));
  expensesList.innerHTML = ordered.length ? '' : `<div class="card empty-state">Nenhuma despesa registrada.</div>`;
  for (const expense of ordered) {
    const article = document.createElement('article');
    article.className = 'card expense-card';
    article.innerHTML = `
      <div class="card-head">
        <div>
          <h4>${escapeHtml(expense.descricao || 'Sem descrição')}</h4>
          <p>${escapeHtml(expense.observacao || 'Sem observação.')}</p>
        </div>
        <span class="badge danger">Despesa</span>
      </div>
      <div class="meta-grid">
        <div class="meta-item"><small>Valor</small><strong>${formatBRL(expense.valor || 0)}</strong></div>
        <div class="meta-item"><small>Categoria</small><strong>${escapeHtml(expense.categoria || '-')}</strong></div>
        <div class="meta-item"><small>Forma de pagamento</small><strong>${escapeHtml(expense.formaPagamento || '-')}</strong></div>
        <div class="meta-item"><small>Data</small><strong>${formatDate(expense.data)}</strong></div>
      </div>
      <div class="card-actions">
        <button class="btn btn-secondary" data-edit-expense="${expense.id}">Editar</button>
        <button class="btn btn-danger" data-delete-expense="${expense.id}">Excluir</button>
      </div>`;
    expensesList.appendChild(article);
  }
  expensesList.querySelectorAll('[data-edit-expense]').forEach((button) => button.addEventListener('click', () => {
    const expense = expensesCache.find((item) => item.id === button.dataset.editExpense);
    if (expense) openExpenseModal(expense);
  }));
  expensesList.querySelectorAll('[data-delete-expense]').forEach((button) => button.addEventListener('click', async () => {
    if (!confirm('Excluir esta despesa?')) return;
    await deleteDoc(doc(db, 'despesas', button.dataset.deleteExpense));
  }));
}

function renderClients() {
  const clients = buildClientSummaries();
  clientsList.innerHTML = clients.length ? '' : `<div class="card empty-state">Nenhum cliente encontrado.</div>`;
  for (const client of clients) {
    const article = document.createElement('article');
    article.className = 'card client-card';
    article.innerHTML = `
      <div class="card-head">
        <div>
          <h4>${escapeHtml(client.nome)}</h4>
          <p>${escapeHtml(client.email || 'Sem e-mail cadastrado')}</p>
        </div>
        <span class="badge ${client.statusClass}">${client.statusLabel}</span>
      </div>
      <div class="meta-grid">
        <div class="meta-item"><small>Total vendido</small><strong>${formatBRL(client.totalVendido)}</strong></div>
        <div class="meta-item"><small>Total recebido</small><strong>${formatBRL(client.totalRecebido)}</strong></div>
        <div class="meta-item"><small>Pendente</small><strong>${formatBRL(client.totalPendente)}</strong></div>
        <div class="meta-item"><small>Plano atual</small><strong>${escapeHtml(client.planoAtual || '-')}</strong></div>
        <div class="meta-item"><small>Último pagamento</small><strong>${formatDate(client.ultimoPagamento)}</strong></div>
        <div class="meta-item"><small>Vencimento</small><strong>${formatDate(client.planoFim)}</strong></div>
      </div>`;
    clientsList.appendChild(article);
  }
}

function buildClientSummaries() {
  const map = new Map();
  for (const user of usersCache) {
    const key = (user.email || user.nome || user.id || '').toLowerCase();
    map.set(key, {
      nome: user.nome || user.email || 'Usuário sem nome',
      email: user.email || '',
      totalVendido: 0,
      totalRecebido: 0,
      totalPendente: 0,
      planoAtual: user.planoAtualNome || '-',
      planoFim: user.planoFim || null,
      ultimoPagamento: null,
      statusLabel: resolvePlanStatus(user).label,
      statusClass: resolvePlanStatus(user).className
    });
  }
  for (const sale of salesCache) {
    const key = (sale.clienteEmail || sale.clienteNome || '').toLowerCase();
    if (!key) continue;
    if (!map.has(key)) map.set(key, { nome: sale.clienteNome || 'Cliente', email: sale.clienteEmail || '', totalVendido: 0, totalRecebido: 0, totalPendente: 0, planoAtual: sale.planoNome || '-', planoFim: null, ultimoPagamento: null, statusLabel: 'Financeiro', statusClass: 'warn' });
    const item = map.get(key);
    item.totalVendido += Number(sale.valor || 0);
    if (sale.status === 'pago') item.totalRecebido += Number(sale.valor || 0);
    if (sale.status === 'pendente') item.totalPendente += Number(sale.valor || 0);
  }
  for (const receipt of receiptsCache) {
    const key = (receipt.clienteEmail || receipt.clienteNome || '').toLowerCase();
    if (!key) continue;
    if (!map.has(key)) map.set(key, { nome: receipt.clienteNome || 'Cliente', email: receipt.clienteEmail || '', totalVendido: 0, totalRecebido: 0, totalPendente: 0, planoAtual: '-', planoFim: null, ultimoPagamento: null, statusLabel: 'Financeiro', statusClass: 'warn' });
    const item = map.get(key);
    item.totalRecebido += Number(receipt.valorRecebido || 0);
    if (!item.ultimoPagamento || new Date(receipt.dataRecebimento) > new Date(item.ultimoPagamento)) item.ultimoPagamento = receipt.dataRecebimento;
  }
  return [...map.values()].sort((a,b) => b.totalVendido - a.totalVendido || a.nome.localeCompare(b.nome));
}

function renderAlerts() {
  const alerts = [];
  const expiring = usersCache.filter((user) => {
    if (!user.planoFim) return false;
    const diff = dayDiff(new Date(), new Date(user.planoFim));
    return diff >= 0 && diff <= 3;
  });
  if (expiring.length) alerts.push({ title: 'Planos vencendo', text: `${expiring.length} cliente(s) com plano vencendo em até 3 dias.` });
  const pendingTotal = salesCache.filter((sale) => sale.status === 'pendente').reduce((sum, sale) => sum + Number(sale.valor || 0), 0);
  if (pendingTotal > 0) alerts.push({ title: 'Recebimentos pendentes', text: `Há ${formatBRL(pendingTotal)} aguardando pagamento.` });
  const net = totals().net;
  if (net < 0) alerts.push({ title: 'Lucro negativo', text: 'As despesas já ultrapassaram os recebimentos.' });
  alertsList.innerHTML = alerts.length ? alerts.map((item) => `<div class="simple-item"><strong>${escapeHtml(item.title)}</strong><span>${escapeHtml(item.text)}</span></div>`).join('') : `<div class="simple-item">Nenhum alerta importante no momento.</div>`;
}

function updateStats() {
  const t = totals();
  const month = monthTotals();
  const expiring = usersCache.filter((user) => {
    if (!user.planoFim) return false;
    const diff = dayDiff(new Date(), new Date(user.planoFim));
    return diff >= 0 && diff <= 3;
  }).length;

  setText('statUsers', usersCache.length);
  setText('statPlans', plansCache.length);
  setText('statActivePlans', usersCache.filter((user) => resolvePlanStatus(user).key === 'ativo').length);
  setText('statRevenueTotal', formatBRL(t.sold));
  setText('statReceivedTotal', formatBRL(t.received));
  setText('statNetTotal', formatBRL(t.net));
  setText('dashSoldMonth', formatBRL(month.sold));
  setText('dashReceivedMonth', formatBRL(month.received));
  setText('dashPending', formatBRL(t.pending));
  setText('dashExpensesMonth', formatBRL(month.expenses));

  setText('finTotalSold', formatBRL(t.sold));
  setText('finTotalReceived', formatBRL(t.received));
  setText('finTotalPending', formatBRL(t.pending));
  setText('finTotalExpenses', formatBRL(t.expenses));
  setText('finNet', formatBRL(t.net));
  setText('finExpiring', expiring);
  setText('finSalesCount', salesCache.length);
  setText('finReceiptsCount', receiptsCache.length);
  setText('finExpensesCount', expensesCache.length);
  setText('finClientsActive', usersCache.filter((user) => resolvePlanStatus(user).key === 'ativo').length);
}

function totals() {
  const sold = salesCache.filter((sale) => sale.status !== 'cancelado').reduce((sum, sale) => sum + Number(sale.valor || 0), 0);
  const received = receiptsCache.reduce((sum, receipt) => sum + Number(receipt.valorRecebido || 0), 0);
  const expenses = expensesCache.reduce((sum, expense) => sum + Number(expense.valor || 0), 0);
  const pending = Math.max(0, sold - received);
  return { sold, received, expenses, pending, net: received - expenses };
}

function monthTotals() {
  const now = new Date();
  const sameMonth = (value) => {
    const date = new Date(value);
    return !Number.isNaN(date.getTime()) && date.getMonth() === now.getMonth() && date.getFullYear() === now.getFullYear();
  };
  const sold = salesCache.filter((sale) => sameMonth(sale.dataVenda) && sale.status !== 'cancelado').reduce((sum, sale) => sum + Number(sale.valor || 0), 0);
  const received = receiptsCache.filter((receipt) => sameMonth(receipt.dataRecebimento)).reduce((sum, receipt) => sum + Number(receipt.valorRecebido || 0), 0);
  const expenses = expensesCache.filter((expense) => sameMonth(expense.data)).reduce((sum, expense) => sum + Number(expense.valor || 0), 0);
  return { sold, received, expenses };
}

function openPlanModal(plan = null) {
  setText('planModalTitle', plan ? 'Editar plano' : 'Novo plano');
  document.getElementById('planId').value = plan?.id || '';
  document.getElementById('planName').value = plan?.nome || '';
  document.getElementById('planValue').value = plan?.valor ?? '';
  document.getElementById('planDuration').value = plan?.duracaoQuantidade ?? '';
  document.getElementById('planUnit').value = plan?.duracaoUnidade || 'days';
  document.getElementById('planDescription').value = plan?.descricao || '';
  document.getElementById('planActive').checked = !!plan?.ativo;
  planModal.classList.remove('hidden');
}

function openUserPlanModal(user) {
  document.getElementById('targetUserId').value = user.id;
  document.getElementById('targetUserLabel').value = `${user.nome || 'Sem nome'} - ${user.email || ''}`;
  document.getElementById('targetPlanStart').value = toInputDateTimeLocal(user.planoInicio) || toInputDateTimeLocal(new Date());
  document.getElementById('targetPlanEnd').value = toInputDateTimeLocal(user.planoFim);
  targetUsePlanDuration.checked = true;
  targetPlanEnd.disabled = true;
  const select = document.getElementById('targetPlanSelect');
  select.innerHTML = plansCache.filter((plan) => plan.ativo).map((plan) => `<option value="${plan.id}">${escapeHtml(plan.nome)}</option>`).join('');
  const currentPlan = plansCache.find((plan) => plan.id === user.planoAtualId || plan.nome === user.planoAtualNome);
  if (currentPlan) select.value = currentPlan.id;
  userPlanModal.classList.remove('hidden');
}

function openSaleModal(sale = null) {
  setText('saleModalTitle', sale ? 'Editar venda' : 'Nova venda');
  document.getElementById('saleId').value = sale?.id || '';
  fillUserSelect('saleUserId', sale?.clienteId || '');
  fillPlanSelect('salePlanId', sale?.planoId || '');
  document.getElementById('saleClientName').value = sale?.clienteNome || '';
  document.getElementById('saleValue').value = sale?.valor ?? '';
  document.getElementById('salePaymentMethod').value = sale?.formaPagamento || 'Pix';
  document.getElementById('saleStatus').value = sale?.status || 'pendente';
  document.getElementById('saleDate').value = toInputDateTimeLocal(sale?.dataVenda) || toInputDateTimeLocal(new Date());
  document.getElementById('salePaymentDate').value = toInputDateTimeLocal(sale?.dataPagamento);
  document.getElementById('saleNotes').value = sale?.observacao || '';
  saleModal.classList.remove('hidden');
}

function openReceiptModal(receipt = null) {
  setText('receiptModalTitle', receipt ? 'Editar recebimento' : 'Novo recebimento');
  document.getElementById('receiptId').value = receipt?.id || '';
  fillSalesSelect('receiptSaleId', receipt?.vendaId || '');
  document.getElementById('receiptClientName').value = receipt?.clienteNome || '';
  document.getElementById('receiptValue').value = receipt?.valorRecebido ?? '';
  document.getElementById('receiptPaymentMethod').value = receipt?.metodoPagamento || 'Pix';
  document.getElementById('receiptDate').value = toInputDateTimeLocal(receipt?.dataRecebimento) || toInputDateTimeLocal(new Date());
  document.getElementById('receiptNotes').value = receipt?.observacao || '';
  receiptModal.classList.remove('hidden');
}

function openExpenseModal(expense = null) {
  setText('expenseModalTitle', expense ? 'Editar despesa' : 'Nova despesa');
  document.getElementById('expenseId').value = expense?.id || '';
  document.getElementById('expenseDescription').value = expense?.descricao || '';
  document.getElementById('expenseCategory').value = expense?.categoria || 'Domínio';
  document.getElementById('expenseValue').value = expense?.valor ?? '';
  document.getElementById('expensePaymentMethod').value = expense?.formaPagamento || 'Pix';
  document.getElementById('expenseDate').value = toInputDateTimeLocal(expense?.data) || toInputDateTimeLocal(new Date());
  document.getElementById('expenseNotes').value = expense?.observacao || '';
  expenseModal.classList.remove('hidden');
}

function fillUserSelect(id, current = '') {
  const select = document.getElementById(id);
  select.innerHTML = `<option value="">Selecionar usuário</option>` + usersCache.map((user) => `<option value="${user.id}">${escapeHtml(user.nome || user.email || 'Usuário')}</option>`).join('');
  select.value = current || '';
}

function fillPlanSelect(id, current = '') {
  const select = document.getElementById(id);
  select.innerHTML = plansCache.filter((plan) => plan.ativo).map((plan) => `<option value="${plan.id}">${escapeHtml(plan.nome)} - ${formatBRL(plan.valor || 0)}</option>`).join('');
  if (current) select.value = current;
}

function fillSalesSelect(id, current = '') {
  const select = document.getElementById(id);
  select.innerHTML = `<option value="">Nenhuma</option>` + salesCache.map((sale) => `<option value="${sale.id}">${escapeHtml(sale.clienteNome || 'Cliente')} - ${escapeHtml(sale.planoNome || 'Plano')} - ${formatBRL(sale.valor || 0)}</option>`).join('');
  if (current) select.value = current;
}

function closeModal(id) { document.getElementById(id).classList.add('hidden'); }

async function savePlan(event) {
  event.preventDefault();
  const id = document.getElementById('planId').value.trim() || slugify(document.getElementById('planName').value);
  const current = plansCache.find((plan) => plan.id === id);
  const payload = {
    nome: document.getElementById('planName').value.trim(),
    valor: Number(document.getElementById('planValue').value || 0),
    duracaoQuantidade: Number(document.getElementById('planDuration').value || 0),
    duracaoUnidade: document.getElementById('planUnit').value,
    descricao: document.getElementById('planDescription').value.trim(),
    ativo: document.getElementById('planActive').checked,
    atualizadoEm: serverTimestamp(),
    ocultoNaEscolha: current?.fixo ? true : false,
    fixo: current?.fixo || false
  };
  await setDoc(doc(db, 'planos', id), { ...payload, criadoEm: current?.criadoEm || serverTimestamp() }, { merge: true });
  closeModal('planModal');
}

async function saveUserPlan(event) {
  event.preventDefault();
  const userId = document.getElementById('targetUserId').value;
  const planId = document.getElementById('targetPlanSelect').value;
  const startInput = document.getElementById('targetPlanStart').value;
  const endInput = document.getElementById('targetPlanEnd').value;
  const plan = plansCache.find((item) => item.id === planId);
  if (!userId || !plan || !startInput) { alert('Preencha os campos obrigatórios.'); return; }
  const startDate = new Date(startInput);
  const endDate = targetUsePlanDuration.checked ? calculatePlanEnd(startDate, plan.duracaoQuantidade, plan.duracaoUnidade) : new Date(endInput);
  const planoPayload = {
    planoAtualId: plan.id,
    planoAtualNome: plan.nome,
    planoValor: plan.valor,
    planoInicio: startDate.toISOString(),
    planoFim: endDate.toISOString(),
    planoStatus: 'ativo',
    atualizadoEm: serverTimestamp()
  };
  await updateDoc(doc(db, 'usuarios', userId), planoPayload);
  await setDoc(doc(db, 'usuarios', userId, 'plano', 'dados'), {
    id: plan.id,
    nome: plan.nome,
    valor: plan.valor,
    dataInicio: startDate.getTime(),
    dataFim: endDate.getTime(),
    status: 'ativo',
    atualizadoEm: serverTimestamp()
  }, { merge: true });
  closeModal('userPlanModal');
}

async function removeUserPlan() {
  const userId = document.getElementById('targetUserId').value;
  if (!userId || !confirm('Remover o plano atual deste usuário?')) return;
  await updateDoc(doc(db, 'usuarios', userId), {
    planoAtualId: null, planoAtualNome: null, planoValor: null, planoInicio: null, planoFim: null, planoStatus: 'sem_plano', atualizadoEm: serverTimestamp()
  });
  await setDoc(doc(db, 'usuarios', userId, 'plano', 'dados'), {
    id: null,
    nome: 'Plano Free',
    valor: 0,
    dataInicio: 0,
    dataFim: 0,
    status: 'sem_plano',
    atualizadoEm: serverTimestamp()
  }, { merge: true });
  closeModal('userPlanModal');
}

async function saveSale(event) {
  event.preventDefault();
  const id = document.getElementById('saleId').value.trim();
  const ref = id ? doc(db, 'vendas_planos', id) : doc(collection(db, 'vendas_planos'));
  const userId = document.getElementById('saleUserId').value;
  const user = usersCache.find((item) => item.id === userId);
  const planId = document.getElementById('salePlanId').value;
  const plan = plansCache.find((item) => item.id === planId);
  const status = document.getElementById('saleStatus').value;
  const payload = {
    clienteId: userId || null,
    clienteNome: document.getElementById('saleClientName').value.trim() || user?.nome || user?.email || 'Cliente',
    clienteEmail: user?.email || null,
    planoId,
    planoNome: plan?.nome || 'Plano',
    valor: Number(document.getElementById('saleValue').value || plan?.valor || 0),
    formaPagamento: document.getElementById('salePaymentMethod').value,
    status,
    dataVenda: new Date(document.getElementById('saleDate').value).toISOString(),
    dataPagamento: document.getElementById('salePaymentDate').value ? new Date(document.getElementById('salePaymentDate').value).toISOString() : null,
    observacao: document.getElementById('saleNotes').value.trim(),
    atualizadoEm: serverTimestamp(),
    criadoEm: id ? (salesCache.find((item) => item.id === id)?.criadoEm || serverTimestamp()) : serverTimestamp()
  };
  await setDoc(ref, payload, { merge: true });
  closeModal('saleModal');
}

async function saveReceipt(event) {
  event.preventDefault();
  const id = document.getElementById('receiptId').value.trim();
  const ref = id ? doc(db, 'recebimentos', id) : doc(collection(db, 'recebimentos'));
  const saleId = document.getElementById('receiptSaleId').value;
  const linkedSale = salesCache.find((item) => item.id === saleId);
  const payload = {
    vendaId: saleId || null,
    clienteNome: document.getElementById('receiptClientName').value.trim() || linkedSale?.clienteNome || 'Cliente',
    clienteEmail: linkedSale?.clienteEmail || null,
    valorRecebido: Number(document.getElementById('receiptValue').value || 0),
    metodoPagamento: document.getElementById('receiptPaymentMethod').value,
    dataRecebimento: new Date(document.getElementById('receiptDate').value).toISOString(),
    observacao: document.getElementById('receiptNotes').value.trim(),
    atualizadoEm: serverTimestamp(),
    criadoEm: id ? (receiptsCache.find((item) => item.id === id)?.criadoEm || serverTimestamp()) : serverTimestamp()
  };
  await setDoc(ref, payload, { merge: true });
  if (saleId) {
    await updateDoc(doc(db, 'vendas_planos', saleId), { status: 'pago', dataPagamento: payload.dataRecebimento, atualizadoEm: serverTimestamp() });
  }
  closeModal('receiptModal');
}

async function saveExpense(event) {
  event.preventDefault();
  const id = document.getElementById('expenseId').value.trim();
  const ref = id ? doc(db, 'despesas', id) : doc(collection(db, 'despesas'));
  const payload = {
    descricao: document.getElementById('expenseDescription').value.trim(),
    categoria: document.getElementById('expenseCategory').value,
    valor: Number(document.getElementById('expenseValue').value || 0),
    formaPagamento: document.getElementById('expensePaymentMethod').value,
    data: new Date(document.getElementById('expenseDate').value).toISOString(),
    observacao: document.getElementById('expenseNotes').value.trim(),
    atualizadoEm: serverTimestamp(),
    criadoEm: id ? (expensesCache.find((item) => item.id === id)?.criadoEm || serverTimestamp()) : serverTimestamp()
  };
  await setDoc(ref, payload, { merge: true });
  closeModal('expenseModal');
}


async function deleteUserAndRelatedData(userId) {
  const batch = writeBatch(db);
  batch.delete(doc(db, 'usuarios', userId));

  salesCache
    .filter((sale) => sale.clienteId === userId)
    .forEach((sale) => batch.delete(doc(db, 'vendas_planos', sale.id)));

  receiptsCache
    .filter((receipt) => {
      const linkedSale = salesCache.find((sale) => sale.id === receipt.vendaId);
      return receipt.clienteId === userId || linkedSale?.clienteId === userId;
    })
    .forEach((receipt) => batch.delete(doc(db, 'recebimentos', receipt.id)));

  await batch.commit();
}


function toggleSidebarCollapse() {
  if (window.innerWidth <= 1024) return;
  appShell?.classList.toggle('sidebar-collapsed');
  const collapsed = appShell?.classList.contains('sidebar-collapsed');
  if (sidebarToggleBtn) {
    sidebarToggleBtn.textContent = collapsed ? '›' : '‹';
    sidebarToggleBtn.setAttribute('aria-label', collapsed ? 'Mostrar menu' : 'Ocultar menu');
    sidebarToggleBtn.title = collapsed ? 'Mostrar menu' : 'Ocultar menu';
  }
}

window.addEventListener('resize', () => {
  if (window.innerWidth <= 1024) {
    appShell?.classList.remove('sidebar-collapsed');
    if (sidebarToggleBtn) {
      sidebarToggleBtn.textContent = '‹';
      sidebarToggleBtn.setAttribute('aria-label', 'Ocultar menu');
      sidebarToggleBtn.title = 'Ocultar menu';
    }
  }
});
function toggleMobileMenu() {
  sidebar?.classList.toggle('is-open');
  mobileSidebarBackdrop?.classList.toggle('hidden', !sidebar?.classList.contains('is-open'));
}

function closeMobileMenu() {
  sidebar?.classList.remove('is-open');
  mobileSidebarBackdrop?.classList.add('hidden');
}

function renderDashboardCharts() {
  if (!dashboardCharts || typeof Chart === 'undefined') return;
  const configs = buildDashboardChartConfigs();

  dashboardCharts.innerHTML = '';
  for (const [, chart] of chartInstances.entries()) chart.destroy();
  chartInstances.clear();

  for (const config of configs) {
    const article = document.createElement('article');
    article.className = 'card chart-card';
    article.innerHTML = `
      <div>
        <h3>${escapeHtml(config.title)}</h3>
        <p>${escapeHtml(config.subtitle)}</p>
      </div>
      <div class="chart-wrap">
        <canvas id="${config.id}"></canvas>
      </div>`;
    dashboardCharts.appendChild(article);
    const ctx = article.querySelector('canvas');
    chartInstances.set(config.id, new Chart(ctx, config.chart));
  }
}

function buildDashboardChartConfigs() {
  const configs = [];

  const revenueByMonth = new Map();
  for (const sale of salesCache) {
    if (!sale.dataVenda) continue;
    const date = new Date(sale.dataVenda);
    if (Number.isNaN(date.getTime())) continue;
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    revenueByMonth.set(key, (revenueByMonth.get(key) || 0) + Number(sale.valor || 0));
  }
  if (revenueByMonth.size > 0) {
    const labels = [...revenueByMonth.keys()].sort();
    configs.push({
      id: 'chartRevenueByMonth',
      title: 'Faturamento por mês',
      subtitle: 'Total vendido em cada mês.',
      chart: createBarChart(labels.map(formatMonthLabel), labels.map((key) => revenueByMonth.get(key)), true)
    });
  }

  const totalReceived = receiptsCache.reduce((sum, item) => sum + Number(item.valorRecebido || 0), 0);
  const totalPending = salesCache
    .filter((sale) => sale.status !== 'pago' && sale.status !== 'cancelado')
    .reduce((sum, sale) => sum + Number(sale.valor || 0), 0);
  if (totalReceived > 0 || totalPending > 0) {
    configs.push({
      id: 'chartReceivedPending',
      title: 'Recebido x Pendente',
      subtitle: 'O que já entrou e o que ainda falta receber.',
      chart: createPieLikeChart('doughnut', ['Recebido', 'Pendente'], [totalReceived, totalPending], true)
    });
  }

  const expensesByCategory = aggregateBy(expensesCache, (item) => item.categoria || 'Outros', (item) => Number(item.valor || 0));
  if (expensesByCategory.labels.length > 0) {
    configs.push({
      id: 'chartExpensesCategory',
      title: 'Despesas por categoria',
      subtitle: 'Distribuição dos gastos cadastrados.',
      chart: createPieLikeChart('pie', expensesByCategory.labels, expensesByCategory.values, true)
    });
  }

  const netByMonth = new Map(revenueByMonth);
  for (const expense of expensesCache) {
    if (!expense.data) continue;
    const date = new Date(expense.data);
    if (Number.isNaN(date.getTime())) continue;
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    netByMonth.set(key, (netByMonth.get(key) || 0) - Number(expense.valor || 0));
  }
  if (netByMonth.size > 0) {
    const labels = [...netByMonth.keys()].sort();
    configs.push({
      id: 'chartNetByMonth',
      title: 'Lucro líquido por mês',
      subtitle: 'Faturamento menos despesas por mês.',
      chart: createBarChart(labels.map(formatMonthLabel), labels.map((key) => netByMonth.get(key)), true)
    });
  }

  const plansMostSold = aggregateBy(salesCache, (item) => item.planoNome || 'Plano não informado', () => 1);
  if (plansMostSold.labels.length > 0) {
    configs.push({
      id: 'chartPlansMostSold',
      title: 'Planos mais vendidos',
      subtitle: 'Quantidade de vendas por plano.',
      chart: createBarChart(plansMostSold.labels, plansMostSold.values, false)
    });
  }

  const clientsStatus = { Ativos: 0, Vencidos: 0, Pendentes: 0 };
  for (const user of usersCache) {
    const status = resolvePlanStatus(user);
    if (status.key === 'ativo') clientsStatus.Ativos += 1;
    else if (status.key === 'vencido') clientsStatus.Vencidos += 1;
    else clientsStatus.Pendentes += 1;
  }
  if (Object.values(clientsStatus).some((value) => value > 0)) {
    configs.push({
      id: 'chartClientsStatus',
      title: 'Clientes ativos, vencidos e pendentes',
      subtitle: 'Situação dos clientes em relação aos planos.',
      chart: createPieLikeChart('doughnut', Object.keys(clientsStatus), Object.values(clientsStatus), false)
    });
  }

  const paymentMethods = aggregateBy(
    [
      ...salesCache.map((item) => ({ metodo: item.formaPagamento })),
      ...receiptsCache.map((item) => ({ metodo: item.metodoPagamento }))
    ],
    (item) => item.metodo || 'Outro',
    () => 1
  );
  if (paymentMethods.labels.length > 0) {
    configs.push({
      id: 'chartPaymentMethods',
      title: 'Formas de pagamento',
      subtitle: 'Métodos mais usados em vendas e recebimentos.',
      chart: createPieLikeChart('pie', paymentMethods.labels, paymentMethods.values, false)
    });
  }

  return configs;
}

function aggregateBy(items, getLabel, getValue) {
  const map = new Map();
  for (const item of items) {
    const label = getLabel(item);
    const value = Number(getValue(item) || 0);
    if (!label || value <= 0) continue;
    map.set(label, (map.get(label) || 0) + value);
  }
  return { labels: [...map.keys()], values: [...map.values()] };
}

function formatMonthLabel(key) {
  const [year, month] = key.split('-').map(Number);
  return new Date(year, month - 1, 1).toLocaleDateString('pt-BR', { month: 'short', year: 'numeric' });
}

function baseChartOptions(currency = false) {
  return {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { position: 'bottom' },
      tooltip: {
        callbacks: {
          label(context) {
            const value = context.raw ?? 0;
            return currency ? `${context.label}: ${formatBRL(value)}` : `${context.label}: ${value}`;
          }
        }
      }
    }
  };
}

function createBarChart(labels, values, currency = false) {
  return {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: currency ? 'Valor' : 'Quantidade',
        data: values,
        backgroundColor: ['#E01510', '#F95C1A', '#FE9723', '#FEDA15', '#EA9D60', '#D96B48', '#A12029', '#651D21']
      }]
    },
    options: {
      ...baseChartOptions(currency),
      scales: {
        y: {
          beginAtZero: true,
          ticks: {
            callback(value) {
              return currency ? formatBRL(value) : value;
            }
          }
        }
      }
    }
  };
}

function createPieLikeChart(type, labels, values, currency = false) {
  return {
    type,
    data: {
      labels,
      datasets: [{
        data: values,
        backgroundColor: ['#E01510', '#F95C1A', '#FE9723', '#FEDA15', '#EA9D60', '#D96B48', '#A12029', '#651D21']
      }]
    },
    options: baseChartOptions(currency)
  };
}

function calculatePlanEnd(startDate, quantity, unit) {
  const end = new Date(startDate);
  if (unit === 'hours') end.setHours(end.getHours() + quantity);
  else end.setDate(end.getDate() + quantity);
  return end;
}

function resolvePlanStatus(user) {
  if (!user.planoAtualNome || !user.planoFim) return { key: 'sem_plano', label: 'Sem plano', className: 'off' };
  const now = new Date(); const end = new Date(user.planoFim);
  if (Number.isNaN(end.getTime())) return { key: 'sem_plano', label: 'Sem plano', className: 'off' };
  if (end < now) return { key: 'vencido', label: 'Vencido', className: 'warn' };
  return { key: 'ativo', label: 'Ativo', className: 'ok' };
}

function dayDiff(a, b) { return Math.ceil((new Date(b).getTime() - new Date(a).getTime()) / 86400000); }
function formatDate(value) { if (!value) return '-'; const date = new Date(value); if (Number.isNaN(date.getTime())) return '-'; return date.toLocaleString('pt-BR'); }
function toInputDateTimeLocal(value) { if (!value) return ''; const date = new Date(value); if (Number.isNaN(date.getTime())) return ''; const pad = (n) => String(n).padStart(2, '0'); return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`; }
function formatBRL(value) { return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(value || 0)); }
function slugify(text) { return String(text || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, ''); }
function escapeHtml(text) { return String(text ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;'); }
function capitalize(text) { const s = String(text || ''); return s ? s.charAt(0).toUpperCase() + s.slice(1) : ''; }
function setText(id, value) { const el = document.getElementById(id); if (el) el.textContent = String(value); }
