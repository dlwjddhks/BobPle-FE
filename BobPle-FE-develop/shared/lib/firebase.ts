// shared/lib/firebase.ts
import { initializeApp, getApps, getApp } from "firebase/app";
import { getAuth, GoogleAuthProvider } from "firebase/auth";

const firebaseConfig = {
  apiKey: "AIzaSyCZntc2T5X9d7tCzXLf6lerrGdjwFCCJO4",
  authDomain: "time-attack-bobple.firebaseapp.com",
  projectId: "time-attack-bobple",
  storageBucket: "time-attack-bobple.firebasestorage.app",
  messagingSenderId: "1098429130982",
  appId: "1:1098429130982:web:7972b9956868e863a27327"
};

for (const [k, v] of Object.entries(firebaseConfig)) {
  if (!v) {
    throw new Error(`[Firebase] Missing env: ${k}. Check your .env.local and restart dev server.`);
  }
}

export const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();