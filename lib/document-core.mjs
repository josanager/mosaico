export const MOSAICO_DOCUMENT_VERSION = 1;

const createId = (prefix = 'id') => {
  const randomId = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
  return `${prefix}-${randomId}`;
};

export const clamp = (value, min, max) =>
  Math.min(max, Math.max(min, value));

export const createEmptyProject = ({
  id = createId('project'),
  name = 'Nuevo proyecto de video',
  preset = 'landscape',
  width = preset === 'portrait' ? 1080 : 1920,
  height = preset === 'portrait' ? 1920 : 1080,
  fps = 30,
  durationInFrames = 300,
  background = '#111214',
} = {}) => ({
  id,
  name,
  width,
  height,
  fps,
  durationInFrames,
  background,
  tracks: [
    {
      id: createId('track-audio'),
      name: 'Audio',
      kind: 'audio',
      hidden: false,
      locked: false,
      muted: false,
      clips: [],
    },
    {
      id: createId('track-video'),
      name: 'Video',
      kind: 'visual',
      hidden: false,
      locked: false,
      muted: false,
      clips: [],
    },
    {
      id: createId('track-text'),
      name: 'Text',
      kind: 'visual',
      hidden: false,
      locked: false,
      muted: false,
      clips: [],
    },
  ],
});

export const createMosaicoDocument = ({
  project = createEmptyProject(),
  media = {assets: [], folders: []},
  metadata = {},
} = {}) => ({
  schemaVersion: MOSAICO_DOCUMENT_VERSION,
  project,
  media: {
    assets: Array.isArray(media?.assets) ? media.assets : [],
    folders: Array.isArray(media?.folders) ? media.folders : [],
  },
  metadata,
});

export const getClip = (project, clipId) => {
  for (const track of project.tracks || []) {
    const clip = track.clips?.find((candidate) => candidate.id === clipId);
    if (clip) return clip;
  }
  return null;
};

export const getProjectContentEnd = (project) => {
  return (project.tracks || []).reduce((maxEnd, track) => {
    const trackEnd = (track.clips || []).reduce(
      (end, clip) => Math.max(end, clip.start + clip.duration),
      0,
    );
    return Math.max(maxEnd, trackEnd);
  }, 0);
};

export const ensureProjectDuration = (project, minimumFrames) => {
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

export const updateClipInProject = (project, clipId, patch) =>
  ensureProjectDuration({
    ...project,
    tracks: project.tracks.map((track) => ({
      ...track,
      clips: track.clips.map((clip) =>
        clip.id === clipId ? {...clip, ...patch} : clip,
      ),
    })),
  });

export const removeClipFromProject = (project, clipId) => ({
  ...project,
  tracks: project.tracks.map((track) => ({
    ...track,
    clips: track.clips.filter((clip) => clip.id !== clipId),
  })),
});

export const moveClipToTrack = (project, clipId, targetTrackId, start) => {
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
          clips: [...track.clips, {...source, trackId: targetTrackId, start}],
        };
      }
      return track;
    }),
  };
};

export const trimClip = (clip, edge, frame) => {
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

export const snapFrame = (frame, project, excludedClipId, threshold, playhead) => {
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

const addClipToProject = (project, trackId, clip) =>
  ensureProjectDuration({
    ...project,
    tracks: project.tracks.map((track) =>
      track.id === trackId
        ? {...track, clips: [...track.clips, {...clip, trackId}]}
        : track,
    ),
  });

const addTrackToProject = (project, track) => ({
  ...project,
  tracks: [
    ...project.tracks,
    {
      id: track.id ?? createId('track'),
      name: track.name ?? (track.kind === 'audio' ? 'Audio' : 'Layer'),
      kind: track.kind ?? 'visual',
      hidden: Boolean(track.hidden),
      locked: Boolean(track.locked),
      muted: Boolean(track.muted),
      clips: Array.isArray(track.clips) ? track.clips : [],
    },
  ],
});

export const applyProjectOperation = (project, operation) => {
  switch (operation.type) {
    case 'replaceProject':
      return ensureProjectDuration(operation.project);
    case 'updateProject':
      return ensureProjectDuration({...project, ...operation.patch});
    case 'addTrack':
      return addTrackToProject(project, operation.track);
    case 'updateTrack':
      return {
        ...project,
        tracks: project.tracks.map((track) =>
          track.id === operation.trackId ? {...track, ...operation.patch} : track,
        ),
      };
    case 'removeTrack':
      return {
        ...project,
        tracks: project.tracks.filter((track) => track.id !== operation.trackId),
      };
    case 'addClip':
      return addClipToProject(project, operation.trackId, operation.clip);
    case 'updateClip':
      return updateClipInProject(project, operation.clipId, operation.patch);
    case 'moveClip':
      return moveClipToTrack(project, operation.clipId, operation.trackId, operation.start);
    case 'trimClip': {
      const clip = getClip(project, operation.clipId);
      return clip
        ? updateClipInProject(project, operation.clipId, trimClip(clip, operation.edge, operation.frame))
        : project;
    }
    case 'removeClip':
      return removeClipFromProject(project, operation.clipId);
    default:
      throw new Error(`Unsupported project operation: ${operation.type}`);
  }
};

export const applyProjectOperations = (project, operations = []) =>
  operations.reduce(
    (current, operation) => applyProjectOperation(current, operation),
    project,
  );

export const applyDocumentOperation = (document, operation) => {
  if (operation.scope === 'media') {
    const media = document.media ?? {assets: [], folders: []};
    if (operation.type === 'setMedia') {
      return {...document, media: operation.media};
    }
    if (operation.type === 'addAsset') {
      return {...document, media: {...media, assets: [...media.assets, operation.asset]}};
    }
    if (operation.type === 'updateAsset') {
      return {
        ...document,
        media: {
          ...media,
          assets: media.assets.map((asset) =>
            asset.id === operation.assetId ? {...asset, ...operation.patch} : asset,
          ),
        },
      };
    }
    if (operation.type === 'removeAsset') {
      return {
        ...document,
        media: {
          ...media,
          assets: media.assets.filter((asset) => asset.id !== operation.assetId),
        },
      };
    }
    if (operation.type === 'addFolder') {
      return {
        ...document,
        media: {
          ...media,
          folders: [...media.folders, {id: operation.id ?? createId('folder'), name: operation.name}],
        },
      };
    }
    if (operation.type === 'removeFolder') {
      return {
        ...document,
        media: {
          folders: media.folders.filter((folder) => folder.id !== operation.folderId),
          assets: media.assets.map((asset) =>
            asset.folderId === operation.folderId ? {...asset, folderId: null} : asset,
          ),
        },
      };
    }
    throw new Error(`Unsupported media operation: ${operation.type}`);
  }

  return {
    ...document,
    project: applyProjectOperation(document.project, operation),
  };
};

export const applyDocumentOperations = (document, operations = []) =>
  operations.reduce(
    (current, operation) => applyDocumentOperation(current, operation),
    createMosaicoDocument(document),
  );

export const validateProject = (project) => {
  const errors = [];
  if (!project || typeof project !== 'object') errors.push('Project must be an object.');
  if (!project?.id) errors.push('Project requires an id.');
  if (!project?.name) errors.push('Project requires a name.');
  if (!Number.isFinite(project?.width) || project.width <= 0) errors.push('Project width must be positive.');
  if (!Number.isFinite(project?.height) || project.height <= 0) errors.push('Project height must be positive.');
  if (!Number.isFinite(project?.fps) || project.fps <= 0) errors.push('Project fps must be positive.');
  if (!Array.isArray(project?.tracks)) errors.push('Project tracks must be an array.');

  for (const track of project?.tracks || []) {
    if (!track.id) errors.push('Track requires an id.');
    if (!['visual', 'audio'].includes(track.kind)) errors.push(`Track ${track.id} has an invalid kind.`);
    for (const clip of track.clips || []) {
      if (!clip.id) errors.push(`Track ${track.id} has a clip without id.`);
      if (clip.trackId !== track.id) errors.push(`Clip ${clip.id} trackId does not match its track.`);
      if (!Number.isFinite(clip.start) || clip.start < 0) errors.push(`Clip ${clip.id} start must be non-negative.`);
      if (!Number.isFinite(clip.duration) || clip.duration <= 0) errors.push(`Clip ${clip.id} duration must be positive.`);
      if (track.kind === 'audio' && clip.type !== 'audio') errors.push(`Clip ${clip.id} is not valid on an audio track.`);
      if (track.kind === 'visual' && clip.type === 'audio') errors.push(`Clip ${clip.id} is not valid on a visual track.`);
    }
  }

  return {ok: errors.length === 0, errors};
};

export const validateMosaicoDocument = (document) => {
  const normalized = createMosaicoDocument(document);
  const projectValidation = validateProject(normalized.project);
  const errors = [...projectValidation.errors];
  if (normalized.schemaVersion !== MOSAICO_DOCUMENT_VERSION) {
    errors.push(`Unsupported schemaVersion: ${normalized.schemaVersion}`);
  }
  if (!Array.isArray(normalized.media.assets)) errors.push('Media assets must be an array.');
  if (!Array.isArray(normalized.media.folders)) errors.push('Media folders must be an array.');
  return {ok: errors.length === 0, errors};
};
