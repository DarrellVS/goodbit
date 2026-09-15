import { readFileSync, writeFileSync } from 'node:fs';

/**
 * Just enough INI for OBS's `basic.ini`, `global.ini` and `user.ini`.
 *
 * Deliberately not a library, and deliberately not a parse-and-regenerate
 * round trip. A profile holds the user's hotkeys, their encoder settings and
 * anything a future OBS adds, all in the same file, and a writer that rebuilds
 * the file from a model it understands drops everything it does not. So this
 * edits the text in place: a key that exists is replaced where it sits, a key
 * that does not is appended to its section, a section that does not exist is
 * appended to the file. Comments, ordering and unknown keys survive untouched.
 */

export type IniData = Map<string, Map<string, string>>;

export function parseIni(text: string): IniData {
  const data: IniData = new Map();
  let section = '';

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith(';') || line.startsWith('#')) continue;

    const header = line.match(/^\[(.+)\]$/);
    if (header) {
      section = header[1];
      if (!data.has(section)) data.set(section, new Map());
      continue;
    }

    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    const value = line.slice(eq + 1);
    if (!data.has(section)) data.set(section, new Map());
    data.get(section)!.set(key, value);
  }

  return data;
}

export function readIni(filePath: string): IniData {
  try {
    return parseIni(readFileSync(filePath, 'utf-8'));
  } catch {
    return new Map();
  }
}

export function iniValue(data: IniData, section: string, key: string): string | null {
  return data.get(section)?.get(key) ?? null;
}

export interface IniEdit {
  section: string;
  key: string;
  value: string;
}

/**
 * Apply edits to INI text, leaving everything else exactly as it was.
 *
 * Returns the new text rather than writing, so a preview and an apply run the
 * same code and the preview can diff the result.
 */
export function applyIniEdits(original: string, edits: IniEdit[]): string {
  let lines = original.split(/\r?\n/);
  const eol = original.includes('\r\n') ? '\r\n' : '\n';

  for (const edit of edits) {
    let sectionStart = -1;
    let sectionEnd = lines.length;

    for (let i = 0; i < lines.length; i++) {
      const header = lines[i].trim().match(/^\[(.+)\]$/);
      if (!header) continue;
      if (header[1] === edit.section) {
        sectionStart = i;
        sectionEnd = lines.length;
      } else if (sectionStart !== -1 && i > sectionStart) {
        sectionEnd = i;
        break;
      }
    }

    if (sectionStart === -1) {
      // A section OBS has never written. Append it, with a blank line before
      // it if the file does not already end in one.
      const tail: string[] = [];
      if (lines.length && lines[lines.length - 1].trim() !== '') tail.push('');
      tail.push(`[${edit.section}]`, `${edit.key}=${edit.value}`);
      lines = lines.concat(tail);
      continue;
    }

    let replaced = false;
    for (let i = sectionStart + 1; i < sectionEnd; i++) {
      const eq = lines[i].indexOf('=');
      if (eq === -1) continue;
      if (lines[i].slice(0, eq).trim() !== edit.key) continue;
      lines[i] = `${edit.key}=${edit.value}`;
      replaced = true;
      break;
    }

    if (!replaced) {
      // Insert at the end of the section rather than the end of the file, or
      // the key lands under whichever section happens to come last.
      let insertAt = sectionEnd;
      while (insertAt > sectionStart + 1 && lines[insertAt - 1].trim() === '') insertAt--;
      lines.splice(insertAt, 0, `${edit.key}=${edit.value}`);
    }
  }

  return lines.join(eol);
}

export function writeIniEdits(filePath: string, edits: IniEdit[]): string {
  let original = '';
  try {
    original = readFileSync(filePath, 'utf-8');
  } catch {
    original = '';
  }
  const updated = applyIniEdits(original, edits);
  writeFileSync(filePath, updated, 'utf-8');
  return updated;
}
