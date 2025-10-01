<script lang="ts" setup>
import { PopoverArrow, PopoverContent, PopoverPortal, PopoverRoot, PopoverTrigger } from 'radix-vue'

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
        class="rounded-xl bg-[hsl(var(--card))] shadow-xl border border-gray-300 p-4 min-w-[200px] backdrop-blur-md z-50"
      >
        <slot />
        <PopoverArrow class="fill-[hsl(var(--card))]" />
      </PopoverContent>
    </PopoverPortal>
  </PopoverRoot>
  
</template>


