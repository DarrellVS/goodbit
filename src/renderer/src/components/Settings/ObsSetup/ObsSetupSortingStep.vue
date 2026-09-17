<script setup lang="ts">
import { Icon } from '@iconify/vue';

/**
 * Where clips land, which is not optional and so is not a question.
 *
 * OBS cannot name a file after a game: `os_generate_formatted_filename` takes
 * the clock and the video settings and nothing else. So OBS records into
 * `<videosRoot>/.goodbit-incoming/` and GoodBit files the clip itself, from the
 * program that was in front while it was recording. See
 * `src/main/services/capture/`. There is nothing to decide here, and this page
 * exists to say so rather than to ask.
 */
</script>

<template>
  <p class="text-sm text-muted-500">
    GoodBit reads a folder per game, and that folder name is the game name. OBS names a
    recording after the clock and nothing else, so something has to decide which game a clip
    belongs to. GoodBit does it itself, with nothing to install.
  </p>

  <div class="p-4 rounded-md bg-muted-50 flex items-start gap-3">
    <Icon
      icon="material-symbols:check-circle"
      class="text-lg text-muted-500 shrink-0 mt-0.5"
    />
    <div class="min-w-0">
      <p class="font-medium text-foreground text-sm">A folder per game</p>
      <p class="text-xs text-muted-500 mt-1">
        Whatever you were playing when you press the key is what the clip is filed under. A
        browser or a launcher is named properly too, so nothing lands loose.
      </p>
    </div>
  </div>
</template>
