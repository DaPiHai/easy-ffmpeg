const express = require("express");
const fs = require("fs");
const path = require("path");
const { JobQueue } = require("./jobs");
const { createRouter } = require("./routes");
const { attachWebSocket } = require("./websocket");
const { GATEWAY_PREFIX, IS_DEV, VERSION } = require("./paths");

const SOCKET_PATH = process.env.SOCKET_PATH || "";
const PORT = Number(process.env.PORT || 5001);

async function main() {
  const queue = new JobQueue();
  await queue.load();

  const app = express();
  app.disable("x-powered-by");
  app.use(express.json({ limit: "2mb" }));

  app.use((req, res, next) => {
    if (req.path.startsWith("/api")) {
      console.log(`${new Date().toISOString()} ${req.method} ${req.url}`);
    }
    next();
  });

  // API 同时挂在 / 与网关前缀下：网关转发带前缀，本地直连/反代不带
  const router = createRouter(queue);
  app.use("/", router);
  app.use(GATEWAY_PREFIX, router);

  // 前端构建产物（打包时位于 app/server/public）
  const STATIC_DIR = path.resolve(
    process.env.FRONTEND_DIST || path.join(__dirname, "..", "public")
  );
  if (fs.existsSync(path.join(STATIC_DIR, "index.html"))) {
    app.use(GATEWAY_PREFIX, express.static(STATIC_DIR));
    app.get(`${GATEWAY_PREFIX}/*`, (req, res) =>
      res.sendFile(path.join(STATIC_DIR, "index.html"))
    );
    app.use(express.static(STATIC_DIR));
    app.get("*", (req, res) => res.sendFile(path.join(STATIC_DIR, "index.html")));
  } else if (IS_DEV) {
    console.log("[easyffmpeg] 未找到前端构建产物，仅提供 API（前端请用 vite dev server）");
  }

  const server = SOCKET_PATH
    ? (() => {
        fs.rmSync(SOCKET_PATH, { force: true });
        return app.listen(SOCKET_PATH, () =>
          console.log(`[easyffmpeg] listening on unix:${SOCKET_PATH}`)
        );
      })()
    : app.listen(PORT, () =>
        console.log(`[easyffmpeg v${VERSION}] listening on http://localhost:${PORT}`)
      );

  attachWebSocket(server, queue);

  let shuttingDown = false;
  const shutdown = async () => {
    if (shuttingDown) {
      process.exit(0);
    }
    shuttingDown = true;
    console.log("[easyffmpeg] shutting down...");
    await queue.shutdown();
    server.close();
    setTimeout(() => process.exit(0), 500).unref();
    process.exit(0);
  };
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}

main().catch((e) => {
  console.error("[easyffmpeg] 启动失败:", e);
  process.exit(1);
});
