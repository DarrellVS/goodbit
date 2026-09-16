import axios from '../axios';
import type {
  DraftAudio,
  DraftClip,
  DraftImportEntry,
  DraftImportSummary,
} from '../types/editor';

/**
 * Saved timelines: the one store a named draft lives in.
 *
 * Until 2.0 the editor kept its drafts in IndexedDB and mirrored them here, so
 * a draft existed twice with no rule for choosing between the copies. It is a
 * row now and only a row, because this is the copy that gets backed up, that a
 * restore can put back, and that does not go away with the Electron profile.
 * `services/editorDraftsDb.ts` keeps one local scratch record and says where
 * the line is.
 *
 * The payload is ids, filenames and edits, never media URLs: those are rebuilt
 * on restore from whatever the clip's id resolves to today.
 */
export interface ProjectTimeline {
  clips: DraftClip[];
  audio: DraftAudio[];
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

/**
 * Hand the old local store's drafts over, once, on the first run of 2.0.
 *
 * One call for the whole set rather than one per draft: the library applies it
 * in a single transaction, and the renderer deletes a local copy only once the
 * reply says where that copy landed, so a half-applied import would leave
 * records it believes are safe.
 */
export async function importEditorDrafts(
  drafts: DraftImportEntry[],
): Promise<DraftImportSummary> {
  const { data } = await axios.post<DraftImportSummary>('/api/projects/import', { drafts });
  return data;
}
