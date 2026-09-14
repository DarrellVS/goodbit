<script setup lang="ts">
import { Icon } from '@iconify/vue';
import { updateClipName } from '../../services/clips';
import type { Clip } from '../../types/clip';

interface Props {
  clip: Clip;
}

interface Emits {
  (e: 'updated', clip: Clip): void;
}

const props = defineProps<Props>();
const emit = defineEmits<Emits>();

async function handleNameChange(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement;
  const updated = await updateClipName(props.clip.id, input.value || null);
  emit('updated', updated);
}
</script>

<template>
  <!--
    It is a text box, and it has to look like one.

    This was a borderless input holding the filename, with nothing to say it
    could be typed in. Every tester found it by accident and two of them
    assumed they had just renamed a recording on disk. It shows a frame and a
    pencil on hover now, and the tooltip says what editing it actually does,
    which is nothing to the file.
  -->
  <div class="flex-1 min-w-0 group/name">
    <!--
      The input fills this box and the pencil sits inside it, so both share one
      set of edges. It used to carry a negative margin, which made it wider than
      the wrapper the icon was positioned against, so the pencil sat off to one
      side of the frame rather than in it. The right padding keeps a long name
      from running underneath.
    -->
    <div class="relative -mx-1.5">
      <input
        class="w-full bg-transparent border border-transparent outline-none pl-1.5 pr-6 py-0.5 font-medium text-sm truncate rounded
               group-hover/name:border-border group-hover/name:bg-card/5
               focus:border-orange-500/60 focus:bg-card/5"
        :value="clip.displayName ?? clip.filename"
        :title="`${clip.displayName ?? clip.filename}\n\nClick to rename it in GoodBit. The file on disk keeps its own name.`"
        :aria-label="`Name for ${clip.filename}, shown in GoodBit only`"
        @change="handleNameChange"
      />
      <Icon
        icon="material-symbols:edit-outline"
        class="pointer-events-none absolute right-1.5 inset-y-0 my-auto h-4 w-4 text-muted-400 opacity-0 group-hover/name:opacity-100 transition-opacity"
      />
    </div>
    <div class="text-xs text-muted-400 mt-1 line-clamp-1">
      {{ clip.game }}
    </div>
  </div>
</template>

