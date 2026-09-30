import { reactive } from "vue";

/** 响应式断点状态（移动端飞牛 App / 窄窗口共用） */
export const media = reactive({ isMobile: false });

export function initMediaQuery() {
  if (!window.matchMedia) return;
  const mq = window.matchMedia("(max-width: 768px)");
  const update = () => (media.isMobile = mq.matches);
  update();
  mq.addEventListener("change", update);
}
