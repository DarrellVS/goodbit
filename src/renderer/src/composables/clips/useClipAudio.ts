import { computed, ref, watch, type Ref } from 'vue';
import { getClipAudioTracks, type ClipAudioSelection, type ClipAudioTrack } from '@renderer/services/clips';
import {
  hasSelection,
  isMutedIn,
  soloed,
  volumeIn,
  withMuteToggled,
  withVolume,
} from '@renderer/utils/clipAudioSelection';

/**
 * What a clip's tracks are, and what has been decided about them.
 *
 * Held in the screen rather than on the clip, and deliberately: a selection is
 * an export-time decision the same way a crop is, so it lasts as long as the
 * trimmer is open and no longer. Nothing about a clip changes because somebody
 * looked at its sound.
 *
 * **Soloing is a state of the other tracks, not a state of its own.** There is
 * no way to preview one track in a `<video>`: Chromium does not implement
 * `HTMLMediaElement.audioTracks`, so a browser plays whatever the container
 * calls the default and nothing here can change that. Solo therefore means
 * "mute the others", which is a thing the cut and the export both understand,
 * and it survives being pressed twice because the mutes it set are ordinary
 * mutes anybody can undo one at a time.
 */
export function useClipAudio(clipId: Ref<number | string>) {
  const tracks = ref<ClipAudioTrack[]>([]);
  const loading = ref(false);

  /**
   * The decisions, in the shape they will be sent in.
   *
   * A list rather than a map per track, so that this and the editor's own copy
   * on the timeline clip are the same value and the merge rules live in one
   * place: `utils/clipAudioSelection.ts`.
   */
  const chosen = ref<ClipAudioSelection[]>([]);

  async function load(): Promise<void> {
    // Nothing selected, which the editor's properties panel is in most of the
    // time. Asking the library about clip 0 is a 500 in the log for a question
    // nobody asked.
    if (!Number(clipId.value)) {
      tracks.value = [];
      return;
    }

    loading.value = true;
    try {
      tracks.value = await getClipAudioTracks(Number(clipId.value));
    } catch (error) {
      // A clip whose sound cannot be read is not a reason to fail the screen
      // that cuts it. The section simply does not appear.
      console.error('Failed to read the audio tracks:', error);
      tracks.value = [];
    } finally {
      loading.value = false;
    }
  }

  watch(
    clipId,
    () => {
      chosen.value = [];
      void load();
    },
    { immediate: true },
  );

  const isMuted = (index: number): boolean => isMutedIn(chosen.value, index);
  const volumeOf = (index: number): number => volumeIn(chosen.value, index);

  function toggleMute(index: number): void {
    chosen.value = withMuteToggled(chosen.value, index);
  }

  function setVolume(index: number, volume: number): void {
    chosen.value = withVolume(chosen.value, index, volume);
  }

  function solo(index: number): void {
    chosen.value = soloed(chosen.value, tracks.value, index);
  }

  function reset(): void {
    chosen.value = [];
  }

  const changed = computed(() => hasSelection(chosen.value));

  /**
   * What to send, or nothing at all.
   *
   * Nothing is the important half: an untouched clip must send no selection,
   * because "every track at zero" and "nobody looked" produce different
   * commands and only the second one is free.
   */
  const selection = computed<ClipAudioSelection[] | undefined>(() =>
    changed.value ? chosen.value : undefined,
  );

  return {
    tracks,
    loading,
    changed,
    selection,
    isMuted,
    volumeOf,
    toggleMute,
    setVolume,
    solo,
    reset,
    reload: load,
  };
}
