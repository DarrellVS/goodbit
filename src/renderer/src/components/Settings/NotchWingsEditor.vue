<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue';
import { Icon } from '@iconify/vue';
import { AnimatePresence, motion } from 'motion-v';
import { islandHeight, type NotchTileData, type NotchTiles } from '@shared/notch';
import {
  TILES,
  TILE_IDS,
  WING_CELL,
  WING_INSET,
  WING_WIDTH,
  canPlace,
  firstFit,
  rotated,
  tileSize,
  type Placement,
  type TileId,
  type TileKind,
  type TileSize,
  type WingLayout,
  type WingSide,
} from '@shared/notchWings';
import NotchTile from '@renderer/components/Notch/NotchTile.vue';
import { ICON_BOX } from '@renderer/components/Base/geometry';

/**
 * The layout of the notch's wings, arranged by hand.
 *
 * The tiles are the real ones with what they say right now, not labels, so
 * what is arranged here is what the notch shows. Drag one from the tray into a
 * wing, between wings, or anywhere outside both to take it off. An oblong tile
 * can be stood up or laid down where it is. Every rule about what fits comes
 * from `notchWings.ts`, which is what main draws from, so this cannot arrange
 * something the notch then refuses.
 *
 * Pointer events rather than HTML drag and drop: the web drag shows the
 * browser's own ghost and cannot say, while dragging, where the tile would
 * land.
 */
const props = defineProps<{ layout: WingLayout; tiles: NotchTiles | null }>();
const emit = defineEmits<{ 'update:layout': [layout: WingLayout] }>();

const SIDES: WingSide[] = ['left', 'right'];
/** Drawn at the height the island has most often, which is without the drive warning. */
const PANEL_HEIGHT = islandHeight(null) - WING_INSET;
const ROW = (PANEL_HEIGHT - WING_CELL.pad * 2 - WING_CELL.gap) / 2;
const PITCH = { x: WING_CELL.width + WING_CELL.gap, y: ROW + WING_CELL.gap };

const SPRING = { type: 'spring', visualDuration: 0.34, bounce: 0.3 } as const;

const GROUPS: Array<{ kind: TileKind; title: string; note: string }> = [
  { kind: 'large', title: 'Large', note: 'All four cells' },
  { kind: 'oblong', title: 'Wide or tall', note: 'Two cells, either way round' },
  { kind: 'small', title: 'Small', note: 'One cell' },
];

const tray = computed(() =>
  GROUPS.map((group) => ({ ...group, ids: TILE_IDS.filter((id) => TILES[id].kind === group.kind) })),
);

function data(id: TileId): NotchTileData | null {
  return (props.tiles?.[id] as NotchTileData | undefined) ?? null;
}

/** Why a tile has nothing to show, in the words of what would fix it. */
function missing(id: TileId): string {
  if (!props.tiles) return 'Reading';
  const needs = TILES[id].needs;
  if (needs === 'publisher') return 'Needs a publisher';
  if (needs === 'steam') return 'Needs a Steam game';
  return 'Nothing to show yet';
}

function where(id: TileId): string {
  return SIDES.filter((side) => props.layout[side].some((p) => p.id === id))
    .map((side) => (side === 'left' ? 'left' : 'right'))
    .join(' and ');
}

function px(size: { w: number; h: number }): { width: string; height: string } {
  return {
    width: `${size.w * WING_CELL.width + (size.w - 1) * WING_CELL.gap}px`,
    height: `${size.h * ROW + (size.h - 1) * WING_CELL.gap}px`,
  };
}

function area(placement: Placement): string {
  const { w, h } = tileSize(placement);
  return `${placement.y + 1} / ${placement.x + 1} / span ${h} / span ${w}`;
}

function commit(next: WingLayout): void {
  emit('update:layout', next);
}

function copy(): WingLayout {
  return { left: props.layout.left.map((p) => ({ ...p })), right: props.layout.right.map((p) => ({ ...p })) };
}

function remove(side: WingSide, index: number): void {
  const next = copy();
  next[side].splice(index, 1);
  commit(next);
}

function turn(side: WingSide, index: number): void {
  const placed = rotated(props.layout[side], index);
  if (!placed) return;
  const next = copy();
  next[side][index] = placed;
  commit(next);
}

function canTurn(side: WingSide, index: number): boolean {
  return rotated(props.layout[side], index) !== null;
}

/** From the keyboard: the first wing with room, left first. */
function addSomewhere(id: TileId): void {
  for (const side of SIDES) {
    const placed = firstFit(props.layout[side], id);
    if (placed) {
      const next = copy();
      next[side].push(placed);
      commit(next);
      return;
    }
  }
}

/* ---- dragging ---- */

interface Drag {
  id: TileId;
  tall: boolean;
  from: { side: WingSide; index: number } | null;
  offset: { x: number; y: number };
  size: TileSize;
  pointer: { x: number; y: number };
}

const drag = ref<Drag | null>(null);
const grids: Record<WingSide, HTMLElement | null> = { left: null, right: null };

function setGrid(side: WingSide, el: unknown): void {
  grids[side] = (el as HTMLElement | null) ?? null;
}

interface Target {
  side: WingSide;
  x: number;
  y: number;
  ok: boolean;
}

const target = computed<Target | null>(() => {
  const d = drag.value;
  if (!d) return null;
  const left = d.pointer.x - d.offset.x;
  const top = d.pointer.y - d.offset.y;
  for (const side of SIDES) {
    const el = grids[side];
    if (!el) continue;
    const r = el.getBoundingClientRect();
    const slack = 24;
    if (d.pointer.x < r.left - slack || d.pointer.x > r.right + slack) continue;
    if (d.pointer.y < r.top - slack || d.pointer.y > r.bottom + slack) continue;
    const x = Math.max(0, Math.min(2 - d.size.w, Math.round((left - r.left - WING_CELL.pad) / PITCH.x)));
    const y = Math.max(0, Math.min(2 - d.size.h, Math.round((top - r.top - WING_CELL.pad) / PITCH.y)));
    const skip = d.from?.side === side ? d.from.index : -1;
    const candidate: Placement = { id: d.id, x, y, ...(d.tall ? { tall: true } : {}) };
    return { side, x, y, ok: canPlace(props.layout[side], candidate, skip) };
  }
  return null;
});

/** Let go outside both wings with a placed tile, and it comes off. */
const discarding = computed(() => !!drag.value?.from && !target.value);

function start(event: PointerEvent, id: TileId, tall: boolean, from: Drag['from']): void {
  if (event.button !== 0) return;
  if ((event.target as HTMLElement).closest('[data-no-drag]')) return;
  event.preventDefault();
  const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
  drag.value = {
    id,
    tall,
    from,
    offset: { x: event.clientX - rect.left, y: event.clientY - rect.top },
    size: tileSize({ id, tall }),
    pointer: { x: event.clientX, y: event.clientY },
  };
  window.addEventListener('pointermove', move);
  window.addEventListener('pointerup', end);
  window.addEventListener('pointercancel', cancel);
  window.addEventListener('keydown', escape, true);
}

function move(event: PointerEvent): void {
  if (drag.value) drag.value = { ...drag.value, pointer: { x: event.clientX, y: event.clientY } };
}

function stop(): void {
  drag.value = null;
  window.removeEventListener('pointermove', move);
  window.removeEventListener('pointerup', end);
  window.removeEventListener('pointercancel', cancel);
  window.removeEventListener('keydown', escape, true);
}

function end(): void {
  const d = drag.value;
  const t = target.value;
  if (!d) return stop();
  if (t?.ok) {
    const next = copy();
    if (d.from) next[d.from.side].splice(d.from.index, 1);
    next[t.side].push({ id: d.id, x: t.x, y: t.y, ...(d.tall ? { tall: true } : {}) });
    commit(next);
  } else if (!t && d.from) {
    remove(d.from.side, d.from.index);
  }
  stop();
}

function cancel(): void {
  stop();
}

function escape(event: KeyboardEvent): void {
  if (event.key !== 'Escape') return;
  event.stopPropagation();
  stop();
}

onBeforeUnmount(stop);

function lifted(side: WingSide, index: number): boolean {
  return drag.value?.from?.side === side && drag.value.from.index === index;
}

function freeCells(side: WingSide): number {
  return 4 - props.layout[side].reduce((sum, p) => sum + tileSize(p).w * tileSize(p).h, 0);
}
</script>

<template>
  <div class="flex flex-col gap-4 text-foreground" :class="drag ? 'cursor-grabbing select-none' : ''">
    <!-- The two wings, at the size they are drawn, on a stand-in for a desktop. -->
    <div class="flex flex-wrap items-start justify-center gap-x-8 gap-y-5 rounded-xl bg-muted-100 px-4 py-6">
      <div v-for="side in SIDES" :key="side" class="flex flex-col items-center gap-2">
        <span class="text-xs font-medium text-muted-600">{{ side === 'left' ? 'Left of the notch' : 'Right of the notch' }}</span>
        <div
          :ref="(el) => setGrid(side, el)"
          class="dark relative grid rounded-[18px] bg-notch shadow-pop"
          :style="{
            width: `${WING_WIDTH}px`,
            height: `${PANEL_HEIGHT}px`,
            padding: `${WING_CELL.pad}px`,
            gap: `${WING_CELL.gap}px`,
            gridTemplateColumns: `repeat(2, ${WING_CELL.width}px)`,
            gridTemplateRows: `repeat(2, ${ROW}px)`,
          }"
          :data-wing="side"
        >
          <!-- The empty cells, so there is something to aim at. -->
          <span
            v-for="cell in 4"
            :key="`slot-${cell}`"
            class="rounded-[11px] border border-dashed border-muted-200"
            :style="{ gridArea: `${Math.ceil(cell / 2)} / ${((cell - 1) % 2) + 1}` }"
          />

          <motion.div
            v-for="(placement, index) in layout[side]"
            :key="`${placement.id}`"
            layout
            class="group/tile relative z-[1] min-h-0 min-w-0 cursor-grab touch-none"
            :style="{ gridArea: area(placement) }"
            :initial="{ opacity: 0, scale: 0.8 }"
            :animate="{ opacity: lifted(side, index) ? 0.25 : 1, scale: 1 }"
            :transition="SPRING"
            :data-tile="placement.id"
            @pointerdown="start($event, placement.id, !!placement.tall, { side, index })"
          >
            <NotchTile v-if="data(placement.id)" :data="data(placement.id)!" :size="tileSize(placement)" inert />
            <div v-else class="flex size-full flex-col justify-between rounded-[11px] bg-muted-50 p-2 text-[11px]">
              <span class="font-medium text-muted-800">{{ TILES[placement.id].name }}</span>
              <span class="text-muted-400">{{ missing(placement.id) }}</span>
            </div>

            <!-- Turn and remove, over the tile's corner, only while it is under the pointer. -->
            <div
              class="absolute right-1 top-1 flex gap-1 opacity-0 transition-opacity duration-150 group-hover/tile:opacity-100 group-focus-within/tile:opacity-100"
              data-no-drag
            >
              <button
                v-if="TILES[placement.id].kind === 'oblong'"
                type="button"
                class="flex size-6 items-center justify-center rounded-md bg-scrim-strong text-on-video outline-none hover:bg-video-bed focus-visible:focus-ring disabled:opacity-40"
                :disabled="!canTurn(side, index)"
                :title="placement.tall ? 'Lay it down' : 'Stand it up'"
                :aria-label="`${placement.tall ? 'Lay down' : 'Stand up'} ${TILES[placement.id].name}`"
                @click="turn(side, index)"
              >
                <motion.span :animate="{ rotate: placement.tall ? 90 : 0 }" :transition="SPRING" class="block">
                  <Icon icon="material-symbols:crop-landscape-outline" :class="ICON_BOX" />
                </motion.span>
              </button>
              <button
                type="button"
                class="flex size-6 items-center justify-center rounded-md bg-scrim-strong text-on-video outline-none hover:bg-video-bed focus-visible:focus-ring"
                title="Take it off"
                :aria-label="`Take ${TILES[placement.id].name} off`"
                @click="remove(side, index)"
              >
                <Icon icon="material-symbols:close" :class="ICON_BOX" />
              </button>
            </div>
          </motion.div>

          <!-- Where the tile being dragged would land. -->
          <motion.span
            v-if="drag && target && target.side === side"
            class="pointer-events-none z-[2] rounded-[11px] border-2"
            :class="target.ok ? 'border-accent bg-accent/20' : 'border-danger bg-danger/15'"
            :style="{ gridArea: `${target.y + 1} / ${target.x + 1} / span ${drag.size.h} / span ${drag.size.w}` }"
            layout
            :transition="{ type: 'spring', visualDuration: 0.18, bounce: 0.2 }"
          />
        </div>
        <span class="font-mono text-[11px] tabular-nums text-muted-400">{{ freeCells(side) }} of 4 cells free</span>
      </div>
    </div>

    <!-- The tray, one row per shape. -->
    <div
      class="flex flex-col gap-4 rounded-xl border bg-card p-4 transition-colors duration-150"
      :class="discarding ? 'border-danger' : 'border-border'"
    >
      <p class="text-sm text-muted-500">
        <template v-if="discarding">Let go to take it off.</template>
        <template v-else>Drag a tile into a wing. Drag one out of a wing to take it off.</template>
      </p>
      <section v-for="group in tray" :key="group.kind" class="flex flex-col gap-2">
        <h4 class="flex items-baseline gap-2 text-xs font-medium text-muted-600">
          {{ group.title }}<span class="font-normal text-muted-400">{{ group.note }}</span>
        </h4>
        <div class="flex flex-wrap items-start gap-3">
          <div v-for="id in group.ids" :key="id" class="flex flex-col gap-1.5" :style="{ width: px(tileSize({ id })).width }">
            <motion.div
              class="dark relative cursor-grab touch-none rounded-[14px] bg-notch p-[3px] outline-none focus-visible:focus-ring"
              :style="{ height: `${Number.parseFloat(px(tileSize({ id })).height) + 6}px`, width: `calc(100% + 6px)`, marginLeft: '-3px' }"
              :while-hover="{ y: -2 }"
              :transition="SPRING"
              tabindex="0"
              role="button"
              :aria-label="`Add ${TILES[id].name}`"
              :data-tray-tile="id"
              @pointerdown="start($event, id, false, null)"
              @keydown.enter.prevent="addSomewhere(id)"
            >
              <NotchTile v-if="data(id)" :data="data(id)!" :size="tileSize({ id })" inert />
              <div v-else class="flex size-full flex-col justify-between rounded-[11px] bg-muted-50 p-2 text-[11px]">
                <span class="font-medium text-muted-800">{{ TILES[id].name }}</span>
                <span class="text-muted-400">{{ missing(id) }}</span>
              </div>
            </motion.div>
            <span class="truncate text-xs text-muted-700" :title="TILES[id].description">
              {{ TILES[id].name }}
              <span v-if="where(id)" class="text-muted-400">· in {{ where(id) }}</span>
            </span>
          </div>
        </div>
      </section>
    </div>

    <!-- The tile following the pointer. -->
    <Teleport to="body">
      <AnimatePresence>
        <motion.div
          v-if="drag"
          class="dark pointer-events-none fixed z-[80] rounded-[14px] bg-notch p-[3px] shadow-pop"
          :style="{
            left: `${drag.pointer.x - drag.offset.x - 3}px`,
            top: `${drag.pointer.y - drag.offset.y - 3}px`,
            width: `${Number.parseFloat(px(drag.size).width) + 6}px`,
            height: `${Number.parseFloat(px(drag.size).height) + 6}px`,
          }"
          :initial="{ scale: 1, rotate: 0 }"
          :animate="{ scale: 1.04, rotate: discarding ? 4 : -2, opacity: discarding ? 0.5 : 1 }"
          :exit="{ opacity: 0, scale: 0.9, transition: { duration: 0.12 } }"
          :transition="SPRING"
        >
          <NotchTile v-if="data(drag.id)" :data="data(drag.id)!" :size="drag.size" inert />
          <div v-else class="flex size-full flex-col justify-between rounded-[11px] bg-muted-50 p-2 text-[11px]">
            <span class="font-medium text-muted-800">{{ TILES[drag.id].name }}</span>
            <span class="text-muted-400">{{ missing(drag.id) }}</span>
          </div>
        </motion.div>
      </AnimatePresence>
    </Teleport>
  </div>
</template>
