import { ref } from 'vue';

export function useQueuedHover() {
  const isAnimating = ref(false);
  const open = ref(false);
  const desiredOpen = ref(false);

  function tryStart() {
    if (isAnimating.value) return;
    if (open.value === desiredOpen.value) return;
    open.value = desiredOpen.value;
    isAnimating.value = true;
  }

  function onEnter() {
    desiredOpen.value = true;
    tryStart();
  }

  function onLeave() {
    desiredOpen.value = false;
    tryStart();
  }

  function onTransitionEnd() {
    isAnimating.value = false;
    tryStart();
  }

  return { open, onEnter, onLeave, onTransitionEnd };
}


