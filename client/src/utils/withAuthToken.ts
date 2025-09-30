import { useAuthStore } from '../stores/auth';
import { apiBaseOrigin } from '../axios';

export function withAuthToken(url: string): string {
  const auth = useAuthStore();
  const token = auth.idToken;
  const absoluteUrl = url.startsWith('http') ? url : `${apiBaseOrigin}${url}`;
  if (!token) return absoluteUrl;
  const sep = url.includes('?') ? '&' : '?';
  return `${absoluteUrl}${sep}token=${encodeURIComponent(token)}`;
}


