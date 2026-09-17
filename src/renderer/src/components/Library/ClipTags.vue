<script setup lang="ts">
import { computed, toRef, TransitionGroup } from 'vue';
import { Icon } from '@iconify/vue';
import { useClipTags } from '@renderer/composables/clips/useClipTags';
import type { Clip } from '@renderer/types/clip';
import { useRouter } from 'vue-router';
import { useClipsStore } from '@renderer/stores/clips';
import BasePopover from '@renderer/components/Base/BasePopover.vue';

interface Props {
  clip: Clip;
  /**
   * Show the control rather than waiting for a hover.
   *
   * On a library card the trigger is deliberately quiet: forty cards each
   * showing a permanent "Manage tags" line would be forty pieces of furniture
   * nobody asked for, so it fades in with the rest of the card's controls.
   *
   * In the clip panel that reasoning inverts and the same styling becomes a
   * bug. There is one clip, its Tags card sits beside three others that each
   * carry a visible `+`, and the card has no `group` ancestor for
   * `group-hover` to fire from, so the control was at `opacity-0` permanently:
   * present in the DOM, clickable if you knew the pixel, invisible to a
   * person. Tagging was unreachable from the one screen that is about a single
   * clip, and the Smart Tags page told people to do it there.
   */
  prominent?: boolean;
}

interface Emits {
  (e: 'updated', clip: Clip): void;
}

const router = useRouter();
const clipsStore = useClipsStore();
const props = defineProps<Props>();
const emit = defineEmits<Emits>();

const {
  newTagName,
  availableTags,
  suggestedTags,
  toggleTag,
  addTag,
  applySuggestedTag,
  removeTag,
  getCategoryForTag,
} = useClipTags(toRef(() => props.clip), (updated) => emit('updated', updated));

/**
 * Two on a card, all of them in the panel.
 *
 * A card is one tile in a grid and has room for a couple before it starts
 * pushing its own metadata around. The panel is a column with space, and
 * hiding a clip's third tag behind a `+1` there is hiding it for no reason.
 */
const visibleTags = computed(() =>
  props.prominent ? (props.clip.tags ?? []) : (props.clip.tags?.slice(0, 2) ?? []),
);

/**
 * Show every clip carrying this tag.
 *
 * Tagging was only half a feature: you could put a tag on a clip and then had
 * no way to use it except by typing the word into search. The library already
 * filters by tag, so a chip just has to ask it to.
 */
function filterByTag(tag: string): void {
  clipsStore.setTags([tag]);
  if (router.currentRoute.value.name !== 'clips') void router.push('/');
}
const hiddenTagsCount = computed(() => Math.max(0, (props.clip.tags?.length || 0) - 2));
</script>

<template>
  <!--
    On a card this row has a fixed height and only its opacity moves.

    Both the chips and the "Manage tags" trigger used to arrive into flow on
    hover, so pointing at a clip made its tile taller and pushed the row of
    tiles below it down. That is `12-card-idle.png` against
    `13-card-hover-height-jump.png`, and the design contract calls it out by
    name: nothing in a card's box model may depend on `:hover`.

    In the clip panel (`prominent`) the same component is a real section with
    a heading above it, so there is nothing to reserve and nothing to reveal.
  -->
  <div
    :class="prominent ? '' : 'h-7 mt-1 opacity-0 group-hover:opacity-100 transition-opacity duration-150 overflow-hidden'"
  >
    <!-- Visible Tags -->
    <TransitionGroup
      v-if="clip.tags?.length"
      name="tag"
      tag="div"
      class="flex items-center gap-1 gap-x-2 flex-wrap"
      :class="prominent ? 'mt-2' : ''"
    >
      <!--
        A tag exists so you can click it later. These were plain text, so the
        only way to use one was to type it into search.
      -->
      <button
        v-for="tag in visibleTags"
        :key="tag"
        type="button"
        class="text-xs bg-card/10 px-1.5 py-0.5 rounded-sm tag-enter-active hover:bg-accent/15 hover:text-accent-ink transition-colors"
        :title="`Show every clip tagged #${tag}`"
        @click.stop="filterByTag(tag)"
      >
        #{{ tag }}
      </button>
      
      <BasePopover v-if="hiddenTagsCount > 0" key="more-tags" side="bottom" :side-offset="8">
        <template #trigger>
          <button class="text-xs text-muted-400 hover:text-foreground transform-transition">
            +{{ hiddenTagsCount }}
          </button>
        </template>
        <div class="flex flex-col gap-1 p-2">
          <button
            v-for="tag in clip.tags"
            :key="tag"
            type="button"
            class="text-xs text-left hover:text-accent-ink transition-colors"
            :title="`Show every clip tagged #${tag}`"
            @click.stop="filterByTag(tag)"
          >
            #{{ tag }}
          </button>
        </div>
      </BasePopover>
    </TransitionGroup>

    <!-- Manage Tags Popover -->
    <BasePopover side="bottom" :side-offset="8">
      <template #trigger>
        <button
          v-if="prominent"
          class="mt-2 inline-flex items-center gap-1.5 text-sm font-medium text-accent-ink hover:text-accent-ink transition-colors"
        >
          <Icon icon="material-symbols:add" class="text-lg" />
          {{ clip.tags?.length ? 'Add or remove tags' : 'Add a tag' }}
        </button>
        <button
          v-else
          type="button"
          class="text-xs text-muted-400 hover:text-accent-ink text-left transition-colors duration-150 outline-none focus-visible:focus-ring rounded-sm"
        >
          Manage tags
        </button>
      </template>
      
      <div class="flex flex-col gap-3 max-h-72 overflow-auto min-w-[280px]">
        <header class="flex items-center justify-between">
          <h3 class="text-sm font-semibold">Manage Tags</h3>
        </header>
        
        <!-- Suggested Tags -->
        <div v-if="suggestedTags.length > 0" class="space-y-2">
          <div class="flex items-center gap-2 text-xs text-muted-600">
            <Icon icon="material-symbols:auto-awesome" class="text-accent-ink" />
            <span class="font-medium">Suggested Tags</span>
          </div>
          <div class="flex flex-wrap gap-1.5">
            <button
              v-for="tag in suggestedTags"
              :key="tag"
              class="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-accent/10 border border-accent/30 hover:border-accent hover:bg-accent/20 transition-all text-xs font-medium group scale-on-hover"
              :title="`Category: ${getCategoryForTag(tag)}`"
              @click="applySuggestedTag(tag)"
            >
              <Icon icon="material-symbols:add" class="text-accent-ink size-4 shrink-0 block" />
              <span class="text-foreground">#{{ tag }}</span>
            </button>
          </div>
        </div>
        
        <!-- Add New Tag -->
        <div class="flex items-center gap-2">
          <input
            v-model="newTagName"
            class="flex-1 rounded-lg border border-border bg-card/5 px-3 h-9 outline-hidden focus:ring-2 focus:ring-accent/50 transition text-sm"
            placeholder="New tag name"
            @keyup.enter="addTag()"
          />
          <button 
            class="rounded-lg bg-accent hover:bg-accent-hover px-3 h-9 text-accent-fg text-sm font-medium transition"
            @click="addTag()"
          >
            Add
          </button>
        </div>

        <!-- Available Tags List -->
        <div class="border-t border-border pt-2">
          <div v-if="!availableTags.length" class="text-muted-400 text-sm py-4 text-center">
            No tags yet
          </div>
          
          <div v-else class="space-y-1.5">
            <div
              v-for="tag in availableTags"
              :key="tag"
              class="flex items-center gap-2"
            >
              <button
                class="flex-1 text-left rounded-lg border-2 border-border px-3 py-2.5 bg-card/5 hover:bg-card/10 transition-colors"
                :class="{ 'bg-accent/10 border-accent': clip.tags?.includes(tag) }"
                @click="toggleTag(tag)"
              >
                <span class="text-sm">#{{ tag }}</span>
                <span v-if="clip.tags?.includes(tag)" class="ml-2 text-xs text-accent-ink font-medium">✓</span>
              </button>
              
              <button
                class="p-2 rounded-lg border border-border bg-card/5 hover:bg-danger/20 hover:border-danger/50 transition-colors group"
                title="Delete tag"
                @click.stop="removeTag(tag)"
              >
                <Icon icon="material-symbols:delete" class="text-muted-400 group-hover:text-danger-ink transition-colors" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </BasePopover>
  </div>
</template>

