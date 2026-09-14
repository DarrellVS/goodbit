import { register, type GameEvent, type GameModule, type WatchInput } from '../registry.js';
import { REFERENCE_HEIGHT, type Region } from '../vision/geometry.js';
import { crop, glyphSaturation, greyscale } from '../vision/pixels.js';
import { findTemplate } from '../vision/match.js';
import { BF_KILL_LABEL, BF_SKULL, type Template } from '../vision/templates.js';

/**
 * Battlefield tells you when you got a kill. This reads it.
 *
 * Not the kill feed in the corner — that lists everybody's kills and would
 * need to know your own name to be any use. The banner under the crosshair
 * appears only for kills *you* got, so it filters itself: a skull, the score,
 * the name of whoever you dropped, and a boxed KILL underneath.
 *
 * **Why two templates and a colour test.** The skull alone looked like enough
 * and is not. Measured against forty real recordings, every confirmed kill
 * scored 0.89 or better — but a clock icon on IMPROVABLE SECTOR reached 0.87
 * and a helmet on SPOT ASSIST 0.83, while one genuine kill caught mid-fade
 * scored 0.82. Any single threshold on the skull either loses that kill or
 * takes those two. The word KILL looks nothing like a clock, and the assist
 * skulls Battlefield draws are *green* where a kill's is white, so the three
 * tests together separate what one could not.
 */

/**
 * One box holding the whole banner: skull, score, and the label row under it.
 *
 * Deliberately one region and not two. Each region costs its own decode of the
 * video, which is nearly the entire cost of reading a clip — asking for the
 * banner and the labels separately doubled the time for one file. The two
 * boxes are adjacent, so one crop covers both and the parts are sliced out
 * here.
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
 * legible — one real kill was thrown away because the only frame whose skull
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
    // expected, and only off the lit pixels — see `glyphSaturation`.
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

interface Kill {
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
      // gave — not the average. The banner fades in and out, so averaging over
      // a group drags a certain kill down to the score of its own half-drawn
      // first frame.
      confidence: Math.min(
        1,
        group.reduce((best, h) => Math.max(best, h.skull, h.label), 0),
      ),
    }));
}

function describeKills(kills: Kill[]): GameEvent {
  const first = kills[0];
  const last = kills[kills.length - 1];
  const span = Math.round(last.atSec - first.atSec);
  const confidence = kills.reduce((sum, k) => sum + k.confidence, 0) / kills.length;

  if (kills.length === 1) {
    return {
      kind: 'kill',
      atSec: first.atSec,
      untilSec: first.atSec,
      confidence,
      reason: 'you dropped someone here — Battlefield put its own kill banner up',
    };
  }
  if (kills.length === 2) {
    return {
      kind: 'multi-kill',
      atSec: first.atSec,
      untilSec: last.atSec,
      confidence,
      reason: span <= 1 ? 'two kills, near enough at once' : `two kills, ${span} seconds apart`,
    };
  }
  return {
    kind: 'multi-kill',
    atSec: first.atSec,
    untilSec: last.atSec,
    confidence,
    reason: `${kills.length} kills inside ${Math.max(1, span)} seconds`,
  };
}

export const battlefield: GameModule = {
  // Battlefield 6 only, and that is a measurement rather than an oversight.
  // 2042 draws its kill notification as a red strip left of centre carrying a
  // skull and an XP figure, with no boxed KILL beneath — neither template
  // matches it, and four recordings is too thin a sample to build a second
  // module against. It gets the general rule until there is footage to check
  // one with.
  games: ['Battlefield 6', 'BF6'],
  describe: 'reads Battlefield’s own kill banner under the crosshair',
  regions: { hud: HUD },

  watch(input: WatchInput): GameEvent[] {
    const kills = groupHits(findHits(input));
    if (!kills.length) return [];

    // Kills within a few seconds are one moment, and saying so is the point of
    // counting them: "three kills inside nine seconds" is a better reason than
    // three separate suggestions nobody asked for.
    const moments: Kill[][] = [];
    for (const kill of kills) {
      const last = moments[moments.length - 1];
      if (last && kill.atSec - last[last.length - 1].atSec <= SAME_MOMENT_SEC) last.push(kill);
      else moments.push([kill]);
    }
    return moments.map(describeKills);
  },

  refine() {
    // Nothing to adjust from the sound alone. What this module knows it knows
    // from the screen, and that arrives as events.
    return {};
  },
};

register(battlefield);
