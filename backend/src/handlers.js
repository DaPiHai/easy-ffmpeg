const fs = require("fs");
const fsp = require("fs/promises");
const path = require("path");
const { ffprobeJson, runFfmpeg, summarizeProbe } = require("./ffmpeg");

// ---------- 通用工具 ----------

function sanitizeFileName(name, fallback) {
  if (typeof name !== "string") return fallback;
  const cleaned = name.replace(/[\\/:*?"<>|\x00-\x1f]/g, "").trim();
  return cleaned || fallback;
}

function splitName(fileName) {
  const ext = path.extname(fileName);
  return { stem: fileName.slice(0, fileName.length - ext.length) || "output", ext };
}

/** 输出文件重名时自动追加 (1)、(2)… */
async function uniqueOutputPath(dir, fileName) {
  let p = path.join(dir, fileName);
  const { stem, ext } = splitName(fileName);
  let i = 1;
  while (fs.existsSync(p)) {
    if (i > 500) throw new Error("输出目录已存在大量同名文件");
    p = path.join(dir, `${stem}(${i++})${ext}`);
  }
  return p;
}

function concatListLine(file) {
  // concat demuxer 的 file 指令：单引号路径需转义为 '\''
  return `file '${file.replace(/'/g, "'\\''")}'`;
}

async function probeOf(file) {
  return summarizeProbe(await ffprobeJson(file));
}

function fpsText(video) {
  const raw = String(video?.r_frame_rate || "");
  if (raw && raw !== "0/0") return raw;
  const avg = String(video?.avg_frame_rate || "");
  if (avg && avg !== "0/0") return avg;
  return "30";
}

// 当前任务的进度回调（队列并发为 1，模块级状态安全）
let activeOnProgress = () => {};

/**
 * 一次 ffmpeg 调用映射到整任务进度：
 * offset/weight 为该步骤耗时在总时长中的占比，返回回调传给 runFfmpeg。
 */
function step(offset, weight) {
  return (pct) => {
    if (weight > 0) activeOnProgress(offset + pct * weight);
  };
}

let seqCounter = 0;
function jobSeq(ctx) {
  // 供临时文件命名
  return ctx.jobId || ++seqCounter;
}

// ---------- 合并 ----------

function canStreamCopyMerge(probes) {
  const v = (p) =>
    p.video ? [p.video.codec_name, p.video.width, p.video.height, p.video.pix_fmt].join("|") : null;
  const a = (p) =>
    p.audio ? [p.audio.codec_name, p.audio.sample_rate, p.audio.channels].join("|") : null;
  const v0 = v(probes[0]);
  const a0 = a(probes[0]);
  return (
    probes.every((p) => v(p) === v0) && probes.every((p) => (p.audio ? a(p) : null) === a0)
  );
}

async function mergeHandler(params, ctx) {
  const inputs = params.inputs;
  const mode = params.mode || "auto";

  const probes = [];
  for (const f of inputs) probes.push(await probeOf(f));
  const totalDuration = probes.reduce((s, p) => s + (p.duration || 0), 0);
  const onProg = step(0, 1);

  const copyable = canStreamCopyMerge(probes);
  const useCopy = mode === "copy" || (mode === "auto" && copyable);
  if (mode === "copy" && !copyable) {
    throw new Error(
      "各视频的编码参数不一致，无法无损拼接；请改用「自动」或「重编码拼接」模式"
    );
  }

  const outName = sanitizeFileName(
    params.fileName || `${splitName(path.basename(inputs[0])).stem}-合并.mp4`,
    "合并.mp4"
  );
  const output = await uniqueOutputPath(params.outputDir, outName);

  if (useCopy) {
    const listFile = path.join(ctx.tmpDir, `concat-${jobSeq(ctx)}.txt`);
    await fsp.writeFile(listFile, inputs.map(concatListLine).join("\n") + "\n", "utf8");
    try {
      await runFfmpeg(
        ["-f", "concat", "-safe", "0", "-i", listFile, "-c", "copy", output],
        { totalDuration, onProgress: onProg, signal: ctx.signal }
      );
    } finally {
      await fsp.rm(listFile, { force: true });
    }
  } else {
    // 重编码：统一到第一个片段的分辨率/帧率，音频统一 44.1kHz 立体声
    const first = probes[0];
    if (!first.video) throw new Error("第一个文件没有可用的视频流");
    const w = first.video.width;
    const h = first.video.height;
    const fps = fpsText(first.video);

    const inputArgs = [];
    const prepLabels = [];
    let inputIdx = 0;
    // 背景模糊强度随分辨率缩放（1080p 约 27）
    const sigma = Math.max(6, Math.round(Math.min(w, h) / 40));
    probes.forEach((p, i) => {
      inputArgs.push("-i", inputs[i]);
      const fileIdx = inputIdx++;
      const vLabel = `[${fileIdx}:v]`;
      let aLabel;
      if (p.audio) {
        aLabel = `[${fileIdx}:a]`;
      } else {
        // 无音轨的片段补静音轨（额外占一个输入序号）
        inputArgs.push(
          "-f",
          "lavfi",
          "-t",
          String(p.duration || 1),
          "-i",
          "anullsrc=channel_layout=stereo:sample_rate=44100"
        );
        aLabel = `[${inputIdx++}:a]`;
      }
      // 画面统一到第一个片段的 WxH：按比例缩放居中（contain），
      // 背景为同帧放大裁切后的高斯模糊，避免直接拉伸变形
      prepLabels.push(
        `${vLabel}split=2[bgsrc${i}][fgsrc${i}];` +
          `[bgsrc${i}]scale=${w}:${h}:force_original_aspect_ratio=increase,crop=${w}:${h},gblur=sigma=${sigma}[bg${i}];` +
          `[fgsrc${i}]scale=${w}:${h}:force_original_aspect_ratio=decrease[fg${i}];` +
          `[bg${i}][fg${i}]overlay=(main_w-overlay_w)/2:(main_h-overlay_h)/2,setsar=1,fps=${fps},format=yuv420p[v${i}];` +
          `${aLabel}aresample=44100,aformat=sample_fmts=fltp:channel_layouts=stereo[a${i}];`
      );
    });

    const filter =
      prepLabels.join("") +
      `${prepLabels.map((_, i) => `[v${i}][a${i}]`).join("")}concat=n=${probes.length}:v=1:a=1[v][a]`;

    await runFfmpeg(
      [
        ...inputArgs,
        "-filter_complex",
        filter,
        "-map",
        "[v]",
        "-map",
        "[a]",
        "-c:v",
        "libx264",
        "-preset",
        "medium",
        "-crf",
        "20",
        "-c:a",
        "aac",
        "-b:a",
        "160k",
        output
      ],
      { totalDuration, onProgress: onProg, signal: ctx.signal }
    );
  }

  return { output, mode: useCopy ? "copy" : "encode" };
}


// ---------- 转换 / 压缩 ----------

const CRF_BY_QUALITY = { high: 18, balanced: 23, small: 28 };

async function convertHandler(params, ctx) {
  const container = ["mp4", "mkv", "webm"].includes(params.container) ? params.container : "mp4";
  const scale = ["orig", "1080p", "720p"].includes(params.scale) ? params.scale : "orig";
  const crf = CRF_BY_QUALITY[params.quality] || CRF_BY_QUALITY.balanced;

  const info = await probeOf(params.input);
  if (!info.video) throw new Error("文件中没有可用的视频流");

  const { stem } = splitName(path.basename(params.input));
  const outName = sanitizeFileName(
    params.fileName || `${stem}.${container}`,
    `output.${container}`
  );
  const output = await uniqueOutputPath(params.outputDir, outName);

  const args = ["-i", params.input];
  if (scale !== "orig") {
    args.push("-vf", `scale=-2:${scale === "1080p" ? 1080 : 720}`);
  }

  if (container === "webm") {
    args.push("-c:v", "libvpx-vp9", "-crf", "34", "-b:v", "0", "-row-mt", "1");
    args.push("-c:a", "libopus", "-b:a", "128k");
  } else {
    const vcodec = params.vcodec === "libx265" ? "libx265" : "libx264";
    args.push("-c:v", vcodec, "-preset", "medium", "-crf", String(crf));
    if (vcodec === "libx265" && container === "mp4") args.push("-tag:v", "hvc1");
    args.push("-c:a", "aac", "-b:a", "160k");
    if (container === "mp4") args.push("-movflags", "+faststart");
  }
  args.push(output);

  await runFfmpeg(args, {
    totalDuration: info.duration,
    onProgress: step(0, 1),
    signal: ctx.signal
  });

  return { output };
}

// ---------- 提取音频 ----------

const AUDIO_COPY_EXT = { aac: "m4a", mp3: "mp3", flac: "flac" };
const AUDIO_ENCODERS = {
  mp3: ["-c:a", "libmp3lame", "-q:a", "2"],
  m4a: ["-c:a", "aac", "-b:a", "192k"],
  flac: ["-c:a", "flac"],
  wav: ["-c:a", "pcm_s16le"]
};

async function extractHandler(params, ctx) {
  const info = await probeOf(params.input);
  if (!info.audio) throw new Error("文件中没有音轨");

  let target = params.format || "auto";
  let copy = false;
  let ext;

  if (target === "auto") {
    copy = Boolean(AUDIO_COPY_EXT[info.audio.codec_name]);
    ext = copy ? AUDIO_COPY_EXT[info.audio.codec_name] : "m4a";
    target = ext;
  } else {
    ext = target;
    copy = AUDIO_COPY_EXT[info.audio.codec_name] === target;
  }

  const { stem } = splitName(path.basename(params.input));
  const outName = sanitizeFileName(params.fileName || `${stem}.${ext}`, `audio.${ext}`);
  const output = await uniqueOutputPath(params.outputDir, outName);

  const args = ["-i", params.input, "-map", "0:a:0", "-vn"];
  if (copy) args.push("-c:a", "copy");
  else args.push(...AUDIO_ENCODERS[target]);
  args.push(output);

  await runFfmpeg(args, {
    totalDuration: info.duration,
    onProgress: step(0, 1),
    signal: ctx.signal
  });

  return { output, codec: copy ? `copy(${info.audio.codec_name})` : target };
}

// ---------- 调度 ----------

const HANDLERS = {
  merge: mergeHandler,
  convert: convertHandler,
  extract: extractHandler
};

async function runJob(job, ctx) {
  const handler = HANDLERS[job.type];
  if (!handler) throw new Error(`未知任务类型: ${job.type}`);
  ctx.jobId = job.id;
  activeOnProgress = ctx.onProgress;
  return handler(job.params, ctx);
}

module.exports = { runJob };
