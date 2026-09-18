import { describe, expect, it } from 'vitest';
import { useTimeline } from '../../../src/renderer/src/composables/editor/useTimeline';

/**
 * What the properties panel is allowed to change about a clip.
 *
 * `updateClipProperties` names the keys it will carry rather than spreading
 * whatever it is handed, which is right: the panel should not be able to move
 * a clip's start time by accident. The cost is a failure mode with no symptom
 * anywhere except the screen. A key that is not in the list is dropped in
 * silence, so the control that sent it springs back to where it was, nothing
 * is logged, and nothing fails to compile, because `Partial<TimelineClip>` is
 * perfectly assignable to a narrower `Partial<Pick<...>>`.
 *
 * That is exactly what happened when the per-track audio section was added:
 * the sliders worked in the trimmer, which holds its own selection, and did
 * nothing at all in the editor, which sends it here.
 */

function timelineWithAClip() {
  const timeline = useTimeline();
  timeline.addClip(7, 'Battlefield 6', 'goodbit://7', 'goodbit://7/thumb', 12);
  return { timeline, id: timeline.clips.value[0].id };
}

describe('updateClipProperties', () => {
  it('carries a per-track audio selection', () => {
    const { timeline, id } = timelineWithAClip();

    timeline.updateClipProperties(id, { audio: [{ index: 2, muted: true }] });

    expect(timeline.clips.value[0].audio).toEqual([{ index: 2, muted: true }]);
  });

  it('carries an empty selection, which is what a reset sends', () => {
    const { timeline, id } = timelineWithAClip();

    timeline.updateClipProperties(id, { audio: [{ index: 2, muted: true }] });
    timeline.updateClipProperties(id, { audio: [] });

    // Not "nothing was passed": an empty list has to replace what was there,
    // or Reset would appear to do nothing.
    expect(timeline.clips.value[0].audio).toEqual([]);
  });

  it('leaves the selection alone when only the fader moves', () => {
    const { timeline, id } = timelineWithAClip();

    timeline.updateClipProperties(id, { audio: [{ index: 1, volume: 0.5 }] });
    timeline.updateClipProperties(id, { volume: 0.25 });

    expect(timeline.clips.value[0].volume).toBe(0.25);
    expect(timeline.clips.value[0].audio).toEqual([{ index: 1, volume: 0.5 }]);
  });

  it('still clamps the clip fader', () => {
    const { timeline, id } = timelineWithAClip();

    timeline.updateClipProperties(id, { volume: 4 });
    expect(timeline.clips.value[0].volume).toBe(1);
  });
});
