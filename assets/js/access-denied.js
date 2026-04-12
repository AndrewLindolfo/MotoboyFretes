import { auth } from './firebase-config.js';
import { signOut, onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/12.12.0/firebase-auth.js';

const btn = document.getElementById('switchAccountBtn');
const msg = document.getElementById('accessMessage');

btn?.addEventListener('click', async () => {
  msg.textContent = 'Saindo da conta...';
  await signOut(auth);
  location.replace('index.html');
});

onAuthStateChanged(auth, (user) => {
  if (!user) {
    msg.textContent = 'Faça login com a conta administradora.';
  }
});
