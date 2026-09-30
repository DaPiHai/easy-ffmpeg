import { reactive } from "vue";
import { api, connectWs } from "./api";

export const store = reactive({
  tab: "merge",
  config: { dev: false, version: "", appName: "", gatewayPrefix: "/app/easyffmpeg" },
  dirs: [], // [{ path, name, type: "user"|"shared" }]
  dirsLoaded: false,
  jobs: [],
  wsConnected: false,
  // 主题：light | dark | auto（auto = 跟随宿主/系统）
  theme: localStorage.getItem("easyffmpeg:theme") || "auto",
  systemTheme: null, // 'dark' | 'light'，来自宿主 getPlatformConfig / os/theme 事件或浏览器偏好
  // 文件/目录选择对话框状态（由 openPicker 设置，App.vue 渲染 DirBrowser）
  picker: null
});

const THEME_KEY = "easyffmpeg:theme";

export function resolvedTheme() {
  if (store.theme === "auto") return store.systemTheme || "dark";
  return store.theme;
}

export function applyTheme() {
  const dark = resolvedTheme() === "dark";
  document.documentElement.classList.toggle("dark", dark);
  let meta = document.querySelector('meta[name="theme-color"]');
  if (!meta) {
    meta = document.createElement("meta");
    meta.name = "theme-color";
    document.head.appendChild(meta);
  }
  meta.content = dark ? "#121212" : "#ffffff";
}

export function setTheme(theme) {
  store.theme = theme;
  try {
    localStorage.setItem(THEME_KEY, theme);
  } catch {}
  applyTheme();
}

/**
 * 主题初始化：
 * - 宿主环境：getPlatformConfig 拿当前主题 + $on('os/theme') 跟随宿主切换
 * - 非宿主：回退到浏览器 prefers-color-scheme
 */
export async function initTheme(sdk) {
  try {
    const cfg = await sdk.getPlatformConfig();
    if (cfg && (cfg.theme === "dark" || cfg.theme === "light")) {
      store.systemTheme = cfg.theme;
    }
  } catch {}

  if (sdk && sdk.isWeb === true && sdk.isStandaloneWeb === false) {
    try {
      await sdk.$on("os/theme", (theme) => {
        if (theme === "dark" || theme === "light") {
          store.systemTheme = theme;
          if (store.theme === "auto") applyTheme();
        }
      });
    } catch {}
  } else if (window.matchMedia) {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    store.systemTheme = mq.matches ? "dark" : "light";
    mq.addEventListener("change", (e) => {
      store.systemTheme = e.matches ? "dark" : "light";
      if (store.theme === "auto") applyTheme();
    });
  }

  applyTheme();
}

export async function loadConfig() {
  try {
    store.config = await api.config();
  } catch (e) {
    console.warn("读取配置失败", e);
  }
}

export async function refreshAccessibleDirs() {
  try {
    const data = await api.accessible(true);
    store.dirs = data.dirs || [];
    store.dirsLoaded = true;
  } catch (e) {
    store.dirsLoaded = true;
    throw e;
  }
}

export function connectJobsWs() {
  connectWs((connected, msg) => {
    store.wsConnected = connected;
    if (!msg) return;
    if (msg.type === "snapshot") {
      store.jobs = msg.jobs || [];
    } else if (msg.type === "removed") {
      store.jobs = store.jobs.filter((j) => j.id !== msg.job?.id);
    } else if (msg.job) {
      const idx = store.jobs.findIndex((j) => j.id === msg.job.id);
      if (idx >= 0) store.jobs.splice(idx, 1, msg.job);
      else store.jobs.unshift(msg.job);
    }
  });
}

/**
 * 打开文件/目录选择对话框。
 * opts: { mode: "file"|"files"|"dir", accept?: string[]（扩展名白名单）, root?: string（起始目录） }
 * 返回 Promise<string[] | string | null>
 */
export function openPicker(opts) {
  return new Promise((resolve) => {
    store.picker = { mode: "file", multiple: false, accept: null, root: "", ...opts, resolve };
  });
}

export function closePicker(result) {
  const p = store.picker;
  store.picker = null;
  p && p.resolve && p.resolve(result);
}
