import type {Clip, StudioProject} from './types';

export const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

export const getClip = (project: StudioProject, clipId: string) => {
  for (const track of project.tracks) {
    const clip = track.clips.find((candidate) => candidate.id === clipId);
    if (clip) return clip;
  }
  return null;
};

export const getProjectContentEnd = (project: StudioProject) => {
  return project.tracks.reduce((maxEnd, track) => {
    const trackEnd = track.clips.reduce(
      (end, clip) => Math.max(end, clip.start + clip.duration),
      0,
    );
    return Math.max(maxEnd, trackEnd);
  }, 0);
};

export const ensureProjectDuration = (
  project: StudioProject,
  minimumFrames?: number,
) => {
  const contentEnd = getProjectContentEnd(project);
  const nextMinimum = minimumFrames ?? contentEnd;
  const padding = Math.max(project.fps * 5, 60);
  const targetDuration = Math.max(
    project.durationInFrames,
    contentEnd,
    contentEnd >= project.durationInFrames || nextMinimum > project.durationInFrames
      ? nextMinimum + padding
      : 0,
  );

  return targetDuration === project.durationInFrames
    ? project
    : {...project, durationInFrames: targetDuration};
};

export const updateClipInProject = (
  project: StudioProject,
  clipId: string,
  patch: Partial<Clip>,
): StudioProject =>
  ensureProjectDuration({
    ...project,
    tracks: project.tracks.map((track) => ({
      ...track,
      clips: track.clips.map((clip) =>
        clip.id === clipId ? {...clip, ...patch} : clip,
      ),
    })),
  });

export const removeClipFromProject = (
  project: StudioProject,
  clipId: string,
): StudioProject => ({
  ...project,
  tracks: project.tracks.map((track) => ({
    ...track,
    clips: track.clips.filter((clip) => clip.id !== clipId),
  })),
});

export const moveClipToTrack = (
  project: StudioProject,
  clipId: string,
  targetTrackId: string,
  start: number,
): StudioProject => {
  const source = getClip(project, clipId);
  if (!source) return project;
  const target = project.tracks.find((track) => track.id === targetTrackId);
  if (!target || (source.type === 'audio') !== (target.kind === 'audio')) {
    return updateClipInProject(project, clipId, {start});
  }
  if (source.trackId === targetTrackId) {
    return updateClipInProject(project, clipId, {start});
  }
  return {
    ...ensureProjectDuration(project, start + source.duration),
    tracks: project.tracks.map((track) => {
      if (track.id === source.trackId) {
        return {...track, clips: track.clips.filter((clip) => clip.id !== clipId)};
      }
      if (track.id === targetTrackId) {
        return {
          ...track,
          clips: [
            ...track.clips,
            {...source, trackId: targetTrackId, start},
          ],
        };
      }
      return track;
    }),
  };
};

export const trimClip = (
  clip: Clip,
  edge: 'left' | 'right',
  frame: number,
): Partial<Clip> => {
  if (edge === 'left') {
    const nextStart = clamp(frame, 0, clip.start + clip.duration - 1);
    const delta = nextStart - clip.start;
    return {
      start: nextStart,
      duration: clip.duration - delta,
      sourceStart: Math.max(0, clip.sourceStart + delta),
    };
  }
  return {
    duration: Math.max(1, frame - clip.start),
  };
};

export const snapFrame = (
  frame: number,
  project: StudioProject,
  excludedClipId: string,
  threshold: number,
  playhead: number,
) => {
  const points = [0, getProjectContentEnd(project), playhead];
  for (const track of project.tracks) {
    for (const clip of track.clips) {
      if (clip.id !== excludedClipId) {
        points.push(clip.start, clip.start + clip.duration);
      }
    }
  }
  const nearest = points.reduce(
    (best, point) =>
      Math.abs(point - frame) < Math.abs(best - frame) ? point : best,
    points[0],
  );
  return Math.abs(nearest - frame) <= threshold ? nearest : frame;
};
