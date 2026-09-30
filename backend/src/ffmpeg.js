const { spawn } = require("child_process");
const { FFMPEG_PATH, FFPROBE_PATH } = require("./paths");

/** ffprobe 输出 JSON 的封装 */
function ffprobeJson(file) {
  return new Promise((resolve, reject) => {
    const p = spawn(FFPROBE_PATH, [
      "-v",
      "error",
      "-print_format",
      "json",
      "-show_format",
      "-show_streams",
      file
    ]);
    const out = [];
    const err = [];
    p.stdout.on("data", (c) => out.push(c));
    p.stderr.on("data", (c) => err.push(c));
    p.on("error", (e) => reject(new Error(`ffprobe 启动失败: ${e.message}`)));
    p.on("close", (code) => {
      if (code !== 0) {
        return reject(new Error(`ffprobe 失败(code=${code}): ${Buffer.concat(err).toString("utf8").trim()}`));
      }
      try {
        resolve(JSON.parse(Buffer.concat(out).toString("utf8")));
      } catch (e) {
        reject(new Error(`ffprobe 输出解析失败: ${e.message}`));
      }
    });
  });
}

/**
 * 运行 ffmpeg。
 * - progress 通过 `-progress pipe:1` 从 stdout 解析（out_time_us/out_time_ms 为微秒）
 * - onProgress(percent 0-100, speedText) 节流回调
 * - signal 取消：先 SIGTERM，5 秒后 SIGKILL
 * - 失败时错误 message 携带 ffmpeg stderr 尾部，便于定位
 */
function runFfmpeg(args, { totalDuration = 0, onProgress = () => {}, signal } = {}) {
  return new Promise((resolve, reject) => {
    const p = spawn(FFMPEG_PATH, [
      "-hide_banner",
      "-nostdin",
      "-y",
      "-progress",
      "pipe:1",
      "-nostats",
      ...args
    ]);

    let stderrTail = "";
    let stdoutBuf = "";
    let lastEmit = 0;
    let canceled = false;
    let killTimer = null;

    const onAbort = () => {
      canceled = true;
      try {
        p.kill("SIGTERM");
      } catch {}
      killTimer = setTimeout(() => {
        try {
          p.kill("SIGKILL");
        } catch {}
      }, 5000);
    };
    if (signal) {
      if (signal.aborted) {
        return reject(Object.assign(new Error("任务已取消"), { canceled: true }));
      }
      signal.addEventListener("abort", onAbort, { once: true });
    }

    p.stdout.on("data", (c) => {
      stdoutBuf += c.toString("utf8");
      let idx;
      while ((idx = stdoutBuf.indexOf("\n")) >= 0) {
        const line = stdoutBuf.slice(0, idx).trim();
        stdoutBuf = stdoutBuf.slice(idx + 1);
        const eq = line.indexOf("=");
        if (eq <= 0) continue;
        const key = line.slice(0, eq);
        const val = line.slice(eq + 1);
        if (key === "out_time_us" || key === "out_time_ms") {
          const us = Number(val);
          if (Number.isFinite(us) && totalDuration > 0) {
            const pct = Math.max(0, Math.min(99.5, (us / 1e6 / totalDuration) * 100));
            const now = Date.now();
            if (now - lastEmit > 400) {
              lastEmit = now;
              onProgress(pct);
            }
          }
        } else if (key === "progress" && val === "end" && totalDuration > 0) {
          onProgress(99.9);
        }
      }
    });

    p.stderr.on("data", (c) => {
      stderrTail = (stderrTail + c.toString("utf8")).slice(-8000);
    });

    p.on("error", (e) => {
      if (killTimer) clearTimeout(killTimer);
      reject(new Error(`ffmpeg 启动失败: ${e.message}`));
    });

    p.on("close", (code) => {
      if (killTimer) clearTimeout(killTimer);
      if (signal) signal.removeEventListener("abort", onAbort);
      if (canceled) {
        return reject(Object.assign(new Error("任务已取消"), { canceled: true }));
      }
      if (code === 0) {
        return resolve({ stderrTail });
      }
      const tail = stderrTail
        .split("\n")
        .filter(Boolean)
        .slice(-6)
        .join("\n");
      reject(new Error(`ffmpeg 退出码 ${code}\n${tail}`));
    });
  });
}

/**
 * 抽一帧视频存为图片（用于缩略图，无需 -progress）。
 * seekSec 超出视频时长时 ffmpeg 会输出 0 帧，调用方需检测输出文件是否生成并降级重试。
 */
function grabFrame(file, outPath, { seekSec = 0, timeoutMs = 20000 } = {}) {
  return new Promise((resolve, reject) => {
    const args = ["-hide_banner", "-nostdin", "-y", "-loglevel", "error"];
    if (seekSec > 0) args.push("-ss", String(seekSec));
    args.push("-i", file, "-frames:v", "1", "-vf", "scale=-2:180", "-q:v", "5", outPath);

    const p = spawn(FFMPEG_PATH, args);
    let errTail = "";
    const timer = setTimeout(() => {
      try {
        p.kill("SIGKILL");
      } catch {}
      reject(new Error("ffmpeg 抽帧超时"));
    }, timeoutMs);

    p.stderr.on("data", (c) => {
      errTail = (errTail + c.toString("utf8")).slice(-2000);
    });
    p.on("error", (e) => {
      clearTimeout(timer);
      reject(new Error(`ffmpeg 启动失败: ${e.message}`));
    });
    p.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) return resolve();
      reject(new Error(`ffmpeg 抽帧失败(code=${code}): ${errTail.trim()}`));
    });
  });
}

/**
 * 提取媒体概要：真实的视频流（排除封面 attached_pic）、首个音频流、时长、容器。
 */
function summarizeProbe(info) {
  const streams = Array.isArray(info.streams) ? info.streams : [];
  const isRealVideo = (s) =>
    s.codec_type === "video" && !(s.disposition && Number(s.disposition.attached_pic) === 1);
  const video = streams.find(isRealVideo) || null;
  const audio = streams.find((s) => s.codec_type === "audio") || null;
  const format = info.format || {};
  return {
    duration: Number(format.duration || video?.duration || 0),
    size: Number(format.size || 0),
    bitrate: Number(format.bit_rate || 0),
    container: format.format_name || "",
    video,
    audio,
    streams
  };
}

module.exports = { ffprobeJson, runFfmpeg, grabFrame, summarizeProbe };
