<script setup>
import { ref, computed } from "vue";
import { ElMessage } from "element-plus";
import { api } from "../api";
import { media } from "../media";
import { fmtTime, fmtSize } from "../utils";
import FileSelectButton from "../components/FileSelectButton.vue";
import DirSelect from "../components/DirSelect.vue";

const file = ref("");
const info = ref(null);
const probing = ref(false);
const container = ref("mp4");
const quality = ref("balanced");
const scale = ref("orig");
const vcodec = ref("libx264");
const outputDir = ref("");
const fileName = ref("");
const submitting = ref(false);

const isWebm = computed(() => container.value === "webm");

async function onFileChange(path) {
  file.value = path;
  info.value = null;
  if (!path) return;
  probing.value = true;
  try {
    info.value = await api.probe(path);
  } catch (e) {
    ElMessage.error(e.message);
  } finally {
    probing.value = false;
  }
}

async function submit() {
  if (!file.value) return ElMessage.warning("请先选择视频");
  if (!outputDir.value) return ElMessage.warning("请选择输出目录");
  submitting.value = true;
  try {
    await api.createJob("convert", {
      input: file.value,
      outputDir: outputDir.value,
      fileName: fileName.value || undefined,
      container: container.value,
      quality: quality.value,
      scale: scale.value,
      vcodec: vcodec.value
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
    <template #header>转码 / 压缩</template>

    <el-form :label-position="media.isMobile ? 'top' : 'left'" :label-width="media.isMobile ? undefined : '90px'">
      <el-form-item label="视频">
        <FileSelectButton v-model="file" :accept="api.videoAccept" @update:model-value="onFileChange" />
      </el-form-item>
      <el-form-item v-if="info" label="信息">
        <span class="tip">
          {{ fmtTime(info.duration) }} · {{ info.video?.width }}×{{ info.video?.height }} ·
          {{ fmtSize(info.size) }} · {{ info.video?.codec }}
        </span>
      </el-form-item>

      <el-form-item label="目标格式">
        <el-radio-group v-model="container">
          <el-radio value="mp4">MP4（兼容性最好）</el-radio>
          <el-radio value="mkv">MKV</el-radio>
          <el-radio value="webm">WebM</el-radio>
        </el-radio-group>
      </el-form-item>

      <el-form-item v-if="!isWebm" label="视频编码">
        <el-radio-group v-model="vcodec">
          <el-radio value="libx264">H.264（推荐）</el-radio>
          <el-radio value="libx265">H.265（体积更小，兼容性差）</el-radio>
        </el-radio-group>
      </el-form-item>

      <el-form-item label="画质">
        <el-radio-group v-model="quality">
          <el-radio value="high">高质量</el-radio>
          <el-radio value="balanced">均衡（推荐）</el-radio>
          <el-radio value="small">体积优先</el-radio>
        </el-radio-group>
      </el-form-item>

      <el-form-item label="分辨率">
        <el-radio-group v-model="scale">
          <el-radio value="orig">保持原始</el-radio>
          <el-radio value="1080p">1080p</el-radio>
          <el-radio value="720p">720p</el-radio>
        </el-radio-group>
      </el-form-item>

      <el-form-item label="输出目录">
        <DirSelect v-model="outputDir" />
      </el-form-item>
      <el-form-item label="输出文件名">
        <el-input v-model="fileName" placeholder="留空自动命名为「文件名.目标格式」" clearable />
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
