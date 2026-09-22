import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buttonVariants, menuItemVariants } from '../../../src/renderer/src/components/Base/variants';
import { cn } from '../../../src/renderer/src/components/Base/cn';

const RENDERER = join(__dirname, '../../../src/renderer/src');

function vueFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return vueFiles(path);
    return entry.name.endsWith('.vue') ? [path] : [];
  });
}

/*
 * A `Base*` component used in a template and never imported renders as an
 * unknown element, `<basebutton>`, and nothing fails: `vue-tsc` accepts
 * unknown tags, and the page still draws, just without the button's classes.
 * The card's drag grip shipped that way for one build while the move to
 * `cva` was in progress, and only a pixel diff of the card title noticed.
 */
describe('every Base component a template uses is imported', () => {
  it.each(vueFiles(RENDERER).map((file) => [relative(RENDERER, file), file]))('%s', (_name, file) => {
    const source = readFileSync(file, 'utf-8');
    const template = source.split('</script>').pop() ?? '';
    const used = new Set([...template.matchAll(/<(Base[A-Z]\w*)\b/g)].map((m) => m[1]));
    const missing = [...used].filter((name) => !new RegExp(`import ${name} from`).test(source));
    expect(missing).toEqual([]);
  });
});

/*
 * The rules the recipes carry, held where a reordering of `variants.ts`
 * would break them silently.
 */
describe('the button recipe', () => {
  it('has exactly one filled accent, and it is `strong`', () => {
    const tones = ['default', 'strong', 'quiet', 'danger', 'success'] as const;
    const filled = tones.filter((tone) => buttonVariants({ tone }).split(' ').includes('bg-accent'));
    expect(filled).toEqual(['strong']);
  });

  it('never fills danger', () => {
    expect(buttonVariants({ tone: 'danger' })).not.toMatch(/(^|\s)bg-danger(\s|$)/);
  });

  it('is square when it is only a glyph, at every size', () => {
    expect(cn(buttonVariants({ size: 'md', iconOnly: true }))).toMatch(/\bh-9\b.*\bw-9\b|\bw-9\b.*\bh-9\b/);
    expect(cn(buttonVariants({ size: 'sm', iconOnly: true }))).toMatch(/\bw-8\b/);
    expect(cn(buttonVariants({ size: 'dense', iconOnly: true }))).toMatch(/\bw-7\b/);
    expect(cn(buttonVariants({ size: 'sm', iconOnly: true }))).not.toMatch(/\bpx-3\b/);
  });

  it('lets a caller override padding rather than adding a second one', () => {
    const merged = cn(buttonVariants({ size: 'sm' }), 'px-2').split(' ');
    expect(merged).toContain('px-2');
    expect(merged).not.toContain('px-3');
  });
});

describe('the menu row recipe', () => {
  it('keeps one geometry across tones, so labels form a column', () => {
    const geometry = (classes: string) =>
      classes.split(' ').filter((c) => /^(h-|px-|py-|gap-)/.test(c)).sort().join(' ');
    expect(geometry(menuItemVariants({ tone: 'danger' }))).toBe(geometry(menuItemVariants()));
    expect(geometry(menuItemVariants({ tone: 'accent' }))).toBe(geometry(menuItemVariants()));
  });
});
