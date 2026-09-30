const { WebSocketServer } = require("ws");
const { uidFromReq } = require("./auth-files");
const { GATEWAY_PREFIX } = require("./paths");

/**
 * 任务进度 WebSocket：
 * - 统一网关下路径为 /app/easyffmpeg/ws，本地开发为 /ws（两个都接受）
 * - 连接建立即下发任务快照，之后广播 created/progress/status/removed 事件
 */
function attachWebSocket(server, queue) {
  const wss = new WebSocketServer({ noServer: true });
  const wsPaths = new Set([`${GATEWAY_PREFIX}/ws`, "/ws"]);

  server.on("upgrade", (req, socket, head) => {
    let pathname = "";
    try {
      pathname = new URL(req.url, "http://localhost").pathname;
    } catch {
      socket.destroy();
      return;
    }
    if (!wsPaths.has(pathname)) {
      socket.destroy();
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => {
      wss.emit("connection", ws, req);
    });
  });

  wss.on("connection", (ws, req) => {
    ws.uid = uidFromReq(req);

    const send = (payload) => {
      if (ws.readyState === 1) {
        try {
          ws.send(JSON.stringify(payload));
        } catch {}
      }
    };

    send({ type: "snapshot", jobs: queue.list() });

    const off = queue.onEvent((type, job) => send({ type, job }));
    ws.on("close", off);
    ws.on("error", () => {});
  });

  return wss;
}

module.exports = { attachWebSocket };
