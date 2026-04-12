import {
  auth,
  db,
  ADMIN_EMAIL
} from './firebase-config.js';

import {
  onAuthStateChanged,
  signOut,
  getIdTokenResult
} from 'https://www.gstatic.com/firebasejs/12.12.0/firebase-auth.js';

import {
  collection,
  doc,
  getDocs,
  serverTimestamp,
  setDoc,
  updateDoc,
  deleteDoc,
  onSnapshot,
  query,
  orderBy
} from 'https://www.gstatic.com/firebasejs/12.12.0/firebase-firestore.js';

const sections = {
  dashboard: document.getElementById('dashboardSection'),
  users: document.getElementById('usersSection'),
  plans: document.getElementById('plansSection')
};

const signOutBtn = document.getElementById('signOutBtn');
const refreshBtn = document.getElementById('refreshBtn');
const plansList = document.getElementById('plansList');
const usersList = document.getElementById('usersList');
const newPlanBtn = document.getElementById('newPlanBtn');
const planModal = document.getElementById('planModal');
const planForm = document.getElementById('planForm');
const userPlanModal = document.getElementById('userPlanModal');
const userPlanForm = document.getElementById('userPlanForm');
const removeUserPlanBtn = document.getElementById('removeUserPlanBtn');
const targetUsePlanDuration = document.getElementById('targetUsePlanDuration');
const targetPlanEnd = document.getElementById('targetPlanEnd');

const statUsers = document.getElementById('statUsers');
const statPlans = document.getElementById('statPlans');
const statActivePlans = document.getElementById('statActivePlans');
const viewTitle = document.getElementById('viewTitle');
const viewSubtitle = document.getElementById('viewSubtitle');
const adminPhoto = document.getElementById('adminPhoto');
const adminName = document.getElementById('adminName');
const adminEmail = document.getElementById('adminEmail');

let currentUser = null;
let unsubUsers = null;
let unsubPlans = null;
let plansCache = [];
let usersCache = [];

const DEFAULT_PLANS = [
  { id: 'plano-free', nome: 'Plano Free', valor: 0, duracaoQuantidade: 2, duracaoUnidade: 'hours', descricao: 'Plano inicial automático do sistema.', ativo: true, ocultoNaEscolha: true, fixo: true, criadoEm: null, atualizadoEm: null },
  { id: 'plano-semanal', nome: 'Plano Semanal', valor: 10, duracaoQuantidade: 7, duracaoUnidade: 'days', descricao: 'Plano semanal padrão.', ativo: true, ocultoNaEscolha: false, fixo: false, criadoEm: null, atualizadoEm: null },
  { id: 'plano-mensal', nome: 'Plano Mensal', valor: 25, duracaoQuantidade: 30, duracaoUnidade: 'days', descricao: 'Plano mensal padrão.', ativo: true, ocultoNaEscolha: false, fixo: false, criadoEm: null, atualizadoEm: null },
  { id: 'plano-trimestral', nome: 'Plano Trimestral', valor: 60, duracaoQuantidade: 90, duracaoUnidade: 'days', descricao: 'Plano trimestral padrão.', ativo: true, ocultoNaEscolha: false, fixo: false, criadoEm: null, atualizadoEm: null }
];

signOutBtn?.addEventListener('click', async () => {
  await signOut(auth);
  location.replace('index.html');
});
refreshBtn?.addEventListener('click', () => {
  renderUsers();
  renderPlans();
  updateStats();
});
newPlanBtn?.addEventListener('click', () => openPlanModal());

document.querySelectorAll('[data-close-modal]').forEach((button) => {
  button.addEventListener('click', () => closeModal(button.dataset.closeModal));
});

planForm?.addEventListener('submit', savePlan);
userPlanForm?.addEventListener('submit', saveUserPlan);
removeUserPlanBtn?.addEventListener('click', removeUserPlan);
targetUsePlanDuration?.addEventListener('change', () => {
  targetPlanEnd.disabled = targetUsePlanDuration.checked;
});

document.getElementById('navMenu')?.addEventListener('click', (event) => {
  const button = event.target.closest('.nav-btn');
  if (!button) return;
  setSection(button.dataset.view);
});

onAuthStateChanged(auth, async (user) => {
  currentUser = user;
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
    adminPhoto.src = user.photoURL || '';
    adminName.textContent = user.displayName || 'Administrador';
    adminEmail.textContent = user.email || '';
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
    renderPlans();
    updateStats();
  });
  unsubUsers = onSnapshot(query(collection(db, 'usuarios')), (snapshot) => {
    usersCache = snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
    renderUsers();
    updateStats();
  });
}

function stopListeners() {
  if (unsubPlans) unsubPlans();
  if (unsubUsers) unsubUsers();
  unsubPlans = null; unsubUsers = null; plansCache = []; usersCache = [];
}

function setSection(name) {
  Object.entries(sections).forEach(([key, element]) => {
    element.classList.toggle('active-section', key === name);
  });
  document.querySelectorAll('.nav-btn').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.view === name);
  });
  const labels = {
    dashboard: ['Dashboard', 'Resumo do sistema'],
    users: ['Usuários', 'Gerencie usuários e planos ativos'],
    plans: ['Planos', 'Cadastre e edite planos do sistema']
  };
  viewTitle.textContent = labels[name][0];
  viewSubtitle.textContent = labels[name][1];
}

function renderPlans() {
  plansList.innerHTML = '';
  if (!plansCache.length) {
    plansList.innerHTML = '<div class="card"><p>Nenhum plano cadastrado.</p></div>';
    return;
  }
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
  plansList.querySelectorAll('[data-edit-plan]').forEach((button) => {
    button.addEventListener('click', () => {
      const plan = plansCache.find((item) => item.id === button.dataset.editPlan);
      if (plan) openPlanModal(plan);
    });
  });
  plansList.querySelectorAll('[data-delete-plan]').forEach((button) => {
    button.addEventListener('click', async () => {
      if (!confirm('Excluir este plano?')) return;
      await deleteDoc(doc(db, 'planos', button.dataset.deletePlan));
    });
  });
}

function renderUsers() {
  usersList.innerHTML = '';
  if (!usersCache.length) {
    usersList.innerHTML = '<div class="card"><p>Nenhum usuário cadastrado ainda.</p></div>';
    return;
  }
  for (const user of usersCache) {
    const article = document.createElement('article');
    article.className = 'card user-card';
    const planoStatus = resolvePlanStatus(user);
    article.innerHTML = `
      <div class="card-head">
        <div>
          <h4>${escapeHtml(user.nome || user.email || 'Usuário sem nome')}</h4>
          <p>${escapeHtml(user.email || '')}</p>
        </div>
        <span class="badge ${planoStatus.className}">${planoStatus.label}</span>
      </div>
      <div class="meta-grid">
        <div class="meta-item"><small>Telefone</small><strong>${escapeHtml(user.telefone || '-')}</strong></div>
        <div class="meta-item"><small>Cidade / Estado</small><strong>${escapeHtml([user.cidade, user.estado].filter(Boolean).join(' / ') || '-')}</strong></div>
        <div class="meta-item"><small>Plano atual</small><strong>${escapeHtml(user.planoAtualNome || 'Sem plano')}</strong></div>
        <div class="meta-item"><small>Plano solicitado</small><strong>${escapeHtml(user.planoSolicitadoNome || '-')}</strong></div>
        <div class="meta-item"><small>Início</small><strong>${formatDate(user.planoInicio)}</strong></div>
        <div class="meta-item"><small>Fim</small><strong>${formatDate(user.planoFim)}</strong></div>
      </div>
      <div class="card-actions">
        <button class="btn btn-primary" data-manage-user-plan="${user.id}">Gerenciar plano</button>
      </div>`;
    usersList.appendChild(article);
  }
  usersList.querySelectorAll('[data-manage-user-plan]').forEach((button) => {
    button.addEventListener('click', () => {
      const user = usersCache.find((item) => item.id === button.dataset.manageUserPlan);
      if (user) openUserPlanModal(user);
    });
  });
}

function updateStats() {
  statUsers.textContent = String(usersCache.length);
  statPlans.textContent = String(plansCache.length);
  statActivePlans.textContent = String(usersCache.filter((user) => resolvePlanStatus(user).key === 'ativo').length);
}

function openPlanModal(plan = null) {
  document.getElementById('planModalTitle').textContent = plan ? 'Editar plano' : 'Novo plano';
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
  const currentPlan = plansCache.find((plan) => plan.nome === user.planoAtualNome || plan.id === user.planoAtualId);
  if (currentPlan) select.value = currentPlan.id;
  userPlanModal.classList.remove('hidden');
}

function closeModal(id) { document.getElementById(id).classList.add('hidden'); }

async function savePlan(event) {
  event.preventDefault();
  const id = document.getElementById('planId').value.trim() || slugify(document.getElementById('planName').value);
  const current = plansCache.find((plan) => plan.id === id);
  if (current?.fixo && id !== 'plano-free') { alert('Plano fixo inválido.'); return; }
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
  await updateDoc(doc(db, 'usuarios', userId), {
    planoAtualId: plan.id,
    planoAtualNome: plan.nome,
    planoValor: plan.valor,
    planoInicio: startDate.toISOString(),
    planoFim: endDate.toISOString(),
    planoStatus: 'ativo',
    atualizadoEm: serverTimestamp()
  });
  closeModal('userPlanModal');
}

async function removeUserPlan() {
  const userId = document.getElementById('targetUserId').value;
  if (!userId || !confirm('Remover o plano atual deste usuário?')) return;
  await updateDoc(doc(db, 'usuarios', userId), {
    planoAtualId: null, planoAtualNome: null, planoValor: null, planoInicio: null, planoFim: null, planoStatus: 'sem_plano', atualizadoEm: serverTimestamp()
  });
  closeModal('userPlanModal');
}

function calculatePlanEnd(startDate, quantity, unit) {
  const end = new Date(startDate);
  if (unit === 'hours') end.setHours(end.getHours() + quantity); else end.setDate(end.getDate() + quantity);
  return end;
}

function resolvePlanStatus(user) {
  if (!user.planoAtualNome || !user.planoFim) return { key: 'sem_plano', label: 'Sem plano', className: 'off' };
  const now = new Date(); const end = new Date(user.planoFim);
  if (Number.isNaN(end.getTime())) return { key: 'sem_plano', label: 'Sem plano', className: 'off' };
  if (end < now) return { key: 'vencido', label: 'Vencido', className: 'warn' };
  return { key: 'ativo', label: 'Ativo', className: 'ok' };
}

function formatDate(value) { if (!value) return '-'; const date = new Date(value); if (Number.isNaN(date.getTime())) return '-'; return date.toLocaleString('pt-BR'); }
function toInputDateTimeLocal(value) { if (!value) return ''; const date = new Date(value); if (Number.isNaN(date.getTime())) return ''; const pad = (n) => String(n).padStart(2, '0'); return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`; }
function formatBRL(value) { return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(value || 0)); }
function slugify(text) { return String(text || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, ''); }
function escapeHtml(text) { return String(text ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;'); }
