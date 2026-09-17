<script lang="ts" setup>
import { PopoverArrow, PopoverContent, PopoverPortal, PopoverRoot, PopoverTrigger } from 'reka-ui'

const props = defineProps<{ side?: 'top' | 'right' | 'bottom' | 'left'; sideOffset?: number }>();
</script>

<template>
  <PopoverRoot>
    <PopoverTrigger as-child>
      <slot name="trigger" />
    </PopoverTrigger>
    <PopoverPortal>
      <PopoverContent
        :side="props.side ?? 'bottom'"
        :side-offset="props.sideOffset ?? 6"
        class="rounded-lg bg-card shadow-pop border border-border p-3 min-w-[200px] z-50"
      >
        <slot />
        <PopoverArrow class="fill-card" />
      </PopoverContent>
    </PopoverPortal>
  </PopoverRoot>
  
</template>


