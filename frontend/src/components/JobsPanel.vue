<script setup>
import { computed } from "vue";
import { ElMessage } from "element-plus";
import { store } from "../store";
import { api } from "../api";
import { fmtDateTime } from "../utils";

const TYPE_NAMES = {
  merge: "合并",
  trim: "剪辑",
  convert: "转码",
  extract: "提取音频"
};

const STATUS = {
  queued: { text: "排队中", type: "info" },
  running: { text: "进行中", type: "primary" },
  done: { text: "已完成", type: "success" },
  error: { text: "失败", type: "danger" },
  canceled: { text: "已取消", type: "warning" }
};

const activeCount = computed(
  () => store.jobs.filter((j) => j.status === "running" || j.status === "queued").length
);

async function cancel(job) {
  try {
    await api.cancelJob(job.id);
  } catch (e) {
    ElMessage.error(e.message);
  }
}

async function remove(job) {
  try {
    await api.removeJob(job.id);
  } catch (e) {
    ElMessage.error(e.message);
  }
}

async function retry(job) {
  try {
    await api.createJob(job.type, job.params);
    ElMessage.success("已重新加入队列");
  } catch (e) {
    ElMessage.error(e.message);
  }
}

async function copyOutput(job) {
  try {
    await navigator.clipboard.writeText(job.output || "");
    ElMessage.success("已复制输出路径");
  } catch {
    ElMessage.warning("复制失败，请手动选择路径复制");
  }
}
</script>

<template>
  <div class="jobs-panel">
    <div class="panel-head">
      <span>任务（{{ activeCount }} 个进行中 / 共 {{ store.jobs.length }} 个）</span>
      <el-tag v-if="!store.wsConnected" size="small" type="warning">连接断开，重连中…</el-tag>
    </div>

    <el-empty v-if="!store.jobs.length" description="暂无任务" :image-size="80" />

    <el-scrollbar v-else style="height: calc(100% - 40px)">
      <div v-for="job in store.jobs" :key="job.id" class="job-card">
        <div class="job-head">
          <span class="job-title">
            <el-tag size="small" effect="plain">{{ TYPE_NAMES[job.type] || job.type }}</el-tag>
            {{ job.title }}
          </span>
          <el-tag size="small" :type="STATUS[job.status]?.type || 'info'">
            {{ STATUS[job.status]?.text || job.status }}
          </el-tag>
        </div>

        <el-progress
          v-if="job.status === 'running'"
          :percentage="Math.round(job.progress)"
          :stroke-width="8"
        />

        <div class="job-meta">
          {{ fmtDateTime(job.createdAt) }}
          <template v-if="job.result?.mode === 'copy'"> · 无损流复制</template>
          <template v-if="job.result?.mode === 'encode'"> · 重编码</template>
        </div>

        <div v-if="job.output" class="job-output">
          <span class="output-path">{{ job.output }}</span>
          <el-button size="small" text type="primary" @click="copyOutput(job)">复制路径</el-button>
        </div>

        <el-alert
          v-if="job.status === 'error' && job.error"
          :title="job.error"
          type="error"
          :closable="false"
          style="margin-top: 6px"
        />

        <div class="job-actions">
          <el-button
            v-if="job.status === 'running' || job.status === 'queued'"
            size="small"
            type="warning"
            plain
            @click="cancel(job)"
          >
            取消
          </el-button>
          <el-button
            v-if="['done', 'error', 'canceled'].includes(job.status)"
            size="small"
            plain
            @click="retry(job)"
          >
            重新执行
          </el-button>
          <el-button
            v-if="['done', 'error', 'canceled'].includes(job.status)"
            size="small"
            type="danger"
            plain
            @click="remove(job)"
          >
            删除记录
          </el-button>
        </div>
      </div>
    </el-scrollbar>
  </div>
</template>

<style scoped>
.panel-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 10px;
  font-weight: 600;
}
.job-card {
  background: #181818;
  border-radius: 10px;
  padding: 10px 12px;
  margin-bottom: 10px;
}
.job-card:hover {
  background: #1f1f1f;
}
.job-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
}
.job-title {
  font-size: 14px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.job-meta {
  font-size: 12px;
  color: #999;
  margin-top: 6px;
}
.job-output {
  display: flex;
  align-items: center;
  margin-top: 6px;
  gap: 4px;
}
.output-path {
  font-size: 12px;
  font-family: monospace;
  color: #1ed760;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.job-actions {
  margin-top: 8px;
  display: flex;
  gap: 4px;
}
</style>
