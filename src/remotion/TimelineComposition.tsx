import React from 'react';
import {Audio, Video} from '@remotion/media';
import {
  AbsoluteFill,
  Img,
  Sequence,
  interpolate,
  staticFile,
  useCurrentFrame,
} from 'remotion';
import type {Clip, StudioProject} from '../types';

const mediaSource = (src?: string) => {
  if (!src) return '';
  if (src.startsWith('/')) return staticFile(src.slice(1));
  return src;
};

const clampFrames = (value: number | undefined, fallback: number, duration: number) =>
  Math.max(0, Math.min(duration, Math.round(value ?? fallback)));

const getAnimationState = (clip: Clip, frame: number) => {
  let opacity = clip.opacity;
  let translateX = 0;
  let translateY = 0;
  let scale = clip.scale;
  const inFrames = clampFrames(clip.animationInFrames, 12, clip.duration);
  const outFrames = clampFrames(clip.animationOutFrames, 12, clip.duration);
  const inProgress =
    clip.animationIn && clip.animationIn !== 'none' && inFrames > 0
      ? interpolate(frame, [0, inFrames], [0, 1], {
          extrapolateLeft: 'clamp',
          extrapolateRight: 'clamp',
        })
      : 1;
  const outStart = Math.max(0, clip.duration - outFrames);
  const outProgress =
    clip.animationOut && clip.animationOut !== 'none' && outFrames > 0
      ? interpolate(frame, [outStart, clip.duration], [1, 0], {
          extrapolateLeft: 'clamp',
          extrapolateRight: 'clamp',
        })
      : 1;

  const applyPreset = (
    preset: Clip['animationIn'],
    progress: number,
    direction: 'in' | 'out',
  ) => {
    const amount = direction === 'in' ? 1 - progress : progress;
    if (!preset || preset === 'none') return;
    if (preset === 'fade') {
      opacity *= progress;
      return;
    }
    opacity *= Math.max(progress, 0.35);
    if (preset === 'slide-up') {
      translateY += 36 * amount;
    } else if (preset === 'slide-left') {
      translateX += direction === 'in' ? -44 * amount : 44 * amount;
    } else if (preset === 'slide-right') {
      translateX += direction === 'in' ? 44 * amount : -44 * amount;
    } else if (preset === 'zoom-in') {
      scale *= direction === 'in' ? 0.92 + progress * 0.08 : 0.92 + progress * 0.08;
    }
  };

  applyPreset(clip.animationIn, inProgress, 'in');
  applyPreset(clip.animationOut, outProgress, 'out');

  const motionProgress =
    clip.duration > 1
      ? interpolate(frame, [0, clip.duration - 1], [0, 1], {
          extrapolateLeft: 'clamp',
          extrapolateRight: 'clamp',
        })
      : 1;

  if (clip.motionPreset === 'slow-zoom-in') {
    scale *= 1 + motionProgress * 0.08;
  } else if (clip.motionPreset === 'slow-zoom-out') {
    scale *= 1.08 - motionProgress * 0.08;
  } else if (clip.motionPreset === 'drift-left') {
    translateX -= motionProgress * 48;
  } else if (clip.motionPreset === 'drift-right') {
    translateX += motionProgress * 48;
  } else if (clip.motionPreset === 'drift-up') {
    translateY -= motionProgress * 28;
  }

  return {opacity, translateX, translateY, scale};
};

const visualStyle = (
  clip: Clip,
  animation: ReturnType<typeof getAnimationState>,
): React.CSSProperties => ({
  position: 'absolute',
  left: clip.x,
  top: clip.y,
  width: clip.width,
  height: clip.height,
  opacity: animation.opacity,
  transform: `translate(${animation.translateX}px, ${animation.translateY}px) rotate(${clip.rotation}deg) scale(${animation.scale})`,
  transformOrigin: 'center',
  overflow: 'hidden',
});

const ClipContent: React.FC<{clip: Clip; trackMuted: boolean}> = ({
  clip,
  trackMuted,
}) => {
  const frame = useCurrentFrame();
  const animation = getAnimationState(clip, frame);

  if (clip.type === 'video') {
    return (
      <div style={visualStyle(clip, animation)}>
        <Video
          src={mediaSource(clip.src)}
          trimBefore={clip.sourceStart}
          playbackRate={clip.playbackRate}
          volume={trackMuted || clip.muted ? 0 : clip.volume}
          objectFit={clip.fit}
          fallbackOffthreadVideoProps={{
            pauseWhenBuffering: true,
            toneMapped: false,
            transparent: false,
          }}
          style={{width: '100%', height: '100%'}}
        />
      </div>
    );
  }
  if (clip.type === 'audio') {
    return (
      <Audio
        src={mediaSource(clip.src)}
        trimBefore={clip.sourceStart}
        playbackRate={clip.playbackRate}
        volume={trackMuted || clip.muted ? 0 : clip.volume}
        fallbackHtml5AudioProps={{pauseWhenBuffering: true}}
      />
    );
  }
  if (clip.type === 'image') {
    return (
      <Img
        src={mediaSource(clip.src)}
        style={{...visualStyle(clip, animation), objectFit: clip.fit}}
      />
    );
  }
  if (clip.type === 'shape') {
    return <div style={{...visualStyle(clip, animation), background: clip.color}} />;
  }
  return (
    <div
      style={{
        ...visualStyle(clip, animation),
        color: clip.color,
        fontFamily:
          '"SF Pro Display", "Helvetica Neue", Helvetica, sans-serif',
        fontSize: clip.fontSize,
        fontWeight: clip.fontWeight,
        lineHeight: 1.05,
        whiteSpace: 'pre-wrap',
        display: 'flex',
        alignItems: 'center',
      }}
    >
      {clip.text}
    </div>
  );
};

export const TimelineComposition: React.FC<{project: StudioProject}> = ({
  project,
}) => (
  <AbsoluteFill style={{backgroundColor: project.background}}>
    {[...project.tracks].reverse().map((track) =>
      track.hidden
        ? null
        : track.clips.map((clip) => (
            <Sequence
              key={clip.id}
              from={clip.start}
              durationInFrames={clip.duration}
              name={clip.name}
            >
              <ClipContent clip={clip} trackMuted={track.muted} />
            </Sequence>
          )),
    )}
  </AbsoluteFill>
);
