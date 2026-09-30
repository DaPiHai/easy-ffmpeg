// 视频缩略图：持久化磁盘缓存 + 索引 + 并发闸门 + 失效清理
// 身份标识 = 源文件路径 + mtime + size（非文件名）：同名新视频会得到新 key，不会误用旧图
const fs = require("fs");
const fsp = require("fs/promises");
const path = require("path");
const crypto = require("crypto");
const { grabFrame } = require("./ffmpeg");
const { STATE_DIR } = require("./paths");

const THUMB_DIR = path.join(STATE_DIR, "thumbs");
const INDEX_FILE = path.join(THUMB_DIR, "index.json");
const MAX_CONCURRENT = 2;
const MAX_CACHE_FILES = 500;
const SEEK_SEC = 3;

// index: { [key]: { p: 源路径, m: mtimeMs, s: size, t: 生成时间 } }
let index = null;
let indexLoad = null;
let persistChain = Promise.resolve();
const generating = new Set(); // 生成中的 key，清理任务跳过

let pruneTimer = null;

function loadIndex() {
  if (!indexLoad) {
    indexLoad = fsp
      .readFile(INDEX_FILE, "utf8")
      .then((txt) => {
        try {
          const parsed = JSON.parse(txt);
          index = parsed && typeof parsed === "object" ? parsed : {};
        } catch {
          index = {};
        }
      })
      .catch(() => {
        index = {};
      });
  }
  return indexLoad;
}

// 串行 + 临时文件原子替换，避免并发写坏索引
function persistIndex() {
  persistChain = persistChain
    .then(() =>
      fsp
        .mkdir(THUMB_DIR, { recursive: true })
        .then(() => fsp.writeFile(INDEX_FILE + ".tmp", JSON.stringify(index)))
        .then(() => fsp.rename(INDEX_FILE + ".tmp", INDEX_FILE))
    )
    .catch(() => {});
  return persistChain;
}

let running = 0;
const waiting = [];

// 队尾串行调度：并发闸门满时任务排队
function withSlot(fn) {
  return new Promise((resolve, reject) => {
    const start = () => {
      running++;
      fn()
        .then(resolve, reject)
        .finally(() => {
          running--;
          const next = waiting.shift();
          if (next) next();
        });
    };
    if (running < MAX_CONCURRENT) start();
    else waiting.push(start);
  });
}

/**
 * 清理任务：
 * - 源视频已删除 → 删除其缩略图与索引记录
 * - 源视频已变更（mtime/size 与记录不符，含同名新视频）→ 旧缩略图不可达，删除
 * - 磁盘上无索引记录的孤儿文件 → 删除
 * - 超过上限按生成时间删最旧
 */
async function cleanup() {
  await loadIndex();
  for (const key of Object.keys(index)) {
    if (generating.has(key)) continue;
    const e = index[key];
    const jpg = path.join(THUMB_DIR, `${key}.jpg`);
    let src = null;
    let jpgSt = null;
    try {
      src = await fsp.stat(e.p);
    } catch {}
    try {
      jpgSt = await fsp.stat(jpg);
    } catch {}
    const srcValid = src && src.isFile() && src.mtimeMs === e.m && src.size === e.s;
    if (!srcValid) {
      // 源不存在或已变更：缩略图不再有意义
      if (jpgSt) await fsp.rm(jpg, { force: true }).catch(() => {});
      delete index[key];
    } else if (!jpgSt) {
      // 有记录无文件（如生成中断的残留记录）
      delete index[key];
    }
  }

  let names = [];
  try {
    names = await fsp.readdir(THUMB_DIR);
  } catch {}
  for (const n of names) {
    if (n === "index.json" || n === "index.json.tmp") continue;
    const key = n.replace(/\.jpg$/, "");
    if (!index[key] && !generating.has(key)) {
      await fsp.rm(path.join(THUMB_DIR, n), { force: true }).catch(() => {});
    }
  }

  const entries = Object.entries(index).sort((a, b) => a[1].t - b[1].t);
  for (let i = 0; i < entries.length - MAX_CACHE_FILES; i++) {
    const [key] = entries[i];
    await fsp.rm(path.join(THUMB_DIR, `${key}.jpg`), { force: true }).catch(() => {});
    delete index[key];
  }
  await persistIndex();
}

function ensureCleanupTimer() {
  if (pruneTimer) return;
  pruneTimer = setInterval(cleanup, 60 * 60 * 1000);
  pruneTimer.unref();
  cleanup();
}

/**
 * 生成/读取视频缩略图，返回缓存文件绝对路径。
 * st 为源文件 stat（缓存 key 的一部分，文件变化自动失效）。
 */
async function videoThumbnail(file, st) {
  await loadIndex();
  const key = crypto
    .createHash("md5")
    .update(`${file}|${st.mtimeMs}|${st.size}`)
    .digest("hex");
  const cached = path.join(THUMB_DIR, `${key}.jpg`);

  try {
    await fsp.access(cached);
    return cached;
  } catch {}

  await fsp.mkdir(THUMB_DIR, { recursive: true });
  ensureCleanupTimer();

  await withSlot(async () => {
    // 双重检查：排队期间同文件可能已由其它请求生成
    try {
      await fsp.access(cached);
      return;
    } catch {}
    generating.add(key);
    try {
      try {
        await grabFrame(file, cached, { seekSec: SEEK_SEC });
      } catch (e) {
        // 短视频 -ss 越界时无输出帧，降级从头抽帧
        await grabFrame(file, cached, { seekSec: 0 });
      }
      if (!fs.existsSync(cached)) throw new Error("缩略图生成失败");
      index[key] = { p: file, m: st.mtimeMs, s: st.size, t: Date.now() };
      await persistIndex();
    } finally {
      generating.delete(key);
    }
  });

  return cached;
}

module.exports = { videoThumbnail };
