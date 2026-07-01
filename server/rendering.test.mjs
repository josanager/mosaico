import {describe, expect, it} from 'vitest';
import os from 'node:os';
import {normalizeRenderSettings, safeName} from './rendering.mjs';

const project = {
  id: 'project',
  name: 'Render Test',
  width: 1920,
  height: 1080,
  fps: 30,
  durationInFrames: 150,
  background: '#000000',
  tracks: [],
};

describe('rendering helpers', () => {
  it('sanitizes output names', () => {
    expect(safeName(' Hola / mundo ?? ')).toBe('Hola-mundo');
  });

  it('disables hardware acceleration for unsupported codecs', async () => {
    const settings = await normalizeRenderSettings(project, {
      kind: 'video',
      codec: 'vp9',
      hardwareAcceleration: 'required',
    });

    expect(settings.hardwareAcceleration).toBe('disable');
  });

  it('keeps CPU CRF settings when hardware acceleration is disabled', async () => {
    const settings = await normalizeRenderSettings(project, {
      kind: 'video',
      codec: 'h264',
      hardwareAcceleration: 'disable',
      crf: 21,
      x264Preset: 'fast',
    });

    expect(settings.hardwareAcceleration).toBe('disable');
    expect(settings.crf).toBe(21);
    expect(settings.x264Preset).toBe('fast');
  });

  it('clamps concurrency to the current machine limit', async () => {
    const settings = await normalizeRenderSettings(project, {
      kind: 'video',
      codec: 'h264',
      concurrency: 999,
    });

    expect(settings.concurrency).toBeLessThanOrEqual(os.cpus().length);
    expect(settings.concurrency).toBeGreaterThan(0);
  });
});
