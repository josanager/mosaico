import type {
  Clip,
  MediaAsset,
  MediaFolder,
  StudioProject,
  Track,
} from '../src/types';

export const MOSAICO_DOCUMENT_VERSION: 1;

export type MosaicoMediaState = {
  assets: MediaAsset[];
  folders: MediaFolder[];
};

export type MosaicoDocument = {
  schemaVersion: 1;
  project: StudioProject;
  media: MosaicoMediaState;
  metadata?: Record<string, unknown>;
};

export type ProjectOperation =
  | {type: 'replaceProject'; project: StudioProject}
  | {type: 'updateProject'; patch: Partial<StudioProject>}
  | {type: 'addTrack'; track: Partial<Track> & Pick<Track, 'kind'>}
  | {type: 'updateTrack'; trackId: string; patch: Partial<Track>}
  | {type: 'removeTrack'; trackId: string}
  | {type: 'addClip'; trackId: string; clip: Clip}
  | {type: 'updateClip'; clipId: string; patch: Partial<Clip>}
  | {type: 'moveClip'; clipId: string; trackId: string; start: number}
  | {type: 'trimClip'; clipId: string; edge: 'left' | 'right'; frame: number}
  | {type: 'removeClip'; clipId: string};

export type MediaOperation =
  | {scope: 'media'; type: 'setMedia'; media: MosaicoMediaState}
  | {scope: 'media'; type: 'addAsset'; asset: MediaAsset}
  | {scope: 'media'; type: 'updateAsset'; assetId: string; patch: Partial<MediaAsset>}
  | {scope: 'media'; type: 'removeAsset'; assetId: string}
  | {scope: 'media'; type: 'addFolder'; id?: string; name: string}
  | {scope: 'media'; type: 'removeFolder'; folderId: string};

export type MosaicoOperation = ProjectOperation | MediaOperation;

export function clamp(value: number, min: number, max: number): number;
export function createEmptyProject(options?: Partial<StudioProject> & {preset?: 'landscape' | 'portrait'}): StudioProject;
export function createMosaicoDocument(input?: Partial<MosaicoDocument>): MosaicoDocument;
export function getClip(project: StudioProject, clipId: string): Clip | null;
export function getProjectContentEnd(project: StudioProject): number;
export function ensureProjectDuration(project: StudioProject, minimumFrames?: number): StudioProject;
export function updateClipInProject(project: StudioProject, clipId: string, patch: Partial<Clip>): StudioProject;
export function removeClipFromProject(project: StudioProject, clipId: string): StudioProject;
export function moveClipToTrack(project: StudioProject, clipId: string, targetTrackId: string, start: number): StudioProject;
export function trimClip(clip: Clip, edge: 'left' | 'right', frame: number): Partial<Clip>;
export function snapFrame(frame: number, project: StudioProject, excludedClipId: string, threshold: number, playhead: number): number;
export function applyProjectOperation(project: StudioProject, operation: ProjectOperation): StudioProject;
export function applyProjectOperations(project: StudioProject, operations?: ProjectOperation[]): StudioProject;
export function applyDocumentOperation(document: MosaicoDocument, operation: MosaicoOperation): MosaicoDocument;
export function applyDocumentOperations(document: MosaicoDocument, operations?: MosaicoOperation[]): MosaicoDocument;
export function validateProject(project: StudioProject): {ok: boolean; errors: string[]};
export function validateMosaicoDocument(document: MosaicoDocument): {ok: boolean; errors: string[]};
