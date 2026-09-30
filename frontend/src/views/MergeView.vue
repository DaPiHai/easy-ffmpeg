<script setup>
import { ref } from "vue";
import { ElMessage } from "element-plus";
import { Top, Bottom, Delete } from "@element-plus/icons-vue";
import { api } from "../api";
import { media } from "../media";
import { openPicker } from "../store";
import { fmtSize } from "../utils";
import DirSelect from "../components/DirSelect.vue";

const files = ref([]); // [{ path, name, size? }]
const mode = ref("auto");
const outputDir = ref("");
const fileName = ref("");
const submitting = ref(false);

function basename(p) {
  return String(p).split("/").pop();
}

async function addFiles() {
  const paths = await openPicker({ mode: "files", accept: api.videoAccept });
  if (!Array.isArray(paths)) return;
  for (const p of paths) {
    if (!files.value.some((f) => f.path === p)) {
      files.value.push({ path: p, name: basename(p) });
    }
  }
}

function removeAt(i) {
  files.value.splice(i, 1);
}

function move(i, d) {
  const a = files.value;
  const j = i + d;
  if (j < 0 || j >= a.length) return;
  const tmp = a[i];
  a[i] = a[j];
  a[j] = tmp;
}

async function submit() {
  if (files.value.length < 2) return ElMessage.warning("请至少添加 2 个视频");
  if (!outputDir.value) return ElMessage.warning("请选择输出目录");
  submitting.value = true;
  try {
    await api.createJob("merge", {
      inputs: files.value.map((f) => f.path),
      outputDir: outputDir.value,
      fileName: fileName.value || undefined,
      mode: mode.value
    });
    ElMessage.success("任务已加入队列，可在「任务」面板查看进度");
    files.value = [];
    fileName.value = "";
  } catch (e) {
    ElMessage.error(e.message);
  } finally {
    submitting.value = false;
  }
}
</script>

<template>
  <el-card shadow="never">
    <template #header>视频合并</template>

    <el-form :label-position="media.isMobile ? 'top' : 'left'" :label-width="media.isMobile ? undefined : '90px'">
      <el-form-item label="视频列表">
        <div class="file-list-wrap">
          <el-button @click="addFiles">添加视频（可多选）</el-button>
          <el-empty
            v-if="!files.length"
            description="还没有添加视频，按列表顺序依次拼接"
            :image-size="60"
          />
          <div v-for="(f, i) in files" :key="f.path" class="file-row">
            <span class="order">{{ i + 1 }}</span>
            <span class="name" :title="f.path">{{ f.name }}</span>
            <span class="ops">
              <el-button size="small" text :icon="Top" :disabled="i === 0" @click="move(i, -1)" />
              <el-button
                size="small"
                text
                :icon="Bottom"
                :disabled="i === files.length - 1"
                @click="move(i, 1)"
              />
              <el-button size="small" text type="danger" :icon="Delete" @click="removeAt(i)" />
            </span>
          </div>
        </div>
      </el-form-item>

      <el-form-item label="拼接模式">
        <el-radio-group v-model="mode">
          <el-radio value="auto">自动（推荐）</el-radio>
          <el-radio value="copy">无损拼接</el-radio>
          <el-radio value="encode">重编码拼接</el-radio>
        </el-radio-group>
        <div class="tip">
          自动：编码参数一致时秒级无损拼接，否则自动重编码统一参数；无损：要求各视频编码完全一致；
          重编码：无论参数是否一致都统一转码（较慢），不同尺寸的画面会按比例居中并加模糊背景填充。
        </div>
      </el-form-item>

      <el-form-item label="输出目录">
        <DirSelect v-model="outputDir" />
      </el-form-item>
      <el-form-item label="输出文件名">
        <el-input
          v-model="fileName"
          placeholder="留空则自动命名为「第一个文件名-合并.mp4」"
          clearable
        />
      </el-form-item>
    </el-form>

    <div class="actions">
      <el-button type="primary" :loading="submitting" @click="submit">加入任务队列</el-button>
    </div>
  </el-card>
</template>

<style scoped>
.file-list-wrap {
  width: 100%;
}
.file-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 8px;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 6px;
  margin-top: 6px;
}
.order {
  color: #999;
  font-size: 12px;
  width: 18px;
}
.name {
  flex: 1;
  font-size: 13px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.ops :deep(.el-button + .el-button) {
  margin-left: 0;
}
.tip {
  font-size: 12px;
  color: #999;
  line-height: 1.6;
  margin-top: 4px;
}
.actions {
  margin-top: 8px;
  text-align: right;
}
</style>
