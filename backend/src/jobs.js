const fs = require("fs");
const fsp = require("fs/promises");
const path = require("path");
const crypto = require("crypto");
const { STATE_DIR, MAX_CONCURRENCY } = require("./paths");
const { runJob } = require("./handlers");

/**
 * 串行任务队列。
 * - 任务持久化到 STATE_DIR/jobs.json，服务重启后 running/queued 标记为中断
 * - 事件（created/progress/status）通过 listeners 广播（WebSocket）
 */
class JobQueue {
  constructor() {
    this.jobsFile = path.join(STATE_DIR, "jobs.json");
    /** @type {Map<string, object>} */
    this.jobs = new Map();
    this.runningId = null;
    this.abortController = null;
    this.listeners = new Set();
    this.saveTimer = null;
  }

  async load() {
    await fsp.mkdir(STATE_DIR, { recursive: true });
    try {
      const raw = await fsp.readFile(this.jobsFile, "utf8");
      const list = JSON.parse(raw);
      for (const job of Array.isArray(list) ? list : []) {
        // 上次运行中/排队中的任务：进程重启后视为中断
        if (job.status === "running" || job.status === "queued") {
          job.status = "error";
          job.error = "服务重启，任务被中断";
          job.endedAt = Date.now();
        }
        this.jobs.set(job.id, job);
      }
      await this.persistNow();
    } catch {
      // 首次启动无历史文件
    }
  }

  persist() {
    clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => this.persistNow().catch(() => {}), 300);
  }

  persistProgressThrottled() {
    if (this._progTimer) return;
    this._progTimer = setTimeout(() => {
      this._progTimer = null;
      this.persistNow().catch(() => {});
    }, 1000);
  }

  async persistNow() {
    clearTimeout(this.saveTimer);
    const list = [...this.jobs.values()].sort((a, b) => b.createdAt - a.createdAt);
    await fsp.mkdir(STATE_DIR, { recursive: true });
    await fsp.writeFile(this.jobsFile, JSON.stringify(list, null, 2), "utf8");
  }

  list() {
    return [...this.jobs.values()].sort((a, b) => b.createdAt - a.createdAt);
  }

  get(id) {
    return this.jobs.get(id) || null;
  }

  onEvent(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  emit(type, job) {
    const snapshot = job ? this.publicView(job) : null;
    for (const fn of this.listeners) {
      try {
        fn(type, snapshot);
      } catch {}
    }
  }

  publicView(job) {
    // 去掉 params 里的长列表等噪音？保留完整 params 便于前端展示，直接浅拷贝
    return { ...job };
  }

  create({ uid, type, params, title }) {
    const job = {
      id: crypto.randomUUID(),
      uid,
      type,
      params,
      title,
      status: "queued",
      progress: 0,
      detail: "",
      output: null,
      error: null,
      createdAt: Date.now(),
      startedAt: null,
      endedAt: null
    };
    this.jobs.set(job.id, job);
    this.persist();
    this.emit("created", job);
    this.pump();
    return job;
  }

  pump() {
    if (this.runningId) return;
    const next = [...this.jobs.values()]
      .filter((j) => j.status === "queued")
      .sort((a, b) => a.createdAt - b.createdAt)[0];
    if (!next) return;
    this.start(next).catch(() => {});
  }

  async start(job) {
    this.runningId = job.id;
    this.abortController = new AbortController();
    job.status = "running";
    job.progress = 0;
    job.startedAt = Date.now();
    this.persist();
    this.emit("status", job);

    const { TEMP_DIR } = require("./paths");
    const tmpDir = path.join(TEMP_DIR, `job-${job.id}`);
    await fsp.mkdir(tmpDir, { recursive: true });

    const ctx = {
      tmpDir,
      signal: this.abortController.signal,
      onProgress: (pct) => {
        job.progress = Math.round(pct * 10) / 10;
        this.emit("progress", job);
        this.persistProgressThrottled();
      }
    };

    try {
      const result = await runJob(job, ctx);
      job.status = "done";
      job.progress = 100;
      job.output = result?.output || null;
      job.result = result || null;
    } catch (e) {
      if (e && e.canceled) {
        job.status = "canceled";
        job.error = "已取消";
      } else {
        job.status = "error";
        job.error = e && e.message ? e.message : String(e);
      }
    } finally {
      job.endedAt = Date.now();
      this.runningId = null;
      this.abortController = null;
      // 清理任务的临时目录
      fsp.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
      this.persist();
      this.emit("status", job);
      this.pump();
    }
  }

  cancel(id) {
    const job = this.jobs.get(id);
    if (!job) return false;
    if (job.status === "queued") {
      job.status = "canceled";
      job.error = "已取消";
      job.endedAt = Date.now();
      this.persist();
      this.emit("status", job);
      return true;
    }
    if (job.status === "running" && this.abortController) {
      this.abortController.abort();
      return true;
    }
    return false;
  }

  async remove(id) {
    const job = this.jobs.get(id);
    if (!job) return false;
    if (job.status === "running" || job.status === "queued") {
      this.cancel(id);
    }
    this.jobs.delete(id);
    await this.persistNow();
    this.emit("removed", job);
    return true;
  }

  async shutdown() {
    // 收到 SIGTERM 时取消运行中的 ffmpeg，让进程尽快退出
    if (this.abortController) this.abortController.abort();
    await this.persistNow().catch(() => {});
  }
}

module.exports = { JobQueue, MAX_CONCURRENCY };
