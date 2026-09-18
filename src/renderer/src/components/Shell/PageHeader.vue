<script lang="ts" setup>
import BaseField from '@renderer/components/Base/BaseField.vue';

/**
 * The title of the screen, and the search field. Nothing else.
 *
 * It held two more things and neither belonged here. **Rescan** was solid
 * orange, the colour this app keeps for the thing it wants you to press, for an
 * operation that is a backstop: the watcher, the incoming folder and a six
 * hourly sweep have already done it. It is in Settings now, next to the folder
 * it scans. **Tags** was a button that opened a filter, one row above the
 * filters, so filtering by tag was in a different place from filtering by
 * everything else; it is in the Filter popover now, with the game and the
 * state.
 *
 * Editorial rather than chrome. The title is the display face at 34px and the
 * search is a rule under the placeholder, right-aligned and sitting on the
 * subtitle's baseline, which is what `items-end` is for: the two blocks are
 * different heights and the thing that should agree is where they stop, not
 * where they start.
 */
withDefaults(
  defineProps<{
    search: string;
    title?: string;
    subtitle?: string;
    /**
     * The screen under this one has been scrolled away from the top.
     *
     * The title is editorial, and editorial is for arriving: once somebody is
     * three rows into their clips, 34px of display face and a sentence
     * explaining the screen are 90 pixels of something they have read. So it
     * shrinks to a label and the subtitle goes, and the search stays, because
     * that is the one thing in here anybody reaches for twice.
     */
    compact?: boolean;
  }>(),
  { compact: false },
);
defineEmits<{
  (e: 'update:search', value: string): void;
}>();
</script>

<template>
  <!--
    The padding, the title's size and the subtitle all move together, over the
    same 200ms, so the header reads as one thing shrinking rather than three
    things moving. `prefers-reduced-motion` turns all of it off in `styles.css`,
    once, for the whole app.
  -->
  <header
    class="px-12 pb-1 transition-[padding] duration-200 ease-out"
    :class="compact ? 'pt-3.5' : 'pt-8'"
  >
    <div class="flex items-end gap-8">
      <!--
        `self-start`, in a row that is otherwise `items-end`.

        The search field wants the bottom, because it should stop where the
        subtitle stops. The title does not: bottom-aligned, its position
        depends on how tall the block under it happens to be, and that block
        collapses as the header shrinks. Past the point where it becomes
        shorter than the search field, the field sets the row's height and the
        title, pinned to the row's bottom, travels back *down* while
        everything else is still moving up. Measured at 2.6px of reversal in
        the last frames of the animation, which reads as a small jump at the
        end of an otherwise smooth move. Anchored to the top it only moves
        with the padding, which is the thing that is actually animating.
      -->
      <div class="min-w-0 self-start">
        <h1
          class="font-display font-medium tracking-tight text-foreground transition-[font-size,line-height] duration-200 ease-out"
          :class="compact ? 'text-2xl' : 'text-hero'"
        >
          {{ title || 'My Library' }}
        </h1>
        <!--
          `grid-template-rows` from `1fr` to `0fr` is the one way to animate to
          and from a height nobody knows in advance, which is the case for a
          sentence that wraps at some widths and not others. The child needs
          `overflow-hidden` and `min-h-0` or it refuses to be squeezed.
        -->
        <div
          v-if="subtitle"
          class="grid transition-[grid-template-rows] duration-200 ease-out"
          :class="compact ? 'grid-rows-[0fr]' : 'grid-rows-[1fr]'"
        >
          <div class="overflow-hidden min-h-0">
            <p class="mt-2 text-muted-500 max-w-[54ch]">{{ subtitle }}</p>
          </div>
        </div>
      </div>

      <BaseField icon="material-symbols:search" class="ml-auto w-[300px] shrink-0">
        <label class="sr-only" for="global-search-input">Search names, dates and tags</label>
        <input
          id="global-search-input"
          type="search"
          autocomplete="off"
          :value="search"
          placeholder="Search names, dates and tags"
          @input="$emit('update:search', ($event.target as HTMLInputElement).value)"
        />
      </BaseField>
    </div>
  </header>
</template>
