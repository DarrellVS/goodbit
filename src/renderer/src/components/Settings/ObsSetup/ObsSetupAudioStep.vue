<script setup lang="ts">
import { computed } from 'vue';
import ObsSetupAudioDevice from './ObsSetupAudioDevice.vue';
import type { AudioDevice } from '../../../services/obs';

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
}

interface Emits {
  (e: 'toggle', id: string): void;
}

const props = defineProps<Props>();
const emit = defineEmits<Emits>();

const outputs = computed(() => props.devices.filter((device) => device.flow === 'output'));
const inputs = computed(() => props.devices.filter((device) => device.flow === 'input'));

function isChosen(id: string): boolean {
  return props.chosenIds.includes(id);
}
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

  <p v-if="!chosenIds.length" class="text-xs text-orange-600">
    Nothing selected, so your clips will be silent.
  </p>
</template>
