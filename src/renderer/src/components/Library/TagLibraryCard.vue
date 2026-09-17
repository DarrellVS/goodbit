<script setup lang="ts">
import { onMounted } from 'vue';
import { Icon } from '@iconify/vue';
import { useTagsStore } from '@renderer/stores/tags';
import { useTagManagement } from '@renderer/composables/library/useTagManagement';

/**
 * Every tag in the library, and the one way to get rid of one.
 *
 * **This control had no home for an afternoon and that is why it exists.**
 * Deleting a tag from every clip used to be a bin icon beside each tag inside
 * the header's Tags popover. 3.9 replaced that popover with a proper filter
 * dropdown in the library's filter row, which is a better filter and a worse
 * place for a destructive action: a `BaseComboBox` row cannot hold a button,
 * and a list you are choosing from is not a list you should be deleting from.
 *
 * So it moved here, to the app's one screen about tags. Somebody who wants to
 * tidy up their tags comes looking for tags, and the alternative was Settings,
 * where nobody would think to look for them.
 *
 * Filtering by tag is a different action and lives in the library, which is
 * the separation the popover never made: one control did both, so choosing
 * what to look at and destroying it were a pixel apart.
 */
const tagsStore = useTagsStore();
const { removeTag } = useTagManagement();

onMounted(() => {
  // The library loads these too, but this page is reachable directly from the
  // sidebar, so it cannot assume somebody has been there first.
  if (tagsStore.items.length === 0) void tagsStore.fetchTags();
});
</script>

<template>
  <!--
    A section, not a card with a tinted tile on it.

    The tile was a 40px block of accent wash holding a label glyph beside a
    heading that says "Tags", which is the glyph again in words.
  -->
  <section class="pb-6 border-b border-border">
    <div class="mb-3">
      <div class="min-w-0">
        <h2 class="text-sm font-medium text-muted-600">Tags in your library</h2>
        <p class="text-sm text-muted-500 mt-1 max-w-[70ch]">
          Every tag on a clip, however it got there. Removing one takes it off every clip that
          has it. The clips themselves are not touched.
        </p>
      </div>
    </div>

    <p v-if="tagsStore.items.length === 0" class="text-sm text-muted-500">
      No tags yet. Open a clip, press Add a tag, and the ones you make turn up here.
    </p>

    <div v-else class="flex flex-wrap gap-2">
      <!--
        A chip with its own remove, rather than a row with a bin at the end.
        A tag is a short word, so a list of rows is mostly empty space, and the
        remove belongs on the thing it removes.
      -->
      <span
        v-for="tag in tagsStore.items"
        :key="tag.id"
        class="group inline-flex items-center gap-1.5 rounded-full border border-border bg-muted-50 pl-3 pr-1.5 py-1 text-sm text-foreground"
      >
        {{ tag.name }}
        <button
          class="rounded-full p-0.5 text-muted-400 transition-colors hover:bg-danger/10 hover:text-danger"
          :title="`Remove ${tag.name} from every clip`"
          :aria-label="`Remove ${tag.name} from every clip`"
          @click="removeTag(tag.name)"
        >
          <Icon icon="material-symbols:close" class="text-base" />
        </button>
      </span>
    </div>
  </section>
</template>
