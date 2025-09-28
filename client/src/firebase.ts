import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';

// Expect Vite env vars to be configured for the Web SDK
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || 'AIzaSyAzSv4ZpImIVVts9t3pdFyfB8ATvWnXaj4',
  authDomain: `${import.meta.env.VITE_FIREBASE_PROJECT_ID || 'clips-b0bbe'}.firebaseapp.com`,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || 'clips-b0bbe',
};

export const firebaseApp = initializeApp(firebaseConfig);
export const auth = getAuth(firebaseApp);


