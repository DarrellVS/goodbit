import { BaseAction } from './BaseAction.js';
import { ffprobeJson } from '../services/ffmpegProcess.js';
import { AppDataSource } from '../data-source.js';
import { Clip } from '../entity/Clip.js';

export type ClipMeta = {
  durationSec: number;
  width: number | null;
  height: number | null;
  codec: string | null;
  fps: string | null;
};

export class GetClipMetaAction extends BaseAction<{ clipId: number }, ClipMeta> {
  async execute({ clipId }: { clipId: number }): Promise<ClipMeta> {
    const repo = AppDataSource.getRepository(Clip);
    const clip = await repo.findOneByOrFail({ id: clipId });
    const meta = await ffprobeJson(clip.filePath);
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


