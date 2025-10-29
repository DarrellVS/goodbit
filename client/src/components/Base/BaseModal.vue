<script setup lang="ts">
import {
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogOverlay,
  DialogPortal,
  DialogRoot,
  DialogTitle,
} from 'radix-vue';
import { Icon } from '@iconify/vue';

interface Props {
  isOpen: boolean;
  title: string;
  description?: string;
  maxWidth?: 'sm' | 'md' | 'lg' | 'xl';
}

interface Emits {
  (e: 'close'): void;
}

const props = withDefaults(defineProps<Props>(), {
  maxWidth: 'md',
});

const emit = defineEmits<Emits>();

const maxWidthClasses = {
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-lg',
  xl: 'max-w-xl',
};

function handleOpenChange(open: boolean) {
  if (!open) {
    emit('close');
  }
}
</script>

<template>
  <DialogRoot :open="isOpen" @update:open="handleOpenChange">
    <DialogPortal>
      <DialogOverlay class="fixed inset-0 bg-black/50 z-50 backdrop-blur-sm" />
      <DialogContent
        :class="[
          'fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50',
          'bg-white rounded-xl shadow-2xl border border-gray-700',
          'w-full max-h-[85vh] flex flex-col outline-none',
          maxWidthClasses[maxWidth]
        ]"
      >
        <!-- Header -->
        <div class="p-6 border-b border-gray-700 flex items-start justify-between">
          <div class="flex-1">
            <DialogTitle class="text-xl font-bold text-gray-900 mb-1">
              {{ title }}
            </DialogTitle>
            <DialogDescription v-if="description" class="text-sm text-gray-400">
              {{ description }}
            </DialogDescription>
          </div>
          <DialogClose as-child>
            <button
              class="ml-4 p-1.5 rounded-lg hover:bg-black/10 transition-colors text-gray-400 hover:text-gray-900"
              @click="emit('close')"
            >
              <Icon icon="material-symbols:close" class="text-xl" />
            </button>
          </DialogClose>
        </div>

        <!-- Content -->
        <div class="flex-1 overflow-y-auto p-6">
          <slot />
        </div>

        <!-- Actions Footer -->
        <div v-if="$slots.actions" class="p-6 border-t border-gray-700 flex items-center justify-end gap-3">
          <slot name="actions" />
        </div>
      </DialogContent>
    </DialogPortal>
  </DialogRoot>
</template>

