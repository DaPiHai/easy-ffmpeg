const fs = require("fs");
const fsp = require("fs/promises");
const path = require("path");
const {
  uidFromReq,
  listAccessibleDirs,
  assertInAccessibleRoots,
  assertFsAccess,
  filterReadableForUser,
  clearDirCache,
  normalizePath
} = require("./auth-files");
const { ffprobeJson, summarizeProbe } = require("./ffmpeg");
const { callTrimApi } = require("./trim-api");
const { IS_DEV, VERSION, APP_NAME, GATEWAY_PREFIX, MAX_CONCURRENCY } = require("./paths");

const CONTENT_TYPES = {
  ".mp4": "video/mp4",
  ".m4v": "video/mp4",
  ".mkv": "video/x-matroska",
  ".webm": "video/webm",
  ".mov": "video/quicktime",
  ".avi": "video/x-msvideo",
  ".ts": "video/mp2t",
  ".flv": "video/x-flv",
  ".wmv": "video/x-ms-wmv",
  ".m4a": "audio/mp4",
  ".mp3": "audio/mpeg",
  ".flac": "audio/flac",
  ".wav": "audio/wav",
  ".aac": "audio/aac",
  ".ogg": "audio/ogg"
};

const VIDEO_EXTS = new Set([
  ".mp4", ".m4v", ".mkv", ".webm", ".mov", ".avi", ".ts", ".flv", ".wmv", ".mpg", ".mpeg"
]);

const h = (fn) => (req, res) => {
  Promise.resolve(fn(req, res)).catch((e) => {
    if (!res.headersSent) {
      res.status(e?.status || 500).json({ error: e?.message || String(e) });
    } else {
      res.end();
    }
  });
};

async function statExists(p, wantDir) {
  const st = await fsp.stat(p).catch(() => null);
  if (!st) throw Object.assign(new Error(`路径不存在: ${p}`), { status: 404 });
  if (wantDir && !st.isDirectory()) throw new Error(`不是目录: ${p}`);
  if (!wantDir && !st.isFile()) throw new Error(`不是文件: ${p}`);
  return st;
}

/** 校验各任务类型参数，返回 { params, title } */
async function validateJob(uid, body) {
  const type = body.type;
  const p = body.params || {};
  const fileName = typeof p.fileName === "string" ? p.fileName.slice(0, 200) : undefined;

  const checkInput = async (f) => {
    const r = await assertInAccessibleRoots(uid, f);
    await statExists(r.path, false);
    await assertFsAccess(r.path, fs.constants.R_OK);
    return r.path;
  };
  const checkOutputDir = async (d) => {
    const r = await assertInAccessibleRoots(uid, d);
    await statExists(r.path, true);
    await assertFsAccess(r.path, fs.constants.W_OK);
    return r.path;
  };

  if (type === "merge") {
    const inputs = Array.isArray(p.inputs) ? p.inputs : [];
    if (inputs.length < 2) throw Object.assign(new Error("请至少选择 2 个视频"), { status: 400 });
    if (inputs.length > 30) throw Object.assign(new Error("一次最多合并 30 个视频"), { status: 400 });
    const checked = [];
    for (const f of inputs) checked.push(await checkInput(f));
    const mode = ["auto", "copy", "encode"].includes(p.mode) ? p.mode : "auto";
    return {
      params: { inputs: checked, outputDir: await checkOutputDir(p.outputDir), fileName, mode },
      title: `合并 ${checked.length} 个视频`
    };
  }

  if (type === "convert") {
    const input = await checkInput(p.input);
    return {
      params: {
        input,
        outputDir: await checkOutputDir(p.outputDir),
        fileName,
        container: ["mp4", "mkv", "webm"].includes(p.container) ? p.container : "mp4",
        quality: ["high", "balanced", "small"].includes(p.quality) ? p.quality : "balanced",
        scale: ["orig", "1080p", "720p"].includes(p.scale) ? p.scale : "orig",
        vcodec: p.vcodec === "libx265" ? "libx265" : "libx264"
      },
      title: `转码 ${path.basename(input)} → ${p.container || "mp4"}`
    };
  }

  if (type === "extract") {
    const input = await checkInput(p.input);
    return {
      params: {
        input,
        outputDir: await checkOutputDir(p.outputDir),
        fileName,
        format: ["auto", "mp3", "m4a", "flac", "wav"].includes(p.format) ? p.format : "auto"
      },
      title: `提取音频 ${path.basename(input)}`
    };
  }

  throw Object.assign(new Error(`未知任务类型: ${type}`), { status: 400 });
}

function createRouter(queue) {
  const router = require("express").Router();

  router.get("/api/config", h(async (req, res) => {
    res.json({
      dev: IS_DEV,
      version: VERSION,
      appName: APP_NAME,
      gatewayPrefix: GATEWAY_PREFIX,
      maxConcurrency: MAX_CONCURRENCY
    });
  }));

  // 当前用户可访问的授权目录（用户个人 + 管理员共享）
  router.get("/api/files/accessible", h(async (req, res) => {
    const uid = uidFromReq(req);
    const dirs = await listAccessibleDirs(uid, { force: req.query.refresh === "1" });
    res.json({ dev: IS_DEV, dirs });
  }));

  // 浏览授权目录内的文件
  router.post("/api/files/browse", h(async (req, res) => {
    const uid = uidFromReq(req);
    const rawPath = typeof req.body?.path === "string" ? req.body.path : "";
    const entries = [];

    if (!rawPath) {
      const dirs = await listAccessibleDirs(uid);
      return res.json({
        path: "",
        parent: null,
        entries: dirs.map((d) => ({
          name: d.name,
          path: d.path,
          isDir: true,
          type: d.type,
          size: null,
          mtime: null
        }))
      });
    }

    const p = (await assertInAccessibleRoots(uid, rawPath)).path;
    await statExists(p, true);
    await assertFsAccess(p, fs.constants.R_OK);

    const dirents = await fsp.readdir(p, { withFileTypes: true });
    const items = [];
    for (const d of dirents) {
      if (d.name.startsWith(".")) continue;
      const full = path.join(p, d.name);
      let size = null;
      let mtime = null;
      try {
        const st = await fsp.stat(full);
        size = st.isFile() ? st.size : null;
        mtime = st.mtimeMs;
      } catch {}
      items.push({
        name: d.name,
        path: full,
        isDir: d.isDirectory(),
        ext: path.extname(d.name).toLowerCase(),
        size,
        mtime
      });
    }
    items.sort((a, b) => {
      if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
      return a.name.localeCompare(b.name, "zh-CN");
    });

    // 按当前登录用户的读权限过滤文件（开发模式/失败时不过滤）
    const readable = await filterReadableForUser(
      uid,
      items.filter((i) => !i.isDir).map((i) => i.path)
    );
    let finalItems = items;
    if (readable) {
      let idx = 0;
      finalItems = items.filter((i) => i.isDir || readable[idx++]);
    }

    const dirs = await listAccessibleDirs(uid);
    const parent = dirs.some((d) => d.path === p) ? null : path.dirname(p);

    res.json({ path: p, parent, entries: finalItems });
  }));

  // 视频预览：支持 Range 的流式播放（仅授权目录内）
  router.get("/api/files/stream", h(async (req, res) => {
    const uid = uidFromReq(req);
    const p = (await assertInAccessibleRoots(uid, String(req.query.path || ""))).path;
    const st = await statExists(p, false);
    await assertFsAccess(p, fs.constants.R_OK);

    const total = st.size;
    const type = CONTENT_TYPES[path.extname(p).toLowerCase()] || "application/octet-stream";
    const range = req.headers.range;
    const baseHeaders = {
      "Content-Type": type,
      "Accept-Ranges": "bytes",
      "Cache-Control": "no-store"
    };

    let stream;
    if (range) {
      const m = /^bytes=(\d*)-(\d*)$/.exec(range);
      let start = m && m[1] ? parseInt(m[1], 10) : 0;
      let end = m && m[2] ? parseInt(m[2], 10) : total - 1;
      if (!Number.isFinite(start) || start < 0) start = 0;
      if (!Number.isFinite(end) || end >= total) end = total - 1;
      if (start > end) start = 0;
      res.writeHead(206, {
        ...baseHeaders,
        "Content-Range": `bytes ${start}-${end}/${total}`,
        "Content-Length": end - start + 1
      });
      stream = fs.createReadStream(p, { start, end });
    } else {
      res.writeHead(200, { ...baseHeaders, "Content-Length": total });
      stream = fs.createReadStream(p);
    }
    req.on("close", () => stream.destroy());
    stream.pipe(res);
  }));

  // 媒体信息探测（同步接口）
  router.post("/api/media/probe", h(async (req, res) => {
    const uid = uidFromReq(req);
    const p = (await assertInAccessibleRoots(uid, String(req.body?.path || ""))).path;
    await statExists(p, false);
    await assertFsAccess(p, fs.constants.R_OK);
    const info = summarizeProbe(await ffprobeJson(p));
    res.json({
      path: p,
      name: path.basename(p),
      duration: info.duration,
      size: info.size,
      bitrate: info.bitrate,
      container: info.container,
      video: info.video
        ? {
            codec: info.video.codec_name,
            width: info.video.width,
            height: info.video.height,
            fps: info.video.r_frame_rate,
            pixFmt: info.video.pix_fmt,
            bitrate: info.video.bit_rate,
            profile: info.video.profile
          }
        : null,
      audio: info.audio
        ? {
            codec: info.audio.codec_name,
            sampleRate: info.audio.sample_rate,
            channels: info.audio.channels,
            bitrate: info.audio.bit_rate
          }
        : null,
      streams: info.streams
    });
  }));

  // 任务
  router.post("/api/jobs", h(async (req, res) => {
    const uid = uidFromReq(req);
    const { params, title } = await validateJob(uid, req.body || {});
    const job = queue.create({ uid, type: req.body.type, params, title });
    res.json({ job: queue.publicView(job) });
  }));

  router.get("/api/jobs", h(async (req, res) => {
    res.json({ jobs: queue.list().map((j) => queue.publicView(j)) });
  }));

  router.post("/api/jobs/:id/cancel", h(async (req, res) => {
    const ok = queue.cancel(req.params.id);
    if (!ok) return res.status(400).json({ error: "任务无法取消（可能已结束）" });
    res.json({ ok: true });
  }));

  router.delete("/api/jobs/:id", h(async (req, res) => {
    const ok = await queue.remove(req.params.id);
    if (!ok) return res.status(404).json({ error: "任务不存在" });
    res.json({ ok: true });
  }));

  // 解除目录授权（用户个人 / 管理员共享）
  router.post("/api/files/revoke", h(async (req, res) => {
    const uid = uidFromReq(req);
    const type = req.body?.type === "shared" ? "shared" : "user";
    const target = normalizePath(String(req.body?.path || ""));
    if (IS_DEV) throw Object.assign(new Error("开发模式下不支持解除授权"), { status: 400 });
    if (type === "shared") {
      await callTrimApi("trim.file.delSharedAccessibleFolder", { path: target });
    } else {
      await callTrimApi("trim.file.delUserAccessibleFolder", { uid, path: target });
    }
    clearDirCache(uid);
    res.json({ ok: true });
  }));

  // 独立浏览器授权流程结束后刷新目录缓存
  router.post("/api/files/refresh", h(async (req, res) => {
    clearDirCache(uidFromReq(req));
    res.json({ ok: true });
  }));

  return router;
}

module.exports = { createRouter, VIDEO_EXTS, CONTENT_TYPES, normalizePath };
