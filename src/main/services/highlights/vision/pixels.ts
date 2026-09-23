/**
 * The handful of measurements a HUD detector needs from a frame.
 *
 * All of them run over a packed RGB buffer of one sampled region and return a
 * single number, so a module can describe what it is looking for without ever
 * touching a pixel itself.
 */

export interface Sampled {
  width: number;
  height: number;
  /** Packed RGB, three bytes per pixel, row-major. */
  data: Uint8Array;
}

/** Luma, one value per pixel. */
export function greyscale(frame: Sampled): Float64Array {
  const out = new Float64Array(frame.width * frame.height);
  const { data } = frame;
  for (let i = 0, p = 0; i < data.length; i += 3, p++) {
    out[p] = 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
  }
  return out;
}

export interface InkOptions {
  /** How bright the brightest channel has to be. */
  min?: number;
  /** How far the channels may differ before it stops counting as grey. */
  spread?: number;
}

/**
 * Which pixels are bright and close to grey, HUD ink, whatever is behind it.
 *
 * Games draw their overlays in white or near-white, and everything else in a
 * frame is coloured by the light in the scene. The greyness test is what keeps
 * foliage, muzzle flash and sky out.
 */
export function inkMask(frame: Sampled, { min = 170, spread = 34 }: InkOptions = {}): Uint8Array {
  const mask = new Uint8Array(frame.width * frame.height);
  const { data } = frame;
  for (let i = 0, p = 0; i < data.length; i += 3, p++) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const hi = r > g ? (r > b ? r : b) : g > b ? g : b;
    if (hi < min) continue;
    const lo = r < g ? (r < b ? r : b) : g < b ? g : b;
    if (hi - lo <= spread) mask[p] = 1;
  }
  return mask;
}

/** The share of a mask that is set. */
export function share(mask: Uint8Array): number {
  let n = 0;
  for (let i = 0; i < mask.length; i++) n += mask[i];
  return n / mask.length;
}

/**
 * How much of the ink stayed exactly where it was since the previous sample.
 *
 * An overlay is pinned to the screen while the world slides behind it, so its
 * pixels land on themselves frame after frame; scenery only does that when the
 * camera is still. On its own this cannot separate the two, but next to a
 * shape match it is what stops a sunlit wall from reading as a banner.
 */
export function stickiness(previous: Uint8Array | undefined, current: Uint8Array): number {
  if (!previous) return 0;
  let both = 0;
  let a = 0;
  let b = 0;
  for (let i = 0; i < current.length; i++) {
    if (previous[i]) a++;
    if (current[i]) b++;
    if (previous[i] && current[i]) both++;
  }
  const most = a > b ? a : b;
  return most ? both / most : 0;
}

/**
 * Mean colourfulness of the *lit* pixels in a box, 0 for grey and 1 for a
 * pure hue.
 *
 * Battlefield draws the skull white for a kill you got and green for an assist
 * someone else finished; the shapes are near enough identical, so only the
 * colour tells them apart, and the shape matcher works in grey on purpose.
 *
 * Only the bright pixels count, and that is the whole point. Averaged over the
 * whole box a white icon on orange dirt reads as orange, which threw away real
 * kills until the dim pixels were dropped. `minBright` is what separates the
 * icon from the scene it is drawn over.
 */
export function glyphSaturation(
  frame: Sampled,
  box: { x: number; y: number; w: number; h: number },
  minBright = 150,
): number {
  const { data, width, height } = frame;
  const x1 = Math.min(width, box.x + box.w);
  const y1 = Math.min(height, box.y + box.h);
  let total = 0;
  let counted = 0;
  for (let y = Math.max(0, box.y); y < y1; y++) {
    for (let x = Math.max(0, box.x); x < x1; x++) {
      const i = (y * width + x) * 3;
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      const hi = r > g ? (r > b ? r : b) : g > b ? g : b;
      if (hi < minBright) continue;
      const lo = r < g ? (r < b ? r : b) : g < b ? g : b;
      total += (hi - lo) / hi;
      counted++;
    }
  }
  // Nothing bright enough to read means nothing claiming to be an icon.
  return counted ? total / counted : 0;
}

/**
 * A greyscale plane minus its own local mean, over a square `radius` pixels
 * either side.
 *
 * Keeps strokes and drops the ground they are drawn on. Correlation already
 * ignores how bright a window is overall, but not what else is in it: white
 * HUD glyphs over sunlit sand or rock share the window with texture of about
 * their own brightness, and that texture carries most of the variance the
 * match normalises by. Taking the local mean out first leaves the thin bright
 * strokes and flattens the broad lumps of scenery, so the shape counts again.
 *
 * Run over a template too, with the same radius in its own pixels, or the two
 * sides of the correlation are not the same kind of picture.
 */
export function highPass(plane: ArrayLike<number>, width: number, height: number, radius: number): Float64Array {
  const stride = width + 1;
  const sums = new Float64Array(stride * (height + 1));
  for (let y = 0; y < height; y++) {
    let row = 0;
    for (let x = 0; x < width; x++) {
      row += plane[y * width + x];
      sums[(y + 1) * stride + x + 1] = sums[y * stride + x + 1] + row;
    }
  }
  const out = new Float64Array(width * height);
  for (let y = 0; y < height; y++) {
    const y0 = Math.max(0, y - radius);
    const y1 = Math.min(height, y + radius + 1);
    for (let x = 0; x < width; x++) {
      const x0 = Math.max(0, x - radius);
      const x1 = Math.min(width, x + radius + 1);
      const total = sums[y1 * stride + x1] - sums[y0 * stride + x1] - sums[y1 * stride + x0] + sums[y0 * stride + x0];
      out[y * width + x] = plane[y * width + x] - total / ((y1 - y0) * (x1 - x0));
    }
  }
  return out;
}

/** Copy a box out of a greyscale plane. */
export function crop(
  plane: Float64Array,
  width: number,
  box: { x: number; y: number; w: number; h: number },
): Float64Array {
  const out = new Float64Array(box.w * box.h);
  for (let y = 0; y < box.h; y++) {
    const from = (box.y + y) * width + box.x;
    for (let x = 0; x < box.w; x++) out[y * box.w + x] = plane[from + x];
  }
  return out;
}
