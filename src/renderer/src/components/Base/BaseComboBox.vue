<script setup lang="ts">
import { computed } from 'vue';
import { Icon } from '@iconify/vue';
import {
  ComboboxAnchor,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxItemIndicator,
  ComboboxPortal,
  ComboboxRoot,
  ComboboxTrigger,
  ComboboxViewport,
} from 'reka-ui';
import { COMBO_BOX_HEIGHT, type ComboBoxOption, type ComboBoxValue } from './types';
import { QUIET_CONTROL_HEIGHT } from './geometry';

/**
 * The dropdown, wherever the app has one.
 *
 * The app drew nine bare `<select>` elements, so every choice made through one
 * of them was drawn by Windows: a different height, a different font and a
 * different focus ring from everything around it, and no way to put a glyph, a
 * number, a second line or a search field in a list. This is the same argument
 * that produced `Base/BaseToggle.vue`: native checkboxes mixed in with
 * hand-rolled switches read as two different controls for one kind of
 * decision, and a native select beside a styled dropdown is that in a
 * different shape.
 *
 * One of the nine is `Settings/SettingSelect.vue`, used on five settings rows,
 * and it is now a wrapper around this. The other eight are the library's sort,
 * the editor's clip library, two steps of the OBS wizard and four rows of Smart
 * Tags. Each of those files belongs to a later item, which is why they are
 * still native: the point of this component is that they have somewhere to go.
 *
 * Reka UI's Combobox rather than its Select, because one of these lists has
 * five entries and another has every tag in the library. **Search is a prop and
 * is off by default**: five sort orders do not want typing and thirty tags do,
 * and they still have to be the same control.
 *
 * Four things here are deliberate and cost something to get wrong.
 *
 * **The closed control is a button, not the text input.** Reka's own examples
 * put a `ComboboxInput` in the anchor and let it be the thing you click, which
 * cannot hold an icon, cannot say "2 tags", and reads as a text field when it is
 * a choice. So the anchor is a button and the search field lives at the top of
 * the open list. Reka supports that directly: `ComboboxContent` checks whether
 * the input is inside it, focuses it on open and hands focus back to the trigger
 * on close.
 *
 * **There is still an input when search is off**, screen reader only and
 * `readonly`. It is not decoration: `ListboxFilter`, which `ComboboxInput` is
 * built on, is where arrow keys, Home, End, Enter and `aria-activedescendant`
 * come from, and it is what stops the highlight dragging DOM focus around the
 * list. Without one, opening the list moves focus onto an option, closing it
 * drops focus on the floor, and every one of those behaviours becomes ours to
 * write. `readonly` is what keeps a hidden field from filtering a list nobody
 * asked to filter. The cost is that typing a letter no longer jumps to an
 * option the way a native select does; a list long enough to want that gets
 * `searchable`.
 *
 * **The trigger's `tabindex` is overridden to 0.** Reka sets `-1` on
 * `ComboboxTrigger` because in its layout the trigger is a chevron beside an
 * input that already has the tab stop. Here the trigger *is* the closed
 * control, so without this the whole dropdown is unreachable by keyboard.
 *
 * **One height, and it is not a prop.** See `COMBO_BOX_HEIGHT` in `./types`.
 * The trigger draws an option's icon and its label, never its count or its
 * description: a count is a fact about the list rather than about the choice,
 * and a description is a second line, and this control has one height.
 */
interface Props {
  /** The chosen value, or the chosen values when `multiple`. */
  modelValue: ComboBoxValue | ComboBoxValue[] | null;
  /**
   * What this dropdown is called. Required, following `BaseToggle`: a control
   * with no name is a riddle to anything that cannot see the label beside it.
   */
  label: string;
  options: ComboBoxOption[];
  /** What the closed control reads when nothing is chosen. */
  placeholder?: string;
  /** A search field at the top of the list. Off unless a list is long. */
  searchable?: boolean;
  searchPlaceholder?: string;
  /**
   * More than one at a time, which is what a tag filter wants: `GET /clips`
   * takes a comma separated `tags` and requires all of them.
   */
  multiple?: boolean;
  disabled?: boolean;
  /**
   * What the closed control reads when `multiple` and more than one thing is
   * chosen. The default counts them, which is right for a filter and wrong for
   * anything that has a word for its own plural.
   */
  summary?: (selected: ComboBoxOption[]) => string;
  /** What the list says when a search matches nothing. */
  emptyMessage?: string;
  /**
   * `bordered` is a control in a form; `quiet` is a word in a line of words.
   *
   * The library's control line is mostly text by design: `Filter`, the sort,
   * `Select` and the count sit in a row with no boxes, because boxing four
   * things that only describe the list below them gives them the weight of
   * four things that change it. A bordered dropdown in that row was the only
   * rectangle on the line and read as the important one.
   *
   * Still one component and still one height per class: bordered controls are
   * 36px and quiet ones are 32px, and neither is a free number.
   */
  variant?: 'bordered' | 'quiet';
}

interface Emits {
  (e: 'update:modelValue', value: ComboBoxValue | ComboBoxValue[] | null): void;
}

const props = withDefaults(defineProps<Props>(), {
  placeholder: 'Choose one',
  searchable: false,
  searchPlaceholder: 'Search',
  multiple: false,
  disabled: false,
  summary: undefined,
  emptyMessage: 'Nothing matches',
  variant: 'bordered',
});

const emit = defineEmits<Emits>();

/**
 * Compared as strings, which the native `<select>` this replaces did for free.
 *
 * A `<select>` round-tripped every value through the DOM, so `SettingSelect`
 * matched with `String(option.value) === target.value` and a page size stored
 * as `'25'` by some earlier version was the same choice as the option `25`.
 * Matching strictly would show the placeholder instead, on a setting the user
 * had picked. The option's own typed value is what gets emitted, so a loose
 * match on the way in does not leak a string on the way out.
 */
function sameValue(option: ComboBoxOption, value: ComboBoxValue): boolean {
  return String(option.value) === String(value);
}

const selectedValues = computed<ComboBoxValue[]>(() => {
  if (Array.isArray(props.modelValue)) return props.modelValue;
  return props.modelValue === null || props.modelValue === undefined ? [] : [props.modelValue];
});

const selectedOptions = computed<ComboBoxOption[]>(() =>
  selectedValues.value
    .map((value) => props.options.find((option) => sameValue(option, value)))
    .filter((option): option is ComboBoxOption => option !== undefined)
);

/**
 * What Reka is given, rather than what the caller passed.
 *
 * The options are the authority on the type of a value, so a stored `'25'`
 * becomes the option's `25` here and the item Reka thinks is checked is the one
 * drawn with a tick. Anything the options do not know about is dropped, which
 * is how a tag that has been deleted stops being a selection.
 */
const resolvedValue = computed<ComboBoxValue | ComboBoxValue[] | null>(() => {
  const values = selectedOptions.value.map((option) => option.value);
  if (props.multiple) return values;
  return values[0] ?? null;
});

const triggerLabel = computed(() => {
  const selected = selectedOptions.value;
  if (selected.length === 0) return props.placeholder;
  if (selected.length === 1) return selected[0].label;
  return props.summary ? props.summary(selected) : `${selected.length} selected`;
});

const triggerIcon = computed(() =>
  selectedOptions.value.length === 1 ? selectedOptions.value[0].icon : undefined
);

const hasSelection = computed(() => selectedOptions.value.length > 0);

function onValueChange(value: unknown): void {
  if (props.multiple) {
    emit('update:modelValue', (Array.isArray(value) ? value : []) as ComboBoxValue[]);
    return;
  }
  emit('update:modelValue', (value ?? null) as ComboBoxValue | null);
}

/**
 * The open list sits above every dialog in the app.
 *
 * It was `z-50`, and that is wrong in any dialog with a higher one, which is
 * most of them. Reka's `PopperContent` copies the content's computed z-index
 * onto the wrapper it portals to `document.body`, and `#app` creates no
 * stacking context, so both end up in the root one and the larger number wins.
 * Measured against the OBS setup wizard, whose scrim is `z-100`: the list
 * rendered **behind** the scrim, and `elementFromPoint` over the middle of it
 * returned the overlay, whose `@click.self` closes the dialog. Clicking an
 * option closed the wizard.
 *
 * A native `<select>` never had this problem because Windows draws its popup
 * outside the page entirely, which is why it took a component to surface it.
 *
 * **One value rather than a prop**, and deliberately not the `above` boolean
 * `BaseDialog` uses. The z-indexes in this app run 50, 60, 100, 200, so a
 * boolean cannot express "above whichever of those contains me", and a number
 * prop makes every caller responsible for knowing its own container's depth,
 * which is the knowledge that goes stale.
 *
 * A dropdown is transient and belongs on top of its own context by definition.
 * Opening a dialog over one closes it, because focus moves, so there is no
 * ordering left to get wrong. The one thing that stays above it is the toast
 * viewport at `z-2147483647`, which reports on what just happened and has to
 * outrank everything.
 */
const LIST_Z_INDEX = 'z-300';
</script>

<template>
  <!--
    The width is the caller's, since this is used at 176 px in a settings row
    and at whatever the filter row gives it. The height never is.
  -->
  <ComboboxRoot
    v-slot="{ open }"
    :model-value="resolvedValue"
    :multiple="multiple"
    :disabled="disabled"
    @update:model-value="onValueChange"
  >
    <ComboboxAnchor as-child>
      <ComboboxTrigger
        v-if="variant === 'quiet'"
        tabindex="0"
        :aria-label="label"
        :class="[
          QUIET_CONTROL_HEIGHT,
          'inline-flex items-center gap-1.5 rounded-md px-1 text-sm text-left',
          'outline-none focus-visible:focus-ring transition-colors duration-150',
          'disabled:cursor-not-allowed disabled:opacity-50',
          open ? 'text-foreground' : 'text-muted-600 hover:text-foreground',
        ]"
      >
        <Icon v-if="triggerIcon" :icon="triggerIcon" class="size-4 shrink-0 block text-muted-400" />
        <span class="min-w-0 truncate">{{ triggerLabel }}</span>
        <Icon
          icon="material-symbols:expand-more"
          class="size-4 shrink-0 block text-muted-400 transition-transform duration-150"
          :class="open ? 'rotate-180' : ''"
        />
      </ComboboxTrigger>

      <ComboboxTrigger
        v-else
        tabindex="0"
        :aria-label="label"
        :class="[
          COMBO_BOX_HEIGHT,
          'flex w-full items-center gap-2 rounded-md border border-border bg-card px-3 text-sm',
          'text-left outline-hidden transition-colors duration-150',
          'focus-visible:border-accent focus-visible:ring-2 focus-visible:ring-accent/40',
          'disabled:cursor-not-allowed disabled:opacity-50',
          open ? 'border-accent' : 'hover:bg-muted-50',
        ]"
      >
        <Icon v-if="triggerIcon" :icon="triggerIcon" class="size-4 shrink-0 block text-muted-500" />
        <span class="min-w-0 flex-1 truncate" :class="hasSelection ? 'text-foreground' : 'text-muted-500'">
          {{ triggerLabel }}
        </span>
        <Icon
          icon="material-symbols:expand-more"
          class="size-4 shrink-0 block text-muted-500 transition-transform duration-150"
          :class="open ? 'rotate-180' : ''"
        />
      </ComboboxTrigger>
    </ComboboxAnchor>

    <!--
      Portalled and positioned by Reka's popper, not absolutely inside the
      anchor: these open inside settings cards and inside dialogs, and an
      `overflow-hidden` ancestor would cut the list off. `align="start"` so the
      list lines up with the left edge of the control rather than its middle.
    -->
    <ComboboxPortal>
      <ComboboxContent
        position="popper"
        align="start"
        :side-offset="6"
        :class="[
          LIST_Z_INDEX,
          'w-(--reka-combobox-trigger-width) min-w-48 rounded-lg border border-border bg-card p-1 shadow-lg outline-hidden',
        ]"
      >
        <div
          v-if="searchable"
          class="mb-1 flex items-center gap-2 border-b border-border px-2 pb-1.5 pt-1"
        >
          <Icon icon="material-symbols:search" class="shrink-0 text-base text-muted-500" />
          <ComboboxInput
            :placeholder="searchPlaceholder"
            :aria-label="`Search ${label}`"
            class="w-full bg-transparent text-sm text-foreground outline-hidden placeholder:text-muted-500"
          />
        </div>
        <!--
          Search is off, and there is still an input. See the docblock: it is
          where the keyboard behaviour comes from, and `readonly` is what stops
          a field nobody can see from filtering the list.
        -->
        <ComboboxInput v-else readonly :aria-label="label" class="sr-only" />

        <ComboboxViewport class="max-h-64 overflow-y-auto">
          <ComboboxEmpty class="px-2.5 py-2 text-sm text-muted-500">
            {{ emptyMessage }}
          </ComboboxEmpty>

          <ComboboxItem
            v-for="option in options"
            :key="String(option.value)"
            :value="option.value"
            :disabled="option.disabled"
            :text-value="option.label"
            class="flex cursor-pointer select-none items-start gap-2 rounded-sm px-2.5 py-1.5 text-sm outline-hidden data-highlighted:bg-muted-100 data-disabled:cursor-not-allowed data-disabled:opacity-50"
          >
            <Icon
              v-if="option.icon"
              :icon="option.icon"
              class="mt-0.5 shrink-0 text-base text-muted-500"
            />
            <span class="min-w-0 flex-1">
              <span class="block truncate text-foreground">{{ option.label }}</span>
              <span v-if="option.description" class="mt-0.5 block text-xs text-muted-500">
                {{ option.description }}
              </span>
            </span>
            <span
              v-if="option.count !== undefined"
              class="mt-0.5 shrink-0 text-xs tabular-nums text-muted-500"
            >
              {{ option.count }}
            </span>
            <!--
              A fixed slot for the tick, so a row does not shift sideways the
              moment it becomes the chosen one.
            -->
            <span class="mt-0.5 w-4 shrink-0">
              <ComboboxItemIndicator>
                <Icon icon="material-symbols:check" class="text-base text-muted-500" />
              </ComboboxItemIndicator>
            </span>
          </ComboboxItem>
        </ComboboxViewport>
      </ComboboxContent>
    </ComboboxPortal>
  </ComboboxRoot>
</template>
