#!/usr/bin/env bash
# 获取静态 ffmpeg/ffprobe 到 vendor/ffmpeg/<arch>/
# 首选 npm 源（@ffmpeg-installer / @ffprobe-installer，包内自带 johnvansickle 静态二进制，
# 不依赖 GitHub 直连）；失败时回退 GitHub ffmpeg-static release。
# 用法: ./scripts/fetch-ffmpeg.sh [x86_64|aarch64]
set -euo pipefail

ARCH="${1:-x86_64}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DEST="$ROOT/vendor/ffmpeg/$ARCH"

case "$ARCH" in
  x86_64) NPM_ARCH="linux-x64" ; GH_NAME="ffmpeg-linux-x64" ;;
  aarch64) NPM_ARCH="linux-arm64" ; GH_NAME="ffmpeg-linux-arm64" ;;
  *) echo "不支持的架构: $ARCH（可选 x86_64 / aarch64）" >&2; exit 1 ;;
esac

mkdir -p "$DEST"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

fetch_via_npm() {
  echo "通过 npm 获取 @ffmpeg-installer/ffmpeg + @ffprobe-installer/ffprobe (${NPM_ARCH}) ..."
  ( cd "$TMP" && npm init -y >/dev/null 2>&1 && \
    npm install --no-save --ignore-scripts \
      "@ffmpeg-installer/${NPM_ARCH}" "@ffprobe-installer/${NPM_ARCH}" >/dev/null )
  cp "$TMP/node_modules/@ffmpeg-installer/${NPM_ARCH}/ffmpeg" "$DEST/ffmpeg"
  cp "$TMP/node_modules/@ffprobe-installer/${NPM_ARCH}/ffprobe" "$DEST/ffprobe"
}

fetch_via_github() {
  local tag="b6.1.1"
  echo "回退 GitHub eugeneware/ffmpeg-static ${tag} ..."
  curl -fL --retry 3 -o "$TMP/ffmpeg.gz" \
    "https://github.com/eugeneware/ffmpeg-static/releases/download/${tag}/${GH_NAME}.gz"
  curl -fL --retry 3 -o "$TMP/ffprobe.gz" \
    "https://github.com/eugeneware/ffmpeg-static/releases/download/${tag}/ffprobe-${GH_NAME#ffmpeg-}.gz"
  gunzip -f "$TMP/ffmpeg.gz" "$TMP/ffprobe.gz"
  cp "$TMP/ffmpeg" "$DEST/ffmpeg"
  cp "$TMP/ffprobe" "$DEST/ffprobe"
}

if command -v npm >/dev/null 2>&1 && fetch_via_npm; then
  :
else
  fetch_via_github
fi

chmod +x "$DEST/ffmpeg" "$DEST/ffprobe"
echo "已就绪:"
"$DEST/ffmpeg" -version | head -1
"$DEST/ffprobe" -version | head -1
