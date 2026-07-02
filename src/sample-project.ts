import {createEmptyProject} from './editor-core';
import type {StudioProject} from './types';

type SampleProjectOptions = Partial<
  Pick<StudioProject, 'name' | 'width' | 'height' | 'fps' | 'durationInFrames' | 'background'>
>;

export const createSampleProject = (
  options: SampleProjectOptions = {},
): StudioProject =>
  createEmptyProject({
    ...options,
    name: options.name ?? 'Nuevo proyecto de video',
  });
