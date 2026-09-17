<script setup lang="ts">
import { timestampTargetSeconds } from '@renderer/utils/timestampParser';

/**
 * Rendered markdown, wherever a note is read: the pane beside the textarea
 * while one is being written, and the note itself when nobody is editing it.
 */
interface Props {
  html: string;
}

interface Emits {
  (e: 'timestamp-click', seconds: number): void;
}

defineProps<Props>();
const emit = defineEmits<Emits>();

/**
 * One handler on the container, not one per chip.
 *
 * This used to walk `querySelectorAll('.timestamp-link')` and add a listener to
 * each, on mount and again on every change to `html`, and it never removed
 * any. A node that survived a re-render therefore collected a listener per
 * keystroke, and one press seeked as many times as the note had been typed
 * into. Delegation cannot double up, and it covers chips that appear later for
 * free, which is the whole reason a rendered note does not have to be walked
 * after every edit.
 */
function activate(event: MouseEvent | KeyboardEvent): void {
  const seconds = timestampTargetSeconds(event.target);
  if (seconds === null) return;

  event.preventDefault();
  // A rendered note sits inside something that hands back the textarea when
  // it is clicked, and pressing a chip is not asking to edit.
  event.stopPropagation();

  emit('timestamp-click', seconds);
}

function onKeydown(event: KeyboardEvent): void {
  if (event.key !== 'Enter' && event.key !== ' ') return;
  activate(event);
}
</script>

<template>
  <div
    class="markdown-preview min-h-full p-4 prose prose-sm max-w-none overflow-auto"
    v-html="html"
    @click="activate"
    @keydown="onKeydown"
  />
</template>

<style scoped>
/*
 * Tailwind 4 compiles every `<style>` block on its own, and a scoped block in
 * an SFC is a separate stylesheet that has never seen the theme. So `@apply`
 * below cannot resolve `text-muted-800` or any other token utility without
 * being pointed back at the sheet that defines them, and the build stops with
 * "Cannot apply unknown utility class".
 *
 * `@reference` reads that file for its theme and utilities and emits nothing,
 * so this costs no bytes in the output. Under Tailwind 3 the whole thing was
 * one compilation and this was unnecessary.
 */
@reference "../../styles.css";

/*
 * `.markdown-preview :deep(p)`, never `:deep(.markdown-preview p)`.
 *
 * They read the same and only one of them works. A bare `:deep(.x)` compiles
 * to `[data-v-hash] .x`, so it asks for a `.markdown-preview` *inside* the
 * scoped root; this element is the root and carries that class itself, so every
 * rule below was addressing a descendant that does not exist. The whole of this
 * block, including the chip, has never rendered. The form used here compiles to
 * `.markdown-preview[data-v-hash] p`, which is the root and its v-html
 * children.
 */
.markdown-preview {
  @apply text-muted-800;
}

.markdown-preview :deep(h1) {
  @apply text-2xl font-bold mt-6 mb-4 text-foreground;
}

.markdown-preview :deep(h2) {
  @apply text-xl font-bold mt-5 mb-3 text-foreground;
}

.markdown-preview :deep(h3) {
  @apply text-lg font-bold mt-4 mb-2 text-foreground;
}

.markdown-preview :deep(p) {
  @apply mb-3 leading-relaxed;
}

.markdown-preview :deep(p:last-child) {
  @apply mb-0;
}

.markdown-preview :deep(ul) {
  @apply list-disc list-inside mb-3 space-y-1;
}

.markdown-preview :deep(ol) {
  @apply list-decimal list-inside mb-3 space-y-1;
}

.markdown-preview :deep(li) {
  @apply mb-1;
}

.markdown-preview :deep(a) {
  @apply text-orange-500 hover:text-orange-600 underline;
}

.markdown-preview :deep(code) {
  @apply bg-muted-100 px-1.5 py-0.5 rounded text-sm font-mono text-orange-600;
}

.markdown-preview :deep(pre) {
  @apply bg-muted-100 text-muted-800 p-4 rounded-lg mb-3 overflow-x-auto;
}

.markdown-preview :deep(pre code) {
  @apply bg-transparent p-0 text-muted-800;
}

.markdown-preview :deep(blockquote) {
  @apply border-l-4 border-orange-400 pl-4 italic my-3 text-muted-600;
}

.markdown-preview :deep(strong) {
  @apply font-bold text-foreground;
}

.markdown-preview :deep(em) {
  @apply italic;
}

/*
 * The chip. It is an anchor with no `href`, so it has to say it is pressable
 * rather than rely on a link's own cursor and focus ring.
 */
.markdown-preview :deep(.timestamp-link) {
  @apply inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-orange-500/20 text-orange-600 font-medium no-underline hover:bg-orange-500/30 transition-colors cursor-pointer;
}

.markdown-preview :deep(.timestamp-link:focus-visible) {
  @apply outline-hidden ring-2 ring-orange-500/50;
}

.markdown-preview :deep(.timestamp-link)::before {
  content: '⏱';
  @apply text-sm;
}
</style>
