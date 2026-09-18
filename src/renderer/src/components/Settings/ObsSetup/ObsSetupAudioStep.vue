<script setup lang="ts">
import { computed } from 'vue';
import ObsSetupAudioDevice from './ObsSetupAudioDevice.vue';
import ObsSetupStepToggle from './ObsSetupStepToggle.vue';
import { planAudioTracks } from '@shared/index';
import type { SetupStep } from '@renderer/composables/obs/useObsSetup';
import type { AudioDevice } from '@renderer/services/obs';

/**
 * What to hear.
 *
 * Each one becomes its own fader in OBS, so a game and a voice chat arrive as
 * two tracks rather than one. Defaulted to the system's own output alone, which
 * is what OBS calls Desktop Audio and the right answer for anybody who has
 * never thought about it.
 */

interface Props {
  devices: AudioDevice[];
  chosenIds: string[];
  /** Whether each of them gets a track of its own. Null before the steps load. */
  multiTrackStep?: SetupStep | null;
}

interface Emits {
  (e: 'toggle', id: string): void;
  (e: 'toggle-step', key: SetupStep['key'], enabled: boolean): void;
}

const props = defineProps<Props>();
const emit = defineEmits<Emits>();

const outputs = computed(() => props.devices.filter((device) => device.flow === 'output'));
const inputs = computed(() => props.devices.filter((device) => device.flow === 'input'));

function isChosen(id: string): boolean {
  return props.chosenIds.includes(id);
}

/**
 * Which sound would land on which track, live, while the ticks are happening.
 *
 * The same function the setup writes the bitmasks from, out of `src/shared`,
 * rather than a second description of the same arithmetic. The order matters
 * and is the order the devices were listed in, so this is built from the
 * device list rather than from the set of chosen ids.
 */
const chosen = computed(() => props.devices.filter((device) => isChosen(device.id)));

const plan = computed(() =>
  planAudioTracks(chosen.value, props.multiTrackStep?.enabled !== false),
);
</script>

<template>
  <p class="text-sm text-muted-500">
    Each one becomes its own fader in OBS, so a game and a voice chat arrive as two tracks
    rather than one. The first is the right answer if you have never thought about this.
  </p>

  <div class="space-y-1.5">
    <p class="text-xs uppercase tracking-wide text-muted-500">Playing</p>
    <!--
      Two columns, because a machine with a capture card, a virtual
      mixer and a monitor's own speakers has a dozen of these and one
      column turns the step into a scroll.
    -->
    <div class="grid sm:grid-cols-2 gap-1.5">
      <ObsSetupAudioDevice
        v-for="device in outputs"
        :key="device.id"
        :device="device"
        :chosen="isChosen(device.id)"
        @toggle="emit('toggle', device.id)"
      />
    </div>
  </div>

  <div v-if="inputs.length" class="space-y-1.5 pt-1">
    <p class="text-xs uppercase tracking-wide text-muted-500">Microphones</p>
    <div class="grid sm:grid-cols-2 gap-1.5">
      <ObsSetupAudioDevice
        v-for="device in inputs"
        :key="device.id"
        :device="device"
        :chosen="isChosen(device.id)"
        @toggle="emit('toggle', device.id)"
      />
    </div>
  </div>

  <p v-if="!chosenIds.length" class="text-xs text-accent-ink">
    Nothing selected, so your clips will be silent.
  </p>

  <!--
    Only worth asking about with something to separate.

    One device is one track whatever anybody answers, so a switch here would be
    a control that does nothing, which is worse than no control.
  -->
  <template v-if="multiTrackStep && chosen.length > 1">
    <ObsSetupStepToggle
      :step="multiTrackStep"
      @update:enabled="emit('toggle-step', multiTrackStep.key, $event)"
    />

    <!--
      What that would actually mean, in tracks, before it is written.

      The routing is the one decision on this screen that a recording cannot be
      talked out of afterwards, so it is shown as a list rather than described
      in a sentence.
    -->
    <div v-if="plan.multiTrack" class="rounded-md border border-border p-4 space-y-1.5">
      <p class="text-xs uppercase tracking-wide text-muted-500">What lands where</p>
      <div
        v-for="track in plan.tracks"
        :key="track.track"
        class="grid grid-cols-[3.5rem_minmax(0,1fr)] items-baseline gap-2"
      >
        <span class="font-mono text-xs tabular-nums text-muted-400">
          Track {{ track.track }}
        </span>
        <span class="text-sm" :class="track.master ? 'text-muted-500' : 'text-muted-700'">
          {{ track.master ? 'Everything, mixed together' : track.label }}
        </span>
      </div>
      <p v-if="plan.overflow.length" class="text-xs text-accent-ink pt-1">
        OBS has six tracks and one of them is the mix, so
        {{ plan.overflow.join(', ') }} reaches the mix without a track of its own.
      </p>
    </div>
  </template>
</template>
