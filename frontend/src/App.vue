<script setup>
import { ref, computed, onMounted } from "vue";
import { ElMessage } from "element-plus";
import { store, loadConfig, refreshAccessibleDirs, connectJobsWs, initTheme, setTheme } from "./store";
import { listenAuthResult, sdk } from "./sdk";
import { media, initMediaQuery } from "./media";
import { api } from "./api";
import {
  VideoPlay,
  Switch,
  Headset,
  InfoFilled,
  FolderOpened,
  List,
  Sunny,
  Moon,
  Monitor
} from "@element-plus/icons-vue";

import MergeView from "./views/MergeView.vue";
import ConvertView from "./views/ConvertView.vue";
import ExtractView from "./views/ExtractView.vue";
import MediaInfoView from "./views/MediaInfoView.vue";
import JobsPanel from "./components/JobsPanel.vue";
import DirManage from "./components/DirManage.vue";
import DirBrowser from "./components/DirBrowser.vue";
import appIcon from "./assets/app-icon.png";

const views = {
  merge: { comp: MergeView, label: "视频合并", icon: VideoPlay },
  convert: { comp: ConvertView, label: "转码压缩", icon: Switch },
  extract: { comp: ExtractView, label: "提取音频", icon: Headset },
  media: { comp: MediaInfoView, label: "媒体信息", icon: InfoFilled }
};
const activeView = computed(() => (views[store.tab] || views.merge).comp);

const jobsVisible = ref(false);
const dirManageVisible = ref(false);
const runningCount = computed(
  () => store.jobs.filter((j) => j.status === "running" || j.status === "queued").length
);

const themeOptions = [
  { label: "亮色", value: "light", icon: Sunny },
  { label: "暗色", value: "dark", icon: Moon },
  { label: "跟随系统", value: "auto", icon: Monitor }
];

async function refreshDirs() {
  try {
    await refreshAccessibleDirs();
  } catch (e) {
    ElMessage.warning(`获取授权目录失败：${e.message}`);
  }
}

onMounted(async () => {
  initMediaQuery();
  await loadConfig();
  connectJobsWs();
  initTheme(sdk);
  listenAuthResult(async () => {
    await api.refreshAuth().catch(() => {});
    refreshDirs();
  });
  refreshDirs();
});
</script>

<template>
  <!-- 桌面端：左侧边栏布局 -->
  <el-container v-if="!media.isMobile" class="app-shell">
    <el-aside width="200px" class="aside">
      <div class="logo">
        <img class="logo-mark" :src="appIcon" alt="Easy FFmpeg" />
        <div>
          <div class="logo-text">Easy FFmpeg</div>
          <div class="logo-sub">
            v{{ store.config.version }}
            <el-tag v-if="store.config.dev" size="small" type="warning">开发模式</el-tag>
          </div>
        </div>
      </div>

      <el-menu :default-active="store.tab" class="menu" @select="(k) => (store.tab = k)">
        <el-menu-item v-for="(v, key) in views" :key="key" :index="key">
          <el-icon><component :is="v.icon" /></el-icon>{{ v.label }}
        </el-menu-item>
      </el-menu>

      <div class="aside-footer">
        <el-segmented
          :model-value="store.theme"
          class="theme-switch"
          :options="themeOptions"
          @update:model-value="setTheme"
        >
          <template #default="{ item }">
            <el-tooltip :content="themeOptions.find((o) => o.value === item.value)?.label" placement="top">
              <span class="theme-opt"><el-icon><component :is="item.icon" /></el-icon></span>
            </el-tooltip>
          </template>
        </el-segmented>

        <el-button class="side-btn" :icon="FolderOpened" @click="dirManageVisible = true">
          授权目录
        </el-button>
        <el-badge :value="runningCount" :hidden="!runningCount" class="jobs-badge">
          <el-button class="side-btn" :icon="List" @click="jobsVisible = true">任务</el-button>
        </el-badge>
      </div>
    </el-aside>

    <el-main class="main">
      <component :is="activeView" />
    </el-main>
  </el-container>

  <!-- 移动端：顶栏 + 内容 + 底部标签栏 -->
  <div v-else class="mobile-shell">
    <header class="m-header">
      <div class="logo">
        <img class="logo-mark" :src="appIcon" alt="Easy FFmpeg" />
        <div>
          <div class="logo-text">Easy FFmpeg</div>
          <div class="logo-sub">
            v{{ store.config.version }}
            <el-tag v-if="store.config.dev" size="small" type="warning">开发</el-tag>
          </div>
        </div>
      </div>
      <div class="m-actions">
        <el-badge :value="runningCount" :hidden="!runningCount">
          <el-button circle :icon="List" @click="jobsVisible = true" />
        </el-badge>
        <el-button circle :icon="FolderOpened" @click="dirManageVisible = true" />
      </div>
    </header>

    <main class="m-main">
      <component :is="activeView" />
    </main>

    <nav class="m-tabbar">
      <button
        v-for="(v, key) in views"
        :key="key"
        class="m-tab-item"
        :class="{ 'is-active': store.tab === key }"
        @click="store.tab = key"
      >
        <el-icon :size="20"><component :is="v.icon" /></el-icon>
        <span>{{ v.label }}</span>
      </button>
    </nav>
  </div>

  <el-drawer
    v-model="jobsVisible"
    title="任务列表"
    :size="media.isMobile ? '100%' : 'min(420px, 92%)'"
  >
    <JobsPanel />
  </el-drawer>

  <DirManage v-model="dirManageVisible" />
  <DirBrowser v-if="store.picker" />
</template>

<style>
html,
body,
#app {
  height: 100%;
  margin: 0;
  background: var(--el-bg-color-page, var(--el-bg-color, #121212));
}
@supports (height: 100dvh) {
  html,
  body,
  #app {
    height: 100dvh;
  }
}
* {
  box-sizing: border-box;
}
</style>

<style scoped>
/* ---------- 共用品牌元素 ---------- */
.logo {
  display: flex;
  align-items: center;
  gap: 10px;
}
.logo-mark {
  width: 34px;
  height: 34px;
  flex: none;
  display: block;
}
.logo-text {
  font-weight: 700;
  color: var(--app-bar-text-active);
  font-size: 15px;
  letter-spacing: -0.2px;
}
.logo-sub {
  font-size: 11px;
  color: var(--app-bar-text);
  display: flex;
  align-items: center;
  gap: 4px;
  margin-top: 1px;
}

/* ---------- 桌面端 ---------- */
.app-shell {
  height: 100%;
}
.aside {
  display: flex;
  flex-direction: column;
  background: var(--app-bar-bg);
  border-right: 1px solid var(--app-bar-border);
  color: var(--app-bar-text);
}
.aside .logo {
  padding: 18px 14px;
}
.menu {
  flex: 1;
  border-right: none;
  background: transparent;
  padding: 0 8px;
}
.menu :deep(.el-menu-item) {
  height: 44px;
  margin: 3px 0;
  border-radius: 8px;
  color: var(--app-bar-text);
  font-size: 14px;
  font-weight: 500;
}
.menu :deep(.el-menu-item .el-icon) {
  color: inherit;
}
.menu :deep(.el-menu-item:hover) {
  background: var(--app-bar-active-bg);
  color: var(--app-bar-text-active);
}
.menu :deep(.el-menu-item.is-active) {
  background: var(--app-bar-active-bg);
  color: var(--app-bar-text-active);
  font-weight: 700;
}
.menu :deep(.el-menu-item.is-active .el-icon) {
  color: #1ed760;
}
.aside-footer {
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.theme-switch {
  width: 100%;
  --el-border-radius-base: 999px;
  --el-segmented-item-selected-bg-color: var(--app-bar-active-bg);
  --el-segmented-item-selected-color: var(--app-bar-text-active);
}
.theme-switch :deep(.el-segmented__group) {
  width: 100%;
}
.theme-switch :deep(.el-segmented__item) {
  flex: 1;
  justify-content: center;
}
.theme-opt {
  display: inline-flex;
  align-items: center;
}
.side-btn {
  width: 100%;
  justify-content: flex-start;
}
.jobs-badge {
  display: block;
  width: 100%;
}
.jobs-badge :deep(.el-badge__content) {
  background: #1ed760;
  color: #000;
  border: none;
}
.main {
  padding: 20px;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}
.main > :deep(.el-card),
.m-main > :deep(.el-card) {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
  width: 100%;
}
.main :deep(.el-card__body),
.m-main :deep(.el-card__body) {
  flex: 1;
  overflow-y: auto;
  min-height: 0;
}

/* ---------- 移动端 ---------- */
.mobile-shell {
  height: 100%;
  display: flex;
  flex-direction: column;
}
.m-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 14px;
  padding-top: calc(10px + env(safe-area-inset-top));
  background: var(--app-bar-bg);
  border-bottom: 1px solid var(--app-bar-border);
  flex: none;
}
.m-actions {
  display: flex;
  align-items: center;
  gap: 10px;
}
.m-main {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 12px;
  display: flex;
}
.m-tabbar {
  display: flex;
  background: var(--app-bar-bg);
  border-top: 1px solid var(--app-bar-border);
  padding-bottom: env(safe-area-inset-bottom);
  flex: none;
}
.m-tab-item {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  padding: 8px 0 6px;
  background: none;
  border: none;
  color: var(--app-bar-text);
  font-size: 11px;
  cursor: pointer;
}
.m-tab-item.is-active {
  color: var(--app-bar-text-active);
  font-weight: 600;
}
.m-tab-item.is-active .el-icon {
  color: #1ed760;
}
</style>
