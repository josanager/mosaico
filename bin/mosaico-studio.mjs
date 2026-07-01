#!/usr/bin/env node

import {spawn} from 'node:child_process';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';

const args = process.argv.slice(2);
let workspaceArg = '.';
let host = '127.0.0.1';
let requestedPort = 3001;
let shouldOpen = true;

for (let index = 0; index < args.length; index += 1) {
  const arg = args[index];
  if (arg === '--workspace' || arg === '-w') {
    workspaceArg = args[index + 1] || '.';
    index += 1;
    continue;
  }
  if (arg === '--host') {
    host = args[index + 1] || host;
    index += 1;
    continue;
  }
  if (arg === '--port' || arg === '-p') {
    requestedPort = Number(args[index + 1] || requestedPort);
    index += 1;
    continue;
  }
  if (arg === '--no-open') {
    shouldOpen = false;
    continue;
  }
  if (arg === '--help' || arg === '-h') {
    console.log(`Mosaico Studio

Usage:
  mosaico-studio [workspace]
  mosaico-studio --workspace ./mi-proyecto --port 3001 --no-open

Options:
  -w, --workspace   Folder where projects, media and renders are stored
  -p, --port        Preferred local port
      --host        Host interface to bind
      --no-open     Do not open the browser automatically
  -h, --help        Show this help
`);
    process.exit(0);
  }
  if (!arg.startsWith('-') && workspaceArg === '.') {
    workspaceArg = arg;
  }
}

const workspaceDir = path.resolve(process.cwd(), workspaceArg);

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
  const launch = (command, commandArgs) => {
    const child = spawn(command, commandArgs, {stdio: 'ignore', detached: true});
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

const port = await resolvePort(requestedPort, host);
process.env.MOSAICO_WORKSPACE_DIR = workspaceDir;
process.env.PORT = String(port);
process.env.BACKEND_PORT = String(port);

const {startServer} = await import('../server/index.mjs');
await startServer({host, port});

const url = `http://${host}:${port}`;
console.log(`Mosaico Studio ready at ${url}`);
console.log(`Workspace: ${workspaceDir}`);

if (shouldOpen) {
  try {
    openBrowser(url);
  } catch {
    // Best effort only.
  }
}
