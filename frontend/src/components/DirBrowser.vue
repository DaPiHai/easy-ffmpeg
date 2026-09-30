<script setup>
import { ref, computed, watch, nextTick, onMounted } from "vue";
import { ElMessage } from "element-plus";
import { store, closePicker } from "../store";
import { api } from "../api";
import { fmtSize } from "../utils";
import { Folder, Document, ArrowUp, FolderOpened, Grid, List } from "@element-plus/icons-vue";
import FileGridItem from "./FileGridItem.vue";

const opts = computed(() => store.picker || {});
const loading = ref(false);
const path = ref("");
const parent = ref(null);
const entries = ref([]);
const selected = ref([]); // 已选文件路径
const gridWrap = ref(null); // 网格滚动容器

const isDirMode = computed(() => opts.value.mode === "dir");

// 视图模式：列表 / 网格（预览图标），选择持久化
const VIEW_KEY = "easyffmpeg:browse-view";
const viewMode = ref(localStorage.getItem(VIEW_KEY) === "list" ? "list" : "grid");
watch(viewMode, (v) => localStorage.setItem(VIEW_KEY, v));
const dialogWidth = computed(() =>
  viewMode.value === "grid" ? "min(860px, 94vw)" : "min(720px, 94vw)"
);

function matchAccept(entry) {
  const accept = opts.value.accept;
  if (!accept || accept.length === 0) return true;
  return accept.includes(entry.ext);
}

async function browse(target) {
  loading.value = true;
  try {
    const data = await api.browse(target || "");
    path.value = data.path;
    parent.value = data.parent;
    entries.value = data.entries || [];
    nextTick(() => {
      if (gridWrap.value) gridWrap.value.scrollTop = 0;
    });
    // 只有根目录列表且仅一个根时自动进入
    if (!data.path && entries.value.length === 1 && entries.value[0].isDir) {
      const only = entries.value[0];
      await browse(only.path);
      return;
    }
  } catch (e) {
    ElMessage.error(e.message);
  } finally {
    loading.value = false;
  }
}

function onRowClick(entry) {
  if (entry.isDir) {
    browse(entry.path);
    return;
  }
  if (isDirMode.value || !matchAccept(entry)) return;
  if (opts.value.multiple) {
    toggleSelect(entry.path);
  } else {
    selected.value = [entry.path];
  }
}

function toggleSelect(p) {
  const i = selected.value.indexOf(p);
  if (i >= 0) selected.value.splice(i, 1);
  else selected.value.push(p);
}

function confirm() {
  if (isDirMode.value) {
    if (!path.value) return;
    closePicker(path.value);
  } else {
    if (!selected.value.length) return;
    closePicker([...selected.value]);
  }
}

onMounted(() => browse(opts.value.root || ""));
</script>

<template>
  <el-dialog
    :model-value="true"
    :title="isDirMode ? '选择目录' : '选择文件'"
    :width="dialogWidth"
    top="4vh"
    class="dir-browser-dialog"
    :close-on-click-modal="false"
    @close="closePicker(null)"
  >
    <div v-loading="loading" class="browser">
      <div class="toolbar">
        <el-button :icon="ArrowUp" size="small" :disabled="!parent" @click="browse(parent)" />
        <span class="crumb" :title="path || '授权目录列表'">
          {{ path || "选择一个授权目录进入" }}
        </span>
        <el-button :icon="FolderOpened" size="small" text @click="browse('')" />
        <el-radio-group v-model="viewMode" size="small" class="view-switch">
          <el-radio-button value="grid" title="缩略图视图">
            <el-icon><Grid /></el-icon>
          </el-radio-button>
          <el-radio-button value="list" title="列表视图">
            <el-icon><List /></el-icon>
          </el-radio-button>
        </el-radio-group>
      </div>

      <div v-if="viewMode === 'grid'" ref="gridWrap" class="grid">
        <FileGridItem
          v-for="e in entries"
          :key="e.path"
          :entry="e"
          :selected="selected.includes(e.path)"
          :dimmed="!e.isDir && !matchAccept(e)"
          :show-check="opts.multiple && !isDirMode && !e.isDir && matchAccept(e)"
          @activate="onRowClick"
          @toggle="toggleSelect"
        />
        <el-empty v-if="!entries.length" description="暂无内容" :image-size="60" class="grid-empty" />
      </div>

      <el-table
        v-else
        :data="entries"
        height="42vh"
        size="small"
        highlight-current-row
        @row-click="onRowClick"
      >
        <el-table-column width="42" v-if="!isDirMode && opts.multiple">
          <template #default="{ row }">
            <el-checkbox
              v-if="!row.isDir && matchAccept(row)"
              :model-value="selected.includes(row.path)"
              @change="toggleSelect(row.path)"
              @click.stop
            />
          </template>
        </el-table-column>
        <el-table-column label="名称" min-width="260">
          <template #default="{ row }">
            <el-icon class="row-icon"><Folder v-if="row.isDir" /><Document v-else /></el-icon>
            <span :class="{ dim: !row.isDir && !matchAccept(row) }">{{ row.name }}</span>
            <el-tag v-if="row.type" size="small" style="margin-left: 8px">
              {{ row.type === "shared" ? "共享" : "个人" }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="大小" width="100">
          <template #default="{ row }">{{ row.isDir ? "-" : fmtSize(row.size) }}</template>
        </el-table-column>
      </el-table>
    </div>

    <template #footer>
      <span class="hint">
        {{
          isDirMode
            ? "将授权当前所在的目录"
            : opts.multiple
              ? `已选 ${selected.length} 个文件`
              : ""
        }}
      </span>
      <el-button @click="closePicker(null)">取消</el-button>
      <el-button
        type="primary"
        :disabled="isDirMode ? !path : !selected.length"
        @click="confirm"
      >
        {{ isDirMode ? "选择当前目录" : "确定" }}
      </el-button>
    </template>
  </el-dialog>
</template>

<style scoped>
.browser {
  min-height: 320px;
}
.toolbar {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}
.crumb {
  flex: 1;
  font-size: 13px;
  color: #666;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  direction: rtl;
  text-align: left;
}
.row-icon {
  margin-right: 6px;
  vertical-align: -2px;
}
.view-switch {
  flex-shrink: 0;
}
.grid {
  height: 42vh;
  overflow-y: auto;
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-content: flex-start;
  align-items: flex-start;
}
.grid-empty {
  flex: 1 1 100%;
}
.dim {
  opacity: 0.4;
}
.hint {
  float: left;
  font-size: 13px;
  color: #999;
}
</style>

<style>
/* 对话框在小窗口内不溢出：主体内部滚动 */
.dir-browser-dialog {
  max-height: 92vh;
  display: flex;
  flex-direction: column;
  margin-bottom: 0 !important;
}
.dir-browser-dialog .el-dialog__body {
  overflow-y: auto;
  flex: 1;
}
</style>
