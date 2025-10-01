import path from 'node:path';
import fs from 'node:fs/promises';
import { AppDataSource, VIDEOS_ROOT } from '../data-source.js';
import { Clip } from '../entity/Clip.js';
import { BaseAction } from './BaseAction.js';
import { ffmpegConfigured } from '../services/ffmpeg.js';
import type { FfmpegCommand } from 'fluent-ffmpeg';

interface TimelineClipData {
  clipId: number;
  startTime: number;
  trimStart: number;
  trimEnd: number;
  volume: number;
  muted: boolean;
}

interface ExportTimelineInput {
  clips: TimelineClipData[];
  outputName?: string;
  exportId?: string;
}

export const exportProgress = new Map<string, number>();

export class ExportTimelineAction extends BaseAction<ExportTimelineInput, { clip: Clip }> {
  async execute(input: ExportTimelineInput): Promise<{ clip: Clip }> {
    const { clips, outputName = `Export_${Date.now()}`, exportId } = input;
    
    if (exportId) {
      exportProgress.set(exportId, 0);
    }

    if (!clips || clips.length === 0) {
      throw new Error('No clips provided for export');
    }

    const clipRepo = AppDataSource.getRepository(Clip);
    const dbClips = await clipRepo.findByIds(clips.map(c => c.clipId));
    const clipMap = new Map(dbClips.map(c => [c.id, c]));

    const editorDir = path.join(VIDEOS_ROOT, 'Editor');
    await fs.mkdir(editorDir, { recursive: true });

    const tempDir = path.join(VIDEOS_ROOT, '.temp');
    await fs.mkdir(tempDir, { recursive: true });

    const tempFiles: string[] = [];
    const concatListPath = path.join(tempDir, `concat_${Date.now()}.txt`);
    const outputFilename = `${outputName}.mp4`;
    const outputPath = path.join(editorDir, outputFilename);
    const relPath = path.join('Editor', outputFilename);

    try {
      const totalSteps = clips.length + 1;
      
      for (let i = 0; i < clips.length; i++) {
        const timelineClip = clips[i];
        const dbClip = clipMap.get(timelineClip.clipId);
        
        if (!dbClip) {
          throw new Error(`Clip ${timelineClip.clipId} not found`);
        }

        const inputPath = dbClip.filePath;
        const tempOutputPath = path.join(tempDir, `segment_${i}_${Date.now()}.mp4`);
        tempFiles.push(tempOutputPath);

        if (exportId) {
          exportProgress.set(exportId, Math.round((i / totalSteps) * 100));
        }

        await this.processClipSegment(
          inputPath,
          tempOutputPath,
          timelineClip.trimStart,
          timelineClip.trimEnd,
          timelineClip.volume,
          timelineClip.muted
        );
      }
      
      if (exportId) {
        exportProgress.set(exportId, Math.round(((clips.length) / totalSteps) * 100));
      }

      const concatContent = tempFiles.map(f => `file '${f}'`).join('\n');
      await fs.writeFile(concatListPath, concatContent, 'utf-8');

      await this.concatenateClips(concatListPath, outputPath);

      const stats = await fs.stat(outputPath);
      
      const newClip = clipRepo.create({
        filePath: outputPath,
        relPath: relPath,
        filename: outputFilename,
        extension: '.mp4',
        displayName: outputName,
        game: 'Editor',
        sizeBytes: stats.size,
        fileModifiedAt: stats.mtime,
        published: false,
        starred: false,
      });

      const savedClip = await clipRepo.save(newClip);

      await fs.rm(tempDir, { recursive: true, force: true });

      if (exportId) {
        exportProgress.set(exportId, 100);
        setTimeout(() => exportProgress.delete(exportId), 5000);
      }

      return { clip: savedClip };
    } catch (error) {
      if (exportId) {
        exportProgress.delete(exportId);
      }
      await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
      throw error;
    }
  }

  private processClipSegment(
    inputPath: string,
    outputPath: string,
    trimStart: number,
    trimEnd: number,
    volume: number,
    muted: boolean
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      let command: FfmpegCommand = ffmpegConfigured(inputPath)
        .setStartTime(trimStart)
        .setDuration(trimEnd - trimStart)
        .outputOptions([
          '-c:v libx264',
          '-preset ultrafast',
          '-crf 23',
        ]);

      if (muted) {
        command = command.outputOptions('-an');
      } else if (volume !== 1) {
        command = command.outputOptions(`-af volume=${volume}`);
      } else {
        command = command.outputOptions('-c:a aac');
      }

      command
        .output(outputPath)
        .on('end', () => resolve())
        .on('error', (err) => reject(err))
        .run();
    });
  }

  private concatenateClips(concatListPath: string, outputPath: string): Promise<void> {
    return new Promise((resolve, reject) => {
      ffmpegConfigured()
        .input(concatListPath)
        .inputOptions(['-f concat', '-safe 0'])
        .outputOptions([
          '-c copy',
        ])
        .output(outputPath)
        .on('end', () => resolve())
        .on('error', (err) => reject(err))
        .run();
    });
  }
}

