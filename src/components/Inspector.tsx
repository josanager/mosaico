import {SlidersHorizontal, Trash2, ChevronRight} from 'lucide-react';
import {getClip} from '../editor-core';
import {useStudioStore} from '../store';
import type {ClipAnimationPreset, ClipMotionPreset} from '../types';

const NumberField = ({
  label,
  value,
  onChange,
  step = 1,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  step?: number;
}) => (
  <label className="field compact">
    <span>{label}</span>
    <input
      type="number"
      value={Number.isFinite(value) ? Number(value.toFixed(3)) : 0}
      step={step}
      onChange={(event) => onChange(Number(event.target.value))}
    />
  </label>
);

const animationOptions: Array<{value: ClipAnimationPreset; label: string}> = [
  {value: 'none', label: 'None'},
  {value: 'fade', label: 'Fade'},
  {value: 'slide-up', label: 'Slide up'},
  {value: 'slide-left', label: 'Slide left'},
  {value: 'slide-right', label: 'Slide right'},
  {value: 'zoom-in', label: 'Zoom in'},
];

const motionOptions: Array<{value: ClipMotionPreset; label: string}> = [
  {value: 'none', label: 'None'},
  {value: 'slow-zoom-in', label: 'Slow zoom in'},
  {value: 'slow-zoom-out', label: 'Slow zoom out'},
  {value: 'drift-left', label: 'Drift left'},
  {value: 'drift-right', label: 'Drift right'},
  {value: 'drift-up', label: 'Drift up'},
];

export const Inspector = ({onCollapse}: {onCollapse?: () => void}) => {
  const {
    project,
    selectedClipId,
    updateClip,
    updateProject,
    removeSelected,
  } = useStudioStore();
  const clip = selectedClipId ? getClip(project, selectedClipId) : null;

  if (!clip) {
    return (
      <aside className="inspector">
        <div className="inspector-title">
          <SlidersHorizontal size={14} /> Composition
          {onCollapse && (
            <button className="icon-button" title="Collapse Panel" onClick={onCollapse} style={{marginLeft: 'auto'}}>
              <ChevronRight size={13} />
            </button>
          )}
        </div>
        <div className="inspector-body">
          <label className="field">
            <span>Name</span>
            <input
              value={project.name}
              onChange={(event) => updateProject({name: event.target.value})}
            />
          </label>
          <div className="field-grid">
            <NumberField label="W" value={project.width} onChange={(width) => updateProject({width})} />
            <NumberField label="H" value={project.height} onChange={(height) => updateProject({height})} />
          </div>
          <div className="field-grid">
            <NumberField label="FPS" value={project.fps} onChange={(fps) => updateProject({fps})} />
            <NumberField
              label="Frames"
              value={project.durationInFrames}
              onChange={(durationInFrames) => updateProject({durationInFrames})}
            />
          </div>
          <label className="field">
            <span>Background</span>
            <div className="color-field">
              <input
                type="color"
                value={project.background}
                onChange={(event) => updateProject({background: event.target.value})}
              />
              <input
                value={project.background}
                onChange={(event) => updateProject({background: event.target.value})}
              />
            </div>
          </label>
        </div>
      </aside>
    );
  }

  const patch = (key: string, value: unknown) =>
    updateClip(clip.id, {[key]: value});

  return (
    <aside className="inspector">
      <div className="inspector-title">
        <SlidersHorizontal size={14} />
        <span className="truncate">{clip.name}</span>
        {onCollapse && (
          <button className="icon-button" title="Collapse Panel" onClick={onCollapse} style={{marginLeft: 'auto'}}>
            <ChevronRight size={13} />
          </button>
        )}
        <button className="icon-button danger" title="Delete" onClick={removeSelected} style={onCollapse ? {} : {marginLeft: 'auto'}}>
          <Trash2 size={14} />
        </button>
      </div>
      <div className="inspector-body">
        <label className="field">
          <span>Name</span>
          <input value={clip.name} onChange={(event) => patch('name', event.target.value)} />
        </label>
        {clip.type === 'text' && (
          <label className="field">
            <span>Text</span>
            <textarea value={clip.text} onChange={(event) => patch('text', event.target.value)} />
          </label>
        )}
        <div className="section-label">Transform</div>
        <div className="field-grid">
          <NumberField label="X" value={clip.x} onChange={(value) => patch('x', value)} />
          <NumberField label="Y" value={clip.y} onChange={(value) => patch('y', value)} />
          <NumberField label="W" value={clip.width} onChange={(value) => patch('width', value)} />
          <NumberField label="H" value={clip.height} onChange={(value) => patch('height', value)} />
          <NumberField label="Scale" value={clip.scale} step={0.05} onChange={(value) => patch('scale', value)} />
          <NumberField label="Rotate" value={clip.rotation} onChange={(value) => patch('rotation', value)} />
        </div>
        <div className="section-label">Timing</div>
        <div className="field-grid">
          <NumberField label="Start" value={clip.start} onChange={(value) => patch('start', value)} />
          <NumberField label="Length" value={clip.duration} onChange={(value) => patch('duration', value)} />
          <NumberField label="In" value={clip.sourceStart} onChange={(value) => patch('sourceStart', value)} />
          <NumberField label="Speed" value={clip.playbackRate} step={0.05} onChange={(value) => patch('playbackRate', value)} />
        </div>
        <div className="section-label">Appearance</div>
        {(clip.type === 'text' || clip.type === 'shape') && (
          <label className="field">
            <span>Color</span>
            <div className="color-field">
              <input type="color" value={clip.color} onChange={(event) => patch('color', event.target.value)} />
              <input value={clip.color} onChange={(event) => patch('color', event.target.value)} />
            </div>
          </label>
        )}
        <NumberField label="Opacity" value={clip.opacity} step={0.05} onChange={(value) => patch('opacity', value)} />
        {clip.type === 'text' && (
          <div className="field-grid">
            <NumberField label="Size" value={clip.fontSize} onChange={(value) => patch('fontSize', value)} />
            <NumberField label="Weight" value={clip.fontWeight} step={100} onChange={(value) => patch('fontWeight', value)} />
          </div>
        )}
        {clip.type !== 'audio' && (
          <>
            <div className="section-label">Animation</div>
            <label className="field">
              <span>In</span>
              <select
                value={clip.animationIn ?? 'none'}
                onChange={(event) => patch('animationIn', event.target.value)}
              >
                {animationOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Out</span>
              <select
                value={clip.animationOut ?? 'none'}
                onChange={(event) => patch('animationOut', event.target.value)}
              >
                {animationOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <div className="field-grid">
              <NumberField
                label="In f"
                value={clip.animationInFrames ?? 12}
                onChange={(value) => patch('animationInFrames', value)}
              />
              <NumberField
                label="Out f"
                value={clip.animationOutFrames ?? 12}
                onChange={(value) => patch('animationOutFrames', value)}
              />
            </div>
            <label className="field">
              <span>Motion</span>
              <select
                value={clip.motionPreset ?? 'none'}
                onChange={(event) => patch('motionPreset', event.target.value)}
              >
                {motionOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          </>
        )}
        {(clip.type === 'video' || clip.type === 'audio') && (
          <NumberField label="Volume" value={clip.volume} step={0.05} onChange={(value) => patch('volume', value)} />
        )}
        {(clip.type === 'video' || clip.type === 'image') && (
          <label className="field">
            <span>Fit</span>
            <select value={clip.fit} onChange={(event) => patch('fit', event.target.value)}>
              <option value="cover">Cover</option>
              <option value="contain">Contain</option>
              <option value="fill">Fill</option>
            </select>
          </label>
        )}
      </div>
    </aside>
  );
};
