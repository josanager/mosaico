import archiver from 'archiver';
import {bundle} from '@remotion/bundler';
import {
  renderFrames,
  renderMedia,
  renderStill,
  selectComposition,
} from '@remotion/renderer';
import {execFile} from 'node:child_process';
import {createWriteStream} from 'node:fs';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {performance} from 'node:perf_hooks';
import {promisify} from 'node:util';
import {fileURLToPath} from 'node:url';

const execFileAsync = promisify(execFile);

const here = path.dirname(fileURLToPath(import.meta.url));
export const packageRoot = path.resolve(here, '..');
export const workspaceRoot = path.resolve(
  process.env.MOSAICO_WORKSPACE_DIR || process.cwd(),
);
export const root = workspaceRoot;
export const mediaDir = path.join(workspaceRoot, 'public', 'media');
export const rendersDir = path.join(workspaceRoot, 'renders');
export const projectDir = path.join(workspaceRoot, 'projects');
export const projectLibraryDir = path.join(projectDir, 'video-projects');
export const projectFile = path.join(projectDir, 'current.json');
export const mediaIndexFile = path.join(projectDir, 'media.json');
export const projectIndexFile = path.join(projectDir, 'projects-index.json');
export const renderTuningFile = path.join(projectDir, 'render-tuning.json');

const ffmpegPath = process.env.FFMPEG_PATH ?? 'ffmpeg';
const ffprobePath = process.env.FFPROBE_PATH ?? 'ffprobe';
const VIDEO_TOOLBOX_CODECS = new Set(['h264', 'h265', 'prores']);
const GPU_RENDERERS = new Set(['angle', 'angle-egl']);
const X264_PRESETS = new Set([
  'ultrafast',
  'superfast',
  'veryfast',
  'faster',
  'fast',
  'medium',
  'slow',
  'slower',
  'veryslow',
  'placebo',
]);

let bundlePromise;
let capabilitiesPromise;

export const ensureWorkspaceDirs = async () => {
  await Promise.all([
    fs.mkdir(mediaDir, {recursive: true}),
    fs.mkdir(rendersDir, {recursive: true}),
    fs.mkdir(projectDir, {recursive: true}),
    fs.mkdir(projectLibraryDir, {recursive: true}),
  ]);
};

export const safeName = (name) =>
  String(name || 'render')
    .normalize('NFKD')
    .replace(/[^\w.-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 100);

const zipDirectory = async (source, output) =>
  new Promise((resolve, reject) => {
    const archive = archiver('zip', {zlib: {level: 6}});
    const stream = createWriteStream(output);
    stream.on('close', resolve);
    archive.on('error', reject);
    archive.pipe(stream);
    archive.directory(source, false);
    archive.finalize();
  });

const readJson = async (file, fallback) => {
  try {
    return JSON.parse(await fs.readFile(file, 'utf8'));
  } catch {
    return fallback;
  }
};

const getBundle = () => {
  if (!bundlePromise) {
    bundlePromise = bundle({
      entryPoint: path.join(packageRoot, 'src', 'remotion', 'index.tsx'),
      onProgress: () => undefined,
    }).catch((error) => {
      bundlePromise = undefined;
      throw error;
    });
  }
  return bundlePromise;
};

const clampConcurrency = (value, cpuCount, fallback) => {
  const raw = Number.isFinite(value) ? Math.floor(value) : fallback;
  return Math.max(1, Math.min(cpuCount, raw));
};

const getHeuristicConcurrency = (cpuCount) => {
  if (cpuCount >= 12) return 8;
  if (cpuCount >= 10) return 7;
  if (cpuCount >= 8) return 6;
  return Math.max(2, Math.ceil(cpuCount * 0.6));
};

const getRecommendedVideoBitrate = (project) => {
  const pixelsPerSecond =
    Number(project?.width || 1920) *
    Number(project?.height || 1080) *
    Number(project?.fps || 30);

  if (pixelsPerSecond <= 70_000_000) return '10M';
  if (pixelsPerSecond <= 130_000_000) return '14M';
  if (pixelsPerSecond <= 260_000_000) return '22M';
  return '30M';
};

const supportsHardwareCodec = (codec, capabilities) => {
  if (!VIDEO_TOOLBOX_CODECS.has(codec)) return false;
  if (codec === 'h264') return capabilities.videotoolbox.h264;
  if (codec === 'h265') return capabilities.videotoolbox.h265;
  if (codec === 'prores') return capabilities.videotoolbox.prores;
  return false;
};

const detectVideoToolboxEncoders = async () => {
  try {
    const {stdout} = await execFileAsync(ffmpegPath, ['-hide_banner', '-encoders']);
    return {
      h264: stdout.includes('h264_videotoolbox'),
      h265: stdout.includes('hevc_videotoolbox'),
      prores: stdout.includes('prores_videotoolbox'),
    };
  } catch {
    return {
      h264: false,
      h265: false,
      prores: false,
    };
  }
};

export const detectRenderCapabilities = async () => {
  if (!capabilitiesPromise) {
    capabilitiesPromise = (async () => {
      const cpuList = os.cpus();
      const videotoolbox = await detectVideoToolboxEncoders();
      return {
        platform: os.platform(),
        arch: os.arch(),
        appleSilicon: os.platform() === 'darwin' && os.arch() === 'arm64',
        cpuModel: cpuList[0]?.model ?? 'Unknown CPU',
        cpuCount: cpuList.length || 1,
        totalMemoryBytes: os.totalmem(),
        ffmpegPath,
        ffprobePath,
        videotoolbox,
        recommendedConcurrency: getHeuristicConcurrency(cpuList.length || 1),
      };
    })();
  }

  return capabilitiesPromise;
};

export const loadRenderTuning = async () => readJson(renderTuningFile, null);

export const saveRenderTuning = async (data) => {
  await ensureWorkspaceDirs();
  await fs.writeFile(renderTuningFile, JSON.stringify(data, null, 2));
};

export const detectMediaMetadata = async (filePath) => {
  try {
    const {stdout} = await execFileAsync(ffprobePath, [
      '-v',
      'quiet',
      '-print_format',
      'json',
      '-show_format',
      '-show_streams',
      filePath,
    ]);
    const probe = JSON.parse(stdout);
    const stream = probe.streams?.find((item) => item.codec_type === 'video');
    return {
      durationInSeconds: Number(probe.format?.duration || 0),
      width: stream?.width,
      height: stream?.height,
    };
  } catch {
    return {};
  }
};

export const getDefaultRenderSettings = async (project) => {
  const [capabilities, tuning] = await Promise.all([
    detectRenderCapabilities(),
    loadRenderTuning(),
  ]);

  const recommended = tuning?.recommended ?? {};
  const hardwareAcceleration =
    recommended.hardwareAcceleration ??
    (capabilities.videotoolbox.h264 ? 'if-possible' : 'disable');

  return {
    kind: 'video',
    codec: recommended.codec ?? 'h264',
    imageFormat: 'png',
    videoImageFormat: recommended.videoImageFormat ?? 'jpeg',
    quality: 90,
    frame: 0,
    scale: 1,
    crf: 18,
    pixelFormat: recommended.pixelFormat ?? 'yuv420p',
    muted: false,
    overwrite: true,
    outputName: project?.name ?? 'mosaico-render',
    hardwareAcceleration,
    videoBitrate: recommended.videoBitrate ?? getRecommendedVideoBitrate(project),
    audioBitrate: recommended.audioBitrate ?? null,
    audioCodec: recommended.audioCodec ?? 'aac',
    concurrency:
      recommended.concurrency ?? capabilities.recommendedConcurrency,
    x264Preset:
      recommended.x264Preset && X264_PRESETS.has(recommended.x264Preset)
        ? recommended.x264Preset
        : 'veryfast',
    gl: recommended.gl ?? null,
    encodingMaxRate: recommended.encodingMaxRate ?? null,
    encodingBufferSize: recommended.encodingBufferSize ?? null,
  };
};

const normalizeGl = (gl) => {
  if (!gl || gl === 'auto') return null;
  return String(gl);
};

const normalizeBitrate = (value) => {
  if (value === null || typeof value === 'undefined') return null;
  const trimmed = String(value).trim();
  return trimmed.length === 0 ? null : trimmed;
};

export const normalizeRenderSettings = async (project, incoming = {}) => {
  const [capabilities, tuning, defaults] = await Promise.all([
    detectRenderCapabilities(),
    loadRenderTuning(),
    getDefaultRenderSettings(project),
  ]);

  const kind = incoming.kind ?? defaults.kind;
  const codec = incoming.codec ?? defaults.codec;
  const cpuCount = capabilities.cpuCount || 1;
  const requestedGl = normalizeGl(incoming.gl ?? defaults.gl);
  const base = {
    ...defaults,
    ...incoming,
    kind,
    codec,
    scale: Number(incoming.scale ?? defaults.scale ?? 1),
    frame: Number(incoming.frame ?? defaults.frame ?? 0),
    quality: Number(incoming.quality ?? defaults.quality ?? 90),
    outputName: incoming.outputName || defaults.outputName,
    pixelFormat: incoming.pixelFormat || defaults.pixelFormat,
    muted: Boolean(incoming.muted),
    overwrite: incoming.overwrite !== false,
    concurrency: clampConcurrency(
      Number(incoming.concurrency ?? defaults.concurrency),
      cpuCount,
      capabilities.recommendedConcurrency,
    ),
    gl: requestedGl,
  };

  if (kind === 'still') {
    return {
      ...base,
      imageFormat: incoming.imageFormat ?? 'png',
    };
  }

  if (kind === 'sequence') {
    return {
      ...base,
      imageFormat: incoming.imageFormat ?? 'png',
    };
  }

  if (kind === 'audio') {
    return {
      ...base,
      codec,
      audioCodec: incoming.audioCodec ?? defaults.audioCodec,
    };
  }

  const tuningRecommendation = tuning?.recommended ?? {};
  const requestedHardware =
    incoming.hardwareAcceleration ?? defaults.hardwareAcceleration;
  const hardwareAllowed = supportsHardwareCodec(codec, capabilities);
  const hardwareAcceleration = hardwareAllowed
    ? requestedHardware
    : 'disable';
  const videoBitrate = normalizeBitrate(
    incoming.videoBitrate ??
      tuningRecommendation.videoBitrate ??
      defaults.videoBitrate ??
      getRecommendedVideoBitrate(project),
  );
  const audioBitrate = normalizeBitrate(
    incoming.audioBitrate ??
      tuningRecommendation.audioBitrate ??
      defaults.audioBitrate,
  );
  const x264Preset =
    incoming.x264Preset && X264_PRESETS.has(incoming.x264Preset)
      ? incoming.x264Preset
      : defaults.x264Preset;
  const encodingMaxRate = normalizeBitrate(
    incoming.encodingMaxRate ??
      tuningRecommendation.encodingMaxRate ??
      defaults.encodingMaxRate,
  );
  const encodingBufferSize = normalizeBitrate(
    incoming.encodingBufferSize ??
      tuningRecommendation.encodingBufferSize ??
      defaults.encodingBufferSize,
  );
  const useHardware = hardwareAcceleration !== 'disable';

  return {
    ...base,
    hardwareAcceleration,
    videoImageFormat: incoming.videoImageFormat ?? defaults.videoImageFormat,
    audioCodec: incoming.audioCodec ?? defaults.audioCodec,
    audioBitrate,
    videoBitrate: useHardware ? videoBitrate : normalizeBitrate(incoming.videoBitrate),
    crf: useHardware ? null : Number(incoming.crf ?? defaults.crf ?? 18),
    x264Preset,
    encodingMaxRate,
    encodingBufferSize,
  };
};

const getChromiumOptions = (settings) => ({
  ...(settings.gl ? {gl: settings.gl} : {}),
});

const getOutputExtension = (settings) => {
  if (settings.kind === 'still') return settings.imageFormat;
  if (settings.kind === 'sequence') return 'zip';
  if (settings.kind === 'audio') return settings.codec;
  if (settings.codec === 'gif') return 'gif';
  if (settings.codec === 'prores') return 'mov';
  return 'mp4';
};

const buildOutputPath = (settings, renderId, outputRoot) => {
  const extension = getOutputExtension(settings);
  const base = safeName(settings.outputName || 'render');
  return path.join(outputRoot, `${base}-${renderId.slice(0, 6)}.${extension}`);
};

const setDefaultJobLabel = (settings) => {
  if (settings.kind === 'video') {
    const renderPath =
      settings.hardwareAcceleration !== 'disable'
        ? 'VideoToolbox'
        : `x264 ${settings.x264Preset}`;
    const glLabel = settings.gl && GPU_RENDERERS.has(settings.gl) ? 'ANGLE' : 'Default';
    return `${settings.codec.toUpperCase()} · ${renderPath} · ${settings.concurrency} workers · ${glLabel}`;
  }

  if (settings.kind === 'sequence') {
    return `${settings.imageFormat.toUpperCase()} sequence · ${settings.concurrency} workers`;
  }

  if (settings.kind === 'still') {
    return `${settings.imageFormat.toUpperCase()} still`;
  }

  return `${settings.codec.toUpperCase()} audio`;
};

export const renderProject = async ({
  project,
  settings,
  renderId,
  outputRoot = rendersDir,
  onProgress,
} = {}) => {
  await ensureWorkspaceDirs();
  const appliedSettings = await normalizeRenderSettings(project, settings);
  const startedAt = performance.now();
  const report = (patch) => {
    onProgress?.(patch);
  };

  report({
    status: 'bundling',
    progress: 0.02,
    message: 'Bundling',
    detail: setDefaultJobLabel(appliedSettings),
    appliedSettings,
  });

  const serveUrl = await getBundle();
  const chromiumOptions = getChromiumOptions(appliedSettings);
  const inputProps = {project};
  const composition = await selectComposition({
    serveUrl,
    id: 'MosaicoComposition',
    inputProps,
    chromiumOptions,
  });
  const output = buildOutputPath(
    appliedSettings,
    renderId,
    outputRoot,
  );

  if (appliedSettings.kind === 'still') {
    report({
      status: 'rendering',
      progress: 0.2,
      message: 'Rendering still',
      detail: setDefaultJobLabel(appliedSettings),
      appliedSettings,
    });
    await renderStill({
      serveUrl,
      composition,
      inputProps,
      output,
      frame: appliedSettings.frame,
      imageFormat: appliedSettings.imageFormat,
      chromiumOptions,
      ...(appliedSettings.imageFormat === 'jpeg'
        ? {jpegQuality: appliedSettings.quality}
        : {}),
      scale: appliedSettings.scale,
    });
  } else if (appliedSettings.kind === 'sequence') {
    const folder = output.replace(/\.zip$/u, '');
    await fs.mkdir(folder, {recursive: true});
    await renderFrames({
      serveUrl,
      composition,
      inputProps,
      outputDir: folder,
      imageFormat: appliedSettings.imageFormat,
      chromiumOptions,
      concurrency: appliedSettings.concurrency,
      scale: appliedSettings.scale,
      ...(appliedSettings.imageFormat === 'jpeg'
        ? {jpegQuality: appliedSettings.quality}
        : {}),
      onFrameUpdate: (framesRendered, frame) => {
        report({
          status: 'rendering',
          progress: Math.min(0.9, framesRendered / composition.durationInFrames),
          message: `Frame ${frame}`,
          detail: setDefaultJobLabel(appliedSettings),
          appliedSettings,
        });
      },
    });
    await zipDirectory(folder, output);
    await fs.rm(folder, {recursive: true, force: true});
  } else {
    await renderMedia({
      serveUrl,
      composition,
      inputProps,
      outputLocation: output,
      codec: appliedSettings.codec,
      chromiumOptions,
      concurrency: appliedSettings.concurrency,
      scale: appliedSettings.scale,
      muted: appliedSettings.muted,
      pixelFormat:
        appliedSettings.kind === 'video'
          ? appliedSettings.pixelFormat
          : undefined,
      crf:
        appliedSettings.kind === 'video' &&
        appliedSettings.hardwareAcceleration === 'disable'
          ? appliedSettings.crf
          : undefined,
      x264Preset:
        appliedSettings.kind === 'video' &&
        appliedSettings.hardwareAcceleration === 'disable'
          ? appliedSettings.x264Preset
          : undefined,
      imageFormat:
        appliedSettings.kind === 'video'
          ? appliedSettings.videoImageFormat
          : undefined,
      audioCodec:
        appliedSettings.kind === 'video'
          ? appliedSettings.audioCodec
          : undefined,
      audioBitrate: appliedSettings.audioBitrate ?? undefined,
      videoBitrate:
        appliedSettings.kind === 'video'
          ? appliedSettings.videoBitrate ?? undefined
          : undefined,
      encodingMaxRate:
        appliedSettings.kind === 'video'
          ? appliedSettings.encodingMaxRate ?? undefined
          : undefined,
      encodingBufferSize:
        appliedSettings.kind === 'video'
          ? appliedSettings.encodingBufferSize ?? undefined
          : undefined,
      hardwareAcceleration:
        appliedSettings.kind === 'video'
          ? appliedSettings.hardwareAcceleration
          : undefined,
      overwrite: appliedSettings.overwrite,
      onProgress: ({progress}) => {
        report({
          status: 'rendering',
          progress,
          message: `${Math.round(progress * 100)}%`,
          detail: setDefaultJobLabel(appliedSettings),
          appliedSettings,
        });
      },
    });
  }

  const completedAt = performance.now();
  return {
    output,
    url: `/renders/${path.basename(output)}`,
    appliedSettings,
    durationMs: Math.round(completedAt - startedAt),
    detail: setDefaultJobLabel(appliedSettings),
  };
};
