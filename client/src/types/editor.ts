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
