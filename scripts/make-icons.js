#!/usr/bin/env node
/**
 * 从 assets/icon-source.png（2048x2048 RGBA 母版）生成应用所需图标。
 * 全程只做等比缩放，保留透明通道（不压平、不重裁圆角——母版已带圆角与 alpha）。
 * 依据官方图标规范（dev-fnnas references/core-concepts/icon.md）：
 * - 包图标: ICON.PNG 64x64、ICON_256.PNG 256x256（sRGB、<=1024KB）
 * - 入口图标: app/ui/images/icon_64.png、icon_256.png
 * 依赖 ffmpeg（系统或 vendor 内静态二进制）做 Lanczos 缩放。
 */
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const root = path.join(__dirname, "..");
const source = path.join(root, "assets", "icon-source.png");
const packDir = path.join(root, "easy-ffmpeg");
const uiImages = path.join(packDir, "app", "ui", "images");

if (!fs.existsSync(source)) {
  console.error(`缺少图标母版: ${source}`);
  process.exit(1);
}

// ffmpeg：优先系统，其次包内静态二进制
let ffmpeg = "ffmpeg";
try {
  execFileSync(ffmpeg, ["-version"], { stdio: "ignore" });
} catch {
  const vendored = path.join(root, "vendor", "ffmpeg", "x86_64", "ffmpeg");
  if (fs.existsSync(vendored)) ffmpeg = vendored;
  else {
    console.error("未找到 ffmpeg，无法缩放图标（可先执行 scripts/fetch-ffmpeg.sh）");
    process.exit(1);
  }
}

const targets = [
  { file: path.join(packDir, "ICON.PNG"), size: 64 },
  { file: path.join(packDir, "ICON_256.PNG"), size: 256 },
  { file: path.join(uiImages, "icon_64.png"), size: 64 },
  { file: path.join(uiImages, "icon_256.png"), size: 256 }
];

fs.mkdirSync(uiImages, { recursive: true });

for (const { file, size } of targets) {
  execFileSync(
    ffmpeg,
    [
      "-hide_banner",
      "-loglevel",
      "error",
      "-y",
      "-i",
      source,
      "-vf",
      `scale=${size}:${size}:flags=lanczos,format=rgba`,
      file
    ],
    { stdio: "inherit" }
  );
  const kb = fs.statSync(file).size / 1024;
  if (kb > 1024) {
    console.error(`${path.basename(file)} 超过 1024KB 限制`);
    process.exit(1);
  }
  console.log(`icon ${size}x${size} -> ${path.relative(root, file)} (${kb.toFixed(1)}KB)`);
}

console.log("图标生成完成（透明通道已保留）");
