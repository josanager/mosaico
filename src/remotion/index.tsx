import {Composition, registerRoot} from 'remotion';
import {createSampleProject} from '../sample-project';
import type {StudioProject} from '../types';
import {TimelineComposition} from './TimelineComposition';

const defaultProject = createSampleProject();

const RemotionRoot = () => (
  <Composition
    id="MosaicoComposition"
    component={TimelineComposition}
    durationInFrames={defaultProject.durationInFrames}
    fps={defaultProject.fps}
    width={defaultProject.width}
    height={defaultProject.height}
    defaultProps={{project: defaultProject}}
    calculateMetadata={({props}) => {
      const project = (props as {project: StudioProject}).project;
      return {
        durationInFrames: project.durationInFrames,
        fps: project.fps,
        width: project.width,
        height: project.height,
      };
    }}
  />
);

registerRoot(RemotionRoot);
