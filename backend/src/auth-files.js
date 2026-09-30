const fs = require("fs");
const fsp = require("fs/promises");
const path = require("path");
const { callTrimApi } = require("./trim-api");
const { IS_DEV, DEV_ROOT } = require("./paths");

/** 从统一网关注入的请求头解析当前用户 uid（本地开发时为 0） */
function uidFromReq(req) {
  const v = parseInt(String(req.headers["x-trim-userid"] || ""), 10);
  return Number.isFinite(v) ? v : 0;
}

/** 规范化路径并拒绝空字节 */
function normalizePath(p) {
  if (typeof p !== "string" || !p.trim()) {
    throw Object.assign(new Error("路径不能为空"), { status: 400 });
  }
  if (p.includes("\0")) {
    throw Object.assign(new Error("非法路径"), { status: 400 });
  }
  return path.resolve(p);
}

function isUnder(root, target) {
  const r = path.resolve(root);
  const t = path.resolve(target);
  return t === r || t.startsWith(r + path.sep);
}

// ---- 授权目录查询（带 30 秒缓存，避免频繁调用平台 API）----

const dirCache = new Map(); // uid -> { at, dirs }
const CACHE_TTL = 30 * 1000;

function devDirs() {
  return [
    {
      path: DEV_ROOT,
      name: "开发目录 (devdata/files)",
      type: "user"
    }
  ];
}

async function listAccessibleDirs(uid, { force = false } = {}) {
  if (IS_DEV || !uid) {
    await fsp.mkdir(DEV_ROOT, { recursive: true });
    return devDirs();
  }

  const cached = dirCache.get(uid);
  if (!force && cached && Date.now() - cached.at < CACHE_TTL) {
    return cached.dirs;
  }

  const [user, shared] = await Promise.all([
    callTrimApi("trim.file.getUserAccessibleFolders", { uid }).catch(() => null),
    callTrimApi("trim.file.getSharedAccessibleFolders").catch(() => null)
  ]);

  const raw = [];
  for (const p of user?.paths || []) raw.push({ path: p, type: "user" });
  for (const p of shared?.paths || []) raw.push({ path: p, type: "shared" });

  const dirs = raw.map((d) => ({
    ...d,
    name: path.basename(d.path) || d.path
  }));

  // 批量把内部路径转换为用户可读的展示路径（失败则回退 basename）
  if (dirs.length > 0) {
    try {
      const conv = await callTrimApi("trim.file.convertPath", {
        path: dirs.map((d) => d.path),
        language: "zh-CN"
      });
      const result = conv?.result;
      if (Array.isArray(result) && result.length === dirs.length) {
        result.forEach((r, i) => {
          if (r && r.semanticPath) dirs[i].name = r.semanticPath;
        });
      }
    } catch {}
  }

  dirCache.set(uid, { at: Date.now(), dirs });
  return dirs;
}

function clearDirCache(uid) {
  if (uid === undefined) dirCache.clear();
  else dirCache.delete(uid);
}

/**
 * 断言目标路径落在当前用户的某个授权目录之下，返回命中的根目录。
 * 未授权/越界访问一律拒绝。
 */
async function assertInAccessibleRoots(uid, target) {
  const p = normalizePath(target);
  const dirs = await listAccessibleDirs(uid);
  const hit = dirs.find((d) => isUnder(d.path, p));
  if (!hit) {
    throw Object.assign(new Error("路径不在已授权目录内，请先在应用中添加授权目录"), {
      status: 403
    });
  }
  return { root: hit, path: p };
}

/**
 * 检查应用运行用户对路径的真实读写能力（应用以独立用户运行，
 * 授权后系统会给该用户授 POSIX ACL，fs.access 即是进程视角的事实）。
 */
async function assertFsAccess(p, mode) {
  try {
    await fsp.access(p, mode);
  } catch {
    const what = mode & fs.constants.W_OK ? "写" : "读";
    throw Object.assign(new Error(`应用对 ${p} 没有文件系统${what}权限`), { status: 403 });
  }
}

/**
 * 批量检查“当前登录用户”对路径的读权限（飞牛 checkUserACL）。
 * 开发模式或调用失败时返回 null（不据此过滤）。
 */
async function filterReadableForUser(uid, pathsToCheck) {
  if (IS_DEV || !uid || pathsToCheck.length === 0) return null;
  try {
    const data = await callTrimApi("trim.file.checkUserACL", {
      uid,
      path: pathsToCheck
    });
    const arr = Array.isArray(data) ? data : data?.results || data?.result;
    if (Array.isArray(arr) && arr.length === pathsToCheck.length) {
      return arr.map((r) => Boolean(r && r.readable));
    }
  } catch {}
  return null;
}

async function ensureDevRoot() {
  await fsp.mkdir(DEV_ROOT, { recursive: true });
}

module.exports = {
  uidFromReq,
  normalizePath,
  isUnder,
  listAccessibleDirs,
  clearDirCache,
  assertInAccessibleRoots,
  assertFsAccess,
  filterReadableForUser,
  ensureDevRoot
};
