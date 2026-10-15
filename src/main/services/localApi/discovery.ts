/**
 * OWNER: transport.
 *
 * The discovery file, `<data dir>/local-api.json`: how a client learns this
 * launch's pipe name. Honours `GOODBIT_USER_DATA` like `settings.json` does.
 */
import { readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  isLocalApiDiscovery,
  LOCAL_API_DISCOVERY_FILE,
  LOCAL_API_DISCOVERY_TMP_SUFFIX,
  type LocalApiDiscovery,
} from '@shared/localApi';
import { userDataDir } from '../../settings.js';

/** Absolute path of `local-api.json` for this profile. */
export function discoveryPath(): string {
  return join(userDataDir(), LOCAL_API_DISCOVERY_FILE);
}

/** Write to a temp name and rename, so the file is never half there. Returns false on failure; never throws. */
export function writeDiscovery(discovery: LocalApiDiscovery): boolean {
  try {
    const target = discoveryPath();
    const temp = `${target}${LOCAL_API_DISCOVERY_TMP_SUFFIX}`;
    writeFileSync(temp, JSON.stringify(discovery, null, 2), 'utf-8');
    renameSync(temp, target);
    return true;
  } catch (error) {
    console.warn('[local-api] could not write the discovery file:', error instanceof Error ? error.message : error);
    return false;
  }
}

/** Delete the file at stop and before-quit. A crash leaves it, which clients read as gone. Never throws. */
export function removeDiscovery(): void {
  try {
    const target = discoveryPath();
    rmSync(target, { force: true });
    rmSync(`${target}${LOCAL_API_DISCOVERY_TMP_SUFFIX}`, { force: true });
  } catch {
    /* nothing more to try */
  }
}

/** The file as written, or null when it is absent or not a valid `LocalApiDiscovery`. Never throws. */
export function readDiscovery(): LocalApiDiscovery | null {
  try {
    const parsed: unknown = JSON.parse(readFileSync(discoveryPath(), 'utf-8'));
    return isLocalApiDiscovery(parsed) ? parsed : null;
  } catch {
    return null;
  }
}
