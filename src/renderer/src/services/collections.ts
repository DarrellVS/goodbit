import axios from '../axios';
import type { Collection } from '../types/collection';
import type { Clip } from '../types/clip';

export async function getCollections(): Promise<Collection[]> {
  const { data } = await axios.get('/api/collections');
  return data;
}

export async function createCollection(name: string): Promise<Collection> {
  const { data } = await axios.post('/api/collections', { name });
  return data;
}

export async function updateCollection(id: number, name: string): Promise<Collection> {
  const { data } = await axios.patch(`/api/collections/${id}`, { name });
  return data;
}

export async function deleteCollection(id: number): Promise<void> {
  await axios.delete(`/api/collections/${id}`);
}

interface CollectionClipsParams {
  page?: number;
  pageSize?: number;
  game?: string;
  q?: string;
  tags?: string;
  published?: string;
  starred?: string;
}

interface CollectionClipsResponse {
  items: Clip[];
  total: number;
  page: number;
  pageSize: number;
}

export async function getCollectionClips(
  id: number,
  params?: CollectionClipsParams
): Promise<CollectionClipsResponse> {
  const { data } = await axios.get(`/api/collections/${id}/clips`, { params });
  return data;
}

export async function addClipToCollection(collectionId: number, clipId: number): Promise<Collection> {
  const { data } = await axios.post(`/api/collections/${collectionId}/clips/${clipId}`);
  return data;
}

export async function removeClipFromCollection(collectionId: number, clipId: number): Promise<Collection> {
  const { data } = await axios.delete(`/api/collections/${collectionId}/clips/${clipId}`);
  return data;
}

