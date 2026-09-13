<script setup lang="ts">
import { watch } from 'vue';
import { Icon } from '@iconify/vue';

interface Props {
  open: boolean;
  title?: string;
  maxWidth?: 'sm' | 'md' | 'lg' | 'xl' | '2xl' | 'full';
}

interface Emits {
  (e: 'update:open', value: boolean): void;
  (e: 'close'): void;
}

const props = withDefaults(defineProps<Props>(), {
  title: 'Dialog',
  maxWidth: 'lg',
});

const emit = defineEmits<Emits>();

const maxWidthClasses = {
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-2xl',
  xl: 'max-w-4xl',
  '2xl': 'max-w-6xl',
  full: 'max-w-full mx-4',
};

function close() {
  emit('update:open', false);
  emit('close');
}

function handleBackdropClick(event: MouseEvent) {
  if (event.target === event.currentTarget) {
    close();
  }
}

watch(() => props.open, (isOpen) => {
  if (isOpen) {
    document.body.style.overflow = 'hidden';
  } else {
    document.body.style.overflow = '';
  }
});
</script>

<template>
  <Teleport to="body">
    <Transition name="modal-backdrop">
      <div
        v-if="open"
        class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
        @click="handleBackdropClick"
      >
        <Transition name="modal-content">
          <div
            v-if="open"
            class="bg-card rounded-2xl shadow-2xl w-full overflow-hidden flex flex-col max-h-[90vh]"
            :class="maxWidthClasses[maxWidth]"
            @click.stop
          >
            <!-- Header -->
            <div class="flex items-center justify-between px-6 py-4 border-b border-border bg-gradient-to-r from-orange-500/8 to-amber-500/8">
              <h2 class="text-xl font-bold text-foreground">
                {{ title }}
              </h2>
              <button
                class="p-2 rounded-lg hover:bg-card/50 transition-colors scale-on-hover"
                @click="close"
              >
                <Icon icon="material-symbols:close" class="text-2xl text-muted-600 transform-transition" />
              </button>
            </div>

            <!-- Content -->
            <div class="flex-1 overflow-y-auto">
              <slot />
            </div>

            <!-- Footer -->
            <div v-if="$slots.footer" class="px-6 py-4 border-t border-border bg-muted-50">
              <slot name="footer" />
            </div>
          </div>
        </Transition>
      </div>
    </Transition>
  </Teleport>
</template>

