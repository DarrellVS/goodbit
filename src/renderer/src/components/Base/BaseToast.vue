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
} from 'radix-vue';
import { useToastStore } from '../../stores/toast';
import type { Toast } from '../../stores/toast';

const toastStore = useToastStore();

const typeIcons = {
  success: 'material-symbols:check-circle',
  error: 'material-symbols:error',
  warning: 'material-symbols:warning',
  info: 'material-symbols:info',
};

const typeColors = {
  success: 'text-green-600 bg-green-50 border-green-200',
  error: 'text-red-600 bg-red-50 border-red-200',
  warning: 'text-orange-600 bg-orange-50 border-orange-200',
  info: 'text-blue-600 bg-blue-50 border-blue-200',
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
      :duration="toast.duration || 4000"
      class="rounded-lg shadow-lg border-2 p-4 flex items-start gap-3 min-w-[320px] max-w-[420px] data-[state=open]:animate-in data-[state=closed]:animate-out data-[swipe=end]:animate-out data-[state=closed]:fade-out-80 data-[state=closed]:slide-out-to-right-full data-[state=open]:slide-in-from-top-full data-[state=open]:sm:slide-in-from-bottom-full data-[swipe=move]:translate-x-[var(--radix-toast-swipe-move-x)] data-[swipe=cancel]:translate-x-0 data-[swipe=cancel]:transition-transform data-[swipe=end]:translate-x-[var(--radix-toast-swipe-end-x)]"
      :class="getToastClass(toast)"
      @update:open="(open) => !open && toastStore.dismiss(toast.id)"
    >
      <Icon :icon="getIconName(toast)" class="w-5 h-5 flex-shrink-0 mt-0.5" />
      
      <div class="flex-1 space-y-1">
        <ToastTitle v-if="toast.title" class="font-semibold text-sm">
          {{ toast.title }}
        </ToastTitle>
        <ToastDescription class="text-sm opacity-90">
          {{ toast.description }}
        </ToastDescription>
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

    <ToastViewport class="fixed bottom-0 right-0 flex flex-col p-6 gap-3 w-[420px] max-w-[100vw] z-[2147483647] outline-none" />
  </ToastProvider>
</template>

