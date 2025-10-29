import { BaseAction } from './BaseAction.js';
import { ffmpegConfigured } from '../services/ffmpeg.js';

export interface VideoMetadata {
  durationSec: number;
  width: number | null;
  height: number | null;
  codec: string | null;
  fps: string | null;
}

export interface GetVideoMetadataInput {
  filePath: string;
}

export class GetVideoMetadataAction extends BaseAction<GetVideoMetadataInput, VideoMetadata> {
  async execute({ filePath }: GetVideoMetadataInput): Promise<VideoMetadata> {
    const meta = await new Promise<any>((resolve, reject) => {
      ffmpegConfigured.ffprobe(filePath, (err: any, data: any) => {
        if (err) return reject(err);
        resolve(data);
      });
    });
    
    const format = meta.format || ({} as any);
    const streams = meta.streams || [];
    const v = streams.find((s: any) => s.codec_type === 'video') as any;
    
    return {
      durationSec: Number(format.duration || 0),
      width: v?.width || null,
      height: v?.height || null,
      codec: v?.codec_name || null,
      fps: v?.avg_frame_rate || v?.r_frame_rate || null,
    };
  }
}


