import {describe, expect, it} from 'vitest';
import {
  applyDocumentOperations,
  applyProjectOperations,
  createMosaicoDocument,
  ensureProjectDuration,
  moveClipToTrack,
  snapFrame,
  trimClip,
  validateMosaicoDocument,
} from './editor-core';
import type {Clip, StudioProject} from './types';

const clip: Clip = {
  id: 'clip',
  trackId: 'video-1',
  type: 'video',
  name: 'Clip',
  start: 10,
  duration: 30,
  sourceStart: 5,
  color: '#fff',
  opacity: 1,
  x: 0,
  y: 0,
  width: 100,
  height: 100,
  rotation: 0,
  scale: 1,
  fontSize: 48,
  fontWeight: 600,
  volume: 1,
  playbackRate: 1,
  fit: 'cover',
};

const project: StudioProject = {
  id: 'p',
  name: 'P',
  width: 1920,
  height: 1080,
  fps: 30,
  durationInFrames: 300,
  background: '#000',
  tracks: [
    {
      id: 'video-1',
      name: 'V1',
      kind: 'visual',
      hidden: false,
      locked: false,
      muted: false,
      clips: [clip],
    },
    {
      id: 'video-2',
      name: 'V2',
      kind: 'visual',
      hidden: false,
      locked: false,
      muted: false,
      clips: [],
    },
    {
      id: 'audio',
      name: 'A1',
      kind: 'audio',
      hidden: false,
      locked: false,
      muted: false,
      clips: [],
    },
  ],
};

describe('timeline editing', () => {
  it('trims the left edge and preserves the source offset', () => {
    expect(trimClip(clip, 'left', 16)).toMatchObject({
      start: 16,
      duration: 24,
      sourceStart: 11,
    });
  });

  it('extends the project duration when content reaches the end', () => {
    const shortProject = {
      ...project,
      durationInFrames: 40,
    };
    const extended = ensureProjectDuration(shortProject);
    expect(extended.durationInFrames).toBeGreaterThan(40);
  });

  it('does not extend the project duration when trimming inside the existing room', () => {
    const alreadyPadded = ensureProjectDuration(project);
    const trimmedProject = {
      ...alreadyPadded,
      tracks: [
        {
          ...alreadyPadded.tracks[0],
          clips: [
            {
              ...alreadyPadded.tracks[0].clips[0],
              duration: 20,
            },
          ],
        },
        ...alreadyPadded.tracks.slice(1),
      ],
    };
    const stable = ensureProjectDuration(trimmedProject);
    expect(stable.durationInFrames).toBe(alreadyPadded.durationInFrames);
  });

  it('moves compatible clips between tracks', () => {
    const moved = moveClipToTrack(project, 'clip', 'video-2', 60);
    expect(moved.tracks[0].clips).toHaveLength(0);
    expect(moved.tracks[1].clips[0]).toMatchObject({
      trackId: 'video-2',
      start: 60,
    });
  });

  it('moves a clip within the same track without removing it', () => {
    const moved = moveClipToTrack(project, 'clip', 'video-1', 75);
    expect(moved.tracks[0].clips).toHaveLength(1);
    expect(moved.tracks[0].clips[0].start).toBe(75);
  });

  it('does not move visual media to an audio track', () => {
    const moved = moveClipToTrack(project, 'clip', 'audio', 50);
    expect(moved.tracks[0].clips[0].start).toBe(50);
    expect(moved.tracks[2].clips).toHaveLength(0);
  });

  it('snaps to nearby clip edges and playhead', () => {
    expect(snapFrame(42, project, 'other', 3, 90)).toBe(40);
    expect(snapFrame(88, project, 'other', 3, 90)).toBe(90);
  });

  it('applies agent operations through the same project engine', () => {
    const updated = applyProjectOperations(project, [
      {
        type: 'updateClip',
        clipId: 'clip',
        patch: {text: 'Edited by operation', x: 120},
      },
      {
        type: 'moveClip',
        clipId: 'clip',
        trackId: 'video-2',
        start: 80,
      },
    ]);

    expect(updated.tracks[0].clips).toHaveLength(0);
    expect(updated.tracks[1].clips[0]).toMatchObject({
      text: 'Edited by operation',
      x: 120,
      start: 80,
      trackId: 'video-2',
    });
  });

  it('validates declarative Mosaico documents', () => {
    const document = createMosaicoDocument({
      project,
      media: {assets: [], folders: []},
    });

    expect(validateMosaicoDocument(document)).toEqual({ok: true, errors: []});
  });

  it('applies media and project operations to one document', () => {
    const document = applyDocumentOperations(
      createMosaicoDocument({project, media: {assets: [], folders: []}}),
      [
        {scope: 'media', type: 'addFolder', id: 'folder-1', name: 'Footage'},
        {type: 'updateProject', patch: {name: 'Agent-ready edit'}},
      ],
    );

    expect(document.project.name).toBe('Agent-ready edit');
    expect(document.media.folders).toEqual([{id: 'folder-1', name: 'Footage'}]);
  });
});
