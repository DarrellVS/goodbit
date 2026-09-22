import fs from 'node:fs/promises';

/**
 * Write JSON so a crash cannot leave half of it behind.
 *
 * The metadata sidecars were written straight to their final path, so a
 * process killed mid-write left truncated JSON. The reader `try/catch`es and
 * falls back to the filename with no marks, which means that failure does not
 * look like a failure: it looks like a clip that never had a display name and
 * never had any GoodBits, and republishing is the only thing that fixes it.
 *
 * A rename within one directory is atomic, so the file a reader opens is
 * always either the old one or the whole new one. `StoreThumbnailAction`
 * already did this for the poster, for the same reason and with the same three
 * lines; this is that, shared.
 */
export async function writeJsonAtomic(filePath: string, value: unknown): Promise<void> {
  const partial = `${filePath}.part`;
  try {
    await fs.writeFile(partial, JSON.stringify(value, null, 2), 'utf-8');
    await fs.rename(partial, filePath);
  } catch (error) {
    await fs.unlink(partial).catch(() => {});
    throw error;
  }
}
