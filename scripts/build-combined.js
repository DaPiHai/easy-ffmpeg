#!/usr/bin/env node
/**
 * 打包构建：
 * 1. 构建前端（Vite）
 * 2. 组装后端运行目录（backend 源码 + 生产依赖 + 前端产物）
 * 3. 拷入静态 ffmpeg/ffprobe（vendor/ffmpeg/x86_64/）
 * 4. 生成图标
 * 5. fnpack build 产出 .fpk（本机无 fnpack 时给出在 NAS 上打包的提示）
 */
const fs = require("fs");
const path = require("path");
const { execSync, spawnSync } = require("child_process");

const root = path.join(__dirname, "..");
const frontendDir = path.join(root, "frontend");
const backendDir = path.join(root, "backend");
const outDir = path.join(root, "dist");
const packDir = path.join(root, "easy-ffmpeg");
const packServerDir = path.join(packDir, "app", "server");
const packFfmpegDir = path.join(packDir, "app", "ffmpeg");
const vendorFfmpegDir = path.join(root, "vendor", "ffmpeg", "x86_64");

function run(command, cwd = process.cwd()) {
  execSync(command, { stdio: "inherit", cwd });
}

function emptyDir(dir) {
  if (fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
  fs.mkdirSync(dir, { recursive: true });
}

// 1. 前端构建
run("npm run build", frontendDir);

// 2. 后端 + 前端产物组装
emptyDir(outDir);
fs.cpSync(backendDir, outDir, {
  recursive: true,
  filter: (src) => !src.endsWith("node_modules")
});

fs.mkdirSync(path.join(outDir, "public"), { recursive: true });
fs.cpSync(path.join(frontendDir, "dist"), path.join(outDir, "public"), {
  recursive: true
});

const backendPkg = JSON.parse(fs.readFileSync(path.join(backendDir, "package.json"), "utf8"));
fs.writeFileSync(
  path.join(outDir, "package.json"),
  JSON.stringify(
    {
      name: "easyffmpeg-server",
      version: backendPkg.version || "1.0.0",
      private: true,
      main: "src/server.js",
      type: backendPkg.type || "commonjs",
      scripts: { start: "node src/server.js" },
      dependencies: backendPkg.dependencies || {}
    },
    null,
    2
  )
);

run("npm install --omit=dev --bin-links=false", outDir);

// 3. ffmpeg 静态二进制
if (!fs.existsSync(path.join(vendorFfmpegDir, "ffmpeg")) || !fs.existsSync(path.join(vendorFfmpegDir, "ffprobe"))) {
  console.error("\n缺少 ffmpeg 静态二进制，请先执行：\n  bash scripts/fetch-ffmpeg.sh\n");
  process.exit(1);
}
emptyDir(packFfmpegDir);
for (const bin of ["ffmpeg", "ffprobe"]) {
  fs.copyFileSync(path.join(vendorFfmpegDir, bin), path.join(packFfmpegDir, bin));
  fs.chmodSync(path.join(packFfmpegDir, bin), 0o755);
}

// 4. 组装应用包 + 图标
emptyDir(packServerDir);
fs.cpSync(outDir, packServerDir, { recursive: true });
// 防止本地从包目录直跑后端时生成的 devdata/ 混入安装包
fs.rmSync(path.join(packDir, "app", "devdata"), { recursive: true, force: true });
run("node scripts/make-icons.js", root);

// 5. fnpack 打包
const fnpackCheck = spawnSync("fnpack", ["build", "--help"], { shell: true });
if (fnpackCheck.status !== 0) {
  console.warn(
    "\n⚠ 未检测到 fnpack，已生成完整的应用包目录 easy-ffmpeg/。\n" +
      "可选做法：\n" +
      "  1) 安装 fnpack 后重跑 npm run build，在本机产出 .fpk；\n" +
      "  2) 将整个项目目录上传到 fnOS 设备，在项目目录内执行 appcenter-cli install-local（官方推荐的本地测试流程）。\n"
  );
  process.exit(0);
}

run(`fnpack build --directory ${packDir}`, root);

// 6. 校验 fnpack 注入的 checksum（= app.tgz 的 md5，应用中心安装时校验。
//    前提：manifest 源文件里预置了 checksum 字段，fnpack 打包时会自动替换为真实 md5；
//    缺失该字段则 fpk 安装时报「解压app.tgz失败」。）
const crypto = require("crypto");
const verifyDir = path.join(outDir, "fpk-verify");
fs.rmSync(verifyDir, { recursive: true, force: true });
fs.mkdirSync(verifyDir, { recursive: true });
execSync(`tar -xzf easyffmpeg.fpk -C ${JSON.stringify(verifyDir)}`, { cwd: root });

const appTgzMd5 = crypto
  .createHash("md5")
  .update(fs.readFileSync(path.join(verifyDir, "app.tgz")))
  .digest("hex");
const manifestInFpk = fs.readFileSync(path.join(verifyDir, "manifest"), "utf8");
const checksumMatch = /^checksum\s*=\s*([0-9a-f]{32})\s*$/m.exec(manifestInFpk);
fs.rmSync(verifyDir, { recursive: true, force: true });

if (!checksumMatch || checksumMatch[1] !== appTgzMd5) {
  console.error(
    `⚠ fpk manifest 缺少 checksum 或与 app.tgz md5 不符（期望 ${appTgzMd5}），安装会失败`
  );
  process.exit(1);
}

// 产物输出到 NAS 的包目录（可用 EASYFFMPEG_OUTPUT_DIR 覆盖）
const OUTPUT_DIR = process.env.EASYFFMPEG_OUTPUT_DIR || "/vol1/1000/packages";
const fpk = path.join(root, "easyffmpeg.fpk");
if (fs.existsSync(fpk)) {
  try {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
    const dest = path.join(OUTPUT_DIR, "easyffmpeg.fpk");
    fs.copyFileSync(fpk, dest);
    console.log(`\n✅ 打包完成: ${dest}`);
  } catch (e) {
    console.log(`\n✅ 打包完成: ${fpk}（复制到 ${OUTPUT_DIR} 失败: ${e.message}）`);
  }
} else {
  console.log("\n✅ 打包完成: easyffmpeg.fpk");
}
