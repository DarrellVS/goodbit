import { defineStore } from 'pinia';
import { auth } from '../firebase';
import { onAuthStateChanged, signInWithEmailAndPassword, signOut, type User } from 'firebase/auth';

export const useAuthStore = defineStore('auth', {
  state: () => ({
    user: null as User | null,
    idToken: null as string | null,
    loading: true,
  }),
  actions: {
    init(): Promise<void> {
      return new Promise((resolve) => {
        onAuthStateChanged(auth, async (user) => {
          this.user = user;
          if (user) {
            this.idToken = await user.getIdToken();
          } else {
            this.idToken = null;
          }
          this.loading = false;
          resolve();
        });
      });
    },
    async login(email: string, password: string) {
      await signInWithEmailAndPassword(auth, email, password);
    },
    async logout() {
      await signOut(auth);
    },
    async refreshToken() {
      if (!this.user) return null;
      this.idToken = await this.user.getIdToken(true);
      return this.idToken;
    },
  },
});


