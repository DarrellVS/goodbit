import path from 'node:path';
import fs from 'node:fs/promises';
import ffmpeg from 'fluent-ffmpeg';
import { BaseAction } from './BaseAction.js';

const TARGET_SIZE_MB = 30;
const TARGET_SIZE_BYTES = TARGET_SIZE_MB * 1024 * 1024;
const MIN_VIDEO_BITRATE_KBPS = 500; // Don't go below this (quality would be terrible)
const MIN_AUDIO_BITRATE_KBPS = 64;
const MAX_COMPRESSION_TIME_MS = 120000; // 2 minutes max

export interface CompressVideoInput {
  inputPath: string;
  outputPath: string;
  durationSec: number;
}

export interface CompressVideoOutput {
  compressed: boolean;
  originalSize: number;
  finalSize: number;
  outputPath: string;
}

/**
 * Compresses a video to target size for Discord embeds (≤30MB)
 * Only compresses if feasible - won't create terrible quality videos
 */
export class CompressVideoAction extends BaseAction<CompressVideoInput, CompressVideoOutput> {
  async execute(input: CompressVideoInput): Promise<CompressVideoOutput> {
    const stats = await fs.stat(input.inputPath);
    const originalSize = stats.size;

    // If already under target, no need to compress
    if (originalSize <= TARGET_SIZE_BYTES) {
      await fs.copyFile(input.inputPath, input.outputPath);
      return {
        compressed: false,
        originalSize,
        finalSize: originalSize,
        outputPath: input.outputPath,
      };
    }

    // Calculate target bitrate
    const durationSec = input.durationSec;
    const targetSizeBytes = TARGET_SIZE_BYTES * 0.95; // 95% to leave some margin
    
    // Total bitrate budget (video + audio)
    const totalBitrateBps = (targetSizeBytes * 8) / durationSec;
    const totalBitrateKbps = totalBitrateBps / 1000;
    
    // Reserve bitrate for audio
    const audioBitrateKbps = Math.max(MIN_AUDIO_BITRATE_KBPS, Math.min(128, totalBitrateKbps * 0.1));
    const videoBitrateKbps = totalBitrateKbps - audioBitrateKbps;

    // Check if compression is feasible
    if (videoBitrateKbps < MIN_VIDEO_BITRATE_KBPS) {
      console.log(`   ⚠️  Video too large to compress to 30MB without terrible quality (would need ${Math.round(videoBitrateKbps)}kbps)`);
      await fs.copyFile(input.inputPath, input.outputPath);
      return {
        compressed: false,
        originalSize,
        finalSize: originalSize,
        outputPath: input.outputPath,
      };
    }

    // Try compression
    try {
      console.log(`   🗜️  Compressing ${(originalSize / 1024 / 1024).toFixed(1)}MB → ~30MB (${Math.round(videoBitrateKbps)}kbps video, ${Math.round(audioBitrateKbps)}kbps audio)`);
      
      await this.compressVideo(input.inputPath, input.outputPath, videoBitrateKbps, audioBitrateKbps);
      
      const compressedStats = await fs.stat(input.outputPath);
      const finalSize = compressedStats.size;
      
      // Verify the compressed file is actually smaller and under target
      if (finalSize < originalSize && finalSize <= TARGET_SIZE_BYTES) {
        console.log(`   ✅ Compressed to ${(finalSize / 1024 / 1024).toFixed(1)}MB (${Math.round((originalSize - finalSize) / originalSize * 100)}% reduction)`);
        return {
          compressed: true,
          originalSize,
          finalSize,
          outputPath: input.outputPath,
        };
      } else {
        // Compression didn't help or went over - use original
        console.log(`   ⚠️  Compression didn't help, using original`);
        await fs.unlink(input.outputPath).catch(() => {});
        await fs.copyFile(input.inputPath, input.outputPath);
        return {
          compressed: false,
          originalSize,
          finalSize: originalSize,
          outputPath: input.outputPath,
        };
      }
    } catch (error) {
      console.error(`   ❌ Compression failed:`, error instanceof Error ? error.message : String(error));
      // Fall back to original
      await fs.copyFile(input.inputPath, input.outputPath);
      return {
        compressed: false,
        originalSize,
        finalSize: originalSize,
        outputPath: input.outputPath,
      };
    }
  }

  private compressVideo(inputPath: string, outputPath: string, videoBitrateKbps: number, audioBitrateKbps: number): Promise<void> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Compression timeout'));
      }, MAX_COMPRESSION_TIME_MS);

      ffmpeg(inputPath)
        .videoCodec('libx264')
        .audioCodec('aac')
        .videoBitrate(`${Math.round(videoBitrateKbps)}k`)
        .audioBitrate(`${Math.round(audioBitrateKbps)}k`)
        .outputOptions([
          '-preset fast', // Fast encoding (medium quality/speed tradeoff)
          '-movflags +faststart', // Enable streaming
          '-pix_fmt yuv420p', // Compatibility
          '-maxrate ' + Math.round(videoBitrateKbps * 1.5) + 'k', // Max bitrate
          '-bufsize ' + Math.round(videoBitrateKbps * 2) + 'k', // Buffer size
        ])
        .on('end', () => {
          clearTimeout(timeout);
          resolve();
        })
        .on('error', (err) => {
          clearTimeout(timeout);
          reject(err);
        })
        .save(outputPath);
    });
  }
}


