import { ref, nextTick, onBeforeUnmount, watch } from 'vue';
import { useShortcutCustomization } from './useShortcutCustomization';
import { useToastStore } from '../stores/toast';
import { ALL_KEYS, getKeyDisplayName, SHORTCUT_ACTIONS, type ShortcutKey } from '../constants/shortcuts';

export function useShortcutEditor() {
  const shortcuts = useShortcutCustomization();
  const toastStore = useToastStore();
  const editingActionId = ref<string | null>(null);

  function startEditing(actionId: string): void {
    editingActionId.value = actionId;
    nextTick(() => {
      const div = document.querySelector(`[data-action-id="${actionId}"]`) as HTMLElement;
      if (div) {
        div.focus();
      }
    });
  }

  function cancelEditing(): void {
    editingActionId.value = null;
  }

  function assignKey(actionId: string, key: ShortcutKey | null): void {
    const conflictAction = key ? shortcuts.getActionForKey(key, actionId) : undefined;
    
    if (conflictAction) {
      const conflictActionLabel = SHORTCUT_ACTIONS.find(a => a.id === conflictAction)?.label;
      toastStore.warning(`This key is already assigned to "${conflictActionLabel}" in the same context. It will be reassigned.`);
    }
    
    shortcuts.setShortcut(actionId, key);
    editingActionId.value = null;
    
    if (key) {
      toastStore.success(`Shortcut assigned: ${getKeyDisplayName(key)}`);
    } else {
      toastStore.success('Shortcut reset to default');
    }
  }

  function handleKeyPress(event: KeyboardEvent, actionId: string): void {
    if (editingActionId.value !== actionId) {
      return;
    }
    
    event.preventDefault();
    event.stopPropagation();
    
    const target = event.target as HTMLElement;
    if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') {
      return;
    }
    
    const key = event.code as ShortcutKey;
    if (ALL_KEYS.includes(key)) {
      assignKey(actionId, key);
    }
  }

  function handleGlobalKeyDown(event: KeyboardEvent): void {
    if (!editingActionId.value) return;
    
    const target = event.target as HTMLElement;
    if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
      return;
    }
    
    if (event.code === 'Escape') {
      cancelEditing();
      return;
    }
    
    handleKeyPress(event, editingActionId.value);
  }

  watch(editingActionId, (newValue) => {
    if (newValue) {
      document.addEventListener('keydown', handleGlobalKeyDown);
    } else {
      document.removeEventListener('keydown', handleGlobalKeyDown);
    }
  });

  onBeforeUnmount(() => {
    document.removeEventListener('keydown', handleGlobalKeyDown);
  });

  return {
    editingActionId,
    startEditing,
    cancelEditing,
    assignKey,
    handleKeyPress,
  };
}

