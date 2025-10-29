<script setup lang="ts">
import { computed } from 'vue';
import { Icon } from '@iconify/vue';
import { useShortcutCustomization } from '../../composables/useShortcutCustomization';
import { useShortcutEditor } from '../../composables/useShortcutEditor';
import { getKeyDisplayName, SHORTCUT_ACTIONS, type ShortcutKey } from '../../constants/shortcuts';

const shortcuts = useShortcutCustomization();
const editor = useShortcutEditor();
const actionsByCategory = computed(() => shortcuts.actionsByCategory.value);
const conflicts = computed(() => shortcuts.getConflicts());
const editingActionId = computed(() => editor.editingActionId.value);

function getActionLabel(actionId: string): string {
  return SHORTCUT_ACTIONS.find(a => a.id === actionId)?.label || actionId;
}
</script>

<template>
  <div class="space-y-4 pt-8">
    <div>
      <h3 class="font-medium text-gray-900">Keyboard Shortcut Customization</h3>
      <p class="text-sm text-muted-500 mt-1">Customize keyboard shortcuts to match your workflow</p>
    </div>

    <div v-if="Object.keys(conflicts).length > 0" class="p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
      <div class="flex gap-3">
        <Icon icon="material-symbols:warning" class="text-yellow-600 text-xl flex-shrink-0 mt-0.5" />
        <div class="flex-1">
          <h4 class="font-medium text-yellow-900 mb-2">Shortcut Conflicts Detected</h4>
          <div class="space-y-1 text-sm text-yellow-800">
            <div v-for="(actionIds, key) in conflicts" :key="key" class="flex items-center gap-2">
              <kbd class="px-2 py-0.5 bg-white rounded border border-yellow-300 font-mono text-xs">
                {{ getKeyDisplayName(key as ShortcutKey) }}
              </kbd>
              <span>is assigned to:</span>
              <span class="font-medium">{{ actionIds?.map(id => getActionLabel(id)).join(', ') }}</span>
            </div>
          </div>
        </div>
      </div>
    </div>

    <div class="space-y-6">
      <div v-for="categoryGroup in actionsByCategory" :key="categoryGroup.category" class="space-y-3">
        <h4 class="font-semibold text-gray-900 capitalize">{{ categoryGroup.category }} Shortcuts</h4>
        <div class="space-y-2">
          <div
            v-for="action in categoryGroup.actions"
            :key="action.id"
            :data-action-id="action.id"
            class="flex items-center justify-between p-4 bg-white rounded-lg border"
            :class="editingActionId === action.id ? 'border-orange-500 ring-2 ring-orange-500/20' : 'border-gray-200'"
            tabindex="0"
          >
            <div class="flex-1">
              <div class="font-medium text-gray-900">{{ action.label }}</div>
              <p class="text-sm text-muted-500 mt-0.5">{{ action.description }}</p>
            </div>
            <div class="flex items-center gap-2">
              <div v-if="editingActionId === action.id" class="flex items-center gap-2">
                <span class="text-sm text-orange-600 font-medium">Press a key...</span>
                <button
                  class="px-2 py-1 text-sm text-gray-600 hover:text-gray-900"
                  @click="editor.cancelEditing"
                >
                  Cancel
                </button>
              </div>
              <div v-else class="flex items-center gap-2">
                <kbd
                  v-if="shortcuts.getActionKey(action.id)"
                  class="px-3 py-1.5 rounded border font-mono text-sm min-w-[60px] text-center"
                  :class="shortcuts.isKeyAssigned(shortcuts.getActionKey(action.id)!, action.id) ? 'bg-yellow-50 border-yellow-300 text-yellow-800' : 'bg-gray-50 border-gray-300 text-gray-700'"
                >
                  {{ getKeyDisplayName(shortcuts.getActionKey(action.id)!) }}
                </kbd>
                <button
                  class="px-3 py-1.5 rounded-lg border border-gray-300 bg-white hover:bg-gray-50 transition-colors text-sm"
                  @click="editor.startEditing(action.id)"
                >
                  Change
                </button>
                <button
                  v-if="shortcuts.customShortcuts.value[action.id]"
                  class="px-2 py-1.5 rounded-lg border border-gray-300 bg-white hover:bg-gray-50 transition-colors text-sm"
                  @click="editor.assignKey(action.id, null)"
                  title="Reset to default"
                >
                  <Icon icon="material-symbols:restart-alt" class="text-base" />
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

