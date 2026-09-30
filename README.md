# Easy FFmpeg

飞牛 fnOS（fnNAS）视频工具应用：基于 FFmpeg 的合并、剪辑、转码压缩、音频提取与媒体信息查看，带任务队列与实时进度。

## 功能

| 功能 | 说明 |
| --- | --- |
| 视频合并 | 多段视频拼接。编码参数一致时流复制无损拼接（秒级完成），不一致时自动重编码统一参数（含无音轨片段自动补静音；不同尺寸画面按比例居中 + 模糊背景填充） |
| 转码 / 压缩 | MP4 / MKV / WebM，H.264 / H.265，三档画质（CRF），可选 1080p / 720p 缩放 |
| 提取音频 | 编码兼容时无损导出（AAC→M4A 等），或转 MP3 / M4A / FLAC / WAV |
| 媒体信息 | ffprobe 查看容器与流详情 |
| 任务队列 | 串行执行（NAS 友好），WebSocket 实时进度，任务持久化（服务重启自动标记中断），支持取消 / 重新执行 |

## 技术架构

- **Native 应用**（`platform=x86`），统一网关接入：服务监听 `${TRIM_APPDEST}/app.sock`，访问路径 `/app/easyffmpeg`，复用 NAS 登录态（`X-Trim-Userid` 等请求头）。
- **后端**：Node.js 22（`install_dep_apps=nodejs_v22`）+ Express + ws，自带静态 ffmpeg/ffprobe（johnvansickle.com 构建）。
- **前端**：Vue 3 + Vite + Element Plus，`micro_app=true` 集成 `@trimjs/web-app` SDK。
- **文件访问**：完全走飞牛开放平台授权体系——
  - `trim.file.userAccess`：用户通过系统文件选择器授权自己的目录/文件；
  - `trim.file.sharedAccess`：管理员授权共享媒体目录（家庭片库场景）；
  - `trim.file.userAcl`：按当前用户过滤可读文件；
  - `trim.file.path`：内部路径转用户可读展示名。
  - 所有文件操作校验「路径在授权目录内 + 用户 ACL + 应用运行用户文件系统权限」，拒绝越权路径。
- **开放平台 API**：仅服务端经 Unix Socket `/var/run/trim_open_gateway_apiscope.socket` 调用，token 取自环境变量 `TRIM_API_TOKEN`，不落盘、不暴露给前端。

## 目录结构

```
easy-ffmpeg/
├── backend/src/          # Node 后端（server / routes / jobs / handlers / ffmpeg / trim-api / auth-files / websocket）
├── frontend/src/         # Vue 前端（views 5 个功能页 + components + sdk）
├── easy-ffmpeg/          # fnOS 应用包目录（manifest / config / cmd / app/ui）
├── scripts/
│   ├── fetch-ffmpeg.sh   # 下载静态 ffmpeg/ffprobe 到 vendor/
│   ├── make-icons.js     # 生成应用图标
│   └── build-combined.js # 打包构建（→ easy-ffmpeg.fpk）
└── devdata/              # 本地开发数据（git 忽略）
```

## 本地开发

要求：Node.js ≥ 20、系统 ffmpeg/ffprobe（开发模式用系统二进制）。

```bash
npm install --workspaces

# 终端 1：后端（检测不到 TRIM_API_TOKEN 自动进入开发模式，
# 文件访问限定在 devdata/files，可先放几个测试视频进去）
npm run dev:backend        # http://localhost:5001

# 终端 2：前端（代理到 5001）
npm run dev:frontend       # http://localhost:5173/app/easyffmpeg/
```

开发模式下没有飞牛宿主环境，SDK 文件选择器不可用（页面会提示），用「浏览…」对话框在 `devdata/files` 内选文件即可完整体验 4 类功能。

## 打包

```bash
bash scripts/fetch-ffmpeg.sh   # 下载 x86_64 静态 ffmpeg/ffprobe（仅首次，BtbN 源优先、johnvansickle 兜底）
npm run build                  # 构建前端 → 组装应用包 → fnpack build
```

- `fnpack` 官方下载（本方案用 linux-amd64）：
  `https://static2.fnnas.com/fnpack/fnpack-1.2.3-linux-amd64`（放入 PATH 即可），其余平台见官方文档。
- 没有 `fnpack` 时也可把整个项目目录上传到 fnOS 设备，在项目目录内执行 `appcenter-cli install-local`（官方推荐的本地测试流程）。
- 产物 `easyffmpeg.fpk` 约 55MB：使用 `@ffmpeg-installer`（johnvansickle 静态构建）而非全功能新版构建，兼顾体积与所需编码器（x264/x265/vp9/aac/mp3/opus/flac 均在内）。
- 打包完成后产物会自动复制到 `/vol1/1000/packages`（NAS 包目录，可用环境变量 `EASYFFMPEG_OUTPUT_DIR` 覆盖）。

## 在 fnOS 上安装测试

1. 应用中心手动安装 `.fpk`，或 `appcenter-cli install-fpk easy-ffmpeg.fpk`。
2. 打开桌面卡片「Easy FFmpeg」→「授权目录」→「添加目录」授权存放视频的目录（普通用户授权个人目录；管理员可额外授权共享目录）。
3. 选择文件创建任务，在「任务」面板查看实时进度。
4. 应用设置中可启停服务；日志位于 `/var/apps/easyffmpeg/var/app.log`。

## 说明与注意事项

- **系统版本**：要求 fnOS `1.2.0401+`（开放平台文件授权 API 的最低要求）、应用中心 App `1.34.0+`。
- **架构**：包内含 x86_64 静态二进制，`platform=x86`；如需 ARM，执行 `bash scripts/fetch-ffmpeg.sh aarch64` 并把构建脚本与 manifest 的 `platform` 相应调整后另打一包（含架构二进制不能用 `all`）。
- **ffmpeg 许可**：随包分发的静态构建为 GPL v3（来源 johnvansickle.com，源码可从该站点获取），个人使用无碍；若上架应用商店请确认 GPL 合规。
- **性能**：任务串行执行；GPU 硬件加速（`config/privilege` 的 `join-groups: ["video","render"]` + QSV/NVENC）预留为后续版本。
