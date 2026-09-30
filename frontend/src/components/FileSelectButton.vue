<script setup>
import { openPicker } from "../store";
import { api } from "../api";

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
    <span v-if="modelValue" class="fsb-name">
      <template v-if="Array.isArray(modelValue)">已选 {{ modelValue.length }} 个文件</template>
      <template v-else>{{ basename(modelValue) }}</template>
    </span>
  </div>
</template>

<style scoped>
.fsb {
  display: flex;
  align-items: center;
  gap: 10px;
}
.fsb-name {
  font-size: 13px;
  color: #555;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
