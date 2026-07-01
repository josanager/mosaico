import {FolderOpen, Plus, Video} from 'lucide-react';
import React from 'react';
import type {VideoProjectLibrary, VideoProjectSummary} from '../types';

const formatProjectDate = (value: string) =>
  new Date(value).toLocaleString('es-ES', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });

export const ProjectManagerDialog = ({
  activeProjectId,
  createName,
  createPreset,
  isBusy,
  library,
  onChangeCreateName,
  onChangeCreatePreset,
  onClose,
  onCreateProject,
  onOpenProject,
}: {
  activeProjectId: string | null;
  createName: string;
  createPreset: 'landscape' | 'portrait';
  isBusy: boolean;
  library: VideoProjectLibrary | null;
  onChangeCreateName: (value: string) => void;
  onChangeCreatePreset: (value: 'landscape' | 'portrait') => void;
  onClose: () => void;
  onCreateProject: () => void;
  onOpenProject: (projectId: string) => void;
}) => {
  const projects = library?.projects || [];

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="project-dialog" onClick={(event) => event.stopPropagation()}>
        <header>
          <div className="project-dialog-title">
            <Video size={15} />
            <span>Proyectos de video</span>
          </div>
          <button className="icon-button" onClick={onClose} title="Cerrar">
            ×
          </button>
        </header>

        <div className="project-dialog-body">
          <section className="project-create-panel">
            <div className="project-panel-heading">Crear proyecto</div>
            <label className="field">
              <span>Nombre</span>
              <input
                value={createName}
                onChange={(event) => onChangeCreateName(event.target.value)}
                placeholder="Ej. Video contaminación junio"
              />
            </label>
            <div className="field">
              <span>Formato</span>
              <div className="project-preset-row">
                <button
                  className={createPreset === 'landscape' ? 'project-preset active' : 'project-preset'}
                  onClick={() => onChangeCreatePreset('landscape')}
                  type="button"
                >
                  1920×1080
                </button>
                <button
                  className={createPreset === 'portrait' ? 'project-preset active' : 'project-preset'}
                  onClick={() => onChangeCreatePreset('portrait')}
                  type="button"
                >
                  1080×1920
                </button>
              </div>
            </div>
            <button
              className="project-create-button"
              disabled={isBusy || !createName.trim()}
              onClick={onCreateProject}
              type="button"
            >
              <Plus size={14} />
              <span>Crear proyecto</span>
            </button>
          </section>

          <section className="project-library-panel">
            <div className="project-panel-heading">Proyectos guardados</div>
            <div className="project-library-list">
              {projects.map((project) => (
                <ProjectLibraryItem
                  activeProjectId={activeProjectId}
                  isBusy={isBusy}
                  key={project.id}
                  onOpenProject={onOpenProject}
                  project={project}
                />
              ))}
              {!projects.length && <div className="project-empty">No hay proyectos guardados todavía.</div>}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
};

const ProjectLibraryItem = ({
  activeProjectId,
  isBusy,
  onOpenProject,
  project,
}: {
  activeProjectId: string | null;
  isBusy: boolean;
  onOpenProject: (projectId: string) => void;
  project: VideoProjectSummary;
}) => {
  const isActive = project.id === activeProjectId;

  return (
    <button
      className={isActive ? 'project-library-item active' : 'project-library-item'}
      disabled={isBusy}
      onClick={() => onOpenProject(project.id)}
      type="button"
    >
      <div className="project-library-main">
        <span className="project-library-name">{project.name}</span>
        <span className="project-library-meta">
          {project.width}×{project.height} · {Math.round(project.durationInFrames / project.fps)}s
        </span>
      </div>
      <div className="project-library-side">
        <span className="project-library-status">
          {isActive ? 'Activo' : <><FolderOpen size={12} /> Abrir</>}
        </span>
        <span className="project-library-date">Editado {formatProjectDate(project.updatedAt)}</span>
        <span className="project-library-counts">
          {project.assetCount} media · {project.folderCount} carpetas
        </span>
      </div>
    </button>
  );
};
