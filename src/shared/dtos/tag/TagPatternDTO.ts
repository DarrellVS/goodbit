import { BaseDTO } from '../BaseDTO.js';
import { tagPatternProblem } from '../../constants/tagPatternRules.js';

export type TagCategory = 'Gameplay' | 'Weapons' | 'Maps' | 'Modes' | 'Quality' | 'General';

export const TAG_CATEGORIES: TagCategory[] = [
  'Gameplay',
  'Weapons',
  'Maps',
  'Modes',
  'Quality',
  'General',
];

/**
 * A filename-matching rule, as it crosses the wire.
 *
 * `patterns` are regex **sources** rather than RegExp objects, those do not
 * survive JSON, and the client rebuilds them with the `i` flag. That is the
 * same contract the IndexedDB version used, so the stored data ports across
 * unchanged.
 */
export class TagPatternDTO extends BaseDTO<TagPatternDTO> {
  tag!: string;
  patterns!: string[];
  category!: TagCategory;

  static fromEntity(entity: {
    tag: string;
    patterns: string;
    category: string;
  }): TagPatternDTO {
    const dto = new TagPatternDTO();
    dto.tag = entity.tag;
    dto.category = (entity.category as TagCategory) ?? 'General';

    try {
      const parsed = JSON.parse(entity.patterns ?? '[]');
      dto.patterns = Array.isArray(parsed) ? parsed.filter((p) => typeof p === 'string') : [];
    } catch {
      // A corrupt row should not take the whole list down with it.
      dto.patterns = [];
    }

    return dto;
  }

  validate(): { isValid: boolean; errors?: string[] } {
    const errors: string[] = [];

    if (!this.tag?.trim()) errors.push('A pattern needs a tag');
    if (!Array.isArray(this.patterns) || this.patterns.length === 0) {
      errors.push('A pattern needs at least one expression');
    }

    // An expression that cannot compile would throw at match time, on every
    // clip, for as long as it stays saved; one that backtracks would hang there.
    for (const source of this.patterns ?? []) {
      const problem = tagPatternProblem(source);
      if (problem) errors.push(problem);
    }

    return { isValid: errors.length === 0, errors: errors.length ? errors : undefined };
  }
}
