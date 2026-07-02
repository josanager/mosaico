#!/usr/bin/env node

import {spawn} from 'node:child_process';
import fs from 'node:fs/promises';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import {
  applyDocumentOperations,
  createEmptyProject,
  createMosaicoDocument,
  validateMosaicoDocument,
} from '../lib/document-core.mjs';

const commandNames = new Set(['dev', 'start', 'serve', 'validate', 'document', 'apply', 'help']);
const args = process.argv.slice(2);
const command = commandNames.has(args[0]) ? args.shift() : 'dev';

const options = {
  workspace: '.',
  host: '127.0.0.1',
  port: 3001,
  open: true,
};
const positionals = [];

for (let index = 0; index < args.length; index += 1) {
  const arg = args[index];
  if (arg === '--workspace' || arg === '-w') {
    options.workspace = args[index + 1] || '.';
    index += 1;
    continue;
  }
  if (arg === '--host') {
    options.host = args[index + 1] || options.host;
    index += 1;
    continue;
  }
  if (arg === '--port' || arg === '-p') {
    options.port = Number(args[index + 1] || options.port);
    index += 1;
    continue;
  }
  if (arg === '--no-open') {
    options.open = false;
    continue;
  }
  if (arg === '--help' || arg === '-h') {
    positionals.push('help');
    continue;
  }
  positionals.push(arg);
}

if (command === 'dev' && positionals[0] && positionals[0] !== 'help') {
  options.workspace = positionals[0];
}

const workspaceDir = path.resolve(process.cwd(), options.workspace);
const projectDir = path.join(workspaceDir, 'projects');
const projectLibraryDir = path.join(projectDir, 'video-projects');
const projectIndexFile = path.join(projectDir, 'projects-index.json');
const projectFile = path.join(projectDir, 'current.json');
const mediaIndexFile = path.join(projectDir, 'media.json');

const showHelp = () => {
  console.log(`Mosaico Studio

Human editor:
  mosaico-studio [workspace]
  mosaico-studio dev --workspace ./mi-proyecto --port 3001 --no-open

Agent automation:
  mosaico-studio document --workspace ./mi-proyecto
  mosaico-studio validate --workspace ./mi-proyecto
  mosaico-studio apply operations.json --workspace ./mi-proyecto

Options:
  -w, --workspace   Folder where projects, media and renders are stored
  -p, --port        Preferred local port
      --host        Host interface to bind
      --no-open     Do not open the browser automatically
  -h, --help        Show this help
`);
};

if (command === 'help' || positionals.includes('help')) {
  showHelp();
  process.exit(0);
}

const safeName = (name) =>
  String(name || 'project')
    .normalize('NFKD')
    .replace(/[^\w.-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 100);

const readJsonFile = async (file, fallback) =>
  fs
    .readFile(file, 'utf8')
    .then((content) => JSON.parse(content))
    .catch(() => fallback);

const ensureWorkspaceDirs = async () => {
  await Promise.all([
    fs.mkdir(path.join(workspaceDir, 'public', 'media'), {recursive: true}),
    fs.mkdir(path.join(workspaceDir, 'renders'), {recursive: true}),
    fs.mkdir(projectLibraryDir, {recursive: true}),
  ]);
};

const getProjectFolder = (entry) => path.join(projectLibraryDir, entry.slug);
const getProjectStatePaths = (entry) => ({
  project: path.join(getProjectFolder(entry), 'project.json'),
  media: path.join(getProjectFolder(entry), 'media.json'),
});

const buildProjectSummary = (entry, project, media) => ({
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
  assetCount: Array.isArray(media.assets) ? media.assets.length : 0,
  folderCount: Array.isArray(media.folders) ? media.folders.length : 0,
});

const writeDocument = async (entry, document) => {
  const paths = getProjectStatePaths(entry);
  await fs.mkdir(getProjectFolder(entry), {recursive: true});
  await Promise.all([
    fs.writeFile(paths.project, JSON.stringify(document.project, null, 2)),
    fs.writeFile(paths.media, JSON.stringify(document.media, null, 2)),
    fs.writeFile(projectFile, JSON.stringify(document.project, null, 2)),
    fs.writeFile(mediaIndexFile, JSON.stringify(document.media, null, 2)),
  ]);
  const library = {
    activeProjectId: entry.id,
    projects: [buildProjectSummary(entry, document.project, document.media)],
  };
  await fs.writeFile(projectIndexFile, JSON.stringify(library, null, 2));
};

const readDocument = async ({createIfMissing = false} = {}) => {
  await ensureWorkspaceDirs();
  const library = await readJsonFile(projectIndexFile, null);
  const active = library?.projects?.find((item) => item.id === library.activeProjectId) ??
    library?.projects?.[0];

  if (active) {
    const paths = getProjectStatePaths(active);
    const project = await readJsonFile(paths.project, null);
    const media = await readJsonFile(paths.media, {assets: [], folders: []});
    if (project) return {entry: active, document: createMosaicoDocument({project, media})};
  }

  const legacyProject = await readJsonFile(projectFile, null);
  const legacyMedia = await readJsonFile(mediaIndexFile, {assets: [], folders: []});
  const project = legacyProject ?? (createIfMissing ? createEmptyProject() : null);
  if (!project) return null;

  const now = new Date().toISOString();
  const entry = {
    id: project.id,
    slug: `${safeName(project.name) || 'project'}-${project.id.slice(0, 8)}`,
    createdAt: now,
    updatedAt: now,
    lastOpenedAt: now,
  };
  const document = createMosaicoDocument({project, media: legacyMedia});
  if (createIfMissing) await writeDocument(entry, document);
  return {entry, document};
};

const isPortAvailable = (port, bindHost) =>
  new Promise((resolve) => {
    const server = net.createServer();
    server.once('error', () => resolve(false));
    server.once('listening', () => {
      server.close(() => resolve(true));
    });
    server.listen(port, bindHost);
  });

const resolvePort = async (preferredPort, bindHost) => {
  const basePort = Number.isFinite(preferredPort) && preferredPort > 0
    ? Math.floor(preferredPort)
    : 3001;

  for (let attempt = 0; attempt < 20; attempt += 1) {
    const nextPort = basePort + attempt;
    if (await isPortAvailable(nextPort, bindHost)) {
      return nextPort;
    }
  }

  throw new Error('No free local port found between 3001 and 3020.');
};

const openBrowser = (url) => {
  const launch = (program, programArgs) => {
    const child = spawn(program, programArgs, {stdio: 'ignore', detached: true});
    child.on('error', () => undefined);
    child.unref();
  };

  const platform = os.platform();
  if (platform === 'darwin') {
    launch('open', [url]);
    return;
  }
  if (platform === 'win32') {
    launch('cmd', ['/c', 'start', '', url]);
    return;
  }
  launch('xdg-open', [url]);
};

if (command === 'document') {
  const state = await readDocument({createIfMissing: true});
  console.log(JSON.stringify(state.document, null, 2));
  process.exit(0);
}

if (command === 'validate') {
  const state = await readDocument({createIfMissing: true});
  const validation = validateMosaicoDocument(state.document);
  if (!validation.ok) {
    console.error(validation.errors.join('\n'));
    process.exit(1);
  }
  console.log('Mosaico document is valid.');
  process.exit(0);
}

if (command === 'apply') {
  const operationsFile = positionals.find((item) => item !== 'help');
  if (!operationsFile) {
    console.error('Missing operations file.');
    process.exit(1);
  }
  const operationsPayload = await readJsonFile(path.resolve(process.cwd(), operationsFile), null);
  const operations = Array.isArray(operationsPayload?.operations)
    ? operationsPayload.operations
    : Array.isArray(operationsPayload)
      ? operationsPayload
      : null;
  if (!operations) {
    console.error('Operations file must contain an array or an {operations: [...]} object.');
    process.exit(1);
  }
  const state = await readDocument({createIfMissing: true});
  const nextDocument = applyDocumentOperations(state.document, operations);
  const validation = validateMosaicoDocument(nextDocument);
  if (!validation.ok) {
    console.error(validation.errors.join('\n'));
    process.exit(1);
  }
  const updatedEntry = {...state.entry, updatedAt: new Date().toISOString()};
  await writeDocument(updatedEntry, nextDocument);
  console.log(`Applied ${operations.length} operation${operations.length === 1 ? '' : 's'}.`);
  process.exit(0);
}

const port = await resolvePort(options.port, options.host);
process.env.MOSAICO_WORKSPACE_DIR = workspaceDir;
process.env.PORT = String(port);
process.env.BACKEND_PORT = String(port);

const {startServer} = await import('../server/index.mjs');
await startServer({host: options.host, port});

const url = `http://${options.host}:${port}`;
console.log(`Mosaico Studio ready at ${url}`);
console.log(`Workspace: ${workspaceDir}`);

if (options.open) {
  try {
    openBrowser(url);
  } catch {
    // Best effort only.
  }
}
