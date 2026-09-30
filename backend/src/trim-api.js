const http = require("http");
const { TRIM_API_SOCKET, APP_NAME } = require("./paths");

/**
 * 调用飞牛开放平台后端 API。
 * 统一端点 POST /api/v1/trimapp，只能通过 Unix Socket 访问，
 * token 来自系统注入的环境变量 TRIM_API_TOKEN（每次从环境读取，禁止持久化）。
 * 请求体 { reqId, req, appName, data }，响应 { reqId, code, msg, data }，code=0 为成功。
 */
function callTrimApi(req, data, opts = {}) {
  const token = process.env.TRIM_API_TOKEN;
  if (!token) {
    return Promise.reject(
      Object.assign(new Error("未检测到 TRIM_API_TOKEN，开放平台 API 仅在飞牛环境中可用"), {
        code: "NO_TOKEN"
      })
    );
  }

  const body = JSON.stringify({
    reqId: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    req,
    appName: APP_NAME,
    ...(data === undefined ? {} : { data })
  });

  return new Promise((resolve, reject) => {
    const httpReq = http.request(
      {
        socketPath: TRIM_API_SOCKET,
        path: "/api/v1/trimapp",
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(body),
          Authorization: `Bearer ${token}`
        },
        timeout: opts.timeout || 15000
      },
      (res) => {
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => {
          try {
            const parsed = JSON.parse(Buffer.concat(chunks).toString("utf8"));
            if (parsed.code === 0) {
              resolve(parsed.data);
            } else {
              reject(
                Object.assign(new Error(parsed.msg || `trimapi ${req} 调用失败`), {
                  code: parsed.code
                })
              );
            }
          } catch (e) {
            reject(new Error(`trimapi 响应解析失败: ${e.message}`));
          }
        });
      }
    );
    httpReq.on("timeout", () => httpReq.destroy(new Error("trimapi 请求超时")));
    httpReq.on("error", reject);
    httpReq.write(body);
    httpReq.end();
  });
}

module.exports = { callTrimApi };
