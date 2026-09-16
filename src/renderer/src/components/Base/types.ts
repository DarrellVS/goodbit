export type ButtonVariant = 'default' | 'primary' | 'danger' | 'ghost' | 'outline' | 'muted';

export type PopoverAction = {
  key: string;
  label: string;
  variant?: ButtonVariant;
  disabled?: boolean;
  onClick: () => void | Promise<void>;
};

/**
 * What a `Base/BaseComboBox.vue` option is worth.
 *
 * Primitives only, because the value is what a caller stores: a theme name, a
 * page size, a tag name in a query string. An object would need an identity
 * rule (`by`) and would make every call site think about one.
 */
export type ComboBoxValue = string | number;

/**
 * One row of a dropdown.
 *
 * Grown out of the `{ value, label }` pair the native `<select>` in
 * `Settings/SettingSelect.vue` took, which is all a `<option>` can hold. The
 * three additions are the three things that were wanted and could not be had:
 * a glyph, a number about the thing, and a second line saying what it means.
 */
export type ComboBoxOption = {
  /** Never the empty string: Reka reserves that for "nothing is selected". */
  value: ComboBoxValue;
  label: string;
  /** An Iconify name, drawn before the label. */
  icon?: string;
  /** A number about the option, like how many clips carry a tag. */
  count?: number;
  /** A second line under the label. Explains the option; never repeats it. */
  description?: string;
  disabled?: boolean;
};

/**
 * The height of every dropdown in the app, as a Tailwind class. 36 px.
 *
 * A constant and not a prop. In the library's filter row a sort dropdown sits
 * directly beside a tag dropdown, and two controls of the same kind at two
 * heights is the thing this component exists to stop: a `size` prop is an
 * invitation to get that wrong, and nothing has asked for a second size.
 *
 * Exported so anything that has to line up with one (a button at the end of
 * that row, say) can say `COMBO_BOX_HEIGHT` rather than guess `h-9` and drift
 * when this changes.
 */
export const COMBO_BOX_HEIGHT = 'h-9';


