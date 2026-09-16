<script setup lang="ts">
import { Icon } from '@iconify/vue';

interface Emits {
  (e: 'insert', prefix: string, suffix?: string): void;
  (e: 'insert-playhead'): void;
  (e: 'toggle-preview'): void;
}

interface Props {
  showPreview: boolean;
  /** The preview sits beside the text, so it is shown and hidden, not swapped into. */
  split?: boolean;
  /**
   * No bar of its own: no ground, no border, no padding.
   *
   * For a header that already provides all three. Drawn as a strip it became a
   * second header stacked under the real one, with a rule between them.
   */
  bare?: boolean;
  /**
   * There is a player to read a position from.
   *
   * Off where a note is written with no clip in front of it, since a button
   * that writes 0:00 whatever is going on is worse than no button.
   */
  hasPlayhead?: boolean;
}

withDefaults(defineProps<Props>(), { split: false, bare: false, hasPlayhead: false });
const emit = defineEmits<Emits>();
</script>

<template>
  <div
    class="flex items-center gap-1"
    :class="bare ? '' : 'p-2 border-b border-border bg-muted-50/50 rounded-t-lg'"
  >
    <!--
      First on the bar, because it is the one button here that knows something
      the keyboard does not. The moment worth writing down is the frame on
      screen, and reading it off the scrubber and typing it back is the part
      nobody does.
    -->
    <button
      v-if="hasPlayhead"
      type="button"
      class="p-2 rounded hover:bg-muted-200 transition-colors text-orange-600"
      title="Insert the time on screen now"
      @click="emit('insert-playhead')"
    >
      <Icon icon="material-symbols:more-time" class="text-lg" />
    </button>

    <div v-if="hasPlayhead" class="w-px h-6 bg-muted-300 mx-1" />

    <button
      type="button"
      class="p-2 rounded hover:bg-muted-200 transition-colors"
      title="Bold (Ctrl+B)"
      @click="emit('insert', '**', '**')"
    >
      <Icon icon="material-symbols:format-bold" class="text-lg" />
    </button>
    
    <button
      type="button"
      class="p-2 rounded hover:bg-muted-200 transition-colors"
      title="Italic (Ctrl+I)"
      @click="emit('insert', '*', '*')"
    >
      <Icon icon="material-symbols:format-italic" class="text-lg" />
    </button>
    
    <button
      type="button"
      class="p-2 rounded hover:bg-muted-200 transition-colors"
      title="Heading"
      @click="emit('insert', '## ')"
    >
      <Icon icon="material-symbols:format-h2" class="text-lg" />
    </button>
    
    <div class="w-px h-6 bg-muted-300 mx-1" />
    
    <button
      type="button"
      class="p-2 rounded hover:bg-muted-200 transition-colors"
      title="Link"
      @click="emit('insert', '[', '](url)')"
    >
      <Icon icon="material-symbols:link" class="text-lg" />
    </button>
    
    <button
      type="button"
      class="p-2 rounded hover:bg-muted-200 transition-colors"
      title="Bullet List"
      @click="emit('insert', '- ')"
    >
      <Icon icon="material-symbols:format-list-bulleted" class="text-lg" />
    </button>
    
    <button
      type="button"
      class="p-2 rounded hover:bg-muted-200 transition-colors"
      title="Code"
      @click="emit('insert', '`', '`')"
    >
      <Icon icon="material-symbols:code" class="text-lg" />
    </button>
    
    <button
      type="button"
      class="p-2 rounded hover:bg-muted-200 transition-colors"
      title="Quote"
      @click="emit('insert', '> ')"
    >
      <Icon icon="material-symbols:format-quote" class="text-lg" />
    </button>
    
    <div v-if="!bare" class="flex-1" />
    
    <button
      type="button"
      class="px-3 py-1.5 rounded hover:bg-muted-200 transition-colors flex items-center gap-2 text-sm font-medium"
      :class="{ 'bg-orange-500/16 text-orange-600': showPreview }"
      @click="emit('toggle-preview')"
    >
      <!--
        Beside the text rather than instead of it, so the label is not "Edit":
        editing never stopped. It says what pressing it does.
      -->
      <Icon
        :icon="showPreview ? 'material-symbols:visibility-off' : 'material-symbols:visibility'"
        class="text-lg"
      />
      <span>{{ showPreview ? (split ? 'Hide preview' : 'Edit') : 'Preview' }}</span>
    </button>
  </div>
</template>

