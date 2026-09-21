import { getApp, getApps, initializeApp, type FirebaseApp } from "firebase/app";
import {
  getAuth,
  inMemoryPersistence,
  initializeAuth,
  type Auth,
} from "firebase/auth";

function requireEnv(name: keyof ImportMetaEnv): string {
  const value = import.meta.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable ${name}`);
  }
  return value;
}

const firebaseConfig = {
  apiKey: requireEnv("VITE_FIREBASE_API_KEY"),
  authDomain: requireEnv("VITE_FIREBASE_AUTH_DOMAIN"),
  projectId: requireEnv("VITE_FIREBASE_PROJECT_ID"),
  storageBucket: requireEnv("VITE_FIREBASE_STORAGE_BUCKET"),
  messagingSenderId: requireEnv("VITE_FIREBASE_MESSAGING_SENDER_ID"),
  appId: requireEnv("VITE_FIREBASE_APP_ID"),
};

function getOrInitApp(): FirebaseApp {
  return getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
}

function isAlreadyInitialized(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code: unknown }).code === "auth/already-initialized"
  );
}

function getOrInitAuth(app: FirebaseApp): Auth {
  try {
    return initializeAuth(app, { persistence: inMemoryPersistence });
  } catch (error) {
    if (isAlreadyInitialized(error)) {
      return getAuth(app);
    }
    throw error;
  }
}

export const app = getOrInitApp();
export const auth = getOrInitAuth(app);
export const firebaseApiKey = firebaseConfig.apiKey;
