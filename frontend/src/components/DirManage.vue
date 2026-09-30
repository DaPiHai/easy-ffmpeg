<script setup>
import { ref } from "vue";
import { ElMessage, ElMessageBox } from "element-plus";
import { store, refreshAccessibleDirs } from "../store";
import { api } from "../api";
import { pickDirectory, hasHost } from "../sdk";

const visible = defineModel({ type: Boolean, default: false });
const adding = ref(false);

async function addDir() {
  adding.value = true;
  try {
    const paths = await pickDirectory();
    await api.refreshAuth().catch(() => {});
    await refreshAccessibleDirs();
    if (paths && paths.length) ElMessage.success("目录授权成功");
    else ElMessage.info("授权流程已发起，完成后目录会出现在列表中");
  } catch (e) {
    ElMessage.error(e.message);
  } finally {
    adding.value = false;
  }
}

async function revoke(dir) {
  try {
    await ElMessageBox.confirm(
      `确定解除对「${dir.name}」的授权吗？解除后应用将无法访问该目录。`,
      "解除授权",
      { type: "warning" }
    );
  } catch {
    return;
  }
  try {
    await api.revokeDir(dir.path, dir.type);
    await refreshAccessibleDirs();
    ElMessage.success("已解除授权");
  } catch (e) {
    ElMessage.error(e.message);
  }
}

async function refresh() {
  try {
    await refreshAccessibleDirs();
  } catch (e) {
    ElMessage.error(e.message);
  }
}
</script>

<template>
  <el-dialog v-model="visible" title="授权目录管理" width="min(640px, 94vw)" top="5vh">
    <el-alert
      v-if="!hasHost"
      title="当前未运行在飞牛 fnOS 中，无法发起新的系统目录授权"
      type="warning"
      :closable="false"
      style="margin-bottom: 12px"
    />
    <el-table :data="store.dirs" size="small" empty-text="暂无授权目录，点击「添加目录」发起授权">
      <el-table-column label="目录" min-width="260">
        <template #default="{ row }">
          <div>{{ row.name }}</div>
          <div class="dir-path">{{ row.path }}</div>
        </template>
      </el-table-column>
      <el-table-column label="类型" width="90">
        <template #default="{ row }">
          <el-tag size="small" :type="row.type === 'shared' ? 'warning' : 'primary'">
            {{ row.type === "shared" ? "共享" : "个人" }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column label="操作" width="140">
        <template #default="{ row }">
          <el-button size="small" text type="danger" @click="revoke(row)">解除授权</el-button>
        </template>
      </el-table-column>
    </el-table>
    <template #footer>
      <el-button @click="refresh">刷新</el-button>
      <el-button type="primary" :loading="adding" @click="addDir">添加目录</el-button>
    </template>
  </el-dialog>
</template>

<style scoped>
.dir-path {
  font-size: 12px;
  color: #999;
  font-family: monospace;
}
</style>
