const { app, BrowserWindow } = require("electron");
const path = require("path");
const http = require("http");
const fs = require("fs");
const { spawn } = require("child_process");

const DEFAULT_PORT = 39647;

/** @type {import('child_process').ChildProcess | null} */
let serverChild = null;
/** @type {import('electron').BrowserWindow | null} */
let mainWindow = null;

function getStandaloneRoot() {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, "standalone");
  }
  return path.join(__dirname, "..", ".next", "standalone");
}

/**
 * @param {string} url
 * @param {number} attempts
 */
async function waitForServer(url, attempts = 90) {
  for (let i = 0; i < attempts; i++) {
    try {
      await new Promise((resolve, reject) => {
        const req = http.get(url, (res) => {
          res.resume();
          resolve(undefined);
        });
        req.on("error", reject);
        req.setTimeout(2000, () => {
          req.destroy();
          reject(new Error("timeout"));
        });
      });
      return;
    } catch {
      await new Promise((r) => setTimeout(r, 300));
    }
  }
  throw new Error(`Server did not become ready: ${url}`);
}

/**
 * @param {string} standaloneRoot
 * @param {number} port
 */
function startNextServer(standaloneRoot, port) {
  const serverJs = path.join(standaloneRoot, "server.js");
  if (!fs.existsSync(serverJs)) {
    throw new Error(
      `Missing ${serverJs} — run "npm run build" before launching Electron.`,
    );
  }
  const child = spawn(process.execPath, [serverJs], {
    cwd: standaloneRoot,
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: "1",
      PORT: String(port),
      HOSTNAME: "127.0.0.1",
      NODE_ENV: "production",
    },
    stdio: "pipe",
  });
  child.stderr?.on("data", (d) => process.stderr.write(d));
  child.stdout?.on("data", (d) => process.stderr.write(d));
  child.on("error", (err) => console.error("Flightdeck server:", err));
  return child;
}

async function createWindow() {
  const isDev = process.env.FLIGHTDECK_ELECTRON_DEV === "1";
  let loadUrl;

  if (isDev) {
    loadUrl = "http://127.0.0.1:3000";
    await waitForServer(loadUrl);
  } else {
    const port = Number(process.env.FLIGHTDECK_PORT) || DEFAULT_PORT;
    loadUrl = `http://127.0.0.1:${port}`;
    if (!serverChild || serverChild.exitCode != null) {
      const standaloneRoot = getStandaloneRoot();
      serverChild = startNextServer(standaloneRoot, port);
      await waitForServer(loadUrl);
    }
  }

  mainWindow = new BrowserWindow({
    width: 1280,
    height: 840,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  mainWindow.loadURL(loadUrl);
  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

function shutdownServer() {
  if (serverChild && serverChild.exitCode === null) {
    serverChild.kill("SIGTERM");
  }
  serverChild = null;
}

app.whenReady().then(() => createWindow());

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    shutdownServer();
    app.quit();
  }
});

app.on("before-quit", () => {
  shutdownServer();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    void createWindow();
  }
});
