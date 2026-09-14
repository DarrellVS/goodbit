export interface TimelineClip {
  id: string;
  clipId: number;
  startTime: number;
  duration: number;
  trimStart: number;
  trimEnd: number;
  volume: number;
  muted: boolean;
  videoUrl: string;
  thumbnailUrl: string;
  originalDuration: number;
}

/**
 * A music track placed on the editor's audio lane.
 *
 * Unlike video clips these never reflow: they may sit anywhere, overlap each
 * other, and run past the end of the picture (the export cuts them there).
 */
export interface TimelineAudio {
  /** Instance id. The same library track can be placed more than once. */
  id: string;
  /** Filename of the track in the editor music folder. */
  trackId: string;
  name: string;
  url: string;
  startTime: number;
  duration: number;
  trimStart: number;
  trimEnd: number;
  originalDuration: number;
  volume: number;
  muted: boolean;
  fadeIn: number;
  fadeOut: number;
}

export interface AudioSegment {
  id: string;
  startTime: number;
  endTime: number;
  muted: boolean;
}

export interface RulerMark {
  position: number;
  label: string;
}

export interface DragState {
  active: boolean;
  startX: number;
  initialValue: number;
}
