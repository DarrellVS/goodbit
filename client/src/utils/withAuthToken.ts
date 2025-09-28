import { useAuthStore } from '../stores/auth';

export function withAuthToken(url: string): string {
  const auth = useAuthStore();
  const token = auth.idToken;
  if (!token) return url;
  const sep = url.includes('?') ? '&' : '?';
  return `${url}${sep}token=${encodeURIComponent(token)}`;
}


