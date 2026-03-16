import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';

if (!firebaseConfig || !firebaseConfig.apiKey || firebaseConfig.apiKey === 'TODO_KEYHERE') {
  throw new Error("Configurazione Firebase mancante o non valida. Assicurati di aver configurato il file firebase-applet-config.json.");
}

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
