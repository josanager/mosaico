export type ClipType = 'video' | 'audio' | 'image' | 'text' | 'shape';
export type TrackKind = 'visual' | 'audio';
export type ClipAnimationPreset =
  | 'none'
  | 'fade'
  | 'slide-up'
  | 'slide-left'
  | 'slide-right'
  | 'zoom-in';
export type ClipMotionPreset =
  | 'none'
  | 'slow-zoom-in'
  | 'slow-zoom-out'
  | 'drift-left'
  | 'drift-right'
  | 'drift-up';

export type Clip = {
  id: string;
  trackId: string;
  type: ClipType;
  name: string;
  start: number;
  duration: number;
  sourceStart: number;
  src?: string;
  text?: string;
  color: string;
  opacity: number;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  scale: number;
  fontSize: number;
  fontWeight: number;
  volume: number;
  playbackRate: number;
  fit: 'cover' | 'contain' | 'fill';
  muted?: boolean;
  animationIn?: ClipAnimationPreset;
  animationOut?: ClipAnimationPreset;
  animationInFrames?: number;
  animationOutFrames?: number;
  motionPreset?: ClipMotionPreset;
};

export type Track = {
  id: string;
  name: string;
  kind: TrackKind;
  hidden: boolean;
  locked: boolean;
  muted: boolean;
  clips: Clip[];
};

export type StudioProject = {
  id: string;
  name: string;
  width: number;
  height: number;
  fps: number;
  durationInFrames: number;
  background: string;
  tracks: Track[];
};

export type MediaAsset = {
  id: string;
  name: string;
  src: string;
  type: 'video' | 'audio' | 'image';
  durationInSeconds?: number;
  width?: number;
  height?: number;
  folderId?: string | null;
};

export type MediaFolder = {
  id: string;
  name: string;
};

export type VideoProjectSummary = {
  id: string;
  name: string;
  slug: string;
  createdAt: string;
  updatedAt: string;
  lastOpenedAt: string;
  width: number;
  height: number;
  fps: number;
  durationInFrames: number;
  assetCount: number;
  folderCount: number;
};

export type VideoProjectLibrary = {
  activeProjectId: string | null;
  projects: VideoProjectSummary[];
};

export type RenderSettings = {
  kind: 'video' | 'still' | 'audio' | 'sequence';
  codec: 'h264' | 'h265' | 'vp8' | 'vp9' | 'prores' | 'gif' | 'mp3' | 'wav';
  imageFormat: 'jpeg' | 'png' | 'webp';
  videoImageFormat?: 'jpeg' | 'png' | 'none';
  quality: number;
  frame: number;
  scale: number;
  crf: number | null;
  pixelFormat: string;
  muted: boolean;
  overwrite: boolean;
  outputName: string;
  hardwareAcceleration?: 'disable' | 'if-possible' | 'required';
  videoBitrate?: string | null;
  audioBitrate?: string | null;
  audioCodec?: 'aac' | 'mp3' | 'pcm-16' | 'opus';
  concurrency?: number;
  x264Preset?:
    | 'ultrafast'
    | 'superfast'
    | 'veryfast'
    | 'faster'
    | 'fast'
    | 'medium'
    | 'slow'
    | 'slower'
    | 'veryslow'
    | 'placebo'
    | null;
  gl?: 'angle' | 'angle-egl' | 'egl' | 'swangle' | 'swiftshader' | 'vulkan' | null;
  encodingMaxRate?: string | null;
  encodingBufferSize?: string | null;
};

export type RenderJob = {
  id: string;
  status: 'queued' | 'bundling' | 'rendering' | 'done' | 'error';
  progress: number;
  message: string;
  url?: string;
  durationMs?: number;
  detail?: string;
  appliedSettings?: RenderSettings;
};

export type RenderCapabilities = {
  capabilities: {
    platform: string;
    arch: string;
    appleSilicon: boolean;
    cpuModel: string;
    cpuCount: number;
    totalMemoryBytes: number;
    ffmpegPath: string;
    ffprobePath: string;
    videotoolbox: {
      h264: boolean;
      h265: boolean;
      prores: boolean;
    };
    recommendedConcurrency: number;
  };
  tuning: {
    measuredAt?: string;
    recommended?: Partial<RenderSettings>;
    benchmarks?: Array<{
      name: string;
      durationMs: number;
      success?: boolean;
      settings: Partial<RenderSettings>;
      detail?: string;
    }>;
    selected?: {
      name: string;
      durationMs: number;
      detail?: string;
    };
  } | null;
};
