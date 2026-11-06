import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';

// ============================================
//   CONFIGURACIÓN DE TU PROYECTO VIAJE
// ============================================
const firebaseConfig = {
  apiKey: "AIzaSyBpRxpm93dz5rQTc7OAnhmxwiX5FAtqiVI",
  authDomain: "viaje-edc90.firebaseapp.com",
  projectId: "viaje-edc90",
  storageBucket: "viaje-edc90.firebasestorage.app",
  messagingSenderId: "738799537465",
  appId: "1:738799537465:web:241c4bec01fd82c0ddace8",
  measurementId: "G-2Z6F4NMYZJ"
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);
export const googleProvider = new GoogleAuthProvider();