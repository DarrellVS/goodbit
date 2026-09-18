import { register, type GameEvent, type GameModule, type WatchInput } from '../registry.js';
import { pointInRect, REFERENCE_HEIGHT, type Anchor, type Region } from '../vision/geometry.js';
import { crop, glyphSaturation, greyscale } from '../vision/pixels.js';
import { findTemplate } from '../vision/match.js';
import {
  BF_KILL_LABEL,
  BF_MAN_DOWN,
  BF_PLAYER_CARD,
  BF_SKULL,
  type Template,
} from '../vision/templates.js';

/**
 * Battlefield tells you when you got a kill, and when you went down. This
 * reads both.
 *
 * Not the kill feed in the corner. That lists everybody's kills and would
 * need to know your own name to be any use. The banner under the crosshair
 * appears only for kills *you* got, so it filters itself: a skull, the score,
 * the name of whoever you dropped, and a boxed KILL underneath.
 *
 * **Why two templates and a colour test.** The skull alone looked like enough
 * and is not. Measured against forty real recordings, every confirmed kill
 * scored 0.89 or better, but a clock icon on IMPROVABLE SECTOR reached 0.87
 * and a helmet on SPOT ASSIST 0.83, while one genuine kill caught mid-fade
 * scored 0.82. Any single threshold on the skull either loses that kill or
 * takes those two. The word KILL looks nothing like a clock, and the assist
 * skulls Battlefield draws are *green* where a kill's is white, so the three
 * tests together separate what one could not.
 */

/**
 * One box holding the whole banner: skull, score, and the label row under it.
 *
 * One region and not two because the two parts are adjacent and one crop
 * covers both, which is now a tidiness argument rather than a cost one. It
 * used to be the cost: a region meant its own decode of the video, so asking
 * for the banner and the labels separately doubled the time for a file.
 * `vision/sample.ts` stacks every box into one picture inside a single filter
 * graph, so the count of boxes is nearly free and only their total area costs
 * anything.
 *
 * In units of frame height from the centre of the frame, so it lands in the
 * same place on an ultrawide and on a 16:9 monitor. Measured on 3440x1440
 * footage: the skull sits 306 px left of centre and 213 px below it, and the
 * KILL box 288 px below.
 */
const HUD: Region = { anchor: 'centre', dx: -0.50, dy: 0.08, w: 0.60, h: 0.17, out: [672, 190] };

/** Where in that box each part sits, in the same units from frame centre. */
const ICON = { dx: (1414 - 1720) / REFERENCE_HEIGHT, dy: (933 - 720) / REFERENCE_HEIGHT };
const LABEL_BAND = { top: (986 - 720) / REFERENCE_HEIGHT, bottom: (1072 - 720) / REFERENCE_HEIGHT };

/** How far from the icon's spot to look, in units of frame height. */
const ICON_SLACK = 0.022;

/**
 * A skull this good is a kill on its own; a weaker one needs the word KILL
 * beside it. The numbers come from contact sheets, not from taste.
 *
 * `SKULL_FLOOR` is low on purpose. The banner animates in, and for the first
 * frame or two the skull is half drawn while the label beside it is already
 * legible, one real kill was thrown away because the only frame whose skull
 * cleared 0.80 was a single frame, and a lone frame is not believed.
 */
const SKULL_ALONE = 0.90;
const SKULL_FLOOR = 0.55;
const LABEL_MATCH = 0.74;

/** Above this the icon is coloured, which in Battlefield means an assist. */
const ASSIST_SATURATION = 0.30;

/**
 * A real banner holds for two or three seconds and so lands in several
 * samples; a lone frame that scores well is a coincidence.
 */
const MIN_SAMPLES = 2;

/** Samples this close together describe one kill, not two. */
const SAME_EVENT_SEC = 0.9;

/** Kills this close together are one moment worth keeping. */
const SAME_MOMENT_SEC = 6;

/**
 * The banner appears a beat after the shot lands, so the moment itself is
 * slightly before the first frame that shows it.
 */
const BANNER_LAG_SEC = 0.6;

/**
 * Where Battlefield says *you* went down, which is two places at once.
 *
 * A kill is one banner under the crosshair. A death is two pieces of text that
 * do not travel together: MAN DOWN under the revive ring in the middle of the
 * screen, and the PLAYER CARD prompt pinned to the bottom right corner. So
 * they are two boxes with two different anchors, and a box that catches one at
 * 21:9 catches neither at 16:9.
 *
 * **Both, because neither on its own is enough.** Measured over 40 real
 * recordings holding 8 deaths: the prompt found 7 of them and MAN DOWN found
 * 4, and the one the prompt missed is the one MAN DOWN caught. They describe
 * different halves of dying. MAN DOWN is the revive state, so it is absent
 * when nobody could have revived you; the prompt names whoever killed you, so
 * it is absent when nothing did, which is the clip that ends in a fall.
 *
 * Both boxes ride the same decode as the kill banner, so the pair costs a crop
 * and a scale rather than a second pass over the file. See `vision/sample.ts`.
 * Measured over ten clips: 0.167 seconds per second of footage for the kill
 * banner alone, 0.181 with MAN DOWN, 0.185 with the prompt, 0.198 with both.
 * Dropping either one saves about seven percent of a scan and loses about a
 * third of the deaths, which is not a trade worth making.
 */
const MAN_DOWN: Region = { anchor: 'centre', dx: -0.15, dy: 0.31, w: 0.30, h: 0.08, out: [432, 115] };
const PLAYER_CARD: Region = {
  anchor: 'bottom-right',
  dx: -0.32,
  dy: -0.13,
  w: 0.32,
  h: 0.10,
  out: [461, 144],
};

/**
 * Where each line sits, in units of frame height from its own anchor.
 *
 * Measured on 3440x1440 footage, off the lit pixels rather than by eye: MAN
 * DOWN spans x 1646..1793 and y 1212..1233, centred on the frame's own centre
 * line to within half a pixel, and the prompt spans x 3043..3268 and y
 * 1358..1383, which is 172 px in from the right edge and 57 up from the
 * bottom.
 */
const DEATH_CUES: ReadonlyArray<{
  region: string;
  point: { anchor: Anchor; dx: number; dy: number };
  template: Template;
}> = [
  {
    region: 'manDown',
    point: {
      anchor: 'centre',
      dx: (1719.5 - 1720) / REFERENCE_HEIGHT,
      dy: (1222.5 - 720) / REFERENCE_HEIGHT,
    },
    template: BF_MAN_DOWN,
  },
  {
    region: 'playerCard',
    point: {
      anchor: 'bottom-right',
      dx: (3155.5 - 3440) / REFERENCE_HEIGHT,
      dy: (1370.5 - 1440) / REFERENCE_HEIGHT,
    },
    template: BF_PLAYER_CARD,
  },
];

/** How far from a cue's own spot to look, in units of frame height. */
const CUE_SLACK = 0.022;

/**
 * How well one of those lines has to read before it counts.
 *
 * From the contact sheets rather than from taste. Run over the whole 174 clip
 * library, the 151 recordings with no death in them peak at **0.41** on either
 * cue, and every one of the 23 deaths scores **0.69 or better**, most of them
 * above 0.93. Nothing lands in between. Two words of text hold a lot more
 * shape than an icon does, which is why this separates where the skull needed
 * three tests to.
 */
const DEATH_MATCH = 0.62;

/**
 * The prompt appears as you hit the ground rather than as you are hit.
 *
 * Longer than the kill banner's lag, because dying has an animation in front
 * of it: the camera falls before the game says anything. Measured on the
 * recording this was built from, the shot lands about a second before either
 * line is legible.
 */
const DEATH_LAG_SEC = 1.0;

/**
 * A death that lands this close to a kill is part of that moment.
 *
 * Trading a kill for your own life is one thing that happened, not two, and
 * cutting it into two suggestions two seconds apart would offer the same eight
 * seconds of footage twice. Beyond this it is its own moment and gets its own
 * range: dying a quarter of a minute after a kill is a separate story, and
 * splicing them together would suggest a cut holding a long walk in the middle.
 */
const DEATH_JOINS_KILL_SEC = 2;

/**
 * How wide a template appears inside the sampled box.
 *
 * The region and the template both scale with frame height, so this is the
 * same number of pixels whatever the source resolution was.
 */
function expectedWidth(template: Template, region: Region): number {
  return (template.width * region.out[0]) / (region.w * REFERENCE_HEIGHT);
}

interface Hit {
  index: number;
  atSec: number;
  skull: number;
  label: number;
}

function findHits({ regions, fps, frameWidth, frameHeight }: WatchInput): Hit[] {
  const hud = regions.hud;
  if (!hud || !hud.frames.length) return [];

  const skullWidth = expectedWidth(BF_SKULL, HUD);
  const labelWidth = expectedWidth(BF_KILL_LABEL, HUD);

  // Everything below is in the sampled box's own pixels.
  const perSourceX = hud.width / hud.rect.w;
  const perSourceY = hud.height / hud.rect.h;
  const iconX = (frameWidth / 2 + ICON.dx * frameHeight - hud.rect.x) * perSourceX;
  const iconY = (frameHeight / 2 + ICON.dy * frameHeight - hud.rect.y) * perSourceY;
  const slackX = ICON_SLACK * frameHeight * perSourceX;
  const slackY = ICON_SLACK * frameHeight * perSourceY;

  const iconBox = {
    x: Math.max(0, Math.round(iconX - skullWidth / 2 - slackX)),
    y: Math.max(0, Math.round(iconY - skullWidth / 2 - slackY)),
  };
  const iconRight = Math.min(hud.width, Math.round(iconX + skullWidth / 2 + slackX));
  const iconBottom = Math.min(hud.height, Math.round(iconY + skullWidth / 2 + slackY));
  const iconW = iconRight - iconBox.x;
  const iconH = iconBottom - iconBox.y;

  // The label row spans the full width of the box: KILL slides left and right
  // depending on what else the game is showing beside it.
  const labelTop = Math.max(0, Math.round((frameHeight / 2 + LABEL_BAND.top * frameHeight - hud.rect.y) * perSourceY));
  const labelBottom = Math.min(
    hud.height,
    Math.round((frameHeight / 2 + LABEL_BAND.bottom * frameHeight - hud.rect.y) * perSourceY),
  );
  const labelH = labelBottom - labelTop;

  if (iconW < 14 || iconH < 14) return [];

  const hits: Hit[] = [];
  hud.frames.forEach((frame, index) => {
    const grey = greyscale(frame);
    const iconWindow = crop(grey, frame.width, { ...iconBox, w: iconW, h: iconH });
    const skull = findTemplate(iconWindow, iconW, iconH, BF_SKULL, { expectedWidth: skullWidth });
    // Nothing icon-shaped at all. Reading the label row costs more than this
    // test, so it only happens once something is there to confirm.
    if (skull.score < SKULL_FLOOR) return;

    let label = -1;
    if (labelH >= 12) {
      const band = crop(grey, frame.width, { x: 0, y: labelTop, w: frame.width, h: labelH });
      label = findTemplate(band, frame.width, labelH, BF_KILL_LABEL, {
        expectedWidth: labelWidth,
      }).score;
    }

    const convincing = skull.score >= SKULL_ALONE || label >= LABEL_MATCH;
    if (!convincing) return;

    // Read the colour where the shape actually matched, not where it was
    // expected, and only off the lit pixels, see `glyphSaturation`.
    const colour = glyphSaturation(frame, {
      x: iconBox.x + skull.x,
      y: iconBox.y + skull.y,
      w: skull.width,
      h: skull.height,
    });
    if (colour > ASSIST_SATURATION) return;

    hits.push({ index, atSec: index / fps, skull: skull.score, label });
  });
  return hits;
}

export interface Kill {
  atSec: number;
  confidence: number;
}

/** Consecutive hits describing one kill. */
function groupHits(hits: Hit[]): Kill[] {
  const groups: Hit[][] = [];
  for (const hit of hits) {
    const last = groups[groups.length - 1];
    if (last && hit.atSec - last[last.length - 1].atSec <= SAME_EVENT_SEC) last.push(hit);
    else groups.push([hit]);
  }
  return groups
    .filter((group) => group.length >= MIN_SAMPLES)
    // A banner already on screen in the very first sample belongs to a kill
    // that happened before the recording starts. The replay buffer caught its
    // tail, not the thing itself.
    .filter((group) => group[0].index > 0)
    .map((group) => ({
      atSec: Math.max(0, group[0].atSec - BANNER_LAG_SEC),
      // How sure this was a kill, which is the best evidence any one frame
      // gave, not the average. The banner fades in and out, so averaging over
      // a group drags a certain kill down to the score of its own half-drawn
      // first frame.
      confidence: Math.min(
        1,
        group.reduce((best, h) => Math.max(best, h.skull, h.label), 0),
      ),
    }));
}

/** One frame in which one of the death cues read well enough to count. */
interface CueHit {
  index: number;
  atSec: number;
  score: number;
}

/** The best either line scored in one frame, and when. */
function findDowns({ regions, fps, frameWidth, frameHeight }: WatchInput): CueHit[] {
  const best = new Map<number, number>();

  for (const cue of DEATH_CUES) {
    const sampled = regions[cue.region];
    if (!sampled || !sampled.frames.length) continue;

    const appearWidth =
      (cue.template.width * frameHeight * (sampled.width / sampled.rect.w)) / REFERENCE_HEIGHT;
    const appearHeight =
      (cue.template.height * frameHeight * (sampled.height / sampled.rect.h)) / REFERENCE_HEIGHT;
    const centre = pointInRect(cue.point, sampled.rect, frameWidth, frameHeight, sampled);
    const slackX = CUE_SLACK * frameHeight * (sampled.width / sampled.rect.w);
    const slackY = CUE_SLACK * frameHeight * (sampled.height / sampled.rect.h);

    const x = Math.max(0, Math.round(centre.x - appearWidth / 2 - slackX));
    const y = Math.max(0, Math.round(centre.y - appearHeight / 2 - slackY));
    const w = Math.min(sampled.width, Math.round(centre.x + appearWidth / 2 + slackX)) - x;
    const h = Math.min(sampled.height, Math.round(centre.y + appearHeight / 2 + slackY)) - y;
    // Too small to hold the words at all, which is what a source shorter than
    // the reference height comes to. Reading it would only invent a number.
    if (w < appearWidth + 4 || h < appearHeight + 2) continue;

    sampled.frames.forEach((frame, index) => {
      const grey = greyscale(frame);
      const window = crop(grey, frame.width, { x, y, w, h });
      const { score } = findTemplate(window, w, h, cue.template, { expectedWidth: appearWidth });
      if (score < DEATH_MATCH) return;
      best.set(index, Math.max(best.get(index) ?? 0, score));
    });
  }

  return [...best.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([index, score]) => ({ index, atSec: index / fps, score }));
}

export interface Death {
  atSec: number;
  confidence: number;
}

/**
 * Consecutive frames describing one death.
 *
 * The same shape as `groupHits` with one rule deliberately missing: a lone
 * frame counts here, where a lone skull does not. That rule exists because a
 * clock icon reaches 0.87 against the skull template and a real kill caught
 * mid-fade reaches 0.82, so one frame cannot settle it. Nothing in this game
 * gets within 0.28 of these two lines of text, and dropping single frames
 * threw away two real deaths out of 23: one where MAN DOWN was legible in
 * exactly one sample, and one caught while the words were still wiping on, a
 * frame reading `MAN` and scoring 0.69.
 *
 * The other rule stays: a prompt already on screen in the first sample belongs
 * to a death that happened before the recording started. It matters more here
 * than for a kill, because being down lasts as long as it takes to bleed out,
 * so a clip that opens mid-death would otherwise report its own first frame as
 * the moment. Two of the 23 are exactly that.
 */
function groupDowns(hits: CueHit[]): Death[] {
  const groups: CueHit[][] = [];
  for (const hit of hits) {
    const last = groups[groups.length - 1];
    if (last && hit.atSec - last[last.length - 1].atSec <= SAME_EVENT_SEC) last.push(hit);
    else groups.push([hit]);
  }
  return groups
    .filter((group) => group[0].index > 0)
    .map((group) => ({
      atSec: Math.max(0, group[0].atSec - DEATH_LAG_SEC),
      confidence: Math.min(1, group.reduce((bestSoFar, h) => Math.max(bestSoFar, h.score), 0)),
    }));
}

/**
 * The same thing, said a few different ways.
 *
 * One fixed sentence per shape meant a library where every Battlefield clip
 * carried the words "you dropped someone here", which stops being a sentence
 * somebody reads and becomes a label they skip. So each shape has a handful of
 * wordings and a clip gets one of them.
 *
 * **Chosen from the clip's own numbers, never at random.** A reading is cached
 * against the file's mtime and read back on every open, so a random pick would
 * reword itself the first time the cache was rebuilt, and two screens showing
 * one clip could disagree about what it says. `pick` is a remainder over when
 * the moment happened, which gives a stable sentence for a given moment and a
 * different one for the next clip along.
 *
 * Plain, lower case, no exclamation marks, like every other reason the app
 * shows. None of them says how it was worked out: that a template matched a
 * banner is the app's business, not the reader's.
 */
function pick(options: readonly string[], seed: number): string {
  const index = Math.abs(Math.round(seed)) % options.length;
  return options[index];
}

const ONE_KILL = [
  'you dropped someone here',
  'you got one here',
  'a kill, right here',
] as const;

/** Two so close together that the gap is not worth a number. */
const QUICK_DOUBLE = [
  'two kills, near enough at once',
  'two kills, almost the same moment',
  'a quick double',
] as const;

const TWO_KILLS = [
  (span: number) => `two kills, ${span} seconds apart`,
  (span: number) => `a kill, then another ${span} seconds later`,
  (span: number) => `two of them, ${span} seconds apart`,
] as const;

const MANY_KILLS = [
  (n: number, span: number) => `${n} kills inside ${span} seconds`,
  (n: number, span: number) => `${n} of them in ${span} seconds`,
  (n: number, span: number) => `${n} kills across ${span} seconds`,
] as const;

const ONE_DEATH = [
  'you went down here',
  'this is where you went down',
  'you got dropped here',
] as const;

/**
 * What goes on the end of a kill clause when the same moment ends badly.
 *
 * Each one has to read as a continuation rather than a second sentence, which
 * is why the kill halves above end without a full stop and why none of these
 * starts with a word that could begin one.
 */
const DEATH_TAIL = [
  ', then you went down',
  ', and then they got you',
  ', and you went down right after',
] as const;

/** What a run of kills amounts to, as a clause that can take a tail. */
function killClause(kills: Kill[], span: number, seed: number): string {
  if (kills.length === 1) return pick(ONE_KILL, seed);
  if (kills.length === 2) {
    return span <= 1
      ? pick(QUICK_DOUBLE, seed)
      : TWO_KILLS[Math.abs(Math.round(seed)) % TWO_KILLS.length](span);
  }
  const many = MANY_KILLS[Math.abs(Math.round(seed)) % MANY_KILLS.length];
  return many(kills.length, Math.max(1, span));
}

/**
 * One moment: the kills in it, and the death that belongs to it if one does.
 *
 * Either list may be the empty one, never both.
 */
function describeMoment(kills: Kill[], death: Death | null): GameEvent {
  const readings = [...kills.map((k) => k.confidence), ...(death ? [death.confidence] : [])];
  const confidence = readings.reduce((sum, c) => sum + c, 0) / readings.length;

  if (!kills.length && death) {
    return {
      kind: 'death',
      atSec: death.atSec,
      untilSec: death.atSec,
      confidence,
      reason: pick(ONE_DEATH, death.atSec * 10),
    };
  }

  const first = kills[0];
  const last = kills[kills.length - 1];
  const atSec = death ? Math.min(first.atSec, death.atSec) : first.atSec;
  const untilSec = death ? Math.max(last.atSec, death.atSec) : last.atSec;
  const span = Math.round(last.atSec - first.atSec);

  /*
   * One seed for the clause and another for the tail, so a moment with both
   * does not pick the same index twice and read as a pattern. Both are the
   * moment's own numbers, so both are stable for a given clip.
   */
  const clause = killClause(kills, span, first.atSec * 10 + kills.length);
  const tail = death ? pick(DEATH_TAIL, death.atSec * 10 + kills.length * 2) : '';

  return {
    kind: kills.length === 1 ? 'kill' : 'multi-kill',
    atSec,
    untilSec,
    confidence,
    reason: `${clause}${tail}`,
  };
}

/**
 * What happened in this clip, as the ranges worth offering.
 *
 * Exported and taking values rather than pixels, because this is the half that
 * decides what somebody is shown and none of it is re-derivable from reading
 * the thresholds. `tests/unit/main/battlefieldMoments.spec.ts` owns it.
 *
 * Two rules, and both come from what a person would say about the footage:
 *
 * **Kills close together are one moment.** "Three kills inside nine seconds"
 * is one thing that happened and one range to cut; three suggestions two
 * seconds apart is the same footage offered three times.
 *
 * **A death close to a kill belongs to it.** Trading a kill for your own life
 * reads as one moment, so it is one range with one sentence. Further off it is
 * its own range: a death twenty seconds after a kill is a second story, and
 * merging them would suggest a cut with a long walk in the middle.
 */
export function composeMoments(kills: Kill[], deaths: Death[]): GameEvent[] {
  if (!kills.length && !deaths.length) return [];

  const moments: Kill[][] = [];
  for (const kill of kills) {
    const last = moments[moments.length - 1];
    if (last && kill.atSec - last[last.length - 1].atSec <= SAME_MOMENT_SEC) last.push(kill);
    else moments.push([kill]);
  }

  /*
   * Nearest first, so that with two moments in reach a death goes to the one
   * it actually belongs to rather than to whichever came first in the list.
   * One death per moment: two deaths inside one run of kills is not something
   * the game can do, and taking the nearest keeps the sentence honest if the
   * detector ever thinks otherwise.
   */
  const joined = new Map<number, Death>();
  const alone: Death[] = [];
  for (const death of deaths) {
    let bestAt = -1;
    let bestDistance = Number.POSITIVE_INFINITY;
    for (let at = 0; at < moments.length; at++) {
      if (joined.has(at)) continue;
      const moment = moments[at];
      const from = moment[0].atSec;
      const to = moment[moment.length - 1].atSec;
      const distance = death.atSec < from ? from - death.atSec : death.atSec - to;
      if (distance > DEATH_JOINS_KILL_SEC || distance >= bestDistance) continue;
      bestAt = at;
      bestDistance = distance;
    }
    if (bestAt >= 0) joined.set(bestAt, death);
    else alone.push(death);
  }

  return [
    ...moments.map((moment, at) => describeMoment(moment, joined.get(at) ?? null)),
    ...alone.map((death) => describeMoment([], death)),
  ].sort((a, b) => a.atSec - b.atSec);
}

export const battlefield: GameModule = {
  // Battlefield 6 only, and that is a measurement rather than an oversight.
  // 2042 draws its kill notification as a red strip left of centre carrying a
  // skull and an XP figure, with no boxed KILL beneath, neither template
  // matches it, and four recordings is too thin a sample to build a second
  // module against. It gets the general rule until there is footage to check
  // one with.
  games: ['Battlefield 6', 'BF6'],
  describe: 'reads Battlefield’s own kill banner, and the lines it shows when you go down',
  regions: { hud: HUD, manDown: MAN_DOWN, playerCard: PLAYER_CARD },

  watch(input: WatchInput): GameEvent[] {
    return composeMoments(groupHits(findHits(input)), groupDowns(findDowns(input)));
  },

  refine() {
    // Nothing to adjust from the sound alone. What this module knows it knows
    // from the screen, and that arrives as events.
    return {};
  },
};

register(battlefield);
