export {
  MOSAICO_DOCUMENT_VERSION,
  applyDocumentOperation,
  applyDocumentOperations,
  applyProjectOperation,
  applyProjectOperations,
  clamp,
  createEmptyProject,
  createMosaicoDocument,
  ensureProjectDuration,
  getClip,
  getProjectContentEnd,
  moveClipToTrack,
  removeClipFromProject,
  snapFrame,
  trimClip,
  updateClipInProject,
  validateMosaicoDocument,
  validateProject,
} from '../lib/document-core.mjs';

export type {
  MosaicoDocument,
  MosaicoMediaState,
  MosaicoOperation,
  ProjectOperation,
  MediaOperation,
} from '../lib/document-core.mjs';
