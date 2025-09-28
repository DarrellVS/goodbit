<template>
  <div class="h-full flex items-center justify-center">
    <form class="card p-8 space-y-6 w-[360px]" @submit.prevent="submit">
      <h1 class="text-2xl font-semibold text-center">Sign in</h1>
      <div class="space-y-2">
        <input class="input w-full" v-model="email" type="email" placeholder="Email" required />
        <input class="input w-full" v-model="password" type="password" placeholder="Password" required />
      </div>
      <button class="btn btn-primary w-full" type="submit" :disabled="loading">
        <span v-if="!loading">Sign in</span>
        <span v-else>Signing in…</span>
      </button>
      
      <p v-if="error" class="text-danger-500 text-sm">{{ error }}</p>
    </form>
  </div>
  </template>

<script lang="ts" setup>
import { ref } from 'vue';
import { useAuthStore } from '../stores/auth';
import { useRouter } from 'vue-router';

const auth = useAuthStore();
const router = useRouter();
const loading = ref(false);
const email = ref('');
const password = ref('');
const error = ref('');

async function submit() {
  if (loading.value) return;
  loading.value = true;
  error.value = '';
  try {
    await auth.login(email.value, password.value);
    await router.replace('/');
  } catch (e: any) {
    error.value = e?.message || 'Failed to sign in';
  } finally {
    loading.value = false;
  }
}

 
</script>


