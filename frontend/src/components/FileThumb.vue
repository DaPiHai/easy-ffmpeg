<script setup>
import { ref, computed, watch } from "vue";
import { api } from "../api";
import { VideoPlay } from "@element-plus/icons-vue";

// 已选视频的行内缩略图（列表/表单用），加载失败回退播放图标
const props = defineProps({
  path: { type: String, default: "" },
  height: { type: Number, default: 48 }
});

const failed = ref(false);
// 统一等高，宽度按视频原始比例伸缩；加载前按 16:10 占位
const ar = ref(null);

watch(
  () => props.path,
  () => {
    failed.value = false;
    ar.value = null;
  }
);

function onImgLoad(e) {
  const img = e.target;
  if (img.naturalWidth && img.naturalHeight) ar.value = [img.naturalWidth, img.naturalHeight];
}

const boxStyle = computed(() => ({
  height: props.height + "px",
  aspectRatio: ar.value ? `${ar.value[0]} / ${ar.value[1]}` : "16 / 10"
}));
</script>

<template>
  <div class="file-thumb" :style="boxStyle">
    <img
      v-if="path && !failed"
      :key="path"
      :src="api.thumbUrl(path)"
      loading="lazy"
      decoding="async"
      alt=""
      @load="onImgLoad"
      @error="failed = true"
    />
    <el-icon v-else class="ph"><VideoPlay /></el-icon>
  </div>
</template>

<style scoped>
.file-thumb {
  flex: none;
  border-radius: 6px;
  overflow: hidden;
  background: var(--el-fill-color-dark);
  display: flex;
  align-items: center;
  justify-content: center;
}
.file-thumb img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}
.ph {
  font-size: 22px;
  color: var(--el-text-color-secondary);
}
</style>
