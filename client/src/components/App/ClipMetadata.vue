<script setup lang="ts">
import { ref, computed } from 'vue';
import { useFormat } from '../../composables/useFormat';
import { useConfiguration } from '../../composables/useConfiguration';
import { formatRelativeTime, formatExactDate } from '../../helpers/dateFormat';

interface Props {
  sizeBytes: number;
  fileModifiedAt: string;
}

const props = defineProps<Props>();
const config = useConfiguration();
const { formatBytes } = useFormat();
const showExactDate = ref(false);

const displayDate = computed(() => {
  if (config.public.value.dateFormat === 'absolute') {
    return formatExactDate(props.fileModifiedAt);
  }
  return showExactDate.value 
    ? formatExactDate(props.fileModifiedAt)
    : formatRelativeTime(props.fileModifiedAt);
});
</script>

<template>
  <div v-if="config.public.value.showMetadata" class="flex items-center justify-between text-xs text-muted-500">
    <span>{{ formatBytes(sizeBytes) }}</span>
    <time 
      :datetime="fileModifiedAt"
      class="cursor-default transition-colors hover:text-orange-500"
      @mouseenter="showExactDate = true"
      @mouseleave="showExactDate = false"
    >
      {{ displayDate }}
    </time>
  </div>
</template>

