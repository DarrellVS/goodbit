import { BaseAction } from './BaseAction.js';
import { AppDataSource, VIDEOS_ROOT } from '../data-source.js';
import { Clip } from '../entity/Clip.js';
import { Tag } from '../entity/Tag.js';
import { videoService } from '../services/videoService.js';
import { publisherService } from '../services/publisherService.js';
import { cleanupEmptyFolders } from '../utils/cleanupEmptyFolders.js';

export interface BatchStarInput {
  clipIds: number[];
  starred: boolean;
}

export interface BatchPublishInput {
  clipIds: number[];
  publish: boolean;
}

export interface BatchAddTagsInput {
  clipIds: number[];
  tags: string[];
}

export interface BatchDeleteInput {
  clipIds: number[];
}

export interface BatchOperationOutput {
  success: number;
  failed: number;
  errors?: string[];
}

// Shared validation and processing helper
abstract class BaseBatchAction<TInput extends { clipIds: number[] }, TOutput extends BatchOperationOutput> extends BaseAction<TInput, TOutput> {
  
  protected validateClipIds(clipIds: unknown): number[] {
    if (!Array.isArray(clipIds)) {
      throw new Error('clipIds must be an array');
    }

    const validIds: number[] = [];
    for (const clipId of clipIds) {
      const numericId = Number(clipId);
      if (!Number.isFinite(numericId) || numericId <= 0) {
        throw new Error(`Invalid clip ID: ${clipId}`);
      }
      validIds.push(numericId);
    }
    
    return validIds;
  }

  protected async processClips(
    validIds: number[],
    processor: (clip: Clip, numericId: number) => Promise<void>
  ): Promise<BatchOperationOutput> {
    const repo = AppDataSource.getRepository(Clip);
    const errors: string[] = [];
    let success = 0;
    let failed = 0;

    for (const numericId of validIds) {
      try {
        const clip = await repo.findOneByOrFail({ id: numericId });
        await processor(clip, numericId);
        success++;
      } catch (error) {
        failed++;
        errors.push(`Clip ${numericId}: ${(error as Error).message}`);
      }
    }

    return { success, failed, errors: errors.length > 0 ? errors : undefined };
  }
}

export class BatchStarAction extends BaseBatchAction<BatchStarInput, BatchOperationOutput> {
  async execute(input: BatchStarInput): Promise<BatchOperationOutput> {
    const validIds = this.validateClipIds(input.clipIds);
    const repo = AppDataSource.getRepository(Clip);
    
    return this.processClips(validIds, async (clip) => {
      clip.starred = input.starred;
      await repo.save(clip);
    });
  }
}

export class BatchPublishAction extends BaseBatchAction<BatchPublishInput, BatchOperationOutput> {
  async execute(input: BatchPublishInput): Promise<BatchOperationOutput> {
    const validIds = this.validateClipIds(input.clipIds);
    const repo = AppDataSource.getRepository(Clip);
    
    return this.processClips(validIds, async (clip) => {
      if (input.publish) {
        // Publish
        if (!clip.published) {
          const result = await publisherService.publish(clip.filePath, clip.displayName || clip.filename);
          clip.published = true;
          clip.publishedUrl = result.url;
          await repo.save(clip);
        }
      } else {
        // Unpublish
        if (clip.published) {
          await publisherService.unpublish(clip.filename);
          clip.published = false;
          clip.publishedUrl = null;
          await repo.save(clip);
        }
      }
    });
  }
}

export class BatchAddTagsAction extends BaseBatchAction<BatchAddTagsInput, BatchOperationOutput> {
  async execute(input: BatchAddTagsInput): Promise<BatchOperationOutput> {
    const validIds = this.validateClipIds(input.clipIds);
    const repo = AppDataSource.getRepository(Clip);
    const tagRepo = AppDataSource.getRepository(Tag);
    
    // Normalize and deduplicate input tags
    const normalizedNewTags = Array.from(new Set(
      input.tags.map(t => t.trim()).filter(t => t.length > 0)
    ));

    if (normalizedNewTags.length === 0) {
      return { success: 0, failed: 0 };
    }

    // Ensure all tags exist in the database
    const existingTags = await tagRepo.find({ 
      where: normalizedNewTags.map(name => ({ name })) 
    });
    const existingNames = new Set(existingTags.map(t => t.name));
    const toCreate = normalizedNewTags
      .filter(name => !existingNames.has(name))
      .map(name => tagRepo.create({ name }));
    
    if (toCreate.length > 0) {
      await tagRepo.save(toCreate);
    }

    // Get all tags to add
    const allTags = await tagRepo.find({ 
      where: normalizedNewTags.map(name => ({ name })) 
    });

    // Process clips
    const errors: string[] = [];
    let success = 0;
    let failed = 0;

    for (const numericId of validIds) {
      try {
        const clip = await repo.findOne({ 
          where: { id: numericId }, 
          relations: ['tags'] 
        });
        
        if (!clip) {
          failed++;
          errors.push(`Clip ${numericId}: Not found`);
          continue;
        }

        // Merge existing tags with new tags
        const existingTagNames = new Set((clip.tags || []).map(t => t.name));
        const tagsToAdd = allTags.filter(tag => !existingTagNames.has(tag.name));
        
        clip.tags = [...(clip.tags || []), ...tagsToAdd];
        await repo.save(clip);
        success++;
      } catch (error) {
        failed++;
        errors.push(`Clip ${numericId}: ${(error as Error).message}`);
      }
    }

    return { success, failed, errors: errors.length > 0 ? errors : undefined };
  }
}

export class BatchDeleteAction extends BaseBatchAction<BatchDeleteInput, BatchOperationOutput> {
  async execute(input: BatchDeleteInput): Promise<BatchOperationOutput> {
    const validIds = this.validateClipIds(input.clipIds);
    const repo = AppDataSource.getRepository(Clip);
    
    const result = await this.processClips(validIds, async (clip) => {
      // If published, unpublish first
      if (clip.published) {
        try {
          await publisherService.unpublish(clip.filename);
        } catch (err) {
          console.warn(`Failed to unpublish ${clip.filename} before delete:`, (err as Error)?.message);
        }
      }

      // Remove caches and move to trash
      await videoService.removeClipCaches(clip.filePath);
      await videoService.moveClipFileToTrash(clip.filePath);
      await repo.remove(clip);
    });

    // Clean up empty folders after batch delete (async, don't wait)
    cleanupEmptyFolders(VIDEOS_ROOT).catch((err) => {
      console.error('Failed to cleanup empty folders after batch delete:', err instanceof Error ? err.message : String(err));
    });

    return result;
  }
}
