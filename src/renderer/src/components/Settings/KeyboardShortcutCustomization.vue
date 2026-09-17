<script setup lang="ts">
import { computed } from 'vue';
import { Icon } from '@iconify/vue';
import { useShortcutCustomization } from '@renderer/composables/settings/useShortcutCustomization';
import { useShortcutEditor } from '@renderer/composables/settings/useShortcutEditor';
import { getKeyDisplayName, SHORTCUT_ACTIONS, type ShortcutKey } from '@renderer/constants/shortcuts';
import { BUTTON_SMALL, ICON_BOX } from '@renderer/components/Base/geometry';

/** A key, drawn the same way wherever one is shown. */
const KEY_CAP =
  'inline-flex items-center justify-center h-7 min-w-[2.75rem] px-2 rounded-sm border ' +
  'font-mono text-xs tabular-nums';

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

  It was `bg-warning/10` with `text-warning` and `text-warning`, which is
  light text on a light ground the moment the dark palette is on. It survived
  because it is doubly conditional: `screens.spec.ts` visits this section, but
  the editor only renders while keyboard shortcuts are enabled and this box only
  while there is an actual conflict, so the contrast walk has never painted it.

  `text-accent-ink` on `bg-accent/8` with a `border-accent/40` is what
  `BaseToast.vue` uses for a warning, and being a tint rather than a fixed
  colour it works in both palettes.
-->
<template>
  <div class="setting-card">
    <h3>Change a shortcut</h3>
    <p>Change any of these to whatever your hands already do.</p>

    <!--
      A conflict is the one thing on this screen that has gone wrong, so it is
      the one thing allowed a tinted ground. It has no glyph: the sentence
      says what happened, and a warning triangle beside a sentence that
      already says "assigned to" is the same information twice.
    -->
    <div
      v-if="Object.keys(conflicts).length > 0"
      class="setting-inset !bg-accent/8 !text-foreground space-y-1.5 mt-4"
    >
      <p class="text-sm font-medium text-foreground">Two things want the same key</p>
      <div v-for="(actionIds, key) in conflicts" :key="key" class="flex items-center gap-2 text-sm">
        <kbd :class="[KEY_CAP, 'border-accent/40 bg-card text-foreground']">
          {{ getKeyDisplayName(key as ShortcutKey) }}
        </kbd>
        <span class="text-muted-500">is assigned to</span>
        <span class="text-foreground">
          {{ actionIds?.map(id => getActionLabel(id)).join(', ') }}
        </span>
      </div>
    </div>

    <div class="mt-4">
      <section v-for="categoryGroup in actionsByCategory" :key="categoryGroup.category">
        <h4
          class="h-8 flex items-center text-xs font-medium uppercase tracking-label text-muted-400 mt-3 first:mt-0"
        >
          {{ categoryGroup.category }}
        </h4>

        <!--
          One row per action, separated by a hairline, with the key and its
          two buttons at the end. Each row was a bordered box of its own, and
          a list of fourteen boxes is a list that has to be read one box at a
          time.
        -->
        <div
          v-for="action in categoryGroup.actions"
          :key="action.id"
          :data-action-id="action.id"
          class="flex items-center justify-between gap-4 py-3 border-t border-border"
          :class="editingActionId === action.id ? 'bg-accent/6' : ''"
          tabindex="0"
        >
          <div class="min-w-0 flex-1">
            <div class="text-sm font-medium text-foreground">{{ action.label }}</div>
            <p class="text-sm text-muted-500 mt-0.5 max-w-[62ch]">{{ action.description }}</p>
          </div>

          <div v-if="editingActionId === action.id" class="flex items-center gap-2 shrink-0">
            <span class="text-sm text-accent-ink">Press a key</span>
            <button
              type="button"
              :class="BUTTON_SMALL"
              @click="editor.cancelEditing"
            >
              Cancel
            </button>
          </div>

          <div v-else class="flex items-center gap-2 shrink-0">
            <kbd
              v-if="shortcuts.getActionKey(action.id)"
              :class="[
                KEY_CAP,
                shortcuts.isKeyAssigned(shortcuts.getActionKey(action.id)!, action.id)
                  ? 'border-accent/40 bg-accent/8 text-accent-ink'
                  : 'border-border bg-muted-50 text-muted-600',
              ]"
            >
              {{ getKeyDisplayName(shortcuts.getActionKey(action.id)!) }}
            </kbd>
            <button type="button" :class="BUTTON_SMALL" @click="editor.startEditing(action.id)">
              Change
            </button>
            <button
              v-if="shortcuts.customShortcuts.value[action.id]"
              type="button"
              :class="[BUTTON_SMALL, '!px-2']"
              title="Put this one back to its default"
              aria-label="Put this one back to its default"
              @click="editor.assignKey(action.id, null)"
            >
              <Icon icon="material-symbols:restart-alt" :class="ICON_BOX" />
            </button>
          </div>
        </div>
      </section>
    </div>
  </div>
</template>
