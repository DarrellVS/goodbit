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

export interface TimelineState {
  clips: TimelineClip[];
  audioSegments: AudioSegment[];
  currentTime: number;
  duration: number;
  zoom: number;
  playing: boolean;
}

export interface ExportSettings {
  quality: 'high' | 'medium' | 'low';
  format: 'mp4' | 'webm';
  fps: 30 | 60;
  resolution: '1080p' | '720p' | '480p';
}

