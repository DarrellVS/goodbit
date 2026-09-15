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
      console.log(`   🗑️  Removed: ${path.basename(dirPath)}`);
      return true;
    }
    
    // Check subdirectories recursively
    let hasRemovedAny = false;
    for (const entry of entries) {
      if (entry.isDirectory()) {
        // The app's own folders, which are empty most of the time by design.
        // `.goodbit-incoming` is where OBS writes a replay before GoodBit
        // files it, and deleting it left OBS pointed at nothing.
        if (entry.name.startsWith('.')) continue;
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
        console.log(`   🗑️  Removed: ${path.basename(dirPath)}`);
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
    console.log('🧹 Scanning for empty folders...');
    
    const entries = await fs.readdir(videosRoot, { withFileTypes: true });
    let removedCount = 0;
    
    for (const entry of entries) {
      if (entry.isDirectory()) {
        if (entry.name.startsWith('.')) continue;
        const subDirPath = path.join(videosRoot, entry.name);
        const wasRemoved = await removeEmptyDirectory(subDirPath);
        if (wasRemoved) {
          removedCount++;
        }
      }
    }
    
    console.log('🧹 Cleanup completed');
    console.log(`   removed: ${removedCount}\n`);
  } catch (error) {
    console.error('❌ Cleanup failed:', error instanceof Error ? error.message : String(error));
  }
}

