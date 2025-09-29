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
        class="rounded-xl bg-black/40 shadow-2xl border border-gray-500 p-4 min-w-[200px] backdrop-blur-lg"
      >
        <slot />
        <PopoverArrow class="fill-gray-500" />
      </PopoverContent>
    </PopoverPortal>
  </PopoverRoot>
  
</template>


