import fs from 'node:fs/promises';
import path from 'node:path';

/**
 * Recursively removes empty directories
 * @param dirPath - The directory path to check
 * @returns true if the directory was removed, false otherwise
 */
async function removeEmptyDirectory(dirPath: string): Promise<boolean> {
  try {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });
    
    // If directory has no entries, it's empty - remove it
    if (entries.length === 0) {
      await fs.rmdir(dirPath);
      console.log(`[Cleanup] Removed empty directory: ${path.basename(dirPath)}`);
      return true;
    }
    
    // Check subdirectories recursively
    let hasRemovedAny = false;
    for (const entry of entries) {
      if (entry.isDirectory()) {
        const subDirPath = path.join(dirPath, entry.name);
        const wasRemoved = await removeEmptyDirectory(subDirPath);
        if (wasRemoved) {
          hasRemovedAny = true;
        }
      }
    }
    
    // If we removed subdirectories, check again if this directory is now empty
    if (hasRemovedAny) {
      const newEntries = await fs.readdir(dirPath);
      if (newEntries.length === 0) {
        await fs.rmdir(dirPath);
        console.log(`[Cleanup] Removed empty directory: ${path.basename(dirPath)}`);
        return true;
      }
    }
    
    return false;
  } catch (error) {
    // Directory doesn't exist or can't be accessed - ignore
    return false;
  }
}

/**
 * Cleans up empty folders in the Videos root directory
 * @param videosRoot - The root Videos directory path
 */
export async function cleanupEmptyFolders(videosRoot: string): Promise<void> {
  try {
    console.log('[Cleanup] Scanning for empty folders in Videos directory...');
    
    const entries = await fs.readdir(videosRoot, { withFileTypes: true });
    let removedCount = 0;
    
    for (const entry of entries) {
      if (entry.isDirectory()) {
        const subDirPath = path.join(videosRoot, entry.name);
        const wasRemoved = await removeEmptyDirectory(subDirPath);
        if (wasRemoved) {
          removedCount++;
        }
      }
    }
    
    if (removedCount > 0) {
      console.log(`[Cleanup] ✓ Removed ${removedCount} empty folder(s)`);
    } else {
      console.log('[Cleanup] ✓ No empty folders found');
    }
  } catch (error) {
    console.error('[Cleanup] Failed to clean up empty folders:', error);
  }
}

