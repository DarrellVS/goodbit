<script setup lang="ts">
import { computed } from 'vue';
import { Icon } from '@iconify/vue';
import { useShortcutCustomization } from '@renderer/composables/settings/useShortcutCustomization';
import { useShortcutEditor } from '@renderer/composables/settings/useShortcutEditor';
import { getKeyDisplayName, SHORTCUT_ACTIONS, type ShortcutKey } from '@renderer/constants/shortcuts';

const shortcuts = useShortcutCustomization();
const editor = useShortcutEditor();
const actionsByCategory = computed(() => shortcuts.actionsByCategory.value);
const conflicts = computed(() => shortcuts.getConflicts());
const editingActionId = computed(() => editor.editingActionId.value);

function getActionLabel(actionId: string): string {
  return SHORTCUT_ACTIONS.find(a => a.id === actionId)?.label || actionId;
}
</script>

<!--
  The conflict warning uses the app's own warning colours, not literal yellows.
  
  It was `bg-yellow-50` with `text-yellow-900` and `text-yellow-800`, which is
  light text on a light ground the moment the dark palette is on. It survived
  because it is doubly conditional: `screens.spec.ts` visits this section, but
  the editor only renders while keyboard shortcuts are enabled and this box only
  while there is an actual conflict, so the contrast walk has never painted it.
  
  `text-orange-600` on `bg-orange-500/8` with a `border-orange-500/40` is what
  `BaseToast.vue` uses for a warning, and being a tint rather than a fixed
  colour it works in both palettes.
-->
<template>
  <div class="space-y-4 pt-8">
    <div>
      <h3 class="font-medium text-foreground">Keyboard Shortcut Customization</h3>
      <p class="text-sm text-muted-500 mt-1">Customize keyboard shortcuts to match your workflow</p>
    </div>

    <div v-if="Object.keys(conflicts).length > 0" class="p-4 bg-orange-500/8 border border-orange-500/40 rounded-lg">
      <div class="flex gap-3">
        <Icon icon="material-symbols:warning" class="text-orange-600 text-xl shrink-0 mt-0.5" />
        <div class="flex-1">
          <h4 class="font-medium text-foreground mb-2">Shortcut Conflicts Detected</h4>
          <div class="space-y-1 text-sm text-muted-700">
            <div v-for="(actionIds, key) in conflicts" :key="key" class="flex items-center gap-2">
              <kbd class="px-2 py-0.5 bg-card rounded-sm border border-orange-500/40 font-mono text-xs">
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
        <h4 class="font-semibold text-foreground capitalize">{{ categoryGroup.category }} Shortcuts</h4>
        <div class="space-y-2">
          <div
            v-for="action in categoryGroup.actions"
            :key="action.id"
            :data-action-id="action.id"
            class="flex items-center justify-between p-4 bg-card rounded-lg border"
            :class="editingActionId === action.id ? 'border-orange-500 ring-2 ring-orange-500/20' : 'border-border'"
            tabindex="0"
          >
            <div class="flex-1">
              <div class="font-medium text-foreground">{{ action.label }}</div>
              <p class="text-sm text-muted-500 mt-0.5">{{ action.description }}</p>
            </div>
            <div class="flex items-center gap-2">
              <div v-if="editingActionId === action.id" class="flex items-center gap-2">
                <span class="text-sm text-orange-600 font-medium">Press a key...</span>
                <button
                  class="px-2 py-1 text-sm text-muted-600 hover:text-foreground"
                  @click="editor.cancelEditing"
                >
                  Cancel
                </button>
              </div>
              <div v-else class="flex items-center gap-2">
                <kbd
                  v-if="shortcuts.getActionKey(action.id)"
                  class="px-3 py-1.5 rounded-sm border font-mono text-sm min-w-[60px] text-center"
                  :class="shortcuts.isKeyAssigned(shortcuts.getActionKey(action.id)!, action.id) ? 'bg-orange-500/8 border-orange-500/40 text-orange-600' : 'bg-muted-50 border-border text-muted-700'"
                >
                  {{ getKeyDisplayName(shortcuts.getActionKey(action.id)!) }}
                </kbd>
                <button
                  class="px-3 py-1.5 rounded-lg border border-border bg-card hover:bg-muted-50 transition-colors text-sm"
                  @click="editor.startEditing(action.id)"
                >
                  Change
                </button>
                <button
                  v-if="shortcuts.customShortcuts.value[action.id]"
                  class="px-2 py-1.5 rounded-lg border border-border bg-card hover:bg-muted-50 transition-colors text-sm"
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

