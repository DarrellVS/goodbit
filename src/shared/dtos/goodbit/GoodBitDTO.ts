import { BaseDTO } from '../BaseDTO.js';

/** Where a GoodBit came from. Mirrors `GoodBitSource` in the main process. */
export type GoodBitSourceName = 'manual' | 'hud' | 'audio';

/**
 * The shape `fromEntity` needs, rather than `any`.
 *
 * `ClipDTO.fromEntity(entity: any)` is the older pattern here and it provides
 * no type safety while doing mechanical field copying: adding a column means
 * editing the entity, the fields and the copy, with the compiler silent if you
 * miss one. A structural parameter costs nothing, keeps `src/shared` free of
 * any import from `src/main` (which it must be, both processes agree on this
 * file), and makes a missed field a compile error. Dates are typed both ways
 * because TypeORM hands back a `Date` and a cached JSON round trip hands back
 * the string.
 */
export interface GoodBitLike {
  id: number;
  clipId: number;
  startSec: number;
  endSec: number;
  name: string | null;
  source: GoodBitSourceName;
  reason: string | null;
  confidence: number | null;
  createdAt?: Date | string;
  updatedAt?: Date | string;
}

/**
 * A named range inside a clip, on its way to the window.
 *
 * A trim replaces the file; a GoodBit does not. The recording stays whole and
 * carries a list of the bits worth watching, which is metadata about content
 * that is already on disk, the same footing as `displayName`.
 *
 * `source` is the field to read before showing a `reason`: a detected GoodBit
 * has one and a hand-marked one does not, and the measurement behind this
 * feature says the hand-marked ones are the common case. Anything that assumes
 * a reason is present will be looking at null most of the time.
 */
export class GoodBitDTO extends BaseDTO<GoodBitDTO, GoodBitLike> {
  id!: number;
  clipId!: number;
  startSec!: number;
  endSec!: number;
  /** Seconds. Derived, and sent because every caller wants it. */
  durationSec!: number;
  name!: string | null;
  source!: GoodBitSourceName;
  /** The sentence a detector wrote. Null for one somebody marked. */
  reason!: string | null;
  /** 0 to 1 for a detected GoodBit, null for a manual one. */
  confidence!: number | null;
  createdAt?: string;
  updatedAt?: string;

  static fromEntity(entity: GoodBitLike): GoodBitDTO {
    const dto = new GoodBitDTO();
    dto.id = entity.id;
    dto.clipId = entity.clipId;
    dto.startSec = entity.startSec;
    dto.endSec = entity.endSec;
    dto.durationSec = Math.round((entity.endSec - entity.startSec) * 1000) / 1000;
    dto.name = entity.name ?? null;
    dto.source = entity.source;
    dto.reason = entity.reason ?? null;
    dto.confidence = entity.confidence ?? null;
    dto.createdAt =
      entity.createdAt instanceof Date ? entity.createdAt.toISOString() : entity.createdAt;
    dto.updatedAt =
      entity.updatedAt instanceof Date ? entity.updatedAt.toISOString() : entity.updatedAt;
    return dto;
  }
}
