import cors from 'cors';
import express from 'express';
import multer from 'multer';
import fs from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {v4 as uuid} from 'uuid';
import {
  applyDocumentOperations,
  createEmptyProject,
  createMosaicoDocument,
  validateMosaicoDocument,
} from '../lib/document-core.mjs';
import {
  detectMediaMetadata,
  detectRenderCapabilities,
  ensureWorkspaceDirs,
  loadRenderTuning,
  mediaDir,
  mediaIndexFile,
  packageRoot,
  normalizeRenderSettings,
  projectIndexFile,
  projectLibraryDir,
  projectFile,
  renderProject,
  rendersDir,
  safeName,
} from './rendering.mjs';

await ensureWorkspaceDirs();

const storage = multer.diskStorage({
  destination: async (_request, _file, callback) => {
    try {
      const entry = await getActiveProjectEntry();
      const targetDir = entry
        ? path.join(mediaDir, 'projects', entry.id)
        : mediaDir;
      await fs.mkdir(targetDir, {recursive: true});
      callback(null, targetDir);
    } catch (error) {
      callback(error, mediaDir);
    }
  },
  filename: (_request, file, callback) => {
    callback(null, `${Date.now()}-${safeName(file.originalname)}`);
  },
});

const upload = multer({
  storage,
  limits: {fileSize: 2 * 1024 * 1024 * 1024},
});

const app = express();
const jobs = new Map();

const readJsonFile = async (file, fallback) =>
  fs
    .readFile(file, 'utf8')
    .then((content) => JSON.parse(content))
    .catch(() => fallback);

const createDefaultProject = ({name, preset = 'landscape'} = {}) =>
  createEmptyProject({name: name || 'Nuevo proyecto de video', preset});

const getProjectFolder = (entry) => path.join(projectLibraryDir, entry.slug);
const getProjectStatePaths = (entry) => ({
  project: path.join(getProjectFolder(entry), 'project.json'),
  media: path.join(getProjectFolder(entry), 'media.json'),
});

const buildProjectSummary = (entry, project, mediaState) => ({
  id: entry.id,
  name: project.name,
  slug: entry.slug,
  createdAt: entry.createdAt,
  updatedAt: entry.updatedAt,
  lastOpenedAt: entry.lastOpenedAt,
  width: project.width,
  height: project.height,
  fps: project.fps,
  durationInFrames: project.durationInFrames,
  assetCount: Array.isArray(mediaState?.assets) ? mediaState.assets.length : 0,
  folderCount: Array.isArray(mediaState?.folders) ? mediaState.folders.length : 0,
});

const writeProjectState = async (entry, project, mediaState) => {
  const paths = getProjectStatePaths(entry);
  await fs.mkdir(getProjectFolder(entry), {recursive: true});
  await Promise.all([
    fs.writeFile(paths.project, JSON.stringify(project, null, 2)),
    fs.writeFile(paths.media, JSON.stringify(mediaState, null, 2)),
  ]);
};

const writeProjectLibrary = async (library) => {
  await fs.writeFile(projectIndexFile, JSON.stringify(library, null, 2));
  return library;
};

const syncLegacyPointers = async (entry) => {
  const paths = getProjectStatePaths(entry);
  await Promise.all([
    fs.copyFile(paths.project, projectFile),
    fs.copyFile(paths.media, mediaIndexFile),
  ]);
};

const ensureProjectLibrary = async () => {
  await ensureWorkspaceDirs();

  const existingLibrary = await readJsonFile(projectIndexFile, null);
  if (existingLibrary?.projects?.length) {
    return existingLibrary;
  }

  const project = await readJsonFile(projectFile, null);
  const mediaState = await readJsonFile(mediaIndexFile, {assets: [], folders: []});
  const fallbackProject =
    project ||
    createDefaultProject({
      name: 'Nuevo proyecto de video',
      preset: 'landscape',
    });
  const id = fallbackProject.id || crypto.randomUUID();
  const slugBase = safeName(fallbackProject.name) || 'proyecto';
  const slug = `${slugBase}-${id.slice(0, 8)}`;
  const now = new Date().toISOString();
  const entry = {
    id,
    slug,
    createdAt: now,
    updatedAt: now,
    lastOpenedAt: now,
  };

  await writeProjectState(entry, {...fallbackProject, id}, mediaState);

  const library = {
    activeProjectId: id,
    projects: [buildProjectSummary(entry, {...fallbackProject, id}, mediaState)],
  };

  await writeProjectLibrary(library);
  await syncLegacyPointers(entry);
  return library;
};

const getProjectSummaryEntry = async (projectId) => {
  const library = await ensureProjectLibrary();
  const entry = library.projects.find((project) => project.id === projectId);
  return {library, entry};
};

const getActiveProjectEntry = async () => {
  const library = await ensureProjectLibrary();
  const active = library.projects.find((project) => project.id === library.activeProjectId);
  return active || library.projects[0] || null;
};

const readProjectState = async (entry) => {
  const paths = getProjectStatePaths(entry);
  return {
    project: await readJsonFile(paths.project, createDefaultProject({name: entry.name})),
    media: await readJsonFile(paths.media, {assets: [], folders: []}),
  };
};

const updateProjectLibraryEntry = async (projectId, project, mediaState, patch = {}) => {
  const library = await ensureProjectLibrary();
  const nextProjects = library.projects.map((entry) => {
    if (entry.id !== projectId) return entry;
    return buildProjectSummary(
      {
        id: entry.id,
        slug: entry.slug,
        createdAt: entry.createdAt,
        updatedAt: patch.updatedAt || entry.updatedAt,
        lastOpenedAt: patch.lastOpenedAt || entry.lastOpenedAt,
      },
      project,
      mediaState,
    );
  });
  return writeProjectLibrary({
    ...library,
    activeProjectId: patch.activeProjectId || library.activeProjectId,
    projects: nextProjects,
  });
};

const readMediaLibrary = async () =>
  (await readProjectState(await getActiveProjectEntry())).media;

const inferMediaType = (filename) => {
  const extension = path.extname(filename).toLowerCase();
  const imageExtensions = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif']);
  const audioExtensions = new Set(['.mp3', '.wav', '.aac', '.m4a', '.ogg', '.flac']);
  if (imageExtensions.has(extension)) return 'image';
  if (audioExtensions.has(extension)) return 'audio';
  return 'video';
};

const createAssetFromUpload = async (file) => {
  const metadata = await detectMediaMetadata(file.path);
  const relativePath = path.relative(mediaDir, file.path).split(path.sep).join('/');
  return {
    id: uuid(),
    name: file.originalname,
    src: `/media/${relativePath}`,
    type: inferMediaType(file.filename),
    ...metadata,
  };
};

app.use(cors());
app.use(express.json({limit: '50mb'}));
app.use('/media', express.static(mediaDir));
app.use('/renders', express.static(rendersDir));

const setJob = (id, patch) => {
  jobs.set(id, {...jobs.get(id), ...patch});
};

app.get('/api/health', async (_request, response) => {
  const capabilities = await detectRenderCapabilities();
  response.json({ok: true, renderer: 'remotion', ffmpeg: true, capabilities});
});

app.get('/api/project', async (_request, response) => {
  try {
    const entry = await getActiveProjectEntry();
    if (!entry) {
      response.status(404).json({error: 'No saved project'});
      return;
    }
    response.json((await readProjectState(entry)).project);
  } catch {
    response.status(404).json({error: 'No saved project'});
  }
});

app.put('/api/project', async (request, response) => {
  const entry = await getActiveProjectEntry();
  if (!entry) {
    response.status(404).json({error: 'No active project'});
    return;
  }
  const mediaState = (await readProjectState(entry)).media;
  const updatedAt = new Date().toISOString();
  await writeProjectState(
    {
      id: entry.id,
      slug: entry.slug,
      createdAt: entry.createdAt,
      updatedAt,
      lastOpenedAt: entry.lastOpenedAt,
    },
    request.body,
    mediaState,
  );
  await updateProjectLibraryEntry(entry.id, request.body, mediaState, {updatedAt});
  await syncLegacyPointers(entry);
  response.json({ok: true});
});

app.get('/api/media', async (_request, response) => {
  try {
    const entry = await getActiveProjectEntry();
    if (!entry) {
      response.json({assets: [], folders: []});
      return;
    }
    const data = (await readProjectState(entry)).media;
    if (Array.isArray(data)) {
      response.json({assets: data, folders: []});
    } else {
      response.json({
        assets: data.assets || [],
        folders: data.folders || [],
      });
    }
  } catch {
    response.json({assets: [], folders: []});
  }
});

app.put('/api/media', async (request, response) => {
  const entry = await getActiveProjectEntry();
  if (!entry) {
    response.status(404).json({error: 'No active project'});
    return;
  }
  const projectState = (await readProjectState(entry)).project;
  const updatedAt = new Date().toISOString();
  await writeProjectState(
    {
      id: entry.id,
      slug: entry.slug,
      createdAt: entry.createdAt,
      updatedAt,
      lastOpenedAt: entry.lastOpenedAt,
    },
    projectState,
    request.body,
  );
  await updateProjectLibraryEntry(entry.id, projectState, request.body, {updatedAt});
  await syncLegacyPointers(entry);
  response.json({ok: true});
});

app.get('/api/document', async (_request, response) => {
  const entry = await getActiveProjectEntry();
  if (!entry) {
    response.status(404).json({error: 'No active project'});
    return;
  }
  const state = await readProjectState(entry);
  response.json(createMosaicoDocument(state));
});

app.put('/api/document', async (request, response) => {
  const entry = await getActiveProjectEntry();
  if (!entry) {
    response.status(404).json({error: 'No active project'});
    return;
  }

  const document = createMosaicoDocument(request.body);
  const validation = validateMosaicoDocument(document);
  if (!validation.ok) {
    response.status(400).json({
      error: 'Invalid Mosaico document',
      details: validation.errors,
    });
    return;
  }

  const updatedAt = new Date().toISOString();
  const nextEntry = {
    id: entry.id,
    slug: entry.slug,
    createdAt: entry.createdAt,
    updatedAt,
    lastOpenedAt: entry.lastOpenedAt,
  };
  await writeProjectState(nextEntry, document.project, document.media);
  await updateProjectLibraryEntry(entry.id, document.project, document.media, {updatedAt});
  await syncLegacyPointers(entry);
  response.json({ok: true, document});
});

app.post('/api/operations', async (request, response) => {
  const entry = await getActiveProjectEntry();
  if (!entry) {
    response.status(404).json({error: 'No active project'});
    return;
  }

  const operations = Array.isArray(request.body?.operations)
    ? request.body.operations
    : Array.isArray(request.body)
      ? request.body
      : [];
  if (!operations.length) {
    response.status(400).json({error: 'No operations provided'});
    return;
  }

  try {
    const currentState = await readProjectState(entry);
    const nextDocument = applyDocumentOperations(
      createMosaicoDocument(currentState),
      operations,
    );
    const validation = validateMosaicoDocument(nextDocument);
    if (!validation.ok) {
      response.status(400).json({
        error: 'Operations produced an invalid document',
        details: validation.errors,
      });
      return;
    }

    const updatedAt = new Date().toISOString();
    const nextEntry = {
      id: entry.id,
      slug: entry.slug,
      createdAt: entry.createdAt,
      updatedAt,
      lastOpenedAt: entry.lastOpenedAt,
    };
    await writeProjectState(nextEntry, nextDocument.project, nextDocument.media);
    await updateProjectLibraryEntry(entry.id, nextDocument.project, nextDocument.media, {updatedAt});
    await syncLegacyPointers(entry);
    response.json({ok: true, document: nextDocument});
  } catch (error) {
    response.status(400).json({
      error: error instanceof Error ? error.message : String(error),
    });
  }
});

app.get('/api/projects', async (_request, response) => {
  response.json(await ensureProjectLibrary());
});

app.post('/api/projects', async (request, response) => {
  const name = String(request.body?.name || '').trim() || 'Nuevo proyecto de video';
  const preset = request.body?.preset === 'portrait' ? 'portrait' : 'landscape';
  const project = createDefaultProject({name, preset});
  const now = new Date().toISOString();
  const slug = `${safeName(name) || 'proyecto'}-${project.id.slice(0, 8)}`;
  const entry = {
    id: project.id,
    slug,
    createdAt: now,
    updatedAt: now,
    lastOpenedAt: now,
  };
  const mediaState = {assets: [], folders: []};
  await writeProjectState(entry, project, mediaState);

  const library = await ensureProjectLibrary();
  const nextLibrary = {
    activeProjectId: project.id,
    projects: [
      buildProjectSummary(entry, project, mediaState),
      ...library.projects,
    ],
  };

  await writeProjectLibrary(nextLibrary);
  await syncLegacyPointers(entry);
  response.status(201).json({
    library: nextLibrary,
    project,
    media: mediaState,
  });
});

app.post('/api/projects/:id/open', async (request, response) => {
  const {library, entry} = await getProjectSummaryEntry(request.params.id);
  if (!entry) {
    response.status(404).json({error: 'Project not found'});
    return;
  }

  const state = await readProjectState(entry);
  const now = new Date().toISOString();
  const nextLibrary = {
    activeProjectId: entry.id,
    projects: library.projects.map((project) =>
      project.id === entry.id
        ? {
            ...project,
            name: state.project.name,
            width: state.project.width,
            height: state.project.height,
            fps: state.project.fps,
            durationInFrames: state.project.durationInFrames,
            assetCount: state.media.assets.length,
            folderCount: state.media.folders.length,
            updatedAt: project.updatedAt,
            lastOpenedAt: now,
          }
        : project,
    ),
  };

  await writeProjectLibrary(nextLibrary);
  await syncLegacyPointers(entry);
  response.json({
    library: nextLibrary,
    project: state.project,
    media: state.media,
  });
});

app.post(
  '/api/media',
  upload.fields([
    {name: 'files', maxCount: 100},
    {name: 'file', maxCount: 1},
  ]),
  async (request, response) => {
  const uploadedFiles = [
    ...(request.files?.files || []),
    ...(request.files?.file || []),
  ];

  if (!uploadedFiles.length) {
    response.status(400).json({error: 'No file received'});
    return;
  }

  const assets = await Promise.all(uploadedFiles.map((file) => createAssetFromUpload(file)));
  const fileContent = await readMediaLibrary();
  const existingAssets = Array.isArray(fileContent) ? fileContent : (fileContent.assets || []);
  const folders = Array.isArray(fileContent) ? [] : (fileContent.folders || []);
  const entry = await getActiveProjectEntry();

  const nextMediaState = {assets: [...existingAssets, ...assets], folders};
  if (entry) {
    const projectState = (await readProjectState(entry)).project;
    const updatedAt = new Date().toISOString();
    await writeProjectState(
      {
        id: entry.id,
        slug: entry.slug,
        createdAt: entry.createdAt,
        updatedAt,
        lastOpenedAt: entry.lastOpenedAt,
      },
      projectState,
      nextMediaState,
    );
    await updateProjectLibraryEntry(entry.id, projectState, nextMediaState, {updatedAt});
    await syncLegacyPointers(entry);
  } else {
    await fs.writeFile(
      mediaIndexFile,
      JSON.stringify(nextMediaState, null, 2)
    );
  }

    response.json(assets.length === 1 ? assets[0] : {assets});
  },
);

app.get('/api/render/capabilities', async (_request, response) => {
  const [capabilities, tuning] = await Promise.all([
    detectRenderCapabilities(),
    loadRenderTuning(),
  ]);
  response.json({capabilities, tuning});
});

app.post('/api/render/defaults', async (request, response) => {
  const settings = await normalizeRenderSettings(request.body.project, request.body.settings);
  response.json(settings);
});

app.post('/api/render', (request, response) => {
  const id = uuid();
  jobs.set(id, {
    id,
    status: 'queued',
    progress: 0,
    message: 'Queued',
  });
  response.status(202).json(jobs.get(id));
  void renderProject({
    project: request.body.project,
    settings: request.body.settings,
    renderId: id,
    onProgress: (patch) => setJob(id, patch),
  })
    .then((result) => {
      setJob(id, {
        status: 'done',
        progress: 1,
        message: `Complete in ${(result.durationMs / 1000).toFixed(1)}s`,
        url: result.url,
        durationMs: result.durationMs,
        detail: result.detail,
        appliedSettings: result.appliedSettings,
      });
    })
    .catch((error) => {
      console.error(error);
      setJob(id, {
        status: 'error',
        message: error instanceof Error ? error.message : String(error),
      });
    });
});

app.get('/api/render/:id', (request, response) => {
  const job = jobs.get(request.params.id);
  if (!job) {
    response.status(404).json({error: 'Unknown render job'});
    return;
  }
  response.json(job);
});

export const startServer = async ({
  host = process.env.HOST || '127.0.0.1',
  port = process.env.BACKEND_PORT || process.env.PORT || 3001,
  log = true,
} = {}) => {
  const distDir = path.join(packageRoot, 'dist');
  try {
    await fs.access(path.join(distDir, 'index.html'));
    app.use(express.static(distDir));
    app.get(/.*/, (_request, response) => {
      response.sendFile(path.join(distDir, 'index.html'));
    });
  } catch {
    // During development, Vite serves the interface on port 3000.
  }

  return new Promise((resolve, reject) => {
    const server = app.listen(port, host, () => {
      if (log) {
        console.log(`Mosaico render server: http://${host}:${port}`);
      }
      resolve(server);
    });
    server.on('error', reject);
  });
};

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  await startServer();
}
