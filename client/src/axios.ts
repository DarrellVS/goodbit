import axios from 'axios';
import { auth } from './firebase';

const LAN_BASE = 'http://192.168.178.28:4000';
const ORIGIN_BASE = typeof window !== 'undefined' ? window.location.origin : '';

export let apiBaseOrigin = ORIGIN_BASE;

async function canReach(url: string, timeoutMs: number): Promise<boolean> {
  try {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeoutMs);
    const res = await fetch(`${url}/api/health`, {
      method: 'GET',
      mode: 'cors',
      cache: 'no-store',
      signal: controller.signal,
    });
    clearTimeout(id);
    if (!res.ok) return false;
    // best-effort parse
    try {
      const data = await res.json();
      return Boolean(data && data.ok);
    } catch {
      return true;
    }
  } catch {
    return false;
  }
}

export async function initApiBase(timeoutMs = 800): Promise<string> {
  const reachable = await canReach(LAN_BASE, timeoutMs);
  apiBaseOrigin = reachable ? LAN_BASE : ORIGIN_BASE;
  axios.defaults.baseURL = apiBaseOrigin;
  return apiBaseOrigin;
}

// Attach Firebase ID token if available
axios.interceptors.request.use(async (config) => {
  const user = auth.currentUser;
  const token = user ? await user.getIdToken() : null;
  if (token) {
    config.headers = config.headers || {};
    (config.headers as any)['Authorization'] = `Bearer ${token}`;
  }
  return config;
});

export default axios;


