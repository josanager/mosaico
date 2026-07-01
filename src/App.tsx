import {Player, type PlayerRef} from '@remotion/player';
import {
  Maximize2,
  Minus,
  FolderOpen,
  Pause,
  Play,
  Plus,
  Redo2,
  Rocket,
  RotateCcw,
  Save,
  SkipBack,
  SkipForward,
  Undo2,
  Volume2,
  VolumeX,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import React, {useCallback, useEffect, useMemo, useRef, useState, memo} from 'react';
import {Inspector} from './components/Inspector';
import {MediaPanel} from './components/MediaPanel';
import {ProjectManagerDialog} from './components/ProjectManagerDialog';
import {RenderDialog} from './components/RenderDialog';
import {Timeline} from './components/Timeline';
import {TimelineComposition} from './remotion/TimelineComposition';
import {createSampleProject} from './sample-project';
import {useStudioStore} from './store';
import type {MediaAsset, MediaFolder, StudioProject, VideoProjectLibrary} from './types';

const formatFrame = (frame: number, fps: number) => {
  const seconds = Math.floor(frame / fps);
  return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}:${String(frame % fps).padStart(2, '0')}`;
};

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

const FrameReadout = memo(({fps}: {fps: number}) => {
  const currentFrame = useStudioStore((state) => state.currentFrame);
  return <span className="frame-readout">{formatFrame(currentFrame, fps)}</span>;
});

const FrameCount = memo(({duration}: {duration: number}) => {
  const currentFrame = useStudioStore((state) => state.currentFrame);
  return <span className="frame-count">{currentFrame} / {duration - 1}</span>;
});

export default function App() {
  const {
    project,
    selectedClipId,
    setProject,
    setCurrentFrame,
    setAssets,
    assets,
    folders,
    removeSelected,
    undo,
    redo,
  } = useStudioStore();
  const playerRef = useRef<PlayerRef | null>(null);
  const playerStageRef = useRef<HTMLDivElement | null>(null);
  const compositionCounterRef = useRef(2);
  const projectLoadedRef = useRef(false);
  const mediaLoadedRef = useRef(false);
  const [playerInstance, setPlayerInstance] = useState<PlayerRef | null>(null);
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(false);
  const [renderOpen, setRenderOpen] = useState(false);
  const [projectManagerOpen, setProjectManagerOpen] = useState(false);
  const [saved, setSaved] = useState(true);
  const [playerBounds, setPlayerBounds] = useState({width: 0, height: 0});
  const [leftPanelWidth, setLeftPanelWidth] = useState(224);
  const [inspectorWidth, setInspectorWidth] = useState(278);
  const [timelineHeight, setTimelineHeight] = useState(286);
  const [previewZoom, setPreviewZoom] = useState(1);
  const [leftPanelCollapsed, setLeftPanelCollapsed] = useState(false);
  const [inspectorCollapsed, setInspectorCollapsed] = useState(false);
  const [projectLibrary, setProjectLibrary] = useState<VideoProjectLibrary | null>(null);
  const [projectActionBusy, setProjectActionBusy] = useState(false);
  const [newVideoProjectName, setNewVideoProjectName] = useState('Nuevo proyecto de video');
  const [newVideoProjectPreset, setNewVideoProjectPreset] = useState<'landscape' | 'portrait'>('landscape');
  const playerInputProps = useMemo(() => ({project}), [project]);
  const assignPlayerRef = useCallback((instance: PlayerRef | null) => {
    playerRef.current = instance;
    setPlayerInstance(instance);
  }, []);

  const seek = useCallback(
    (frame: number) => {
      const next = Math.max(0, Math.min(project.durationInFrames - 1, Math.round(frame)));
      playerRef.current?.seekTo(next);
      setCurrentFrame(next);
    },
    [project.durationInFrames, setCurrentFrame],
  );

  useEffect(() => {
    if (window.mosaico) {
      window.mosaico.seekTo = seek;
    }
  }, [seek]);

  const togglePlayback = useCallback((event?: React.SyntheticEvent) => {
    if (playing) {
      playerRef.current?.pause();
      setPlaying(false);
    } else {
      playerRef.current?.play(event);
      setPlaying(true);
    }
  }, [playing]);

  const save = useCallback(async () => {
    await fetch('/api/project', {
      method: 'PUT',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify(project),
    });
    setSaved(true);
  }, [project]);

  const toggleMute = useCallback(() => {
    setMuted((value) => {
      const nextMuted = !value;
      if (nextMuted) playerRef.current?.mute();
      else playerRef.current?.unmute();
      return nextMuted;
    });
  }, []);

  const adjustPreviewZoom = useCallback((delta: number) => {
    setPreviewZoom((value) => clamp(Number((value + delta).toFixed(2)), 0.5, 2.5));
  }, []);

  const resetPreviewZoom = useCallback(() => {
    setPreviewZoom(1);
  }, []);

  const createComposition = useCallback(
    (preset: 'landscape' | 'portrait' = 'landscape') => {
      const index = compositionCounterRef.current++;
      const nextProject = createSampleProject({
        name: `Composition ${index}`,
        width: preset === 'portrait' ? 1080 : 1920,
        height: preset === 'portrait' ? 1920 : 1080,
        durationInFrames: project.durationInFrames,
        fps: project.fps,
        background: project.background,
      });
      setProject(nextProject);
      setPreviewZoom(1);
      setPlaying(false);
    },
    [project.background, project.durationInFrames, project.fps, setProject],
  );

  const startResize = useCallback(
    (
      event: React.PointerEvent,
      axis: 'left-panel' | 'inspector' | 'timeline',
    ) => {
      event.preventDefault();
      const originX = event.clientX;
      const originY = event.clientY;
      const initialLeft = leftPanelWidth;
      const initialRight = inspectorWidth;
      const initialTimeline = timelineHeight;

      const move = (pointer: PointerEvent) => {
        if (axis === 'left-panel') {
          setLeftPanelWidth(
            clamp(initialLeft + (pointer.clientX - originX), 188, 420),
          );
          return;
        }
        if (axis === 'inspector') {
          setInspectorWidth(
            clamp(initialRight - (pointer.clientX - originX), 240, 420),
          );
          return;
        }
        setTimelineHeight(
          clamp(initialTimeline - (pointer.clientY - originY), 220, 520),
        );
      };

      const up = () => {
        document.removeEventListener('pointermove', move);
        document.removeEventListener('pointerup', up);
      };

      document.addEventListener('pointermove', move);
      document.addEventListener('pointerup', up);
    },
    [inspectorWidth, leftPanelWidth, timelineHeight],
  );

  const saveMedia = useCallback(async () => {
    await fetch('/api/media', {
      method: 'PUT',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({assets, folders}),
    });
  }, [assets, folders]);

  const loadProjectWorkspace = useCallback(async () => {
    const [libraryResponse, projectResponse, mediaResponse] = await Promise.all([
      fetch('/api/projects'),
      fetch('/api/project'),
      fetch('/api/media'),
    ]);

    if (libraryResponse.ok) {
      setProjectLibrary((await libraryResponse.json()) as VideoProjectLibrary);
    }
    if (projectResponse.ok) {
      setProject((await projectResponse.json()) as StudioProject);
    }
    if (mediaResponse.ok) {
      const data = await mediaResponse.json();
      setAssets(data.assets || []);
      useStudioStore.getState().setFolders(data.folders || []);
    }
  }, [setAssets, setProject]);

  const applyProjectWorkspace = useCallback((
    payload: {
      library?: VideoProjectLibrary;
      project: StudioProject;
      media: {assets?: MediaAsset[]; folders?: MediaFolder[]};
    },
  ) => {
    if (payload.library) setProjectLibrary(payload.library);
    setProject(payload.project);
    setAssets(payload.media.assets || []);
    useStudioStore.getState().setFolders(payload.media.folders || []);
    setSaved(true);
    setProjectManagerOpen(false);
  }, [setAssets, setProject]);

  const createVideoProject = useCallback(async () => {
    if (!newVideoProjectName.trim()) return;
    setProjectActionBusy(true);
    try {
      const response = await fetch('/api/projects', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({
          name: newVideoProjectName.trim(),
          preset: newVideoProjectPreset,
        }),
      });
      if (!response.ok) throw new Error('No se pudo crear el proyecto.');
      applyProjectWorkspace(await response.json());
    } finally {
      setProjectActionBusy(false);
    }
  }, [applyProjectWorkspace, newVideoProjectName, newVideoProjectPreset]);

  const openVideoProject = useCallback(async (projectId: string) => {
    setProjectActionBusy(true);
    try {
      const response = await fetch(`/api/projects/${projectId}/open`, {
        method: 'POST',
      });
      if (!response.ok) throw new Error('No se pudo abrir el proyecto.');
      applyProjectWorkspace(await response.json());
    } finally {
      setProjectActionBusy(false);
    }
  }, [applyProjectWorkspace]);

  useEffect(() => {
    void loadProjectWorkspace()
      .finally(() => {
        projectLoadedRef.current = true;
        mediaLoadedRef.current = true;
      });
  }, [loadProjectWorkspace]);

  useEffect(() => {
    if (!projectLoadedRef.current) return;
    setSaved(false);
    const timer = window.setTimeout(() => void save(), 900);
    return () => window.clearTimeout(timer);
  }, [project, save]);

  useEffect(() => {
    if (!mediaLoadedRef.current) return;
    const timer = window.setTimeout(() => void saveMedia(), 900);
    return () => window.clearTimeout(timer);
  }, [assets, folders, saveMedia]);

  useEffect(() => {
    const player = playerInstance;
    if (!player) return;
    const frameUpdate = (event: {detail: {frame: number}}) => setCurrentFrame(event.detail.frame);
    const onEnded = () => setPlaying(false);
    player.addEventListener('frameupdate', frameUpdate);
    player.addEventListener('ended', onEnded);
    return () => {
      player.removeEventListener('frameupdate', frameUpdate);
      player.removeEventListener('ended', onEnded);
    };
  }, [setCurrentFrame, playerInstance]);

  useEffect(() => {
    const player = playerInstance;
    if (!player) return;
    if (muted) player.mute();
    else player.unmute();
  }, [muted, playerInstance]);

  useEffect(() => {
    const stage = playerStageRef.current;
    if (!stage) return;

    const update = () => {
      const styles = window.getComputedStyle(stage);
      const horizontalPadding =
        Number.parseFloat(styles.paddingLeft) +
        Number.parseFloat(styles.paddingRight);
      const verticalPadding =
        Number.parseFloat(styles.paddingTop) +
        Number.parseFloat(styles.paddingBottom);
      const nextWidth = Math.max(0, stage.clientWidth - horizontalPadding);
      const nextHeight = Math.max(0, stage.clientHeight - verticalPadding);
      setPlayerBounds((current) =>
        current.width === nextWidth && current.height === nextHeight
          ? current
          : {width: nextWidth, height: nextHeight},
      );
    };

    update();
    const observer = new ResizeObserver(update);
    observer.observe(stage);
    return () => observer.disconnect();
  }, []);

  const playerFrameStyle = useMemo(() => {
    const aspect = project.width / project.height;
    const stageWidth = playerBounds.width;
    const stageHeight = playerBounds.height;

    if (!stageWidth || !stageHeight || !aspect) {
      return {
        aspectRatio: `${project.width}/${project.height}`,
        transform: `scale(${previewZoom})`,
        transformOrigin: 'center',
      };
    }

    const stageAspect = stageWidth / stageHeight;
    const fitWidth = stageAspect > aspect ? stageHeight * aspect : stageWidth;
    const fitHeight = stageAspect > aspect ? stageHeight : stageWidth / aspect;

    return {
      width: fitWidth * previewZoom,
      height: fitHeight * previewZoom,
      aspectRatio: `${project.width}/${project.height}`,
    };
  }, [playerBounds.height, playerBounds.width, previewZoom, project.height, project.width]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return;
      const command = event.metaKey || event.ctrlKey;
      if (event.code === 'Space') {
        event.preventDefault();
        togglePlayback();
      } else if (event.key === 'ArrowLeft') {
        event.preventDefault();
        const currentFrameVal = useStudioStore.getState().currentFrame;
        seek(currentFrameVal - (event.shiftKey ? 10 : 1));
      } else if (event.key === 'ArrowRight') {
        event.preventDefault();
        const currentFrameVal = useStudioStore.getState().currentFrame;
        seek(currentFrameVal + (event.shiftKey ? 10 : 1));
      } else if ((event.key === 'Backspace' || event.key === 'Delete') && selectedClipId) {
        removeSelected();
      } else if (command && event.key.toLowerCase() === 'z') {
        event.preventDefault();
        if (event.shiftKey) redo();
        else undo();
      } else if (command && event.key.toLowerCase() === 's') {
        event.preventDefault();
        void save();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [redo, removeSelected, save, seek, selectedClipId, togglePlayback, undo]);

  return (
    <main
      className="studio-shell"
      style={{gridTemplateRows: `34px minmax(260px, 1fr) 6px ${timelineHeight}px`}}
    >
      <header className="topbar">
        <div className="brand-mark">M</div>
        <div className="project-title">
          <span>{project.name}</span>
          <span className={saved ? 'save-dot saved' : 'save-dot'} title={saved ? 'Saved' : 'Saving'} />
        </div>
        <div className="top-actions">
          <button className="project-access-button" title="Crear o abrir proyectos" onClick={() => setProjectManagerOpen(true)}>
            <FolderOpen size={13} />
            <span>Proyectos</span>
          </button>
          <button className="icon-button" title="Undo" onClick={undo}><Undo2 size={14} /></button>
          <button className="icon-button" title="Redo" onClick={redo}><Redo2 size={14} /></button>
          <button className="icon-button" title="Save" onClick={() => void save()}><Save size={14} /></button>
          <button className="icon-button render-button" title="Render project" onClick={() => setRenderOpen(true)}><Rocket size={14} /></button>
        </div>
      </header>

      <div
        className="workspace"
        style={{
          gridTemplateColumns: `${leftPanelCollapsed ? 0 : leftPanelWidth}px ${leftPanelCollapsed ? 0 : 6}px minmax(320px, 1fr) ${inspectorCollapsed ? 0 : 6}px ${inspectorCollapsed ? 0 : inspectorWidth}px`,
        }}
      >
        <div style={{display: leftPanelCollapsed ? 'none' : 'contents'}}>
          <MediaPanel
            previewMuted={muted}
            onTogglePreviewMute={toggleMute}
            onCreateComposition={createComposition}
            onCollapse={() => setLeftPanelCollapsed(true)}
          />
        </div>
        {!leftPanelCollapsed && (
          <div
            className="panel-resizer vertical"
            role="separator"
            aria-label="Resize left panel"
            onPointerDown={(event) => startResize(event, 'left-panel')}
          />
        )}
        <section className="center-stage">
          <div className="preview-toolbar">
            <div className="preview-toolbar-group">
              <span className="preview-label">Canvas</span>
              <span>{project.width} × {project.height}</span>
            </div>
            <div className="preview-toolbar-group preview-toolbar-center">
              <button className="toolbar-chip" onClick={resetPreviewZoom}>Fit</button>
              <button className="icon-button" title="Zoom out" onClick={() => adjustPreviewZoom(-0.1)}><Minus size={13} /></button>
              <span className="preview-zoom-value">{Math.round(previewZoom * 100)}%</span>
              <button className="icon-button" title="Zoom in" onClick={() => adjustPreviewZoom(0.1)}><Plus size={13} /></button>
            </div>
            <div className="preview-toolbar-group preview-toolbar-actions">
              <button className="icon-button" title={muted ? 'Enable audio' : 'Mute preview'} onClick={toggleMute}>
                {muted ? <VolumeX size={13} /> : <Volume2 size={13} />}
              </button>
              <button className="icon-button" title="Fullscreen" onClick={() => document.querySelector('.player-frame')?.requestFullscreen()}><Maximize2 size={13} /></button>
            </div>
          </div>
          <div className="preview-area" onPointerDown={() => useStudioStore.getState().selectClip(null)}>
            <div className="player-stage" ref={playerStageRef}>
              <div className="player-frame" style={playerFrameStyle}>
                <Player
                  ref={assignPlayerRef}
                  component={TimelineComposition}
                  inputProps={playerInputProps}
                  durationInFrames={project.durationInFrames}
                  fps={project.fps}
                  compositionWidth={project.width}
                  compositionHeight={project.height}
                  controls={false}
                  clickToPlay={false}
                  loop={false}
                  acknowledgeRemotionLicense
                  style={{width: '100%', height: '100%'}}
                />
              </div>
            </div>
          </div>
          <div className="transport">
            <FrameReadout fps={project.fps} />
            <div className="transport-controls">
              <button title="First frame" onClick={() => seek(0)}><SkipBack size={14} /></button>
              <button title="Previous frame" onClick={() => seek(useStudioStore.getState().currentFrame - 1)}><RotateCcw size={14} /></button>
              <button className="play-button" title="Play / pause" onClick={(event) => togglePlayback(event)}>{playing ? <Pause size={15} fill="currentColor" /> : <Play size={15} fill="currentColor" />}</button>
              <button title="Next frame" onClick={() => seek(useStudioStore.getState().currentFrame + 1)}><SkipForward size={14} /></button>
              <button title={muted ? 'Enable audio' : 'Mute preview'} onClick={toggleMute}>{muted ? <VolumeX size={14} /> : <Volume2 size={14} />}</button>
            </div>
            <FrameCount duration={project.durationInFrames} />
          </div>
        </section>
        {!inspectorCollapsed && (
          <div
            className="panel-resizer vertical"
            role="separator"
            aria-label="Resize inspector"
            onPointerDown={(event) => startResize(event, 'inspector')}
          />
        )}
        <div style={{display: inspectorCollapsed ? 'none' : 'contents'}}>
          <Inspector onCollapse={() => setInspectorCollapsed(true)} />
        </div>
        {leftPanelCollapsed && (
          <button
            className="expand-panel-btn left"
            title="Expand Media Panel"
            onClick={() => setLeftPanelCollapsed(false)}
          >
            <ChevronRight size={12} />
          </button>
        )}
        {inspectorCollapsed && (
          <button
            className="expand-panel-btn right"
            title="Expand Inspector"
            onClick={() => setInspectorCollapsed(false)}
          >
            <ChevronLeft size={12} />
          </button>
        )}
      </div>
      <div
        className="panel-resizer horizontal"
        role="separator"
        aria-label="Resize timeline"
        onPointerDown={(event) => startResize(event, 'timeline')}
      />
      <Timeline onSeek={seek} />
      {projectManagerOpen && (
        <ProjectManagerDialog
          activeProjectId={projectLibrary?.activeProjectId || null}
          createName={newVideoProjectName}
          createPreset={newVideoProjectPreset}
          isBusy={projectActionBusy}
          library={projectLibrary}
          onChangeCreateName={setNewVideoProjectName}
          onChangeCreatePreset={setNewVideoProjectPreset}
          onClose={() => setProjectManagerOpen(false)}
          onCreateProject={() => void createVideoProject()}
          onOpenProject={(projectId) => void openVideoProject(projectId)}
        />
      )}
      {renderOpen && <RenderDialog onClose={() => setRenderOpen(false)} />}
    </main>
  );
}
