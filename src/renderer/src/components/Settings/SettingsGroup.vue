<script setup lang="ts">
/**
 * One group of settings, drawn as one card.
 *
 * Settings used to be a single column of rows with hairlines between them and
 * small-caps subheads now and then, which is one long list: nothing said where
 * one subject ended and the next began, so reading it meant reading all of it.
 * A group is a card now, with its name and one line about it at the top and
 * its rows inside, so a page is a handful of things to choose between and the
 * eye can skip to the one it wants.
 *
 * The rows are the same `SettingToggle`, `SettingSelect` and `.setting-block`
 * as before; `styles.css` gives them their padding and the hairlines between
 * them when they sit in a group. Rows that only appear because the row above
 * them is on go in a `.setting-children` wrapper, which indents them on a
 * quieter ground so they read as belonging to it.
 */
defineProps<{
  /** Optional: a card whose first block is its own heading needs no second one. */
  title?: string;
  description?: string;
}>();
</script>

<template>
  <section class="settings-group">
    <header v-if="title" class="settings-group-head">
      <h3>{{ title }}</h3>
      <p v-if="description">{{ description }}</p>
    </header>
    <div class="settings-group-body">
      <slot />
    </div>
  </section>
</template>
