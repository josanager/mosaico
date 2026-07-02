import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './styles.css';
import {useStudioStore} from './store';
import type {ProjectOperation} from './editor-core';

declare global {
  interface Window {
    mosaico: {
      store: typeof useStudioStore;
      getProject: () => any;
      setProject: (project: any) => void;
      updateClip: (clipId: string, patch: any) => void;
      addClip: (trackId: string, clip: any) => void;
      applyOperations: (operations: ProjectOperation[]) => void;
      seekTo: (frame: number) => void;
      getAssets: () => any;
    };
  }
}

window.mosaico = {
  store: useStudioStore,
  getProject: () => useStudioStore.getState().project,
  setProject: (project) => useStudioStore.getState().setProject(project),
  updateClip: (clipId, patch) => useStudioStore.getState().updateClip(clipId, patch),
  addClip: (trackId, clip) => useStudioStore.getState().addClip(trackId, clip),
  applyOperations: (operations) => useStudioStore.getState().applyOperations(operations),
  seekTo: (frame) => {
    // Overridden by App.tsx to include Player sync, but fallback to store update
    useStudioStore.getState().setCurrentFrame(frame);
  },
  getAssets: () => useStudioStore.getState().assets,
};

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
