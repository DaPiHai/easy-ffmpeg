export function fmtSize(bytes) {
  if (bytes == null || isNaN(bytes)) return "-";
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let v = bytes / 1024;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(v >= 100 ? 0 : 1)} ${units[i]}`;
}

/** 秒 -> HH:MM:SS.t（小时为 0 时省略） */
export function fmtTime(sec) {
  if (sec == null || isNaN(sec) || sec < 0) return "-";
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  const ss = s.toFixed(1).padStart(4, "0");
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${ss}`;
  return `${m}:${ss}`;
}

/** 解析 "80" / "1:20" / "1:02:03.5" -> 秒 */
export function parseTime(text) {
  if (typeof text === "number") return text;
  const t = String(text || "").trim();
  if (!t) return NaN;
  if (!/^[\d:.]+$/.test(t)) return NaN;
  const parts = t.split(":");
  if (parts.length > 3) return NaN;
  let sec = 0;
  for (const p of parts) {
    const v = parseFloat(p);
    if (isNaN(v)) return NaN;
    sec = sec * 60 + v;
  }
  return sec;
}

export function fmtDateTime(ts) {
  if (!ts) return "";
  const d = new Date(ts);
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getMonth() + 1}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}
