import axios from '../axios';
import type { EditorDraftAudio, EditorDraftClip } from './editorDraftsDb';

/**
 * Saved timelines, kept by the server.
 *
 * The editor's own drafts live in IndexedDB, which is per-browser: clearing
 * site data loses them and a timeline built at the desk is invisible from the
 * couch. A named draft is saved here as well, so it belongs to the library
 * rather than to one browser profile.
 *
 * The payload is the same shape the local drafts use, ids, filenames and
 * edits, never media URLs, which carry an expiring token and a LAN host.
 */
export interface ProjectTimeline {
  clips: EditorDraftClip[];
  audio: EditorDraftAudio[];
}

export interface Project {
  id: number;
  name: string;
  timeline: ProjectTimeline;
  format: string;
  framePos: number;
  normalizeLoudness: boolean;
  archived: boolean;
  createdAt: string;
  updatedAt: string;
  clipCount: number;
}

export async function listProjects(includeArchived = false): Promise<Project[]> {
  const { data } = await axios.get<Project[]>('/api/projects', {
    params: { includeArchived: includeArchived ? 'true' : undefined },
  });
  return data;
}

export async function getProject(id: number): Promise<Project> {
  const { data } = await axios.get<Project>(`/api/projects/${id}`);
  return data;
}

export async function createProject(input: {
  name: string;
  timeline: ProjectTimeline;
  format?: string;
  framePos?: number;
  normalizeLoudness?: boolean;
}): Promise<Project> {
  const { data } = await axios.post<Project>('/api/projects', input);
  return data;
}

/** Anything left out is left alone, so a rename need not resend the timeline. */
export async function updateProject(
  id: number,
  input: Partial<{
    name: string;
    timeline: ProjectTimeline;
    format: string;
    framePos: number;
    normalizeLoudness: boolean;
    archived: boolean;
  }>,
): Promise<Project> {
  const { data } = await axios.put<Project>(`/api/projects/${id}`, input);
  return data;
}

export async function deleteProject(id: number): Promise<void> {
  await axios.delete(`/api/projects/${id}`);
}
