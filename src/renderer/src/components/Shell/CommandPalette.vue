<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue';
import { Icon } from '@iconify/vue';
import { DialogContent, DialogOverlay, DialogPortal, DialogRoot, DialogTitle } from 'reka-ui';
import { filterCommands, useCommands, type Command } from '@renderer/composables/ui/useCommands';

interface Props {
  open: boolean;
}

interface Emits {
  (e: 'update:open', value: boolean): void;
}

const props = defineProps<Props>();
const emit = defineEmits<Emits>();

const commands = useCommands();
const query = ref('');
const activeIndex = ref(0);
const input = ref<HTMLInputElement | null>(null);
const listRef = ref<HTMLElement | null>(null);

/** Long lists are trimmed: past about fifty rows nobody is reading, they are typing. */
const results = computed(() => filterCommands(commands.value, query.value).slice(0, 50));

/** Rows carry their group as a heading only when it changes. */
const rows = computed(() => {
  let lastGroup: string | null = null;
  return results.value.map((command, index) => {
    const heading = command.group !== lastGroup ? command.group : null;
    lastGroup = command.group;
    return { command, index, heading };
  });
});

watch(query, () => {
  activeIndex.value = 0;
});

watch(
  () => props.open,
  async (isOpen) => {
    if (!isOpen) return;
    query.value = '';
    activeIndex.value = 0;
    await nextTick();
    input.value?.focus();
  }
);

function move(delta: number): void {
  const count = results.value.length;
  if (count === 0) return;
  // Wraps, so holding a direction cycles rather than sticking at an end.
  activeIndex.value = (activeIndex.value + delta + count) % count;
  void scrollActiveIntoView();
}

async function scrollActiveIntoView(): Promise<void> {
  await nextTick();
  const list = listRef.value;
  const active = list?.querySelector<HTMLElement>('[data-active="true"]');
  if (!list || !active) return;

  // Scroll this list and nothing else. `scrollIntoView` walks every scrollable
  // ancestor, so pressing an arrow key scrolled the library sitting behind the
  // dialog too.
  const listBox = list.getBoundingClientRect();
  const activeBox = active.getBoundingClientRect();
  // Keep a group heading visible when landing on the first row under it.
  const headroom = 28;

  if (activeBox.top - headroom < listBox.top) {
    list.scrollTop -= listBox.top - activeBox.top + headroom;
  } else if (activeBox.bottom > listBox.bottom) {
    list.scrollTop += activeBox.bottom - listBox.bottom;
  }
}

/**
 * Whether the pointer has genuinely moved, rather than the list having scrolled
 * underneath it.
 *
 * A browser fires `mousemove` at the same coordinates when content scrolls
 * under a stationary pointer. Each row used that to claim the selection, so a
 * keyboard press moved the highlight one row, the list scrolled, and the row
 * now under the cursor stole it straight back. Every second item was
 * unreachable.
 */
let lastPointer = { x: -1, y: -1 };

function pointerPicked(index: number, event: MouseEvent): void {
  if (event.clientX === lastPointer.x && event.clientY === lastPointer.y) return;
  lastPointer = { x: event.clientX, y: event.clientY };
  activeIndex.value = index;
}

async function run(command: Command): Promise<void> {
  emit('update:open', false);
  await command.run();
}

function runActive(): void {
  const command = results.value[activeIndex.value];
  if (command) void run(command);
}
</script>

<template>
  <DialogRoot :open="open" @update:open="emit('update:open', $event)">
    <DialogPortal>
      <DialogOverlay class="fixed inset-0 bg-scrim z-50 backdrop-blur-sm modal-overlay-animate" />
      <DialogContent
        class="fixed top-[15%] left-1/2 -translate-x-1/2 z-50 bg-card rounded-xl shadow-2xl border border-border w-[92vw] max-w-xl flex flex-col outline-hidden overflow-hidden panel-drop-animate"
      >
        <DialogTitle class="sr-only">Command palette</DialogTitle>

        <div class="flex items-center gap-3 px-4 border-b border-border">
          <Icon icon="material-symbols:search" class="text-xl text-muted-400 shrink-0" />
          <input
            ref="input"
            v-model="query"
            type="text"
            placeholder="Jump to a game, a collection, a page…"
            class="flex-1 py-3.5 text-sm bg-transparent text-foreground outline-hidden placeholder:text-muted-400"
            @keydown.down.prevent="move(1)"
            @keydown.up.prevent="move(-1)"
            @keydown.enter.prevent="runActive"
          />
          <kbd class="text-[10px] font-mono text-muted-400 border border-border rounded-sm px-1.5 py-0.5">
            esc
          </kbd>
        </div>

        <div ref="listRef" class="max-h-[50vh] overflow-y-auto py-1.5">
          <p v-if="results.length === 0" class="px-4 py-6 text-sm text-muted-500 text-center">
            Nothing matches “{{ query }}”
          </p>

          <template v-for="row in rows" :key="row.command.id">
            <p
              v-if="row.heading"
              class="px-4 pt-2.5 pb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-400"
            >
              {{ row.heading }}
            </p>

            <button
              type="button"
              class="w-full flex items-center gap-3 px-4 py-2 text-left text-sm transition-colors"
              :class="row.index === activeIndex ? 'bg-accent/8 text-accent-ink' : 'text-muted-700 hover:bg-muted-50'"
              :data-active="row.index === activeIndex"
              @click="run(row.command)"
              @mousemove="pointerPicked(row.index, $event)"
            >
              <Icon
                :icon="row.command.icon ?? 'material-symbols:chevron-right'"
                class="text-lg shrink-0"
                :class="row.index === activeIndex ? 'text-muted-500' : 'text-muted-400'"
              />
              <span class="truncate">{{ row.command.label }}</span>
            </button>
          </template>
        </div>
      </DialogContent>
    </DialogPortal>
  </DialogRoot>
</template>
