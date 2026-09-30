<script setup>
import { ref, computed } from "vue";
import { api } from "../api";
import { Folder, Document, VideoPlay, Headset, Picture } from "@element-plus/icons-vue";

const props = defineProps({
  entry: { type: Object, required: true },
  selected: Boolean,
  dimmed: Boolean,
  showCheck: Boolean
});
const emit = defineEmits(["activate", "toggle"]);

const imgFailed = ref(false);
// 所有缩略图统一等高（96px），宽度按视频原始比例伸缩；加载前按 16:10 占位
const THUMB_H = 96;
const ar = ref(null);

function onImgLoad(e) {
  const img = e.target;
  if (img.naturalWidth && img.naturalHeight) ar.value = [img.naturalWidth, img.naturalHeight];
}

// 卡片宽度 = 等高 × 比例（不取整，保证所有卡片高度精确一致），由缩略图决定；
// 文件名在卡片宽度内截断，不参与撑宽
const ratio = computed(() => (ar.value ? ar.value[0] / ar.value[1] : 16 / 10));
const cardStyle = computed(() => ({ width: THUMB_H * ratio.value + "px" }));
const thumbStyle = computed(() => ({
  aspectRatio: ar.value ? `${ar.value[0]} / ${ar.value[1]}` : "16 / 10"
}));

const kind = computed(() => {
  if (props.entry.isDir) return "dir";
  const e = props.entry.ext || "";
  if (api.videoAccept.includes(e)) return "video";
  if ([".jpg", ".jpeg", ".png", ".gif", ".webp", ".bmp"].includes(e)) return "image";
  if ([".mp3", ".m4a", ".flac", ".wav", ".aac", ".ogg"].includes(e)) return "audio";
  return "other";
});

// 视频/图片走缩略图接口，其余用类型图标
const src = computed(() =>
  kind.value === "video" || kind.value === "image" ? api.thumbUrl(props.entry.path) : ""
);
</script>

<template>
  <div
    class="grid-item"
    :class="{ selected, dim: dimmed }"
    :style="cardStyle"
    :title="entry.name"
    @click="emit('activate', entry)"
  >
    <div class="thumb" :style="thumbStyle">
      <img
        v-if="src && !imgFailed"
        :src="src"
        loading="lazy"
        decoding="async"
        alt=""
        @load="onImgLoad"
        @error="imgFailed = true"
      />
      <template v-else>
        <el-icon v-if="kind === 'dir'" class="type-icon"><Folder /></el-icon>
        <el-icon v-else-if="kind === 'video'" class="type-icon"><VideoPlay /></el-icon>
        <el-icon v-else-if="kind === 'image'" class="type-icon"><Picture /></el-icon>
        <el-icon v-else-if="kind === 'audio'" class="type-icon"><Headset /></el-icon>
        <el-icon v-else class="type-icon"><Document /></el-icon>
      </template>
      <el-checkbox
        v-if="showCheck"
        class="check"
        :model-value="selected"
        @click.stop
        @change="emit('toggle', entry.path)"
      />
    </div>
    <div class="name">{{ entry.name }}</div>
  </div>
</template>

<style scoped>
.grid-item {
  cursor: pointer;
  border-radius: 8px;
  padding: 6px 0;
  transition: background-color 0.15s;
}
.grid-item:hover {
  background: var(--el-fill-color-light);
}
.grid-item.selected {
  background: var(--el-fill-color);
}
.thumb {
  position: relative;
  width: 100%;
  border-radius: 6px;
  overflow: hidden;
  background: var(--el-fill-color-dark);
  display: flex;
  align-items: center;
  justify-content: center;
}
.thumb img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}
.selected .thumb {
  outline: 2px solid var(--el-color-primary);
  outline-offset: -2px;
}
.type-icon {
  font-size: 34px;
  color: var(--el-text-color-secondary);
}
.check {
  position: absolute;
  top: 4px;
  right: 4px;
}
.name {
  margin-top: 6px;
  font-size: 12px;
  line-height: 1.3;
  color: var(--el-text-color-primary);
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  word-break: break-all;
}
.dim {
  opacity: 0.4;
}
</style>
