import { sdk, hasHost, checkAuthState } from "./sdk";

// 授权回调页：解析 URL 结果 -> postMessage 通知原页面 -> 尝试关闭
async function run() {
  const el = document.getElementById("app");
  try {
    const result = sdk.parseAppAuthCallback(window.location.href);
    const state = new URL(window.location.href).searchParams.get("state");

    if (!checkAuthState(state)) {
      el.textContent = "授权结果校验失败（state 不匹配），请回到应用页面重新操作。";
      return;
    }

    if (window.opener && !window.opener.closed) {
      window.opener.postMessage({ type: "easyffmpeg:auth-result", result }, window.location.origin);
      el.textContent = "授权完成，本窗口将自动关闭…";
    } else {
      el.textContent =
        result?.status === "success"
          ? "授权完成，请回到应用页面点击「刷新目录」。"
          : "授权未完成，请回到应用页面重新操作。";
    }
    setTimeout(() => window.close(), 1500);
  } catch (e) {
    el.textContent = "解析授权结果失败：" + (e?.message || e);
  }
}

run();
