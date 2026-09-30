import { TrimApp } from "@trimjs/web-app";
import { api } from "./api";

/**
 * 飞牛前端 JS SDK 封装。
 * - 宿主环境（fnOS 桌面 iframe / 微应用）：直接调 pickUserFile 等
 * - 独立浏览器页面（isStandaloneWeb）：走 openAppAuth 路由授权 + callback.html 回调
 * - 本地开发环境（SDK 初始化失败）：mock，提示用户改用「从授权目录浏览」
 */

const APP_NAME = "easyffmpeg";
const AUTH_STATE_KEY = "easyffmpeg:auth-state";

function createAuthState() {
  const s = Math.random().toString(36).slice(2) + Date.now().toString(36);
  try {
    localStorage.setItem(AUTH_STATE_KEY, s);
  } catch {}
  return s;
}

function checkAuthState(state) {
  let saved = null;
  try {
    saved = localStorage.getItem(AUTH_STATE_KEY);
  } catch {}
  return !saved || !state || saved === state;
}

let realSdk = null;
try {
  realSdk = new TrimApp();
} catch (e) {
  console.warn("[easyffmpeg] TrimApp 初始化失败，使用 mock SDK（本地开发模式）", e);
}

const mock = {
  isWeb: false,
  isStandaloneWeb: true,
  async pickUserFile() {
    throw new Error("当前未运行在飞牛 fnOS 中，无法打开系统文件选择器");
  },
  async openAppAuth() {
    throw new Error("当前未运行在飞牛 fnOS 中，无法打开授权页面");
  },
  async getPlatformConfig() {
    return null;
  },
  $on() {},
  parseAppAuthCallback(href) {
    const q = new URL(href, location.href).searchParams;
    return { status: q.get("status") || undefined, state: q.get("state"), data: undefined };
  }
};

export const sdk = realSdk || mock;
export const hasHost = Boolean(realSdk);

function normalizePaths(resp) {
  if (!resp) return [];
  if (Array.isArray(resp)) return resp;
  const d = resp.data;
  if (Array.isArray(d)) return d;
  if (Array.isArray(d?.paths)) return d.paths;
  return [];
}

function isOk(resp) {
  if (!resp) return false;
  if (resp.status && resp.status !== "success") return false;
  if (typeof resp.code === "number" && resp.code !== 0) return false;
  return true;
}

/**
 * 选择并授权一个目录。
 * 返回：授权成功的目录路径数组；独立浏览器页面下返回 []（授权结果由后端目录列表同步）。
 */
export async function pickDirectory() {
  if (!realSdk) {
    throw new Error("当前未运行在飞牛 fnOS 中，无法打开系统目录选择器");
  }
  if (!sdk.isStandaloneWeb) {
    const resp = await sdk.pickUserFile({ directory: true });
    if (!isOk(resp)) {
      throw new Error(resp?.msg || "未选择目录");
    }
    return normalizePaths(resp);
  }
  // 独立浏览器：路由授权，目录授权会持久化，完成后刷新目录列表即可
  await sdk.openAppAuth(
    "pickUserFile",
    {
      appName: APP_NAME,
      directory: true,
      redirectUri: `${import.meta.env.BASE_URL}callback.html`,
      state: createAuthState()
    },
    { target: "_blank", features: "width=750,height=630" }
  );
  return [];
}

/** 监听授权回调页的通知，自动刷新目录列表 */
export function listenAuthResult(onResult) {
  window.addEventListener("message", (event) => {
    if (event.origin !== window.location.origin) return;
    if (event.data?.type !== "easyffmpeg:auth-result") return;
    onResult(event.data?.result);
  });
}

export { checkAuthState };
