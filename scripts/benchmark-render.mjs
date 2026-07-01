import {randomUUID} from 'node:crypto';
import {execFile} from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import {promisify} from 'node:util';
import {
  detectMediaMetadata,
  detectRenderCapabilities,
  ensureWorkspaceDirs,
  mediaDir,
  normalizeRenderSettings,
  renderProject,
  rendersDir,
  saveRenderTuning,
} from '../server/rendering.mjs';

const execFileAsync = promisify(execFile);
const ffmpegPath = process.env.FFMPEG_PATH ?? 'ffmpeg';

const benchmarkSource = path.join(mediaDir, '__benchmark-source.mp4');
const benchmarkOutputDir = path.join(rendersDir, 'benchmarks');

const makeProject = () => ({
  id: randomUUID(),
  name: 'Benchmark render',
  width: 1920,
  height: 1080,
  fps: 30,
  durationInFrames: 150,
  background: '#0f1114',
  tracks: [
    {
      id: randomUUID(),
      name: 'Background',
      kind: 'visual',
      hidden: false,
      locked: false,
      muted: false,
      clips: [
        {
          id: randomUUID(),
          trackId: '',
          type: 'video',
          name: 'Background',
          start: 0,
          duration: 150,
          sourceStart: 0,
          src: '/media/__benchmark-source.mp4',
          color: '#ffffff',
          opacity: 1,
          x: 0,
          y: 0,
          width: 1920,
          height: 1080,
          rotation: 0,
          scale: 1,
          fontSize: 18,
          fontWeight: 700,
          volume: 0.55,
          playbackRate: 1,
          fit: 'cover',
        },
      ],
    },
    {
      id: randomUUID(),
      name: 'Overlay video',
      kind: 'visual',
      hidden: false,
      locked: false,
      muted: false,
      clips: [
        {
          id: randomUUID(),
          trackId: '',
          type: 'video',
          name: 'Inset',
          start: 18,
          duration: 96,
          sourceStart: 24,
          src: '/media/__benchmark-source.mp4',
          color: '#ffffff',
          opacity: 1,
          x: 1290,
          y: 86,
          width: 530,
          height: 298,
          rotation: 0,
          scale: 1,
          fontSize: 18,
          fontWeight: 700,
          volume: 0,
          playbackRate: 1,
          fit: 'cover',
          muted: true,
        },
      ],
    },
    {
      id: randomUUID(),
      name: 'Shape',
      kind: 'visual',
      hidden: false,
      locked: false,
      muted: false,
      clips: [
        {
          id: randomUUID(),
          trackId: '',
          type: 'shape',
          name: 'Panel',
          start: 10,
          duration: 120,
          sourceStart: 0,
          color: '#101115',
          opacity: 0.82,
          x: 84,
          y: 748,
          width: 924,
          height: 192,
          rotation: 0,
          scale: 1,
          fontSize: 18,
          fontWeight: 700,
          volume: 1,
          playbackRate: 1,
          fit: 'cover',
        },
      ],
    },
    {
      id: randomUUID(),
      name: 'Text',
      kind: 'visual',
      hidden: false,
      locked: false,
      muted: false,
      clips: [
        {
          id: randomUUID(),
          trackId: '',
          type: 'text',
          name: 'Title',
          start: 14,
          duration: 100,
          sourceStart: 0,
          text: 'Mosaico Apple Silicon benchmark',
          color: '#f7f8fb',
          opacity: 1,
          x: 112,
          y: 788,
          width: 820,
          height: 120,
          rotation: 0,
          scale: 1,
          fontSize: 68,
          fontWeight: 700,
          volume: 1,
          playbackRate: 1,
          fit: 'cover',
        },
      ],
    },
  ],
});

const fillTrackIds = (project) => ({
  ...project,
  tracks: project.tracks.map((track) => ({
    ...track,
    clips: track.clips.map((clip) => ({...clip, trackId: track.id})),
  })),
});

const ensureBenchmarkSource = async () => {
  await ensureWorkspaceDirs();
  await execFileAsync(ffmpegPath, [
    '-y',
    '-f',
    'lavfi',
    '-i',
    'testsrc2=size=1920x1080:rate=30',
    '-f',
    'lavfi',
    '-i',
    'sine=frequency=880:sample_rate=48000',
    '-t',
    '5',
    '-pix_fmt',
    'yuv420p',
    '-c:v',
    'h264_videotoolbox',
    '-b:v',
    '8M',
    '-c:a',
    'aac',
    '-b:a',
    '192k',
    benchmarkSource,
  ]);
};

const buildCandidates = (capabilities, defaults) => {
  const baseConcurrency = capabilities.recommendedConcurrency;
  const concurrencyCandidates = Array.from(
    new Set([
      baseConcurrency,
      Math.min(capabilities.cpuCount, 6),
      Math.min(capabilities.cpuCount, 8),
      capabilities.cpuCount,
    ]),
  ).filter((value) => value >= 1);

  const candidates = [
    {
      name: 'cpu-veryfast',
      settings: {
        ...defaults,
        hardwareAcceleration: 'disable',
        crf: 18,
        x264Preset: 'veryfast',
        videoBitrate: null,
        gl: null,
        concurrency: baseConcurrency,
      },
    },
  ];

  if (capabilities.videotoolbox.h264) {
    for (const concurrency of concurrencyCandidates) {
      candidates.push({
        name: `hw-default-c${concurrency}`,
        settings: {
          ...defaults,
          hardwareAcceleration: 'if-possible',
          concurrency,
          gl: null,
        },
      });
      candidates.push({
        name: `hw-angle-c${concurrency}`,
        settings: {
          ...defaults,
          hardwareAcceleration: 'if-possible',
          concurrency,
          gl: 'angle',
        },
      });
    }
  }

  return candidates;
};

const pickRecommended = (results) => {
  const successful = results.filter((result) => result.success);
  const cpuBest = successful
    .filter((result) => result.settings.hardwareAcceleration === 'disable')
    .sort((a, b) => a.durationMs - b.durationMs)[0];
  const hwDefaultBest = successful
    .filter(
      (result) =>
        result.settings.hardwareAcceleration !== 'disable' &&
        !result.settings.gl,
    )
    .sort((a, b) => a.durationMs - b.durationMs)[0];
  const hwAngleBest = successful
    .filter((result) => result.settings.gl === 'angle')
    .sort((a, b) => a.durationMs - b.durationMs)[0];

  let preferredHardware = hwDefaultBest;
  if (
    hwAngleBest &&
    (!hwDefaultBest || hwAngleBest.durationMs < hwDefaultBest.durationMs * 0.9)
  ) {
    preferredHardware = hwAngleBest;
  }

  if (!preferredHardware) return cpuBest;
  if (!cpuBest) return preferredHardware;

  return preferredHardware.durationMs <= cpuBest.durationMs
    ? preferredHardware
    : cpuBest;
};

const benchmark = async () => {
  await ensureBenchmarkSource();
  await fs.mkdir(benchmarkOutputDir, {recursive: true});

  const project = fillTrackIds(makeProject());
  const capabilities = await detectRenderCapabilities();
  const defaults = await normalizeRenderSettings(project, {
    kind: 'video',
    codec: 'h264',
    outputName: 'benchmark',
  });
  const candidates = buildCandidates(capabilities, defaults);
  const results = [];

  for (const candidate of candidates) {
    const renderId = randomUUID();
    try {
      const result = await renderProject({
        project,
        settings: {
          ...candidate.settings,
          outputName: candidate.name,
        },
        renderId,
        outputRoot: benchmarkOutputDir,
      });
      const metadata = await detectMediaMetadata(result.output);
      results.push({
        name: candidate.name,
        success: true,
        durationMs: result.durationMs,
        detail: result.detail,
        output: path.basename(result.output),
        settings: result.appliedSettings,
        metadata,
      });
      await fs.rm(result.output, {force: true});
    } catch (error) {
      results.push({
        name: candidate.name,
        success: false,
        durationMs: Number.POSITIVE_INFINITY,
        error: error instanceof Error ? error.message : String(error),
        settings: candidate.settings,
      });
    }
  }

  const selected = pickRecommended(results);
  if (!selected) {
    throw new Error('No benchmark candidate completed successfully.');
  }

  const tuning = {
    measuredAt: new Date().toISOString(),
    machine: capabilities,
    selected: {
      name: selected.name,
      durationMs: selected.durationMs,
      detail: selected.detail,
    },
    recommended: {
      codec: 'h264',
      hardwareAcceleration: selected.settings.hardwareAcceleration,
      concurrency: selected.settings.concurrency,
      gl: selected.settings.gl ?? null,
      videoBitrate: defaults.videoBitrate,
      audioCodec: 'aac',
      pixelFormat: 'yuv420p',
      videoImageFormat: 'jpeg',
      x264Preset:
        selected.settings.hardwareAcceleration === 'disable'
          ? selected.settings.x264Preset ?? 'veryfast'
          : 'veryfast',
      encodingMaxRate: null,
      encodingBufferSize: null,
    },
    benchmarks: results.map((result) => ({
      name: result.name,
      durationMs: Number.isFinite(result.durationMs) ? result.durationMs : -1,
      success: result.success,
      detail: result.detail ?? result.error ?? '',
      settings: {
        hardwareAcceleration: result.settings.hardwareAcceleration,
        concurrency: result.settings.concurrency,
        gl: result.settings.gl ?? null,
      },
    })),
  };

  await saveRenderTuning(tuning);
  await fs.rm(benchmarkSource, {force: true});
  await fs.rm(benchmarkOutputDir, {recursive: true, force: true});

  console.table(
    results.map((result) => ({
      name: result.name,
      success: result.success,
      seconds: Number.isFinite(result.durationMs)
        ? (result.durationMs / 1000).toFixed(2)
        : 'fail',
      detail: result.detail ?? result.error ?? '',
    })),
  );
  console.log(
    `Selected ${selected.name} in ${(selected.durationMs / 1000).toFixed(2)}s`,
  );
};

await benchmark();
