import {create} from 'zustand';
import {
  ensureProjectDuration,
  moveClipToTrack,
  removeClipFromProject,
  updateClipInProject,
} from './editor-core';
import {createSampleProject} from './sample-project';
import type {Clip, MediaAsset, StudioProject, Track, MediaFolder} from './types';

type Snapshot = {project: StudioProject; selectedClipId: string | null};

type StudioState = {
  project: StudioProject;
  selectedClipId: string | null;
  currentFrame: number;
  zoom: number;
  assets: MediaAsset[];
  folders: MediaFolder[];
  past: Snapshot[];
  future: Snapshot[];
  setProject: (project: StudioProject) => void;
  setCurrentFrame: (frame: number) => void;
  setZoom: (zoom: number) => void;
  selectClip: (clipId: string | null) => void;
  updateProject: (patch: Partial<StudioProject>) => void;
  updateClip: (clipId: string, patch: Partial<Clip>, history?: boolean) => void;
  commitProject: (project: StudioProject) => void;
  moveClip: (clipId: string, trackId: string, start: number) => void;
  removeSelected: () => void;
  addClip: (trackId: string, clip: Clip) => void;
  addTrack: (kind: Track['kind']) => void;
  toggleTrack: (trackId: string, key: 'hidden' | 'locked' | 'muted') => void;
  addAsset: (asset: MediaAsset) => void;
  setAssets: (assets: MediaAsset[]) => void;
  addFolder: (name: string) => void;
  deleteFolder: (folderId: string) => void;
  moveAssetToFolder: (assetId: string, folderId: string | null) => void;
  setFolders: (folders: MediaFolder[]) => void;
  undo: () => void;
  redo: () => void;
};

const snapshot = (state: StudioState): Snapshot => ({
  project: structuredClone(state.project),
  selectedClipId: state.selectedClipId,
});

export const useStudioStore = create<StudioState>((set, get) => ({
  project: createSampleProject(),
  selectedClipId: null,
  currentFrame: 0,
  zoom: 1,
  assets: [],
  folders: [],
  past: [],
  future: [],
  setProject: (project) =>
    set({
      project: ensureProjectDuration(project),
      selectedClipId: null,
      currentFrame: 0,
      past: [],
      future: [],
    }),
  setCurrentFrame: (frame) =>
    set((state) => ({
      currentFrame: Math.round(
        Math.min(state.project.durationInFrames - 1, Math.max(0, frame)),
      ),
    })),
  setZoom: (zoom) => set({zoom: Math.min(8, Math.max(0.25, zoom))}),
  selectClip: (selectedClipId) => set({selectedClipId}),
  updateProject: (patch) =>
    set((state) => ({
      past: [...state.past.slice(-49), snapshot(state)],
      future: [],
      project: {...state.project, ...patch},
    })),
  updateClip: (clipId, patch, history = true) =>
    set((state) => ({
      past: history ? [...state.past.slice(-49), snapshot(state)] : state.past,
      future: history ? [] : state.future,
      project: updateClipInProject(state.project, clipId, patch),
    })),
  commitProject: (project) =>
    set((state) => ({
      past: [...state.past.slice(-49), snapshot(state)],
      future: [],
      project: ensureProjectDuration(project),
    })),
  moveClip: (clipId, trackId, start) =>
    set((state) => ({
      past: [...state.past.slice(-49), snapshot(state)],
      future: [],
      project: moveClipToTrack(state.project, clipId, trackId, start),
    })),
  removeSelected: () =>
    set((state) => {
      if (!state.selectedClipId) return state;
      return {
        past: [...state.past.slice(-49), snapshot(state)],
        future: [],
        project: removeClipFromProject(state.project, state.selectedClipId),
        selectedClipId: null,
      };
    }),
  addClip: (trackId, clip) =>
    set((state) => ({
      past: [...state.past.slice(-49), snapshot(state)],
      future: [],
      selectedClipId: clip.id,
      project: ensureProjectDuration({
        ...state.project,
        tracks: state.project.tracks.map((track) =>
          track.id === trackId
            ? {...track, clips: [...track.clips, clip]}
            : track,
        ),
      }),
    })),
  addTrack: (kind) =>
    set((state) => {
      const track: Track = {
        id: crypto.randomUUID(),
        name: kind === 'audio' ? 'Audio' : 'Layer',
        kind,
        hidden: false,
        locked: false,
        muted: false,
        clips: [],
      };
      const firstVisualIndex = state.project.tracks.findIndex(
        (item) => item.kind === 'visual',
      );
      const nextTracks = [...state.project.tracks];
      if (kind === 'audio' && firstVisualIndex !== -1) {
        nextTracks.splice(firstVisualIndex, 0, track);
      } else {
        nextTracks.push(track);
      }
      return {
        past: [...state.past.slice(-49), snapshot(state)],
        future: [],
        project: {...state.project, tracks: nextTracks},
      };
    }),
  toggleTrack: (trackId, key) =>
    set((state) => ({
      project: {
        ...state.project,
        tracks: state.project.tracks.map((track) =>
          track.id === trackId ? {...track, [key]: !track[key]} : track,
        ),
      },
    })),
  addAsset: (asset) => set((state) => ({assets: [...state.assets, asset]})),
  setAssets: (assets) => set({assets}),
  addFolder: (name) =>
    set((state) => {
      const folder: MediaFolder = {id: crypto.randomUUID(), name};
      return {folders: [...state.folders, folder]};
    }),
  deleteFolder: (folderId) =>
    set((state) => ({
      folders: state.folders.filter((f) => f.id !== folderId),
      assets: state.assets.map((a) =>
        a.folderId === folderId ? {...a, folderId: null} : a
      ),
    })),
  moveAssetToFolder: (assetId, folderId) =>
    set((state) => ({
      assets: state.assets.map((a) =>
        a.id === assetId ? {...a, folderId} : a
      ),
    })),
  setFolders: (folders) => set({folders}),
  undo: () =>
    set((state) => {
      const previous = state.past.at(-1);
      if (!previous) return state;
      return {
        ...previous,
        past: state.past.slice(0, -1),
        future: [snapshot(state), ...state.future.slice(0, 49)],
      };
    }),
  redo: () =>
    set((state) => {
      const next = state.future[0];
      if (!next) return state;
      return {
        ...next,
        past: [...state.past.slice(-49), snapshot(state)],
        future: state.future.slice(1),
      };
    }),
}));
