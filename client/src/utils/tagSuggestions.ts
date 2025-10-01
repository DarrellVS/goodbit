/**
 * Smart Tags System
 * 
 * Auto-suggests tags based on:
 * 1. Filename pattern matching (regex-based)
 * 2. Most frequent tags from similar clips
 * 3. Tag categories for organization
 * 
 * Suggestions are generated only when the tags popover is opened to avoid performance issues.
 * Maximum 3 suggestions per clip to avoid overwhelming the user.
 * 
 * Tags are NEVER automatically applied - only suggested for manual approval.
 */

export interface TagPattern {
  tag: string;
  patterns: RegExp[];
  category: TagCategory;
}

export type TagCategory = 'Gameplay' | 'Weapons' | 'Maps' | 'Modes' | 'Quality' | 'General';

export const TAG_PATTERNS: TagPattern[] = [
  // Gameplay
  { tag: 'clutch', patterns: [/clutch/i, /1v[2-5]/i], category: 'Gameplay' },
  { tag: '5k', patterns: [/\b5k\b/i, /ace/i, /penta/i], category: 'Gameplay' },
  { tag: '4k', patterns: [/\b4k\b/i, /quad/i], category: 'Gameplay' },
  { tag: '3k', patterns: [/\b3k\b/i, /triple/i], category: 'Gameplay' },
  { tag: 'team-wipe', patterns: [/team[-_]wipe/i, /squad[-_]wipe/i], category: 'Gameplay' },
  { tag: 'flank', patterns: [/flank/i, /backstab/i], category: 'Gameplay' },
  { tag: 'grenade', patterns: [/grenade/i, /nade/i, /\bfrag\b/i], category: 'Gameplay' },
  { tag: 'knife', patterns: [/knife/i, /melee/i, /takedown/i], category: 'Gameplay' },
  
  // Weapons
  { tag: 'sniper', patterns: [/sniper/i, /\bsr\b/i, /awp/i, /kar98/i], category: 'Weapons' },
  { tag: 'shotgun', patterns: [/shotgun/i, /\bsg\b/i], category: 'Weapons' },
  { tag: 'smg', patterns: [/\bsmg\b/i, /mp5/i, /mp7/i, /vector/i], category: 'Weapons' },
  { tag: 'ar', patterns: [/\bar\b/i, /assault[-_]rifle/i, /m4a1/i, /ak47/i], category: 'Weapons' },
  { tag: 'lmg', patterns: [/\blmg\b/i, /machine[-_]gun/i], category: 'Weapons' },
  { tag: 'pistol', patterns: [/pistol/i, /handgun/i, /deagle/i], category: 'Weapons' },
  { tag: 'rocket', patterns: [/rocket/i, /rpg/i, /launcher/i], category: 'Weapons' },
  
  // Modes
  { tag: 'conquest', patterns: [/conquest/i], category: 'Modes' },
  { tag: 'tdm', patterns: [/\btdm\b/i, /team[-_]deathmatch/i], category: 'Modes' },
  { tag: 'breakthrough', patterns: [/breakthrough/i], category: 'Modes' },
  { tag: 'rush', patterns: [/rush/i], category: 'Modes' },
  { tag: 'hazard-zone', patterns: [/hazard[-_]zone/i], category: 'Modes' },
  
  // Maps (BF2042 examples)
  { tag: 'orbital', patterns: [/orbital/i], category: 'Maps' },
  { tag: 'hourglass', patterns: [/hourglass/i], category: 'Maps' },
  { tag: 'kaleidoscope', patterns: [/kaleidoscope/i], category: 'Maps' },
  { tag: 'manifest', patterns: [/manifest/i], category: 'Maps' },
  { tag: 'discarded', patterns: [/discarded/i], category: 'Maps' },
  { tag: 'renewal', patterns: [/renewal/i], category: 'Maps' },
  
  // Quality
  { tag: 'headshot', patterns: [/headshot/i, /\bhs\b/i], category: 'Quality' },
  { tag: 'noscope', patterns: [/no[-_]scope/i, /noscope/i], category: 'Quality' },
  { tag: 'quickscope', patterns: [/quick[-_]scope/i, /quickscope/i], category: 'Quality' },
  { tag: 'wallbang', patterns: [/wallbang/i, /through[-_]wall/i], category: 'Quality' },
  { tag: 'long-range', patterns: [/long[-_]range/i, /distance/i], category: 'Quality' },
  { tag: 'funny', patterns: [/funny/i, /hilarious/i, /lol/i], category: 'General' },
  { tag: 'epic', patterns: [/epic/i, /insane/i, /crazy/i], category: 'General' },
  { tag: 'fail', patterns: [/fail/i, /mistake/i, /oops/i], category: 'General' },
];

export function suggestTagsForClip(
  filename: string,
  existingTags: string[],
  allClipTags: string[] = []
): string[] {
  const suggestions = new Set<string>();
  const normalizedFilename = filename.toLowerCase();
  
  for (const pattern of TAG_PATTERNS) {
    if (existingTags.includes(pattern.tag)) continue;
    
    const matchesPattern = pattern.patterns.some(regex => regex.test(normalizedFilename));
    if (matchesPattern) {
      suggestions.add(pattern.tag);
      
      if (suggestions.size >= 3) break;
    }
  }
  
  if (suggestions.size < 3) {
    const frequentTags = getFrequentTags(allClipTags, existingTags);
    frequentTags.forEach(tag => {
      if (suggestions.size < 3) {
        suggestions.add(tag);
      }
    });
  }
  
  return Array.from(suggestions).slice(0, 3);
}

function getFrequentTags(allTags: string[], excludeTags: string[]): string[] {
  const frequency = new Map<string, number>();
  
  allTags.forEach(tag => {
    if (!excludeTags.includes(tag)) {
      frequency.set(tag, (frequency.get(tag) || 0) + 1);
    }
  });
  
  return Array.from(frequency.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([tag]) => tag)
    .slice(0, 3);
}

export function getCategoryForTag(tag: string): TagCategory {
  const pattern = TAG_PATTERNS.find(p => p.tag === tag);
  return pattern?.category || 'General';
}

