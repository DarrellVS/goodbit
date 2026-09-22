import path from 'node:path';
import fs from 'node:fs/promises';
import { BaseAction } from './BaseAction.js';
import { AppDataSource, VIDEOS_ROOT } from '../data-source.js';
import { Clip } from '../entity/Clip.js';
import { ffmpegCommand, runFfmpeg } from '../services/ffmpegProcess.js';

export interface ImportFilesInput {
  files: Array<{
    name: string;
    size: number;
    data: Buffer;
  }>;
}

export interface ImportFilesOutput {
  imported: number;
  failed: number;
  clips: Clip[];
  errors?: string[];
}

const VALID_VIDEO_EXTENSIONS = ['.mp4', '.mov', '.MP4', '.MOV', '.avi', '.AVI', '.mkv', '.MKV', '.webm', '.WEBM'];
const SUPPORTED_EXTENSIONS = ['.mp4', '.mov', '.MP4', '.MOV'];
const NEEDS_CONVERSION_EXTENSIONS = ['.avi', '.AVI', '.mkv', '.MKV', '.webm', '.WEBM'];

export class ImportFilesAction extends BaseAction<ImportFilesInput, ImportFilesOutput> {
  async execute(input: ImportFilesInput): Promise<ImportFilesOutput> {
    const repo = AppDataSource.getRepository(Clip);
    const importDir = path.join(VIDEOS_ROOT, 'Import');
    
    // Ensure Import directory exists
    await fs.mkdir(importDir, { recursive: true });

    const clips: Clip[] = [];
    const errors: string[] = [];
    let imported = 0;
    let failed = 0;

    for (const file of input.files) {
      try {
        const ext = path.extname(file.name);
        
        // Validate file extension
        if (!VALID_VIDEO_EXTENSIONS.includes(ext)) {
          errors.push(`${file.name}: Invalid video format (${ext})`);
          failed++;
          continue;
        }

        // Check if conversion is needed
        const needsConversion = NEEDS_CONVERSION_EXTENSIONS.includes(ext);
        const basename = path.basename(file.name, ext);
        
        // If conversion needed, output will be .mp4, otherwise keep original extension
        const outputExt = needsConversion ? '.mp4' : ext;
        let filename = needsConversion ? `${basename}.mp4` : file.name;
        let targetPath = path.join(importDir, filename);
        let counter = 1;
        
        // Generate unique filename if file already exists
        while (await this.fileExists(targetPath)) {
          filename = needsConversion 
            ? `${basename}_${counter}.mp4`
            : `${basename}_${counter}${ext}`;
          targetPath = path.join(importDir, filename);
          counter++;
        }

        if (needsConversion) {
          // Write temp file first
          const tempPath = path.join(importDir, `temp_${Date.now()}_${file.name}`);
          await fs.writeFile(tempPath, file.data);

          try {
            // Convert to MP4
            await this.convertToMp4(tempPath, targetPath);
            
            // Clean up temp file
            await fs.unlink(tempPath);
          } catch (conversionError) {
            // Clean up on failure
            await fs.unlink(tempPath).catch(() => {});
            throw new Error(`Conversion failed: ${(conversionError as Error).message}`);
          }
        } else {
          // No conversion needed, just write the file
          await fs.writeFile(targetPath, file.data);
        }

        // Get file stats
        const stat = await fs.stat(targetPath);
        const relPath = path.relative(VIDEOS_ROOT, targetPath);

        // Create clip entry
        const clip = repo.create({
          filePath: targetPath,
          relPath: relPath,
          game: 'Import',
          filename: filename,
          extension: outputExt.slice(1), // Remove the dot
          sizeBytes: stat.size,
          fileModifiedAt: stat.mtime,
          displayName: null,
          published: false,
          starred: false,
        });

        const savedClip = await repo.save(clip);
        clips.push(savedClip);
        imported++;
      } catch (error) {
        failed++;
        errors.push(`${file.name}: ${(error as Error).message}`);
      }
    }

    return {
      imported,
      failed,
      clips,
      errors: errors.length > 0 ? errors : undefined,
    };
  }

  private async fileExists(filePath: string): Promise<boolean> {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  private async convertToMp4(inputPath: string, outputPath: string): Promise<void> {
    await runFfmpeg(
      ffmpegCommand(inputPath)
        .outputOptions([
          '-c:v libx264',           // H.264 video codec
          '-preset medium',         // Encoding speed/quality balance
          '-crf 23',                // Quality (lower = better, 23 is good default)
          '-c:a aac',               // AAC audio codec
          '-b:a 128k',              // Audio bitrate
          '-movflags +faststart',   // Optimize for streaming
          '-pix_fmt yuv420p',       // Ensure compatibility
        ])
        .output(outputPath),
      { timeoutMs: 60 * 60_000 },
    );
  }
}

