<script setup>
import { ref } from "vue";
import { ElMessage } from "element-plus";
import { api } from "../api";
import { fmtTime, fmtSize } from "../utils";
import FileSelectButton from "../components/FileSelectButton.vue";
import FileThumb from "../components/FileThumb.vue";

const file = ref("");
const info = ref(null);
const loading = ref(false);

async function onFileChange(path) {
  file.value = path;
  info.value = null;
  if (!path) return;
  loading.value = true;
  try {
    info.value = await api.probe(path);
  } catch (e) {
    ElMessage.error(e.message);
  } finally {
    loading.value = false;
  }
}
</script>

<template>
  <el-card shadow="never">
    <template #header>媒体信息</template>

    <FileSelectButton v-model="file" :accept="api.videoAccept" @update:model-value="onFileChange" />

    <div v-if="info" v-loading="loading" style="margin-top: 16px">
      <div class="mi-preview">
        <FileThumb :path="file" :height="135" />
      </div>
      <el-descriptions title="容器信息" :column="2" border size="small">
        <el-descriptions-item label="文件名">{{ info.name }}</el-descriptions-item>
        <el-descriptions-item label="封装格式">{{ info.container }}</el-descriptions-item>
        <el-descriptions-item label="时长">{{ fmtTime(info.duration) }}</el-descriptions-item>
        <el-descriptions-item label="大小">{{ fmtSize(info.size) }}</el-descriptions-item>
        <el-descriptions-item label="总码率">
          {{ info.bitrate ? `${(info.bitrate / 1000).toFixed(0)} kbps` : "-" }}
        </el-descriptions-item>
        <el-descriptions-item label="路径">
          <span class="mono">{{ info.path }}</span>
        </el-descriptions-item>
      </el-descriptions>

      <h4>流信息</h4>
      <el-table :data="info.streams" size="small" border>
        <el-table-column label="#" width="50">
          <template #default="{ $index }">{{ $index }}</template>
        </el-table-column>
        <el-table-column label="类型" width="80">
          <template #default="{ row }">
            <el-tag size="small" :type="row.codec_type === 'video' ? 'primary' : row.codec_type === 'audio' ? 'success' : 'info'">
              {{ row.codec_type }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="编码" width="110">
          <template #default="{ row }">{{ row.codec_name }}{{ row.profile ? ` (${row.profile})` : "" }}</template>
        </el-table-column>
        <el-table-column label="规格" min-width="220">
          <template #default="{ row }">
            <span v-if="row.codec_type === 'video'">
              {{ row.width }}×{{ row.height }} · {{ row.r_frame_rate }} fps · {{ row.pix_fmt }}
            </span>
            <span v-else-if="row.codec_type === 'audio'">
              {{ row.sample_rate }} Hz · {{ row.channels }} 声道 · {{ row.channel_layout || "" }}
            </span>
            <span v-else>{{ row.codec_long_name || "" }}</span>
          </template>
        </el-table-column>
        <el-table-column label="码率" width="110">
          <template #default="{ row }">
            {{ row.bit_rate ? `${(row.bit_rate / 1000).toFixed(0)} kbps` : "-" }}
          </template>
        </el-table-column>
      </el-table>
    </div>
    <el-empty v-else description="选择一个视频文件查看媒体信息" :image-size="80" />
  </el-card>
</template>

<style scoped>
.mono {
  font-family: monospace;
  font-size: 12px;
  word-break: break-all;
}
.mi-preview {
  margin-bottom: 14px;
}
</style>
