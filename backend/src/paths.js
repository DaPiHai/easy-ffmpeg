const path = require("path");

const BACKEND_PKG = require("../package.json");

// 统一网关前缀，须与 manifest / app/ui/config 保持一致
const GATEWAY_PREFIX = process.env.GATEWAY_PREFIX || "/app/easyffmpeg";
const APP_NAME = process.env.TRIM_APPNAME || "easyffmpeg";
const VERSION = process.env.TRIM_APPVER || BACKEND_PKG.version;

// 应用内部状态/临时目录：NAS 上由系统注入，本地开发落到 devdata/
const STATE_DIR = process.env.TRIM_PKGVAR || path.join(__dirname, "../../devdata/state");
const TEMP_DIR = process.env.TRIM_PKGTMP || path.join(__dirname, "../../devdata/tmp");

// 开发模式下的本地文件根目录（替代飞牛的授权目录机制）
const DEV_ROOT = process.env.EASYFFMPEG_DEV_ROOT || path.join(__dirname, "../../devdata/files");

const FFMPEG_PATH = process.env.FFMPEG_PATH || "ffmpeg";
const FFPROBE_PATH = process.env.FFPROBE_PATH || "ffprobe";

// 开放平台后端 API 的 Unix Socket（见官方文档 api/calling）
const TRIM_API_SOCKET =
  process.env.TRIM_API_SOCKET || "/var/run/trim_open_gateway_apiscope.socket";

// 没有平台注入的 token 即视为开发模式（本机直跑，无飞牛网关/授权体系）
const IS_DEV = !process.env.TRIM_API_TOKEN;

// 后台任务并发数：转码吃 CPU，NAS 上默认串行
const MAX_CONCURRENCY = Number(process.env.EASYFFMPEG_CONCURRENCY || 1);

module.exports = {
  GATEWAY_PREFIX,
  APP_NAME,
  VERSION,
  STATE_DIR,
  TEMP_DIR,
  DEV_ROOT,
  FFMPEG_PATH,
  FFPROBE_PATH,
  TRIM_API_SOCKET,
  IS_DEV,
  MAX_CONCURRENCY
};
