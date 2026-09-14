import { defineStore } from 'pinia';
import { ref } from 'vue';

export interface Toast {
  id: string;
  title?: string;
  description: string;
  type?: 'success' | 'error' | 'info' | 'warning';
  duration?: number;
  /**
   * Stay until something dismisses it.
   *
   * For work that is still happening: a toast that fades after four seconds is
   * fine for "saved" and wrong for "uploading, 12%".
   */
  sticky?: boolean;
  /** 0-100. Draws a bar under the text; leave undefined for no bar. */
  progress?: number;
  action?: {
    label: string;
    onClick: () => void;
  };
}

export const useToastStore = defineStore('toast', () => {
  const toasts = ref<Toast[]>([]);
  let idCounter = 0;

  function show(options: Omit<Toast, 'id'>): string {
    const id = `toast-${++idCounter}`;
    toasts.value.push({ id, ...options });
    return id;
  }

  function success(description: string, title?: string, action?: Toast['action']): string {
    return show({ description, title, type: 'success', duration: 3000, action });
  }

  function error(description: string, title?: string): string {
    return show({ description, title, type: 'error', duration: 5000 });
  }

  function info(description: string, title?: string): string {
    return show({ description, title, type: 'info', duration: 4000 });
  }

  function warning(description: string, title?: string): string {
    return show({ description, title, type: 'warning', duration: 4000 });
  }

  function confirm(description: string, onConfirm: () => void, title?: string): string {
    const id = `toast-${++idCounter}`;
    toasts.value.push({
      id,
      description,
      title: title || 'Confirm',
      type: 'warning',
      duration: 10000,
      action: {
        label: 'Confirm',
        onClick: () => {
          onConfirm();
          dismiss(id);
        },
      },
    });
    return id;
  }

  /**
   * Change a toast that is already on screen.
   *
   * The alternative is dismissing and showing another, which slides one out
   * and another in every time a percentage ticks.
   */
  function update(id: string, patch: Partial<Omit<Toast, 'id'>>): void {
    const toast = toasts.value.find((t) => t.id === id);
    if (toast) Object.assign(toast, patch);
  }

  function dismiss(id: string): void {
    const index = toasts.value.findIndex((t) => t.id === id);
    if (index !== -1) toasts.value.splice(index, 1);
  }

  function clear(): void {
    toasts.value = [];
  }

  return {
    toasts,
    show,
    success,
    error,
    info,
    warning,
    confirm,
    update,
    dismiss,
    clear,
  };
});

