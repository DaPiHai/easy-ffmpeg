<script setup>
import { store, openPicker } from "../store";

const model = defineModel({ type: String, default: "" });

async function browse() {
  const p = await openPicker({ mode: "dir" });
  if (typeof p === "string" && p) model.value = p;
}
</script>

<template>
  <div class="dir-select">
    <el-select v-model="model" placeholder="选择输出目录" style="flex: 1">
      <el-option
        v-for="d in store.dirs"
        :key="d.path"
        :value="d.path"
        :label="`${d.name}（${d.type === 'shared' ? '共享' : '个人'}）`"
      />
    </el-select>
    <el-button @click="browse">浏览…</el-button>
  </div>
</template>

<style scoped>
.dir-select {
  display: flex;
  gap: 8px;
  width: 100%;
}
</style>
