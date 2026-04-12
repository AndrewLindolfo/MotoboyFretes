import { auth, googleProvider, ADMIN_EMAIL } from './firebase-config.js';
import { signInWithPopup, onAuthStateChanged, signOut } from 'https://www.gstatic.com/firebasejs/12.12.0/firebase-auth.js';

const loginBtn = document.getElementById('loginBtn');
const loginMessage = document.getElementById('loginMessage');

loginBtn?.addEventListener('click', async () => {
  loginMessage.textContent = 'Abrindo login do Google...';
  loginBtn.disabled = true;
  try {
    const result = await signInWithPopup(auth, googleProvider);
    const email = (result.user?.email || '').toLowerCase();
    if (email === ADMIN_EMAIL.toLowerCase()) {
      location.replace('admin.html');
    } else {
      location.replace('acesso-negado.html');
    }
  } catch (error) {
    console.error('Erro no login Google:', error);
    loginMessage.textContent = error?.message || 'Falha ao entrar com Google.';
    loginBtn.disabled = false;
  }
});

onAuthStateChanged(auth, async (user) => {
  if (!user) return;
  const email = (user.email || '').toLowerCase();
  if (email === ADMIN_EMAIL.toLowerCase()) {
    location.replace('admin.html');
  } else {
    await signOut(auth);
    location.replace('acesso-negado.html');
  }
});
