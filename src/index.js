"use strict";

const fs = require("node:fs/promises");
const path = require("node:path");
const os = require("node:os");
const { spawn } = require("node:child_process");
const readline = require("node:readline");

const APP_NAME = "DevLauncher";
const isWindows = process.platform === "win32";
// When running with `node src/index.js`, use the project-root config.json.
// When packaged into an executable, use config.json beside the executable.
const PROJECT_ROOT = path.resolve(__dirname, "..");
const RUNTIME_CONFIG_PATH = process.pkg
  ? path.join(path.dirname(process.execPath), "config.json")
  : path.join(PROJECT_ROOT, "config.json");

const state = {
  workspaces: [],
  workspaceIndex: 0,
  currentRoot: null,
  currentPath: null,
  entries: [],
  selectedIndex: 0,
  history: [],
  mode: "workspaces", // workspaces | directories
  message: "",
  running: true,
  config: {
    workspaces: [],
    showHiddenDirectories: false,
    openWithCodeCommand: "code"
  }
};

function normalizePath(p) {
  return path.resolve(p);
}

function isInsideRoot(root, candidate) {
  const relative = path.relative(root, candidate);
  return relative === "" || (!relative.startsWith(".." + path.sep) && relative !== ".." && !path.isAbsolute(relative));
}

async function loadConfig() {
  let raw;
  try {
    raw = await fs.readFile(RUNTIME_CONFIG_PATH, "utf8");
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    const sample = {
      workspaces: [path.join(os.homedir(), "Projects")],
      showHiddenDirectories: false,
      openWithCodeCommand: "code"
    };
    await fs.writeFile(RUNTIME_CONFIG_PATH, JSON.stringify(sample, null, 2) + "\n", "utf8");
    raw = JSON.stringify(sample);
    state.message = `已创建配置文件：${RUNTIME_CONFIG_PATH}，请编辑 workspaces 后重启。`;
  }

  const parsed = JSON.parse(raw);
  if (!parsed || !Array.isArray(parsed.workspaces)) {
    throw new Error("配置文件格式错误：workspaces 必须是数组。");
  }

  const valid = [];
  for (const item of parsed.workspaces) {
    if (typeof item !== "string" || !item.trim()) continue;
    const expanded = item.trim().replace(/^~(?=$|[\\/])/, os.homedir());
    const resolved = normalizePath(expanded);
    try {
      const stat = await fs.stat(resolved);
      if (stat.isDirectory()) valid.push(resolved);
    } catch {
      // Ignore missing workspace paths; show a message below.
    }
  }

  state.config = {
    workspaces: parsed.workspaces,
    showHiddenDirectories: Boolean(parsed.showHiddenDirectories),
    openWithCodeCommand: typeof parsed.openWithCodeCommand === "string" && parsed.openWithCodeCommand.trim()
      ? parsed.openWithCodeCommand.trim()
      : "code"
  };
  state.workspaces = valid;

  if (valid.length === 0) {
    state.message = `没有找到有效工作目录。请编辑配置文件：${RUNTIME_CONFIG_PATH}`;
  }
}

async function readDirectories(directory) {
  const items = await fs.readdir(directory, { withFileTypes: true });
  const dirs = [];

  for (const item of items) {
    if (!item.isDirectory()) continue;
    if (!state.config.showHiddenDirectories && item.name.startsWith(".")) continue;

    const fullPath = path.join(directory, item.name);
    try {
      const stat = await fs.stat(fullPath);
      if (stat.isDirectory()) dirs.push({ name: item.name, path: fullPath });
    } catch {
      // Skip inaccessible or disappearing entries.
    }
  }

  dirs.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" }));
  return dirs;
}

async function enterWorkspace(index) {
  const workspace = state.workspaces[index];
  if (!workspace) return;

  state.workspaceIndex = index;
  state.currentRoot = workspace;
  state.currentPath = workspace;
  state.history = [];
  state.mode = "directories";
  state.selectedIndex = 0;
  await refreshDirectories();
}

async function refreshDirectories() {
  try {
    state.entries = await readDirectories(state.currentPath);
    state.selectedIndex = Math.min(state.selectedIndex, Math.max(0, state.entries.length - 1));
    if (state.entries.length === 0) state.selectedIndex = 0;
    state.message = state.entries.length === 0 ? "当前目录没有可进入的子目录。按 Space 可用 VS Code 打开当前目录。" : "";
  } catch (error) {
    state.entries = [];
    state.selectedIndex = 0;
    state.message = `无法读取目录：${error.message}`;
  }
}

function selectedDirectory() {
  return state.entries[state.selectedIndex] || null;
}

function getTerminalWidth() {
  return Math.max(60, process.stdout.columns || 80);
}

function truncate(text, width) {
  if (text.length <= width) return text;
  if (width <= 3) return text.slice(0, width);
  return text.slice(0, width - 3) + "...";
}

function render() {
  const width = Math.max(60, process.stdout.columns || 80);
  const lines = [];
  const cyan = "\x1b[36m";
  const gray = "\x1b[90m";
  const reset = "\x1b[0m";
  const reverse = "\x1b[7m";

  // Keep the UI intentionally minimal: path + selectable directory list.
  const currentPath = state.mode === "workspaces"
    ? "工作区"
    : (state.currentPath || "");
  lines.push(`${cyan}◆${reset} ${currentPath}`);
  lines.push("");

  if (state.mode === "workspaces") {
    if (state.workspaces.length === 0) {
      lines.push("  （没有可用工作区）");
    } else {
      state.workspaces.forEach((workspace, index) => {
        const selected = index === state.workspaceIndex;
        const line = ` ${selected ? "❯" : " "} ${path.basename(workspace) || workspace}  ${gray}${workspace}${reset}`;
        lines.push(selected ? `${reverse}${truncate(line, width)}${reset}` : truncate(line, width));
      });
    }
  } else if (state.entries.length === 0) {
    lines.push("  （空目录）");
  } else {
    state.entries.forEach((entry, index) => {
      const selected = index === state.selectedIndex;
      const line = ` ${selected ? "❯" : " "} ${entry.name}`;
      lines.push(selected ? `${reverse}${truncate(line, width)}${reset}` : truncate(line, width));
    });
  }

  if (state.message) {
    lines.push("");
    lines.push(`${gray}${truncate(state.message, width)}${reset}`);
  }

  process.stdout.write("\x1b[2J\x1b[H" + lines.join("\n") + "\n");
}

function openInVSCode(targetPath) {
  if (!targetPath) return;
  const command = state.config.openWithCodeCommand || "code";
  try {
    const child = spawn(command, [targetPath], {
      detached: true,
      stdio: "ignore",
      shell: isWindows
    });
    child.on("error", (error) => {
      state.message = `启动 VS Code 失败：${error.message}。请确认已安装 VS Code，并且 code 命令可用。`;
      render();
    });
    child.unref();
    state.message = `已请求 VS Code 打开：${targetPath}`;
  } catch (error) {
    state.message = `启动 VS Code 失败：${error.message}`;
  }
}

async function handleKey(key) {
  // Ctrl+C exits. Left/right are navigation; no Q or Backspace shortcuts.
  if (key === "\u0003") {
    state.running = false;
    return;
  }

  if (key === "\u001b[A") { // Up
    if (state.mode === "workspaces") {
      if (state.workspaces.length) state.workspaceIndex = (state.workspaceIndex - 1 + state.workspaces.length) % state.workspaces.length;
    } else if (state.entries.length) {
      state.selectedIndex = (state.selectedIndex - 1 + state.entries.length) % state.entries.length;
    }
    state.message = "";
    return;
  }

  if (key === "\u001b[B") { // Down
    if (state.mode === "workspaces") {
      if (state.workspaces.length) state.workspaceIndex = (state.workspaceIndex + 1) % state.workspaces.length;
    } else if (state.entries.length) {
      state.selectedIndex = (state.selectedIndex + 1) % state.entries.length;
    }
    state.message = "";
    return;
  }

  if (key === "\u001b[C") { // Right: enter selected workspace/directory
    if (state.mode === "workspaces") {
      await enterWorkspace(state.workspaceIndex);
    } else {
      const entry = selectedDirectory();
      if (!entry) {
        state.message = "当前目录没有子目录";
      } else {
        state.history.push({ path: state.currentPath, selectedIndex: state.selectedIndex });
        state.currentPath = entry.path;
        state.selectedIndex = 0;
        await refreshDirectories();
      }
    }
    return;
  }

  if (key === "\u001b[D") { // Left: go back
    if (state.mode === "directories") {
      if (state.history.length > 0) {
        const previous = state.history.pop();
        state.currentPath = previous.path;
        state.selectedIndex = previous.selectedIndex;
        await refreshDirectories();
        state.selectedIndex = Math.min(previous.selectedIndex, Math.max(0, state.entries.length - 1));
      } else {
        state.mode = "workspaces";
        state.currentPath = null;
        state.currentRoot = null;
        state.entries = [];
        state.message = "";
      }
    }
    return;
  }

  if (key === "\r" || key === "\n") {
    // Enter also enters, matching the original requested behavior.
    if (state.mode === "workspaces") {
      await enterWorkspace(state.workspaceIndex);
    } else {
      const entry = selectedDirectory();
      if (!entry) {
        state.message = "当前目录没有子目录";
      } else {
        state.history.push({ path: state.currentPath, selectedIndex: state.selectedIndex });
        state.currentPath = entry.path;
        state.selectedIndex = 0;
        await refreshDirectories();
      }
    }
    return;
  }

  if (key === " ") {
    if (state.mode === "workspaces") {
      openInVSCode(state.workspaces[state.workspaceIndex]);
    } else {
      const entry = selectedDirectory();
      openInVSCode(entry ? entry.path : state.currentPath);
    }
  }
}

async function main() {
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    console.error(`${APP_NAME} 需要在交互式终端中运行。请双击 start.bat 启动。`);
    process.exitCode = 1;
    return;
  }

  try {
    await loadConfig();
  } catch (error) {
    console.error(`配置加载失败：${error.message}`);
    console.error(`配置文件：${RUNTIME_CONFIG_PATH}`);
    console.error("请修复 JSON 格式后重试。");
    process.exitCode = 1;
    return;
  }

  readline.emitKeypressEvents(process.stdin);
  if (typeof process.stdin.setRawMode === "function") process.stdin.setRawMode(true);
  process.stdin.resume();

  const onResize = () => render();
  process.stdout.on("resize", onResize);

  let keyQueue = Promise.resolve();
  const onKeypress = (_str, key) => {
    if (!key) return;
    const input = key.sequence || _str;
    keyQueue = keyQueue.then(async () => {
      await handleKey(input);
      if (state.running) render();
      else cleanup();
    }).catch((error) => {
      state.message = `发生错误：${error.message}`;
      render();
    });
  };

  function cleanup() {
    process.stdin.off("keypress", onKeypress);
    process.stdout.off("resize", onResize);
    if (typeof process.stdin.setRawMode === "function") process.stdin.setRawMode(false);
    process.stdin.pause();
    process.stdout.write("\x1b[0m\x1b[?25h\n");
    process.exit(0);
  }

  process.stdout.write("\x1b[?25l");
  process.stdin.on("keypress", onKeypress);
  render();
}

main();
