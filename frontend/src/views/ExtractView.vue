<script setup>
import { ref } from "vue";
import { ElMessage } from "element-plus";
import { api } from "../api";
import { media } from "../media";
import { fmtTime } from "../utils";
import FileSelectButton from "../components/FileSelectButton.vue";
import DirSelect from "../components/DirSelect.vue";

const file = ref("");
const info = ref(null);
const format = ref("auto");
const outputDir = ref("");
const fileName = ref("");
const submitting = ref(false);

async function onFileChange(path) {
  file.value = path;
  info.value = null;
  if (!path) return;
  try {
    info.value = await api.probe(path);
  } catch (e) {
    ElMessage.error(e.message);
  }
}

async function submit() {
  if (!file.value) return ElMessage.warning("请先选择视频");
  if (!outputDir.value) return ElMessage.warning("请选择输出目录");
  submitting.value = true;
  try {
    await api.createJob("extract", {
      input: file.value,
      outputDir: outputDir.value,
      fileName: fileName.value || undefined,
      format: format.value
    });
    ElMessage.success("任务已加入队列");
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
    <template #header>提取音频</template>

    <el-form :label-position="media.isMobile ? 'top' : 'left'" :label-width="media.isMobile ? undefined : '90px'">
      <el-form-item label="视频">
        <FileSelectButton v-model="file" :accept="api.videoAccept" @update:model-value="onFileChange" />
      </el-form-item>
      <el-form-item v-if="info" label="信息">
        <span class="tip">
          {{ fmtTime(info.duration) }} · 音轨：
          {{ info.audio ? `${info.audio.codec} ${info.audio.sampleRate}Hz` : "无" }}
        </span>
      </el-form-item>

      <el-form-item label="输出格式">
        <el-radio-group v-model="format">
          <el-radio value="auto">自动（编码兼容则无损导出）</el-radio>
          <el-radio value="m4a">M4A / AAC</el-radio>
          <el-radio value="mp3">MP3</el-radio>
          <el-radio value="flac">FLAC（无损）</el-radio>
          <el-radio value="wav">WAV</el-radio>
        </el-radio-group>
      </el-form-item>

      <el-form-item label="输出目录">
        <DirSelect v-model="outputDir" />
      </el-form-item>
      <el-form-item label="输出文件名">
        <el-input v-model="fileName" placeholder="留空自动命名为「文件名.m4a」等" clearable />
      </el-form-item>
    </el-form>

    <div class="actions">
      <el-button type="primary" :loading="submitting" @click="submit">加入任务队列</el-button>
    </div>
  </el-card>
</template>

<style scoped>
.tip {
  font-size: 12px;
  color: #999;
}
.actions {
  margin-top: 8px;
  text-align: right;
}
</style>
