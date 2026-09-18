<script setup lang="ts">
import { Icon } from '@iconify/vue';
import BaseSlider from '@renderer/components/Base/BaseSlider.vue';
import {
  FOCUS_RING,
  ICON_BOX,
  ICON_BUTTON_DENSE,
  MOTION,
  SECTION_HEADER,
} from '@renderer/components/Base/geometry';
import type { ClipAudioTrack } from '@renderer/services/clips';

/**
 * The sound in this clip, one track at a time.
 *
 * Almost every clip has one track and this is one row: a mute and a level, for
 * the clip's whole soundtrack. A recording made through GoodBit's own OBS
 * setup carries a track per source, and then this is the screen the whole of
 * issue #7 exists for: the clutch is fine, the friend chewing on voice chat is
 * not, and one press fixes it.
 *
 * ## Three things about it that are deliberate
 *
 * **It does not change the preview.** Chromium does not implement
 * `HTMLMediaElement.audioTracks`, so the `<video>` above plays whatever the
 * file calls its first track and nothing here can reach it. Saying so once, in
 * a line under the list, is better than a control that looks like it should
 * work and does not.
 *
 * **The mix is named, not hidden.** Track 1 of a multi-track recording is
 * every source summed, so it is not a peer of the tracks below it, and muting
 * voice chat means the mix has to be rebuilt out of what survived. The row
 * says what it is; `services/clipAudio.ts` does the rebuilding.
 *
 * **Nothing here is stored on the clip.** In the trimmer a selection lasts as
 * long as the screen, and the trim writes it into the file because a trim
 * replaces the recording. In the editor it lives on the timeline clip and is
 * saved with the draft, the same way that clip's fader is.
 *
 * One component for both, because they are the same list. The trimmer's own
 * GoodBits list is `ClipDetail/ClipGoodBitsSection.vue` for the same reason,
 * and this sits in the same folder on the same grounds: it is about a clip,
 * not about trimming one.
 */
interface Props {
  tracks: ClipAudioTrack[];
  loading?: boolean;
  changed?: boolean;
  isMuted: (index: number) => boolean;
  /** A multiplier, where 1 is the level it was recorded at. */
  volumeOf: (index: number) => number;
  /** Nothing can be changed while the file is being written. */
  disabled?: boolean;
  /**
   * Whether this is the first thing in its column.
   *
   * The hairline above the heading says where the section before it ended, and
   * a rule across the top of a column is a line under nothing.
   */
  flush?: boolean;
}

withDefaults(defineProps<Props>(), {
  loading: false,
  changed: false,
  disabled: false,
  flush: false,
});

const emit = defineEmits<{
  (e: 'toggle-mute', index: number): void;
  (e: 'set-volume', index: number, volume: number): void;
  (e: 'solo', index: number): void;
  (e: 'reset'): void;
}>();

/**
 * How far a level can move, as a percentage of what was recorded.
 *
 * A percentage rather than decibels, because that is the unit this app already
 * uses for a level: the editor shows a clip's fader as a percentage, and a
 * track inside that clip reading `-6 dB` next to a clip reading `50%` would be
 * two units for one idea.
 *
 * Up to 200, so a track that was recorded too quietly can be brought level with
 * the others rather than only ever turned down. Past that, what was quiet turns
 * out to have been quiet for a reason.
 */
const MIN_PERCENT = 0;
const MAX_PERCENT = 200;

/** Fives. A percent either way is not a difference anybody can hear. */
const STEP_PERCENT = 5;

/**
 * The stored multiplier and the number on screen.
 *
 * Rounded on the way in and divided on the way out, so a slider that lands on
 * 85 stores 0.85 exactly rather than 0.8500000000000001, which would then read
 * as a decision on a clip nobody had touched.
 */
function toPercent(volume: number): number {
  return Math.round(volume * 100);
}

function toVolume(percent: number): number {
  return Math.round(percent) / 100;
}
</script>

<template>
  <section
    v-if="tracks.length > 0 || loading"
    :class="flush ? '' : 'border-t border-border pt-5'"
  >
    <div :class="SECTION_HEADER">
      <h2 class="text-sm font-medium text-muted-600 shrink-0">Sound</h2>
      <span
        v-if="tracks.length > 1"
        class="font-mono text-xs tabular-nums text-muted-400 shrink-0"
      >
        {{ tracks.length }}
      </span>

      <button
        v-if="changed"
        :class="[
          'ml-auto px-3 py-1.5 rounded-lg text-sm text-muted-600 hover:bg-muted-50 shrink-0 flex items-center gap-1.5',
          MOTION,
          FOCUS_RING,
        ]"
        :disabled="disabled"
        title="Put every track back to how it was recorded"
        @click="emit('reset')"
      >
        <Icon icon="material-symbols:undo-rounded" :class="ICON_BOX" />
        Reset
      </button>
    </div>

    <p v-if="loading" class="text-sm text-muted-500 px-1 py-2">Reading the sound on this clip…</p>

    <ul v-else class="flex flex-col gap-3">
      <li
        v-for="track in tracks"
        :key="track.index"
        class="rounded-lg border border-border px-3 py-2.5"
        :class="isMuted(track.index) ? 'bg-surface-sunk' : 'bg-card'"
      >
        <!--
          A grid rather than a flex row of guesses, so the mute glyphs form a
          column and the labels start at one x whatever any row holds.
        -->
        <div class="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2">
          <button
            :class="[
              ICON_BUTTON_DENSE,
              'rounded-md',
              MOTION,
              FOCUS_RING,
              isMuted(track.index)
                ? 'text-danger-ink hover:bg-muted-50'
                : 'text-muted-500 hover:bg-muted-50 hover:text-muted-700',
            ]"
            :disabled="disabled"
            :title="isMuted(track.index) ? 'Bring this track back' : 'Leave this track out'"
            :aria-pressed="isMuted(track.index)"
            @click="emit('toggle-mute', track.index)"
          >
            <Icon
              :icon="
                isMuted(track.index)
                  ? 'material-symbols:volume-off-rounded'
                  : 'material-symbols:volume-up-rounded'
              "
              :class="ICON_BOX"
            />
          </button>

          <div class="min-w-0">
            <p
              class="text-sm truncate"
              :class="isMuted(track.index) ? 'text-muted-400 line-through' : 'text-muted-700'"
              :title="track.label"
            >
              {{ track.label }}
            </p>
            <!--
              What this row actually is, when it is not simply a device.

              The mix is the one row whose meaning is not obvious from its name,
              and it is also the one whose behaviour is surprising: turning a
              source off rebuilds it. A clip whose tracks nobody can name says
              so too, rather than implying that "Track 3" is a considered name.
            -->
            <p v-if="track.master" class="text-xs text-muted-400">
              Everything below, mixed. Rebuilt if you change one.
            </p>
            <p v-else-if="track.labelSource === 'index'" class="text-xs text-muted-400">
              Nothing recorded what this one holds
            </p>
          </div>

          <button
            v-if="tracks.length > 1 && !track.master"
            :class="[
              'px-2.5 h-7 rounded-md text-xs shrink-0',
              MOTION,
              FOCUS_RING,
              'text-muted-500 hover:bg-muted-50 hover:text-muted-700',
            ]"
            :disabled="disabled"
            title="Keep only this one, and leave the rest out"
            @click="emit('solo', track.index)"
          >
            Only this
          </button>
        </div>

        <!--
          The level, reserved at rest rather than revealed on hover: a row that
          grows a slider when a pointer crosses it moves every row under it.
        -->
        <div class="mt-2 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
          <BaseSlider
            :model-value="toPercent(volumeOf(track.index))"
            :min="MIN_PERCENT"
            :max="MAX_PERCENT"
            :step="STEP_PERCENT"
            :disabled="disabled || isMuted(track.index)"
            :label="`Level of ${track.label}`"
            @update:model-value="(value: number) => emit('set-volume', track.index, toVolume(value))"
          />
          <!--
            Mono, tabular and wide enough for its longest value, so the slider
            beside it does not breathe as the number goes from 95 to 100.
          -->
          <span
            class="font-mono text-xs tabular-nums text-right w-[3.25rem] shrink-0"
            :class="volumeOf(track.index) === 1 ? 'text-muted-400' : 'text-muted-700'"
          >
            {{ toPercent(volumeOf(track.index)) }}%
          </span>
        </div>
      </li>
    </ul>

    <p v-if="!loading && tracks.length > 0" class="mt-3 text-xs text-muted-400">
      The preview above always plays the recording as it is. These apply to the
      trimmed clip and to anything exported from it.
    </p>
  </section>
</template>
