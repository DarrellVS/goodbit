import { defineStore } from 'pinia';
import { auth } from '../firebase';
import { onAuthStateChanged, signInWithEmailAndPassword, signOut, type User } from 'firebase/auth';

interface AuthState {
  user: User | null;
  idToken: string | null;
  loading: boolean;
}

export const useAuthStore = defineStore('auth', {
  state: (): AuthState => ({
    user: null,
    idToken: null,
    loading: true,
  }),

  getters: {
    isAuthenticated: (state) => !!state.user,
    userId: (state) => state.user?.uid,
  },

  actions: {
    init(): Promise<void> {
      return new Promise((resolve) => {
        onAuthStateChanged(auth, async (user) => {
          this.user = user;
          this.idToken = user ? await user.getIdToken() : null;
          this.loading = false;
          resolve();
        });
      });
    },

    async login(email: string, password: string): Promise<void> {
      await signInWithEmailAndPassword(auth, email, password);
    },

    async logout(): Promise<void> {
      await signOut(auth);
    },

    async refreshToken(): Promise<string | null> {
      if (!this.user) return null;
      this.idToken = await this.user.getIdToken(true);
      return this.idToken;
    },
  },
});


