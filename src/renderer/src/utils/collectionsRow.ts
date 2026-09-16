/**
 * What the collections row above the clips draws, and how.
 *
 * A collection used to live in the sidebar, under the games, in a column that
 * also held the navigation, Smart Tags, Stats and Settings. It is a view of the
 * library, the same kind of thing as Starred, and one of the few things in this
 * app somebody made by hand, so it belongs above the clips rather than below
 * the games.
 *
 * Which puts it in the way of the thing people came for, so the row is
 * deliberately two shapes rather than one, and this decides which.
 */

/**
 * How many cards the collapsed row draws.
 *
 * Four fits the width at every window size this app is used at, and a library
 * with thirty collections must not push the clips off the screen.
 */
export const COLLECTIONS_ROW_VISIBLE = 4;

export type CollectionsRowFlow = 'strip' | 'grid';

export type CollectionsRowLayout = {
  /** How many cards to draw. */
  visible: number;
  /**
   * `strip` is one row that never wraps and scrolls sideways if the window is
   * too narrow for four cards, so a cramped window costs a scroll rather than
   * reflowing the page. `grid` wraps, because a strip that scrolls for thirty
   * items is worse than a block you can look through.
   */
  flow: CollectionsRowFlow;
  /** How many are not drawn. Zero once the row is expanded. */
  hidden: number;
  /**
   * The expand control's label, or `null` when there is nothing to expand. It
   * counts, because "Show all 30" and "Show all 5" are different offers.
   */
  toggleLabel: string | null;
};

/**
 * `showAll` is a request rather than a state: it only expands the row while
 * there is something hidden. A library that had eight collections, was
 * expanded, and then lost five of them collapses on its own, which matters
 * because the control that would put it back is gone at that point.
 */
export function collectionsRowLayout(total: number, showAll: boolean): CollectionsRowLayout {
  const count = Math.max(0, Math.trunc(total));
  const expandable = count > COLLECTIONS_ROW_VISIBLE;
  const expanded = showAll && expandable;

  return {
    visible: expanded ? count : Math.min(count, COLLECTIONS_ROW_VISIBLE),
    flow: expanded ? 'grid' : 'strip',
    hidden: expanded ? 0 : Math.max(0, count - COLLECTIONS_ROW_VISIBLE),
    toggleLabel: expandable ? (expanded ? 'Show less' : `Show all ${count}`) : null,
  };
}
