import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('api', {
  scan: () => ipcRenderer.invoke('clips:scan'),
  listClips: (params: any) => ipcRenderer.invoke('clips:list', params),
  listGames: () => ipcRenderer.invoke('clips:games'),
  updateClip: (id: number, payload: any) => ipcRenderer.invoke('clips:update', { id, payload }),
  deleteClip: (id: number) => ipcRenderer.invoke('clips:delete', { id }),
  openClip: (id: number) => ipcRenderer.invoke('clips:open', { id }),
  meta: (id: number) => ipcRenderer.invoke('clips:meta', { id }),
  trim: (id: number, range: any) => ipcRenderer.invoke('clips:trim', { id, range }),
  streamUrlForClip: (id: number) => `media://clip?id=${id}`,
  thumbnailUrlForClip: (id: number) => `thumb://clip?id=${id}`,
  frameStripUrlForClip: (id: number) => `thumb://strip?id=${id}`,
});


