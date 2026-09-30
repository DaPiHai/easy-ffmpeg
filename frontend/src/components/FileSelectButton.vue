<script setup>
import { openPicker } from "../store";
import { api } from "../api";
import FileThumb from "./FileThumb.vue";

const props = defineProps({
  modelValue: { type: [String, Array], default: "" },
  accept: { type: Array, default: () => [] },
  multiple: { type: Boolean, default: false },
  label: { type: String, default: "选择视频文件…" }
});
const emit = defineEmits(["update:modelValue"]);

function basename(p) {
  return String(p).split("/").pop();
}

async function pick() {
  const paths = await openPicker({
    mode: props.multiple ? "files" : "file",
    accept: props.accept.length ? props.accept : null
  });
  if (Array.isArray(paths) && paths.length) {
    emit("update:modelValue", props.multiple ? paths : paths[0]);
  }
}
</script>

<template>
  <div class="fsb">
    <el-button type="primary" plain @click="pick">{{ label }}</el-button>
    <div v-if="modelValue && !Array.isArray(modelValue)" class="fsb-file">
      <FileThumb :path="modelValue" :height="56" />
      <span class="fsb-name" :title="modelValue">{{ basename(modelValue) }}</span>
    </div>
    <span v-else-if="Array.isArray(modelValue)" class="fsb-name">
      已选 {{ modelValue.length }} 个文件
    </span>
  </div>
</template>

<style scoped>
.fsb {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
  width: 100%;
}
.fsb-file {
  display: flex;
  align-items: center;
  gap: 10px;
  flex: 1;
  min-width: 0;
  padding: 4px 8px 4px 4px;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 6px;
}
.fsb-name {
  flex: 1;
  min-width: 0;
  font-size: 13px;
  color: #555;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
