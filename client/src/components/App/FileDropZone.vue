<script setup lang="ts">
import { ref, computed } from 'vue';
import { Icon } from '@iconify/vue';

interface Props {
  isDragging: boolean;
  isUploading: boolean;
  uploadProgress?: number;
}

defineProps<Props>();
</script>

<template>
  <Transition
    enter-active-class="transition-opacity duration-200"
    leave-active-class="transition-opacity duration-200"
    enter-from-class="opacity-0"
    leave-to-class="opacity-0"
  >
    <div
      v-if="isDragging || isUploading"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm"
      :class="{ 'pointer-events-none': isUploading }"
    >
      <div
        class="bg-gradient-to-br from-orange-500/20 to-orange-600/20 border-4 border-dashed rounded-3xl px-16 py-20 text-center transition-all"
        :class="{
          'border-orange-500 scale-100': isDragging && !isUploading,
          'border-orange-400/50 scale-95': isUploading,
        }"
      >
        <!-- Drag State -->
        <template v-if="!isUploading">
          <Icon
            icon="material-symbols:upload-file"
            class="text-9xl text-orange-500 mb-6 mx-auto animate-bounce"
          />
          <h2 class="text-4xl font-bold text-white mb-3">
            Drop Files Here
          </h2>
          <p class="text-xl text-gray-300">
            Videos will be imported to the "Import" game
          </p>
          <p class="text-sm text-gray-400 mt-4">
            Supported: MP4, MOV, AVI, MKV, WEBM
          </p>
          <p class="text-xs text-gray-500 mt-2">
            AVI, MKV, WEBM will be automatically converted to MP4
          </p>
        </template>

        <!-- Upload State -->
        <template v-else>
          <div class="relative">
            <Icon
              icon="material-symbols:cloud-upload"
              class="text-9xl text-orange-500 mb-6 mx-auto animate-pulse"
            />
            <div class="absolute inset-0 flex items-center justify-center">
              <div class="w-20 h-20 border-4 border-orange-500/30 border-t-orange-500 rounded-full animate-spin" />
            </div>
          </div>
          <h2 class="text-4xl font-bold text-white mb-3">
            Importing Files...
          </h2>
          <p class="text-xl text-gray-300">
            Please wait while your files are being processed
          </p>
          <div v-if="uploadProgress !== undefined" class="mt-6">
            <div class="w-96 h-3 bg-gray-700 rounded-full overflow-hidden mx-auto">
              <div
                class="h-full bg-gradient-to-r from-orange-500 to-orange-600 transition-all duration-300"
                :style="{ width: `${uploadProgress}%` }"
              />
            </div>
            <p class="text-sm text-gray-400 mt-2">{{ Math.round(uploadProgress) }}%</p>
          </div>
        </template>
      </div>
    </div>
  </Transition>
</template>

