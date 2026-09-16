<script setup lang="ts">
import { Icon } from '@iconify/vue';
import {
  ToastAction,
  ToastClose,
  ToastDescription,
  ToastProvider,
  ToastRoot,
  ToastTitle,
  ToastViewport,
} from 'reka-ui';
import { useToastStore } from '../../stores/toast';
import type { Toast } from '../../stores/toast';

const toastStore = useToastStore();

const typeIcons = {
  success: 'material-symbols:check-circle',
  error: 'material-symbols:error',
  warning: 'material-symbols:warning',
  info: 'material-symbols:info',
};

/**
 * A toast floats over arbitrary content, so it needs a ground of its own.
 *
 * These were pale solid fills (`bg-green-50`) until the accent tints were
 * reworked, and a tint alone is not a background, at 8% over a dark editor the
 * toast was effectively invisible. The card colour underneath is opaque in both
 * themes; the accent stays in the border, icon and text, where it still reads.
 */
const typeColors = {
  success: 'text-green-600 bg-card border-green-500/40',
  error: 'text-red-600 bg-card border-red-500/40',
  warning: 'text-orange-600 bg-card border-orange-500/40',
  info: 'text-blue-600 bg-card border-blue-500/40',
};

function getToastClass(toast: Toast): string {
  return toast.type ? typeColors[toast.type] : 'text-foreground bg-card border-border';
}

function getIconName(toast: Toast): string {
  return toast.type ? typeIcons[toast.type] : 'material-symbols:notifications';
}
</script>

<template>
  <ToastProvider>
    <ToastRoot
      v-for="toast in toastStore.toasts"
      :key="toast.id"
      :duration="toast.sticky ? Infinity : toast.duration || 4000"
      class="pointer-events-auto rounded-lg shadow-lg border-2 p-4 flex items-start gap-3 min-w-[320px] max-w-[420px] data-[state=open]:animate-in data-[state=closed]:animate-out data-[swipe=end]:animate-out data-[state=closed]:fade-out-80 data-[state=closed]:slide-out-to-right-full data-[state=open]:slide-in-from-top-full data-[state=open]:sm:slide-in-from-bottom-full data-[swipe=move]:translate-x-(--reka-toast-swipe-move-x) data-[swipe=cancel]:translate-x-0 data-[swipe=cancel]:transition-transform data-[swipe=end]:translate-x-(--reka-toast-swipe-end-x)"
      :class="getToastClass(toast)"
      @update:open="(open) => !open && toastStore.dismiss(toast.id)"
    >
      <Icon :icon="getIconName(toast)" class="w-5 h-5 shrink-0 mt-0.5" />
      
      <div class="flex-1 space-y-1">
        <ToastTitle v-if="toast.title" class="font-semibold text-sm">
          {{ toast.title }}
        </ToastTitle>
        <ToastDescription class="text-sm opacity-90">
          {{ toast.description }}
        </ToastDescription>

        <!-- Only for work in progress; a bar at 0 would read as stuck. -->
        <div
          v-if="toast.progress !== undefined"
          class="h-1 rounded-full bg-muted-200 overflow-hidden mt-1.5"
        >
          <div
            class="h-full bg-current transition-[width] duration-200 ease-out"
            :style="{ width: `${Math.max(2, Math.min(100, toast.progress))}%` }"
          ></div>
        </div>
      </div>

      <ToastAction
        v-if="toast.action"
        as-child
        :alt-text="toast.action.label"
      >
        <button
          class="px-3 py-1.5 text-xs font-medium rounded-md bg-black/10 hover:bg-black/20 transition-colors"
          @click="toast.action.onClick"
        >
          {{ toast.action.label }}
        </button>
      </ToastAction>

      <ToastClose
        class="ml-auto p-1 rounded-md hover:bg-black/10 transition-colors"
        aria-label="Close"
      >
        <Icon icon="material-symbols:close" class="w-4 h-4" />
      </ToastClose>
    </ToastRoot>

    <!--
      `pointer-events-none` on the column, `pointer-events-auto` on each toast.

      Two reasons, and the second one is the bug that prompted this. A modal
      dialog in Reka puts `pointer-events: none` on `body` while it is open and
      re-enables them on its own content, which is what makes the rest of the
      page inert. The toast viewport is not inside that content, so a toast
      raised over an open clip, trimmer or collection was drawn on top of it and
      could not be clicked: *Forget this GoodBit* asked for a confirmation whose
      Confirm button did nothing. Setting them back to `auto` here takes the
      toast out of that rule, which is right, because a confirmation is exactly
      the thing that has to be answerable while a dialog is up.

      And the column itself must stay `none`, or this fixed 420px strip along
      the bottom right would swallow clicks meant for whatever is under it even
      with no toast on screen.
    -->
    <ToastViewport class="pointer-events-none fixed bottom-0 right-0 flex flex-col p-6 gap-3 w-[420px] max-w-[100vw] z-2147483647 outline-hidden" />
  </ToastProvider>
</template>

