import { initializeApp } from "https://www.gstatic.com/firebasejs/12.12.0/firebase-app.js";
import { getAuth, GoogleAuthProvider } from "https://www.gstatic.com/firebasejs/12.12.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/12.12.0/firebase-firestore.js";

export const firebaseConfig = {
  apiKey: "AIzaSyDRfXjBsU92FGzfgMFy5Nt3IBmeoop_PXg",
  authDomain: "rota-motoboy-28b2d.firebaseapp.com",
  projectId: "rota-motoboy-28b2d",
  storageBucket: "rota-motoboy-28b2d.firebasestorage.app",
  messagingSenderId: "847237706120",
  appId: "1:847237706120:web:edec3e1844163ab1be0a3d",
  measurementId: "G-S54WJJ89KR"
};

export const ADMIN_EMAIL = "lindolfoandrew0@gmail.com";
export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const googleProvider = new GoogleAuthProvider();
