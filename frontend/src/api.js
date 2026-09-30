// 后端 API 封装。页面部署在 /app/easyffmpeg/ 下，全部使用相对 BASE 的路径。
const BASE = import.meta.env.BASE_URL || "/app/easyffmpeg/";

async function request(path, options = {}) {
  let res;
  try {
    res = await fetch(BASE + path, {
      headers: { "Content-Type": "application/json" },
      ...options
    });
  } catch (e) {
    throw new Error("无法连接应用后端服务");
  }
  let body = null;
  try {
    body = await res.json();
  } catch {}
  if (!res.ok) {
    throw new Error(body?.error || `请求失败 (${res.status})`);
  }
  return body;
}

const get = (path) => request(path);
const post = (path, data) => request(path, { method: "POST", body: JSON.stringify(data || {}) });
const del = (path) => request(path, { method: "DELETE" });

export const api = {
  config: () => get("api/config"),
  accessible: (refresh = false) => get(`api/files/accessible${refresh ? "?refresh=1" : ""}`),
  browse: (path) => post("api/files/browse", { path }),
  refreshAuth: () => post("api/files/refresh"),
  revokeDir: (path, type) => post("api/files/revoke", { path, type }),
  probe: (path) => post("api/media/probe", { path }),
  createJob: (type, params) => post("api/jobs", { type, params }),
  jobs: () => get("api/jobs"),
  cancelJob: (id) => post(`api/jobs/${id}/cancel`),
  removeJob: (id) => del(`api/jobs/${id}`),
  streamUrl: (path) => `${BASE}api/files/stream?path=${encodeURIComponent(path)}`,
  thumbUrl: (path) => `${BASE}api/files/thumbnail?path=${encodeURIComponent(path)}`,
  videoAccept: [
    ".mp4", ".m4v", ".mkv", ".webm", ".mov", ".avi", ".ts", ".flv", ".wmv", ".mpg", ".mpeg"
  ]
};

export function connectWs(onState) {
  const proto = location.protocol === "https:" ? "wss" : "ws";
  let ws = null;
  let closed = false;

  const connect = () => {
    ws = new WebSocket(`${proto}://${location.host}${BASE}ws`);
    ws.onopen = () => onState(true);
    ws.onclose = () => {
      onState(false);
      if (!closed) setTimeout(connect, 3000);
    };
    ws.onerror = () => ws.close();
    ws.onmessage = (ev) => {
      try {
        onState(true, JSON.parse(ev.data));
      } catch {}
    };
  };
  connect();

  return () => {
    closed = true;
    ws && ws.close();
  };
}
