import {
  Eye,
  EyeOff,
  Film,
  Lock,
  LockOpen,
  Magnet,
  Music2,
  Plus,
  Volume2,
  VolumeX,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import {type CSSProperties, useEffect, useMemo, useRef, useState, memo} from 'react';
import {getProjectContentEnd, snapFrame, trimClip} from '../editor-core';
import {useStudioStore} from '../store';
import type {Clip} from '../types';

const TRACK_HEIGHT = 42;
const RULER_HEIGHT = 25;
const BASE_PPF = 3;

type DragPreview = {
  clipId: string;
  start: number;
  duration: number;
  sourceStart: number;
  trackId: string;
};

const timecode = (frame: number, fps: number) => {
  const total = Math.max(0, Math.floor(frame));
  const hours = Math.floor(total / (fps * 3600));
  const minutes = Math.floor((total / (fps * 60)) % 60);
  const seconds = Math.floor((total / fps) % 60);
  const frames = total % fps;
  return [hours, minutes, seconds, frames]
    .map((value) => String(value).padStart(2, '0'))
    .join(':');
};

const TimelineTime = memo(({fps}: {fps: number}) => {
  const currentFrame = useStudioStore((state) => state.currentFrame);
  return <span className="timeline-time">{timecode(currentFrame, fps)}</span>;
});

const Playhead = memo(
  ({
    ppf,
    duration,
    onPointerDown,
  }: {
    ppf: number;
    duration: number;
    onPointerDown: (event: React.PointerEvent<HTMLDivElement> | PointerEvent) => void;
  }) => {
    const currentFrame = useStudioStore((state) => state.currentFrame);
    return (
      <div
        className="playhead"
        role="slider"
        aria-label="Playhead"
        aria-valuemin={0}
        aria-valuemax={duration - 1}
        aria-valuenow={currentFrame}
        style={{left: currentFrame * ppf}}
        onPointerDown={onPointerDown as any}
      >
        <div className="playhead-cap" />
      </div>
    );
  },
);

export const Timeline = ({onSeek}: {onSeek: (frame: number) => void}) => {
  const {
    project,
    selectedClipId,
    zoom,
    selectClip,
    setZoom,
    moveClip,
    updateClip,
    addTrack,
    toggleTrack,
  } = useStudioStore();
  const [snapEnabled, setSnapEnabled] = useState(true);
  const [preview, setPreview] = useState<DragPreview | null>(null);
  const [dragOverTrackId, setDragOverTrackId] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const headerScrollRef = useRef<HTMLDivElement>(null);
  const dragPlayheadRef = useRef<null | ((event: PointerEvent) => void)>(null);
  const ppf = BASE_PPF * zoom;
  const contentEnd = getProjectContentEnd(project);
  const visibleDuration = Math.max(project.durationInFrames, contentEnd);
  const orderedTracks = useMemo(
    () =>
      project.tracks
        .map((track, index) => ({track, index}))
        .sort((left, right) => {
          if (left.track.kind === right.track.kind) {
            return left.index - right.index;
          }
          return left.track.kind === 'audio' ? -1 : 1;
        })
        .map((item) => item.track),
    [project.tracks],
  );
  const canvasWidth = Math.max(visibleDuration * ppf + 60, 0);
  const canvasHeight = RULER_HEIGHT + orderedTracks.length * TRACK_HEIGHT;
  const major = Math.max(
    project.fps / 2,
    Math.ceil(84 / ppf / project.fps) * project.fps,
  );
  const labeledTicks = useMemo(
    () =>
      Array.from(
        {length: Math.ceil(visibleDuration / major) + 1},
        (_, index) => index * major,
      ),
    [major, visibleDuration],
  );
  const subdivision = major >= project.fps * 4 ? 4 : 2;
  const minorTicks = useMemo(() => {
    const step = major / subdivision;
    if (step <= 0) return [];
    return Array.from(
      {length: Math.ceil(visibleDuration / step) + 1},
      (_, index) => index * step,
    ).filter((frame) => !labeledTicks.includes(frame));
  }, [labeledTicks, major, subdivision, visibleDuration]);

  const frameFromPointer = (clientX: number) => {
    const box = scrollRef.current?.getBoundingClientRect();
    if (!box || !scrollRef.current) return 0;
    return Math.round((clientX - box.left + scrollRef.current.scrollLeft) / ppf);
  };

  useEffect(() => {
    return () => {
      if (!dragPlayheadRef.current) return;
      document.removeEventListener('pointermove', dragPlayheadRef.current);
    };
  }, []);

  const startPlayheadDrag = (event: React.PointerEvent | PointerEvent) => {
    event.preventDefault();
    onSeek(frameFromPointer(event.clientX));

    const move = (pointer: PointerEvent) => {
      onSeek(frameFromPointer(pointer.clientX));
    };

    const up = () => {
      document.removeEventListener('pointermove', move);
      document.removeEventListener('pointerup', up);
      dragPlayheadRef.current = null;
    };

    dragPlayheadRef.current = move;
    document.addEventListener('pointermove', move);
    document.addEventListener('pointerup', up);
  };

  const beginDrag = (
    event: React.PointerEvent,
    clip: Clip,
    mode: 'move' | 'left' | 'right',
  ) => {
    event.stopPropagation();
    selectClip(clip.id);
    const originX = event.clientX;
    const original = {...clip};
    const threshold = Math.max(1, Math.round(5 / ppf));
    const move = (pointer: PointerEvent) => {
      const delta = Math.round((pointer.clientX - originX) / ppf);
      let patch = {
        start: original.start,
        duration: original.duration,
        sourceStart: original.sourceStart,
      };
      if (mode === 'move') {
        let start = Math.max(0, original.start + delta);
        if (snapEnabled) {
          const currentFrameVal = useStudioStore.getState().currentFrame;
          start = snapFrame(start, project, original.id, threshold, currentFrameVal);
        }
        patch.start = start;
      } else {
        patch = {
          ...patch,
          ...trimClip(
            original,
            mode,
            mode === 'left' ? original.start + delta : original.start + original.duration + delta,
          ),
        };
      }
      const trackElement = document
        .elementFromPoint(pointer.clientX, pointer.clientY)
        ?.closest<HTMLElement>('[data-track-id]');
      setPreview({
        clipId: clip.id,
        ...patch,
        trackId: mode === 'move' ? trackElement?.dataset.trackId || original.trackId : original.trackId,
      });
    };
    const up = (pointer: PointerEvent) => {
      document.removeEventListener('pointermove', move);
      document.removeEventListener('pointerup', up);
      setPreview((last) => {
        if (!last) return null;
        if (mode === 'move') {
          moveClip(last.clipId, last.trackId, last.start);
        } else {
          updateClip(last.clipId, {
            start: last.start,
            duration: last.duration,
            sourceStart: last.sourceStart,
          });
        }
        return null;
      });
      pointer.preventDefault();
    };
    document.addEventListener('pointermove', move);
    document.addEventListener('pointerup', up);
  };

  const handleDragOver = (event: React.DragEvent, track: any) => {
    if (track.locked) return;
    const isAsset = event.dataTransfer.types.includes('application/mosaico-asset');
    if (!isAsset) return;
    event.preventDefault();
  };

  const handleDrop = (event: React.DragEvent, trackId: string, trackKind: 'visual' | 'audio') => {
    event.preventDefault();
    try {
      const dataStr = event.dataTransfer.getData('application/mosaico-asset');
      if (!dataStr) return;
      const asset = JSON.parse(dataStr);
      
      const assetKind = asset.type === 'audio' ? 'audio' : 'visual';
      if (assetKind !== trackKind) return;
      
      const startFrame = Math.max(0, frameFromPointer(event.clientX));
      
      const clipId = crypto.randomUUID();
      const clip: Clip = {
        id: clipId,
        trackId,
        type: asset.type,
        name: asset.name,
        start: startFrame,
        duration: asset.type === 'text' || asset.type === 'shape' || asset.type === 'image' ? 150 : 90,
        sourceStart: 0,
        text: asset.type === 'text' ? 'Edit this title' : undefined,
        color: asset.type === 'shape' ? '#7056e8' : '#ffffff',
        opacity: 1,
        x: asset.type === 'text' ? 220 : 560,
        y: asset.type === 'text' ? 430 : 290,
        width: asset.type === 'text' ? 1480 : 800,
        height: asset.type === 'text' ? 220 : 500,
        rotation: 0,
        scale: 1,
        fontSize: 112,
        fontWeight: 700,
        volume: 1,
        playbackRate: 1,
        fit: 'cover',
        animationIn: 'fade',
        animationOut: 'fade',
        animationInFrames: 12,
        animationOutFrames: 12,
        motionPreset: asset.type === 'image' || asset.type === 'video' ? 'slow-zoom-in' : 'none',
      };
      
      if (asset.src) {
        clip.src = asset.src;
        clip.duration =
          asset.type === 'image'
            ? 150
            : Math.max(1, Math.round((asset.durationInSeconds || 3) * project.fps));
        if (asset.width && asset.height) {
          clip.width = Math.min(asset.width, project.width);
          clip.height = Math.min(asset.height, project.height);
          clip.x = (project.width - clip.width) / 2;
          clip.y = (project.height - clip.height) / 2;
        }
      }
      
      useStudioStore.getState().addClip(trackId, clip);
    } catch (err) {
      console.error('Drop handling failed:', err);
    }
  };

  return (
    <section className="timeline">
      <div className="timeline-toolbar">
        <button title="Añadir pista de vídeo" onClick={() => addTrack('visual')}><Film size={14} /></button>
        <button title="Añadir pista de audio" onClick={() => addTrack('audio')}><Music2 size={14} /></button>
        <span className="toolbar-separator" />
        <button className={snapEnabled ? 'active' : ''} title="Snapping" onClick={() => setSnapEnabled(!snapEnabled)}><Magnet size={14} /></button>
        <TimelineTime fps={project.fps} />
        <div className="timeline-zoom">
          <ZoomOut size={13} />
          <input
            type="range"
            min="0.25"
            max="8"
            step="0.25"
            value={zoom}
            onChange={(event) => setZoom(Number(event.target.value))}
          />
          <ZoomIn size={13} />
        </div>
      </div>
      <div className="timeline-grid">
        <div className="track-headers">
          <div className="track-headers-scroll" ref={headerScrollRef}>
            <div className="ruler-corner" />
            {orderedTracks.map((track) => (
              <div className="track-header" key={track.id}>
                {track.kind === 'audio' ? <Music2 size={13} /> : <Film size={13} />}
                <span>{track.name}</span>
                <button title={track.hidden ? 'Show' : 'Hide'} onClick={() => toggleTrack(track.id, 'hidden')}>
                  {track.hidden ? <EyeOff size={12} /> : <Eye size={12} />}
                </button>
                <button title={track.muted ? 'Unmute' : 'Mute'} onClick={() => toggleTrack(track.id, 'muted')}>
                  {track.muted ? <VolumeX size={12} /> : <Volume2 size={12} />}
                </button>
                <button title={track.locked ? 'Unlock' : 'Lock'} onClick={() => toggleTrack(track.id, 'locked')}>
                  {track.locked ? <Lock size={12} /> : <LockOpen size={12} />}
                </button>
              </div>
            ))}
          </div>
        </div>
        <div
          className="timeline-scroll"
          ref={scrollRef}
          onScroll={(event) => {
            if (!headerScrollRef.current) return;
            headerScrollRef.current.scrollTop = event.currentTarget.scrollTop;
          }}
        >
          <div className="timeline-canvas" style={{width: canvasWidth, height: canvasHeight}}>
            <div
              className="ruler"
              onPointerDown={startPlayheadDrag}
            >
              {minorTicks.map((frame) => (
                <div
                  className="ruler-tick minor"
                  key={`minor-${frame}`}
                  style={{left: frame * ppf}}
                />
              ))}
              {labeledTicks.map((frame) => (
                <div
                  className="ruler-tick"
                  key={frame}
                  style={
                    {
                      left: frame * ppf,
                      '--lane-height': `${canvasHeight - RULER_HEIGHT}px`,
                    } as CSSProperties
                  }
                >
                  <span>{timecode(frame, project.fps).slice(3, 8)}</span>
                </div>
              ))}
            </div>
            {orderedTracks.map((track, trackIndex) => (
              <div
                className={`track-lane ${track.locked ? 'locked' : ''} ${dragOverTrackId === track.id ? 'drag-hover' : ''}`}
                data-track-id={track.id}
                key={track.id}
                style={{top: RULER_HEIGHT + trackIndex * TRACK_HEIGHT}}
                onPointerDown={(event) => {
                  if (event.target === event.currentTarget) startPlayheadDrag(event);
                }}
                onDragOver={(event) => handleDragOver(event, track)}
                onDragEnter={() => !track.locked && setDragOverTrackId(track.id)}
                onDragLeave={() => setDragOverTrackId(null)}
                onDrop={(event) => {
                  setDragOverTrackId(null);
                  handleDrop(event, track.id, track.kind);
                }}
              >
                {track.clips.map((clip) => {
                  const ghost = preview?.clipId === clip.id ? preview : null;
                  const display = ghost || clip;
                  const visibleOnTrack = !ghost || ghost.trackId === track.id;
                  if (!visibleOnTrack) return null;
                  return (
                    <div
                      key={clip.id}
                      className={`timeline-clip clip-${clip.type} ${selectedClipId === clip.id ? 'selected' : ''}`}
                      style={{left: display.start * ppf, width: Math.max(8, display.duration * ppf)}}
                      onPointerDown={(event) => !track.locked && beginDrag(event, clip, 'move')}
                      title={`${clip.name} · ${display.duration}f`}
                    >
                      <div className="trim-handle left" onPointerDown={(event) => !track.locked && beginDrag(event, clip, 'left')} />
                      <span>{clip.name}</span>
                      <div className="clip-stripes" />
                      <div className="trim-handle right" onPointerDown={(event) => !track.locked && beginDrag(event, clip, 'right')} />
                    </div>
                  );
                })}
                {preview && preview.trackId === track.id && !track.clips.some((clip) => clip.id === preview.clipId) && (() => {
                  const clip = project.tracks.flatMap((item) => item.clips).find((item) => item.id === preview.clipId);
                  return clip ? (
                    <div className={`timeline-clip clip-${clip.type} selected ghost`} style={{left: preview.start * ppf, width: Math.max(8, preview.duration * ppf)}}>
                      <span>{clip.name}</span>
                    </div>
                  ) : null;
                })()}
              </div>
            ))}
            <Playhead ppf={ppf} duration={project.durationInFrames} onPointerDown={startPlayheadDrag} />
          </div>
        </div>
      </div>
    </section>
  );
};
