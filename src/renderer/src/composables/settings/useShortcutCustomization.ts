import { computed, ref } from 'vue';
import { useConfiguration } from '@renderer/composables/app/useConfiguration';
import { 
  SHORTCUT_ACTIONS, 
  getDefaultShortcuts, 
  type ShortcutKey,
  type ShortcutAction,
  getKeyDisplayName 
} from '@renderer/constants/shortcuts';

export function useShortcutCustomization() {
  const config = useConfiguration();
  
  // Get default shortcuts
  const defaultShortcuts = computed(() => getDefaultShortcuts());
  
  // Get custom shortcuts from config (merge with defaults)
  const customShortcuts = computed(() => config.public.value.customShortcuts || {});
  
  // Get effective shortcuts (custom override defaults)
  const effectiveShortcuts = computed(() => {
    const effective: Record<string, ShortcutKey> = { ...defaultShortcuts.value };
    Object.assign(effective, customShortcuts.value);
    return effective;
  });
  
  // Get all actions grouped by category
  const actionsByCategory = computed<Array<{ category: string; actions: ShortcutAction[] }>>(() => {
    const grouped: Record<string, ShortcutAction[]> = {
      global: [],
      clips: [],
      editor: [],
    };
    
    SHORTCUT_ACTIONS.forEach(action => {
      grouped[action.category].push(action);
    });
    
    // Convert to array of tuples for better Vue template typing
    return Object.entries(grouped).map(([category, actions]) => ({
      category,
      actions,
    }));
  });
  
  // Get the key assigned to an action
  function getActionKey(actionId: string): ShortcutKey | undefined {
    return effectiveShortcuts.value[actionId];
  }
  
  // Set a custom shortcut
  function setShortcut(actionId: string, key: ShortcutKey | null): void {
    if (!config.public.value.customShortcuts) {
      config.public.value.customShortcuts = {};
    }
    
    if (key === null) {
      // Remove custom shortcut to restore default
      delete config.public.value.customShortcuts[actionId];
    } else {
      config.public.value.customShortcuts[actionId] = key;
    }
  }
  
  // Reset all shortcuts to defaults
  function resetToDefaults(): void {
    config.public.value.customShortcuts = {};
  }
  
  // Get conflicts - actions that share the same key within the same category
  function getConflicts(): Partial<Record<ShortcutKey, string[]>> {
    const categoryKeyToActions: Record<string, Partial<Record<ShortcutKey, string[]>>> = {};
    
    Object.entries(effectiveShortcuts.value).forEach(([actionId, key]) => {
      const action = SHORTCUT_ACTIONS.find(a => a.id === actionId);
      if (!action) return;
      
      const category = action.category;
      if (!categoryKeyToActions[category]) {
        categoryKeyToActions[category] = {};
      }
      if (!categoryKeyToActions[category][key]) {
        categoryKeyToActions[category][key] = [];
      }
      categoryKeyToActions[category][key]!.push(actionId);
    });
    
    const conflicts: Partial<Record<ShortcutKey, string[]>> = {};
    Object.values(categoryKeyToActions).forEach((keyToActions) => {
      Object.entries(keyToActions).forEach(([key, actionIds]) => {
        if (actionIds && actionIds.length > 1) {
          if (conflicts[key as ShortcutKey]) {
            conflicts[key as ShortcutKey]!.push(...actionIds);
          } else {
            conflicts[key as ShortcutKey] = [...actionIds];
          }
        }
      });
    });
    
    return conflicts;
  }
  
  // Check if a key is already assigned within the same category
  function isKeyAssigned(key: ShortcutKey, excludeActionId?: string): boolean {
    if (!excludeActionId) return false;
    
    const excludeAction = SHORTCUT_ACTIONS.find(a => a.id === excludeActionId);
    if (!excludeAction) return false;
    
    return Object.entries(effectiveShortcuts.value).some(
      ([actionId, assignedKey]) => {
        if (assignedKey !== key || actionId === excludeActionId) return false;
        
        const action = SHORTCUT_ACTIONS.find(a => a.id === actionId);
        // Only conflict if in the same category
        return action?.category === excludeAction.category;
      }
    );
  }
  
  // Get action that uses a specific key within the same category
  function getActionForKey(key: ShortcutKey, excludeActionId?: string): string | undefined {
    if (!excludeActionId) return undefined;
    
    const excludeAction = SHORTCUT_ACTIONS.find(a => a.id === excludeActionId);
    if (!excludeAction) return undefined;
    
    const entry = Object.entries(effectiveShortcuts.value).find(
      ([actionId, assignedKey]) => {
        if (assignedKey !== key || actionId === excludeActionId) return false;
        
        const action = SHORTCUT_ACTIONS.find(a => a.id === actionId);
        // Only conflict if in the same category
        return action?.category === excludeAction.category;
      }
    );
    return entry?.[0];
  }
  
  // Export shortcuts configuration
  function exportShortcuts(): string {
    return JSON.stringify({
      customShortcuts: customShortcuts.value,
      exportedAt: new Date().toISOString(),
    }, null, 2);
  }
  
  // Import shortcuts configuration
  function importShortcuts(json: string): { success: boolean; error?: string } {
    try {
      const data = JSON.parse(json);
      if (data.customShortcuts && typeof data.customShortcuts === 'object') {
        config.public.value.customShortcuts = data.customShortcuts;
        return { success: true };
      }
      return { success: false, error: 'Invalid shortcuts format' };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Invalid JSON' };
    }
  }
  
  return {
    defaultShortcuts,
    customShortcuts,
    effectiveShortcuts,
    actionsByCategory,
    getActionKey,
    setShortcut,
    resetToDefaults,
    getConflicts,
    isKeyAssigned,
    getActionForKey,
    exportShortcuts,
    importShortcuts,
  };
}

