import axios from 'axios';

const hasElectron = typeof window !== 'undefined' && !!(window as any).api;

export const api = {
  async scan() {
    return hasElectron ? (window as any).api.scan() : (await axios.post('/api/scan')).data;
  },
  async listGames() {
    return hasElectron ? (window as any).api.listGames() : (await axios.get('/api/games')).data;
  },
  async listClips(params: { game?: string; q?: string; page: number; pageSize: number }) {
    return hasElectron ? (window as any).api.listClips(params) : (await axios.get('/api/clips', { params })).data;
  },
  async updateClip(id: number, payload: { displayName?: string | null }) {
    return hasElectron ? (window as any).api.updateClip(id, payload) : (await axios.patch(`/api/clips/${id}`, payload)).data;
  },
  async deleteClip(id: number) {
    return hasElectron ? (window as any).api.deleteClip(id) : (await axios.delete(`/api/clips/${id}`)).data;
  },
  async openClip(id: number) {
    return hasElectron ? (window as any).api.openClip(id) : (await axios.post(`/api/clips/${id}/open`)).data;
  },
  async meta(id: number) {
    return hasElectron ? (window as any).api.meta(id) : (await axios.get(`/api/clips/${id}/meta`)).data;
  },
  async trim(id: number, range: { startSec: number; endSec: number }) {
    return hasElectron ? (window as any).api.trim(id, range) : (await axios.post(`/api/clips/${id}/trim`, range)).data;
  },
  streamUrl(id: number | string) {
    const n = Number(id);
    return hasElectron ? (window as any).api.streamUrlForClip(n) : `/api/clips/${n}/stream`;
  },
  thumbnailUrl(id: number | string) {
    const n = Number(id);
    return hasElectron ? (window as any).api.thumbnailUrlForClip(n) : `/api/clips/${n}/thumbnail`;
  },
  frameStripUrl(id: number | string) {
    const n = Number(id);
    return hasElectron ? (window as any).api.frameStripUrlForClip(n) : `/api/clips/${n}/frame-strip`;
  },
};


