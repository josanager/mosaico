import type {StudioProject} from './types';

type SampleProjectOptions = Partial<
  Pick<StudioProject, 'name' | 'width' | 'height' | 'fps' | 'durationInFrames' | 'background'>
>;

export const createSampleProject = (
  options: SampleProjectOptions = {},
): StudioProject => ({
  id: crypto.randomUUID(),
  name: options.name ?? 'Mosaico composition',
  width: options.width ?? 1920,
  height: options.height ?? 1080,
  fps: options.fps ?? 30,
  durationInFrames: options.durationInFrames ?? 300,
  background: options.background ?? '#111214',
  tracks: [
    {
      id: crypto.randomUUID(),
      name: 'Audio',
      kind: 'audio',
      hidden: false,
      locked: false,
      muted: false,
      clips: [],
    },
    {
      id: crypto.randomUUID(),
      name: 'Video',
      kind: 'visual',
      hidden: false,
      locked: false,
      muted: false,
      clips: [],
    },
    {
      id: crypto.randomUUID(),
      name: 'Text',
      kind: 'visual',
      hidden: false,
      locked: false,
      muted: false,
      clips: [],
    },
  ],
});
