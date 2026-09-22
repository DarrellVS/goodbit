<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { Icon } from '@iconify/vue';
import { BUTTON, ICON_BOX, ICON_BOX_LG, SECTION_HEADER } from '@renderer/components/Base/geometry';
import BaseSpinner from '@renderer/components/Base/BaseSpinner.vue';
import PublisherStatCards from '@renderer/components/Publish/PublisherStatCards.vue';
import PublisherClipRow from '@renderer/components/Publish/PublisherClipRow.vue';
import {
  CLEANUP_WINDOW_DAYS,
  usePublisherStats,
} from '@renderer/composables/clips/usePublisherStats';
import { useConfirm } from '@renderer/composables/ui/useConfirm';
import { useFormat } from '@renderer/composables/ui/useFormat';
import { useToastStore } from '@renderer/stores/toast';
import { batchPublish } from '@renderer/services/clips';
import { pluralize } from '@renderer/utils/pluralize';

/**
 * What is on the publisher, and what nobody has watched.
 *
 * **Unpublishing is not deleting**, which is the reason this is its own screen
 * rather than a section of Storage Saver. Taking a clip off the publisher
 * frees the publisher's disk and kills the public link; the recording on this
 * machine, its tags, notes, stars and marks are untouched, and publishing it
 * again puts it back. That is a mild, reversible act and it reads as one here.
 *
 * **There is deliberately no local delete on this screen.** Two different
 * consequences behind one button on a page about disk space is how somebody
 * loses a clip they only meant to unpublish.
 */
const saver = usePublisherStats();
const { confirm } = useConfirm();
const { formatBytes } = useFormat();
const toast = useToastStore();

const selected = ref<Set<number>>(new Set());
const working = ref(false);

onMounted(() => void saver.load());

function toggle(clipId: number): void {
  const next = new Set(selected.value);
  if (next.has(clipId)) next.delete(clipId);
  else next.add(clipId);
  selected.value = next;
}

function selectAllUnwatched(): void {
  selected.value = new Set(saver.neverWatched.value.map((clip) => clip.id));
}

const selectedClips = computed(() =>
  saver.clips.value.filter((clip) => selected.value.has(clip.id)),
);

const selectedBytes = computed(() =>
  selectedClips.value.reduce((sum, clip) => sum + (clip.sizeBytes || 0), 0),
);

/**
 * Take them off the publisher.
 *
 * Through the existing batch unpublish, which is the same path the library's
 * own menu uses. The question says what happens, and the important half is
 * what does not: the recordings stay.
 */
function unpublishSelected(): void {
  const clips = selectedClips.value;
  if (!clips.length || working.value) return;

  confirm(
    `${clips.length} ${pluralize(clips.length, 'clip')} will be taken off the publisher, ` +
      `freeing ${formatBytes(selectedBytes.value)} there. Any link you have already shared ` +
      'stops working. The recordings on this computer are not touched, and neither are their ' +
      'names, tags, notes or marks: publishing them again puts them back.',
    async () => {
      working.value = true;
      try {
        await batchPublish(
          clips.map((clip) => clip.id),
          false,
        );
        toast.success(`${clips.length} taken off the publisher`);
        selected.value = new Set();
        await saver.load();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'Please try again', 'Unpublish failed');
      } finally {
        working.value = false;
      }
    },
    `Unpublish ${clips.length} ${pluralize(clips.length, 'clip')}?`,
    { confirmLabel: 'Unpublish' },
  );
}
</script>

<template>
  <div class="space-y-8 pb-16">
    <!--
      No publisher is not an error. It is the ordinary state for anybody who
      has never set one up, and this screen is the only place that can say what
      one is for.
    -->
    <div
      v-if="!saver.configured.value"
      class="rounded-lg border border-border/60 px-4 py-8 text-center"
    >
      <Icon
        icon="material-symbols:cloud-off-outline"
        :class="[ICON_BOX_LG, 'mx-auto mb-2 text-muted-400']"
      />
      <p class="text-sm text-foreground">No publisher is set up</p>
      <p class="mx-auto mt-1 max-w-[52ch] text-sm text-muted-500">
        A publisher is a small server of your own that holds a copy of a clip behind a link you can
        send. Settings, Connections has the address.
      </p>
    </div>

    <template v-else>
      <div v-if="saver.loading.value && !saver.stats.value" class="flex justify-center py-10">
        <BaseSpinner />
      </div>

      <!--
        The one screen here that reads a remote service, so it can be
        unreachable in a way no other screen can. It says so rather than
        spinning: a spinner is a promise that something is coming.
      -->
      <div
        v-else-if="saver.error.value"
        class="rounded-lg border border-border/60 px-4 py-8 text-center"
      >
        <Icon
          icon="material-symbols:cloud-off-outline"
          :class="[ICON_BOX_LG, 'mx-auto mb-2 text-warning']"
        />
        <p class="text-sm text-foreground">Could not reach the publisher</p>
        <p class="mx-auto mt-1 max-w-[52ch] text-sm text-muted-500">{{ saver.error.value }}</p>
        <button type="button" :class="[BUTTON, 'mt-4']" @click="saver.load()">Try again</button>
      </div>

      <template v-else-if="saver.stats.value">
        <PublisherStatCards
          :clips="saver.stats.value.totals.clips"
          :bytes="saver.stats.value.totals.bytes"
          :views="saver.stats.value.totals.views"
        />

        <section>
          <div :class="SECTION_HEADER">
            <h2 class="text-base font-medium text-foreground">Nobody has opened these</h2>
            <span class="text-sm text-muted-500">
              Published more than {{ CLEANUP_WINDOW_DAYS }} days ago, never opened by anyone
            </span>
          </div>

          <!--
            The warm-up clause, and it is the difference between a useful list
            and one that offers to unpublish everything. Nothing was counted
            before the counter shipped, so on day one every clip reads zero.
          -->
          <div
            v-if="!saver.warmedUp.value"
            class="rounded-lg border border-border/60 px-4 py-8 text-center"
          >
            <Icon
              icon="material-symbols:hourglass-top"
              :class="[ICON_BOX_LG, 'mx-auto mb-2 text-muted-400']"
            />
            <p class="text-sm text-foreground">Still watching</p>
            <p class="mx-auto mt-1 max-w-[52ch] text-sm text-muted-500">
              Your publisher only started counting recently, so "nobody opened this" would be true
              of everything. Suggestions appear in about {{ saver.daysUntilWarm.value }}
              {{ pluralize(saver.daysUntilWarm.value, 'day') }}.
            </p>
          </div>

          <div
            v-else-if="!saver.neverWatched.value.length"
            class="rounded-lg border border-border/60 px-4 py-8 text-center"
          >
            <Icon
              icon="material-symbols:check-circle-outline"
              :class="[ICON_BOX_LG, 'mx-auto mb-2 text-success']"
            />
            <p class="text-sm text-foreground">Everything you published has been opened</p>
          </div>

          <template v-else>
            <div :class="SECTION_HEADER">
              <span class="font-mono text-xs tabular-nums text-muted-400">
                {{ saver.neverWatched.value.length }} ·
                {{ formatBytes(saver.reclaimable.value) }} on the server
              </span>
              <button type="button" :class="[BUTTON, 'ml-auto']" @click="selectAllUnwatched">
                Select all
              </button>
            </div>

            <div class="space-y-0.5">
              <PublisherClipRow
                v-for="clip in saver.neverWatched.value"
                :key="clip.id"
                :clip="clip"
                :selected="selected.has(clip.id)"
                @toggle="toggle(clip.id)"
              />
            </div>
          </template>
        </section>

        <section v-if="saver.mostWatched.value.length">
          <div :class="SECTION_HEADER">
            <h2 class="text-base font-medium text-foreground">Most opened</h2>
            <span class="text-sm text-muted-500">The links people actually watched</span>
          </div>

          <div class="space-y-0.5">
            <PublisherClipRow
              v-for="clip in saver.mostWatched.value.slice(0, 10)"
              :key="clip.id"
              :clip="clip"
              :selected="selected.has(clip.id)"
              @toggle="toggle(clip.id)"
            />
          </div>
        </section>

        <!--
          Written here beside the sentence that explains it, and not in danger
          colours: unpublishing is mild and reversible, and dressing it as a
          deletion would teach somebody to hesitate over the wrong thing.
        -->
        <div
          v-if="selected.size"
          class="sticky bottom-4 flex items-center gap-3 rounded-lg border border-line-strong bg-card px-4 py-3 shadow-pop"
        >
          <span class="text-sm text-foreground">
            {{ selected.size }} selected · {{ formatBytes(selectedBytes) }} on the server
          </span>
          <button
            type="button"
            :class="[BUTTON, 'ml-auto']"
            :disabled="working"
            @click="unpublishSelected"
          >
            <Icon icon="material-symbols:cloud-off-outline" :class="ICON_BOX" />
            Take off the publisher
          </button>
        </div>
      </template>
    </template>
  </div>
</template>
