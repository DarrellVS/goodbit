import { ref } from 'vue';

export function useEditorLayout() {
  const showLibrary = ref(true);
  const showProperties = ref(true);

  function toggleLibrary(): void {
    showLibrary.value = !showLibrary.value;
  }

  function toggleProperties(): void {
    showProperties.value = !showProperties.value;
  }

  return {
    showLibrary,
    showProperties,
    toggleLibrary,
    toggleProperties,
  };
}

