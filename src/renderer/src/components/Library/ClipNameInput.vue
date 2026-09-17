<script setup lang="ts">
import { nextTick, ref } from 'vue';
import { Icon } from '@iconify/vue';
import { updateClipName } from '@renderer/services/clips';
import type { Clip } from '@renderer/types/clip';

interface Props {
  clip: Clip;
  /**
   * The modal header, where this is the title of the whole thing rather than
   * one line on a tile among forty others.
   */
  large?: boolean;
}

interface Emits {
  (e: 'updated', clip: Clip): void;
}

const props = withDefaults(defineProps<Props>(), { large: false });
const emit = defineEmits<Emits>();

/*
 * On a card the name is a label until you ask for it to be a field.
 *
 * It was always an input, so the most obvious thing on a tile, its title,
 * swallowed the click that should open the clip. Three walkthrough users tried
 * to open a clip by its name, got nothing, and one of them found the way in by
 * clicking the file size instead.
 *
 * `readonly` rather than a swap to a `<span>`: the click still bubbles, so the
 * card opens, and the pencil is the explicit way in for renaming. In the modal
 * header this does not apply, because there the name is the title of the thing
 * you are already looking at and there is nothing behind it to open.
 */
const editing = ref(false);
const field = ref<HTMLInputElement | null>(null);

async function beginEditing(): Promise<void> {
  editing.value = true;
  await nextTick();
  field.value?.focus();
  field.value?.select();
}

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
        class="w-full bg-transparent border border-transparent outline-hidden py-0.5 truncate rounded
               group-hover/name:border-border group-hover/name:bg-card/5
               focus:border-orange-500/60 focus:bg-card/5"
        :class="large ? 'pl-2 pr-8 text-lg font-semibold' : 'pl-1.5 pr-6 text-sm font-medium'"
        :value="clip.displayName ?? clip.filename"
        :title="`${clip.displayName ?? clip.filename}\n\nClick to rename it in GoodBit. The file on disk keeps its own name.`"
        :aria-label="`Name for ${clip.filename}, shown in GoodBit only`"
        @change="handleNameChange"
      />
      <Icon
        icon="material-symbols:edit-outline"
        class="pointer-events-none absolute inset-y-0 my-auto text-muted-400 opacity-0 group-hover/name:opacity-100 transition-opacity"
        :class="large ? 'right-2 h-5 w-5' : 'right-1.5 h-4 w-4'"
      />
    </div>
    <div class="text-xs text-muted-400 mt-1 line-clamp-1">
      {{ clip.game }}
    </div>
  </div>
</template>

