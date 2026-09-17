<script setup lang="ts">
import { watch } from 'vue';
import { Icon } from '@iconify/vue';

interface Props {
  open: boolean;
  title?: string;
  maxWidth?: 'sm' | 'md' | 'lg' | 'xl' | '2xl' | 'full';
  /**
   * Opened from inside another layer, so it has to sit above it.
   *
   * `Teleport` moves this to the end of `body` when the component *mounts*,
   * not when it opens, and a dialog living inside a panel that is always
   * mounted therefore lands in the document before the panel's own portal
   * does. At the same z-index, document order decides, and the panel wins:
   * the notes editor opened underneath the clip it belongs to.
   */
  above?: boolean;
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
        class="fixed inset-0 flex items-center justify-center bg-scrim backdrop-blur-sm p-4"
        :class="above ? 'z-60' : 'z-50'"
        @click="handleBackdropClick"
      >
        <Transition name="modal-content">
          <div
            v-if="open"
            class="bg-card rounded-lg shadow-pop border border-border w-full overflow-hidden flex flex-col max-h-[90vh]"
            :class="maxWidthClasses[maxWidth]"
            @click.stop
          >
            <!--
              The header labels the dialog. It used to announce it, at 20px
              bold over its own tinted band, which is a screen title's weight
              inside something that is already the only thing on screen.
            -->
            <div class="flex items-center justify-between gap-4 px-5 h-13 border-b border-border shrink-0">
              <h2 class="font-display text-lg font-medium text-foreground truncate">
                {{ title }}
              </h2>
              <button
                type="button"
                aria-label="Close"
                class="size-9 -mr-2 inline-flex items-center justify-center shrink-0 rounded-md text-muted-500 hover:text-foreground hover:bg-muted-50 outline-none focus-visible:focus-ring transition-colors duration-150"
                @click="close"
              >
                <Icon icon="material-symbols:close" class="size-5 shrink-0 block" />
              </button>
            </div>

            <!-- Content -->
            <div class="flex-1 overflow-y-auto">
              <slot />
            </div>

            <!-- Footer -->
            <div v-if="$slots.footer" class="px-5 py-4 border-t border-border shrink-0">
              <slot name="footer" />
            </div>
          </div>
        </Transition>
      </div>
    </Transition>
  </Teleport>
</template>

