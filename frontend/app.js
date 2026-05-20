// ============================================================
// LangGraph AIOps Platform - Frontend Logic
// ============================================================

const API = "/api/v1";

const PAGE_META = {
    overview: { title: "运维概览", subtitle: "本机资源约 3 秒刷新 · 依赖与知识库约 30 秒刷新" },
    aiops: { title: "AIOps 诊断", subtitle: "Skill-first 多智能体故障排查" },
    documents: { title: "知识库", subtitle: "上传 SOP / 告警语料并管理 Milvus 索引" },
};

const OVERVIEW_HOST_POLL_MS = 3000;   // 本机 CPU/内存/磁盘 — 近实时
const OVERVIEW_META_POLL_MS = 30000;  // Milvus/MCP/知识库/告警历史
let overviewHostTimer = null;
let overviewMetaTimer = null;
let overviewHostInFlight = false;

function setText(id, v) {
    const el = document.getElementById(id);
    if (el) el.textContent = v;
}

function setPageHeader(tab) {
    const meta = PAGE_META[tab] || PAGE_META.aiops;
    const titleEl = document.getElementById("page-title");
    const subEl = document.getElementById("page-subtitle");
    if (titleEl) titleEl.textContent = meta.title;
    if (subEl) subEl.textContent = meta.subtitle;
}

// ---------- Tab 切换 ----------
document.querySelectorAll(".tab-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
        document.querySelectorAll(".tab-btn").forEach((b) => b.classList.remove("tab-active"));
        document.querySelectorAll(".tab-pane").forEach((p) => p.classList.add("hidden"));
        btn.classList.add("tab-active");
        const tab = btn.dataset.tab;
        document.getElementById(`tab-${tab}`).classList.remove("hidden");
        setPageHeader(tab);
        if (tab === "documents") initKbPage();
        if (tab === "overview") startOverviewPolling();
        else stopOverviewPolling();
    });
});
setPageHeader("aiops");

// ---------- 知识助手抽屉 ----------
const ASSISTANT_STORAGE_KEY = "langgraph-assistant-open";
const ASSISTANT_WIDTH_KEY = "langgraph-assistant-width";
const ASSISTANT_WIDTH_DEFAULT = 420;
const ASSISTANT_WIDTH_MIN = 300;
const ASSISTANT_WIDTH_MAX = 720;

const assistantFab = document.getElementById("assistant-fab");
const assistantDrawer = document.getElementById("assistant-drawer");
const assistantBackdrop = document.getElementById("assistant-backdrop");
const assistantClose = document.getElementById("assistant-close");
const assistantResizeHandle = document.getElementById("assistant-resize-handle");

function getAssistantMaxWidth() {
    return Math.min(ASSISTANT_WIDTH_MAX, Math.floor(window.innerWidth * 0.92));
}

function clampAssistantWidth(px) {
    return Math.min(getAssistantMaxWidth(), Math.max(ASSISTANT_WIDTH_MIN, px));
}

function applyAssistantWidth(px, persist) {
    if (!assistantDrawer) return;
    const w = clampAssistantWidth(px);
    assistantDrawer.style.setProperty("--assistant-width", `${w}px`);
    assistantDrawer.style.width = `${w}px`;
    if (persist) {
        try {
            sessionStorage.setItem(ASSISTANT_WIDTH_KEY, String(w));
        } catch (_) { /* ignore */ }
    }
}

function loadAssistantWidth() {
    try {
        const saved = parseInt(sessionStorage.getItem(ASSISTANT_WIDTH_KEY), 10);
        if (!Number.isNaN(saved)) {
            applyAssistantWidth(saved, false);
            return;
        }
    } catch (_) { /* ignore */ }
    applyAssistantWidth(ASSISTANT_WIDTH_DEFAULT, false);
}

function initAssistantResize() {
    if (!assistantResizeHandle || !assistantDrawer) return;

    let dragging = false;
    let startX = 0;
    let startWidth = 0;

    const onMove = (e) => {
        if (!dragging) return;
        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        const delta = startX - clientX;
        applyAssistantWidth(startWidth + delta, false);
    };

    const onEnd = () => {
        if (!dragging) return;
        dragging = false;
        assistantDrawer.classList.remove("is-resizing");
        document.body.classList.remove("assistant-resizing");
        const w = assistantDrawer.offsetWidth;
        applyAssistantWidth(w, true);
        document.removeEventListener("mousemove", onMove);
        document.removeEventListener("mouseup", onEnd);
        document.removeEventListener("touchmove", onMove);
        document.removeEventListener("touchend", onEnd);
    };

    const onStart = (e) => {
        if (window.innerWidth <= 767) return;
        e.preventDefault();
        dragging = true;
        startX = e.touches ? e.touches[0].clientX : e.clientX;
        startWidth = assistantDrawer.offsetWidth;
        assistantDrawer.classList.add("is-resizing");
        document.body.classList.add("assistant-resizing");
        document.addEventListener("mousemove", onMove);
        document.addEventListener("mouseup", onEnd);
        document.addEventListener("touchmove", onMove, { passive: false });
        document.addEventListener("touchend", onEnd);
    };

    assistantResizeHandle.addEventListener("mousedown", onStart);
    assistantResizeHandle.addEventListener("touchstart", onStart, { passive: false });
}

loadAssistantWidth();
initAssistantResize();
window.addEventListener("resize", () => {
    const w = assistantDrawer?.offsetWidth || ASSISTANT_WIDTH_DEFAULT;
    applyAssistantWidth(w, true);
});

function isAssistantOpen() {
    return assistantDrawer?.classList.contains("open");
}

function openAssistant() {
    if (!assistantDrawer) return;
    assistantDrawer.classList.add("open");
    assistantDrawer.setAttribute("aria-hidden", "false");
    assistantBackdrop?.classList.remove("hidden");
    assistantBackdrop?.setAttribute("aria-hidden", "false");
    assistantFab?.setAttribute("aria-expanded", "true");
    try {
        sessionStorage.setItem(ASSISTANT_STORAGE_KEY, "1");
    } catch (_) { /* ignore */ }
    setTimeout(() => document.getElementById("chat-input")?.focus(), 200);
}

function closeAssistant() {
    if (!assistantDrawer) return;
    assistantDrawer.classList.remove("open");
    assistantDrawer.setAttribute("aria-hidden", "true");
    assistantBackdrop?.classList.add("hidden");
    assistantBackdrop?.setAttribute("aria-hidden", "true");
    assistantFab?.setAttribute("aria-expanded", "false");
    try {
        sessionStorage.setItem(ASSISTANT_STORAGE_KEY, "0");
    } catch (_) { /* ignore */ }
}

function toggleAssistant() {
    if (isAssistantOpen()) closeAssistant();
    else openAssistant();
}

if (assistantFab) {
    assistantFab.addEventListener("click", toggleAssistant);
}
if (assistantClose) {
    assistantClose.addEventListener("click", closeAssistant);
}
if (assistantBackdrop) {
    assistantBackdrop.addEventListener("click", closeAssistant);
}
document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && isAssistantOpen()) {
        closeAssistant();
    }
});

try {
    if (sessionStorage.getItem(ASSISTANT_STORAGE_KEY) === "1") {
        openAssistant();
    }
} catch (_) { /* ignore */ }

// ---------- 概览大盘 ----------
function ensureOverviewCharts() {
    if (!window.AIOpsCharts) return false;
    if (window.AIOpsCharts.chartJsReady && window.AIOpsCharts.chartJsReady()) {
        window.AIOpsCharts.destroyOverviewCharts();
        window.AIOpsCharts.initOverviewCharts();
        return true;
    }
    return false;
}

function markOverviewLive() {
    const sub = document.getElementById("dash-host-sub");
    if (!sub) return;
    const t = new Date().toLocaleTimeString("zh-CN", {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
    });
    const hostLine = sub.dataset.hostLine || sub.textContent.split("·")[0].trim();
    sub.dataset.hostLine = hostLine;
    sub.innerHTML =
        `<span class="dash-live"><span class="dash-live-dot" aria-hidden="true"></span>实时</span>` +
        ` ${hostLine} · 更新于 ${t}`;
}

function startOverviewPolling() {
    stopOverviewPolling();
    const boot = () => {
        ensureOverviewCharts();
        refreshOverviewHost();
        refreshOverviewMeta();
        overviewHostTimer = setInterval(refreshOverviewHost, OVERVIEW_HOST_POLL_MS);
        overviewMetaTimer = setInterval(refreshOverviewMeta, OVERVIEW_META_POLL_MS);
        setTimeout(() => {
            if (window.AIOpsCharts) {
                window.AIOpsCharts.resizeOverviewCharts();
                refreshOverviewHost();
            }
        }, 350);
    };
    requestAnimationFrame(() => requestAnimationFrame(boot));
}

function stopOverviewPolling() {
    if (overviewHostTimer) {
        clearInterval(overviewHostTimer);
        overviewHostTimer = null;
    }
    if (overviewMetaTimer) {
        clearInterval(overviewMetaTimer);
        overviewMetaTimer = null;
    }
}

function setDepCard(id, ok, label) {
    const el = document.getElementById(id);
    if (!el) return;
    el.classList.remove("dep-ok", "dep-warn", "dep-err");
    if (ok === true) el.classList.add("dep-ok");
    else if (ok === false) el.classList.add("dep-err");
    else el.classList.add("dep-warn");
    const statusEl = el.querySelector(".dep-status");
    if (statusEl) statusEl.textContent = label;
}

function showOverviewError(msg) {
    let el = document.getElementById("dash-overview-err");
    if (!msg) {
        if (el) el.remove();
        return;
    }
    if (!el) {
        el = document.createElement("div");
        el.id = "dash-overview-err";
        const grid = document.querySelector("#tab-overview .dashboard-grid");
        if (grid) grid.prepend(el);
    }
    el.textContent = msg;
}

async function refreshOverviewHost() {
    if (overviewHostInFlight) return;
    overviewHostInFlight = true;
    try {
        const hostRes = await fetch(`${API}/dashboard/host`);
        const hostJson = await hostRes.json().catch(() => ({}));
        const host = hostJson?.data;
        if (!hostRes.ok) {
            showOverviewError(`本机指标接口异常 (${hostRes.status})`);
            return;
        }
        showOverviewError("");
        if (!host) return;

        const sub = document.getElementById("dash-host-sub");
        if (sub) {
            sub.dataset.hostLine = `${host.hostname || ""} · ${host.platform || ""}`;
        }

        const redisHint = document.getElementById("dep-redis-hint");
        if (redisHint) {
            redisHint.textContent = host.redis_memory_enabled
                ? "会话记忆已启用"
                : "会话记忆未启用";
        }

        if (window.AIOpsCharts?.updateOverviewNumericLabels) {
            window.AIOpsCharts.updateOverviewNumericLabels(host);
        }
        if (window.AIOpsCharts?.pushOverviewHostSnapshot) {
            if (!window.AIOpsCharts.chartJsReady?.()) {
                showOverviewError("Chart.js 未加载，环形图不可用；数字仍会每 3 秒刷新。");
            }
            window.AIOpsCharts.pushOverviewHostSnapshot(host);
        }
        markOverviewLive();
    } catch (e) {
        console.error("[overview host]", e);
    } finally {
        overviewHostInFlight = false;
    }
}

async function refreshOverviewMeta() {
    try {
        const [readyRes, docsRes, histRes] = await Promise.all([
            fetch(`${API}/health/ready`),
            fetch(`${API}/documents`),
            fetch(`${API}/webhook/history?limit=20`),
        ]);

        const readyJson = await readyRes.json().catch(() => ({}));
        const readyData = readyJson?.data || readyJson?.detail;

        const milvusOk = readyData?.dependencies?.milvus?.status === "ok";
        const mcpOk = readyData?.dependencies?.mcp?.status === "ok";
        const mcpTools = readyData?.dependencies?.mcp?.tools_count ?? "—";
        const collection = readyData?.dependencies?.milvus?.collection || "—";

        setDepCard("dep-milvus", milvusOk, milvusOk ? "正常" : "不可用");
        setDepCard("dep-mcp", mcpOk, mcpOk ? `${mcpTools} 工具` : "未连接");
        setText("dash-milvus", milvusOk ? "正常" : "异常");
        setText("dash-collection", collection);
        setText("dash-mcp-tools", String(mcpTools));
        setText("dash-mcp-status", mcpOk ? "已连接" : "未连接");

        const docsJson = await docsRes.json();
        const docTotal = docsJson?.data?.total ?? docsJson?.data?.documents?.length ?? "—";
        setText("dash-doc-count", String(docTotal));

        const hist = await histRes.json();
        const items = hist?.items || [];
        setText("dash-alert-count", String(hist?.count ?? items.length));
        if (window.AIOpsCharts) window.AIOpsCharts.updateOverviewAlertBar(items);

        const listEl = document.getElementById("dash-recent-alerts");
        if (listEl) {
            if (items.length === 0) {
                listEl.innerHTML = '<span class="muted">暂无 Webhook 自动诊断记录</span>';
            } else {
                listEl.innerHTML = items.slice(0, 5).map((rec) => {
                    const skill = rec.selected_skill || "—";
                    const err = rec.error ? '<span class="text-err">失败</span>' : '<span class="text-ok">完成</span>';
                    const sid = (rec.session_id || "").slice(0, 12);
                    return `<div class="dash-alert-row"><span class="font-mono">${escapeHtml(sid)}…</span><span>${escapeHtml(skill)}</span>${err}</div>`;
                }).join("");
            }
        }
    } catch (e) {
        console.error("[overview meta]", e);
    }
}

// ---------- 健康检查 ----------
async function checkHealth() {
    try {
        const r = await fetch(`${API}/health/ready`);
        const data = await r.json();
        const ready = data?.data?.status === "ready";
        const milvusOk = data?.data?.dependencies?.milvus?.status === "ok";
        const mcpOk = data?.data?.dependencies?.mcp?.status === "ok";
        const dot = document.getElementById("health-dot");
        const text = document.getElementById("health-text");
        if (ready && mcpOk) {
            dot.className = "status-ok";
            text.textContent = `就绪 · MCP ${data.data.dependencies.mcp.tools_count} 工具`;
        } else if (ready) {
            dot.className = "status-warn";
            text.textContent = "就绪 · MCP 未连";
        } else {
            dot.className = "status-err";
            text.textContent = "Milvus 不可用";
        }
    } catch (e) {
        document.getElementById("health-text").textContent = "服务不可达";
    }
}
checkHealth();
setInterval(checkHealth, 15000);

// ============================================================
// Skill 列表 (页面加载时拉一次, 后续诊断时高亮选中项)
// ============================================================
const SKILL_CARD_ORDER = [
    {
        mod: "host",
        registryName: "host_resource_diagnosis",
        icon: "🖥️",
        titleZh: "主机资源诊断",
        slugEn: "host_diagnosis",
        accent: "#06B6D4",
    },
    {
        mod: "docker",
        registryName: "container_diagnosis",
        icon: "🐳",
        titleZh: "Docker 容器诊断",
        slugEn: "container_diagnosis",
        accent: "#3B82F6",
    },
    {
        mod: "network",
        registryName: "network_diagnosis",
        icon: "🌐",
        titleZh: "网络连通性诊断",
        slugEn: "network_diagnosis",
        accent: "#10B981",
    },
    {
        mod: "oncall",
        registryName: "generic_oncall",
        icon: "🚨",
        titleZh: "通用 OnCall 兜底排查",
        slugEn: "oncall_diagnosis",
        accent: "#F59E0B",
    },
    {
        mod: "disk",
        registryName: "disk_cleanup_diagnosis",
        icon: "🧹",
        titleZh: "磁盘扫描与清理建议",
        slugEn: "disk_cleanup_diagnosis",
        accent: "#8B5CF6",
    },
];

function createSkillCard(meta, apiSkill) {
    const card = document.createElement("div");
    const title = apiSkill?.display_name?.split(" (")[0] || meta.titleZh;
    const desc = apiSkill?.description || "";
    card.className = `skill-card skill-card--${meta.mod}${apiSkill ? "" : " skill-card--missing"}`;
    card.dataset.skillName = meta.registryName;
    card.style.setProperty("--skill-accent", meta.accent);
    card.title = desc || title;
    card.innerHTML = `
        <span class="skill-card__icon" aria-hidden="true">${meta.icon}</span>
        <div class="skill-card__body">
            <div class="skill-card__title">${escapeHtml(title)}</div>
            <div class="skill-card__slug">${escapeHtml(meta.slugEn)}</div>
        </div>
    `;
    return card;
}

function renderSkillGrid(skillsFromApi) {
    const listEl = document.getElementById("skill-list");
    const countEl = document.getElementById("skill-count");
    if (!listEl) return;

    const byName = Object.fromEntries((skillsFromApi || []).map((s) => [s.name, s]));
    const registered = SKILL_CARD_ORDER.filter((m) => byName[m.registryName]).length;

    listEl.innerHTML = "";
    listEl.classList.add("skill-grid");
    SKILL_CARD_ORDER.forEach((meta) => {
        listEl.appendChild(createSkillCard(meta, byName[meta.registryName]));
    });
    if (countEl) countEl.textContent = `· ${registered}/${SKILL_CARD_ORDER.length} 已注册`;
}

async function loadSkills() {
    const listEl = document.getElementById("skill-list");
    if (!listEl) return;
    try {
        const r = await fetch(`${API}/skills`);
        const data = await r.json();
        if (data?.code !== "SUCCESS") throw new Error(data?.message || "加载 Skill 失败");
        renderSkillGrid(data?.data?.skills || []);
    } catch (e) {
        console.warn("[skills]", e);
        renderSkillGrid([]);
    }
}
loadSkills();

function highlightSkill(skillName, reason) {
    document.querySelectorAll(".skill-card.skill-active").forEach((el) => {
        el.classList.remove("skill-active");
        el.removeAttribute("aria-current");
    });

    const card = document.querySelector(`.skill-card[data-skill-name="${CSS.escape(skillName || "")}"]`);
    const banner = document.getElementById("skill-selected-banner");
    const nameEl = document.getElementById("skill-selected-name");
    const reasonEl = document.getElementById("skill-reason");

    if (card) {
        card.classList.add("skill-active");
        card.setAttribute("aria-current", "true");
        card.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "nearest" });
        nameEl.textContent = card.querySelector(".skill-card__title")?.textContent || skillName;
    } else {
        nameEl.textContent = skillName || "(未知)";
    }
    banner.classList.remove("hidden");

    if (reason && String(reason).trim()) {
        reasonEl.textContent = reason;
        reasonEl.classList.remove("hidden");
    } else {
        reasonEl.textContent = "";
        reasonEl.classList.add("hidden");
    }
}

function clearSkillHighlight() {
    document.querySelectorAll(".skill-card.skill-active").forEach((el) => {
        el.classList.remove("skill-active");
        el.removeAttribute("aria-current");
    });
    document.getElementById("skill-selected-banner")?.classList.add("hidden");
    const reasonEl = document.getElementById("skill-reason");
    if (reasonEl) {
        reasonEl.textContent = "";
        reasonEl.classList.add("hidden");
    }
}

// ============================================================
// AIOps 诊断
// ============================================================
let aiopsAbortController = null;

const AIOPS_PHASE_ORDER = ["router", "plan", "execute", "report"];
const AIOPS_MODULE_COLLAPSE_KEY = "langgraph-aiops-module-collapsed";
const AIOPS_REPORT_HEIGHT_KEY = "langgraph-aiops-report-height";
const AIOPS_REPORT_HEIGHT_DEFAULT = 340;
const AIOPS_REPORT_PLACEHOLDER_HTML =
    '<p class="aiops-report-placeholder">诊断完成后，Markdown 报告将显示在此。也可在诊断过程中查看错误信息。</p>';
const AIOPS_REPORT_PENDING_HTML =
    '<p class="aiops-report-placeholder">报告生成中…</p>';

function defaultAiopsReportHeight() {
    return Math.min(
        AIOPS_REPORT_HEIGHT_MAX,
        Math.max(AIOPS_REPORT_HEIGHT_MIN, Math.round(window.innerHeight * 0.38)),
    );
}
const AIOPS_REPORT_HEIGHT_MIN = 120;
const AIOPS_REPORT_HEIGHT_MAX = 560;

const aiopsPageEl = () => document.querySelector(".aiops-page");

function setAiopsRunning(running) {
    const strip = document.getElementById("aiops-incident-strip");
    if (strip) strip.setAttribute("data-running", running ? "true" : "false");
    const page = aiopsPageEl();
    if (page) page.setAttribute("data-running", running ? "true" : "false");
    const stopBtn = document.getElementById("aiops-stop");
    if (stopBtn) stopBtn.classList.toggle("btn-stop-armed", !!running);
}

function setAiopsStatusPill(status, text) {
    const el = document.getElementById("aiops-status");
    if (!el) return;
    if (status) el.dataset.status = status;
    if (text != null) el.textContent = text;
}

function setAiopsPhase(phase) {
    const nav = document.getElementById("aiops-phase");
    if (!nav) return;
    nav.dataset.phase = phase || "idle";
    const idx = phase && phase !== "idle" ? AIOPS_PHASE_ORDER.indexOf(phase) : -1;
    nav.querySelectorAll(".aiops-phase-step").forEach((el) => {
        const stepIdx = AIOPS_PHASE_ORDER.indexOf(el.dataset.phaseStep || "");
        el.classList.remove("is-active", "is-done");
        if (idx < 0) return;
        if (stepIdx < idx) el.classList.add("is-done");
        else if (stepIdx === idx) el.classList.add("is-active");
    });
    nav.querySelectorAll(".aiops-phase-connector").forEach((conn, i) => {
        conn.classList.toggle("is-done", idx >= 0 && i < idx);
    });
}

const AIOPS_MODULES_NO_PERSIST = new Set(["plan"]);

const AIOPS_MODULE_COLLAPSE_LABELS = {
    skill: "Skill 路由",
    plan: "诊断计划",
    charts: "实时图表",
};

function syncCollapseToggle(btn, expanded, sectionLabel) {
    if (!btn) return;
    btn.setAttribute("aria-expanded", String(expanded));
    const textEl = btn.querySelector(".aiops-toggle-text");
    if (textEl) textEl.textContent = expanded ? "收起" : "展开";
    if (sectionLabel) {
        btn.title = expanded ? `收起${sectionLabel}` : `展开${sectionLabel}`;
    }
}

function syncAiopsModuleCollapseUi(mod) {
    const key = mod?.dataset?.module;
    const collapsed = mod?.classList.contains("is-collapsed");
    const btn = mod?.querySelector(":scope > .aiops-module-head .aiops-module-toggle");
    syncCollapseToggle(btn, !collapsed, AIOPS_MODULE_COLLAPSE_LABELS[key] || "");
}

function setAiopsModuleCollapsed(mod, collapsed, { persist = true } = {}) {
    if (!mod) return;
    const key = mod.dataset.module;
    mod.classList.toggle("is-collapsed", collapsed);
    syncAiopsModuleCollapseUi(mod);
    if (persist && key && !AIOPS_MODULES_NO_PERSIST.has(key)) {
        try {
            const stored = JSON.parse(sessionStorage.getItem(AIOPS_MODULE_COLLAPSE_KEY) || "{}");
            if (collapsed) stored[key] = true;
            else delete stored[key];
            sessionStorage.setItem(AIOPS_MODULE_COLLAPSE_KEY, JSON.stringify(stored));
        } catch (_) { /* ignore */ }
    }
    if (key === "charts" && !collapsed && window.AIOpsCharts?.resizeAiopsCharts) {
        setTimeout(() => window.AIOpsCharts.resizeAiopsCharts(), 50);
    }
}

function expandAiopsPlanModule() {
    const mod = document.querySelector('.aiops-page .aiops-module[data-module="plan"]');
    setAiopsModuleCollapsed(mod, false, { persist: false });
}

function toggleAiopsModuleCollapsed(mod) {
    if (!mod) return;
    const key = mod.dataset.module;
    const next = !mod.classList.contains("is-collapsed");
    setAiopsModuleCollapsed(mod, next, { persist: !AIOPS_MODULES_NO_PERSIST.has(key) });
}

function initAiopsModules() {
    let collapsed = {};
    try {
        collapsed = JSON.parse(sessionStorage.getItem(AIOPS_MODULE_COLLAPSE_KEY) || "{}");
        delete collapsed.plan;
        sessionStorage.setItem(AIOPS_MODULE_COLLAPSE_KEY, JSON.stringify(collapsed));
    } catch (_) { /* ignore */ }

    document.querySelectorAll(".aiops-page .aiops-module[data-module]").forEach((mod) => {
        const key = mod.dataset.module;
        if (collapsed[key] && !AIOPS_MODULES_NO_PERSIST.has(key)) {
            mod.classList.add("is-collapsed");
        }

        const btn = mod.querySelector(":scope > .aiops-module-head .aiops-module-toggle");
        if (!btn || btn.id === "aiops-report-collapse") return;

        btn.addEventListener("click", (e) => {
            e.stopPropagation();
            toggleAiopsModuleCollapsed(mod);
        });
        syncAiopsModuleCollapseUi(mod);
    });

    const reportCollapse = document.getElementById("aiops-report-collapse");
    if (reportCollapse) {
        const syncReportCollapseUi = () => {
            const collapsed = aiopsPageEl()?.classList.contains("report-collapsed");
            syncCollapseToggle(reportCollapse, !collapsed, "诊断报告");
        };
        syncReportCollapseUi();
        reportCollapse.addEventListener("click", () => {
            aiopsPageEl()?.classList.toggle("report-collapsed");
            syncReportCollapseUi();
        });
    }
}

function initLiveTabs() {
    const tabStream = document.getElementById("live-tab-stream");
    const tabTools = document.getElementById("live-tab-tools");
    const paneStream = document.getElementById("mon-stream");
    const paneTools = document.getElementById("mon-tool-feed");
    const segmented = document.querySelector(".aiops-live-segmented");
    if (!tabStream || !tabTools || !paneStream || !paneTools) return;

    function showLiveTab(which) {
        const streamOn = which === "stream";
        tabStream.classList.toggle("live-tab-active", streamOn);
        tabTools.classList.toggle("live-tab-active", !streamOn);
        paneStream.classList.toggle("hidden", !streamOn);
        paneTools.classList.toggle("hidden", streamOn);
        segmented?.classList.toggle("is-tools", !streamOn);
    }

    tabStream.addEventListener("click", () => showLiveTab("stream"));
    tabTools.addEventListener("click", () => showLiveTab("tools"));
    showLiveTab("stream");
}

function initAiopsStepStreamCollapse() {
    document.getElementById("aiops-steps")?.addEventListener("click", (e) => {
        const stream = e.target.closest(".step-stream");
        if (!stream || !stream.classList.contains("is-collapsed")) return;
        stream.classList.toggle("is-expanded");
    });
}

function applyAiopsReportHeight(px, persist) {
    const page = aiopsPageEl();
    if (!page) return;
    const maxH = Math.min(AIOPS_REPORT_HEIGHT_MAX, Math.floor(window.innerHeight * 0.55));
    const h = Math.min(maxH, Math.max(AIOPS_REPORT_HEIGHT_MIN, px));
    page.style.setProperty("--aiops-report-height", `${h}px`);
    if (persist) {
        try {
            sessionStorage.setItem(AIOPS_REPORT_HEIGHT_KEY, String(h));
        } catch (_) { /* ignore */ }
    }
}

function loadAiopsReportHeight() {
    try {
        const saved = parseInt(sessionStorage.getItem(AIOPS_REPORT_HEIGHT_KEY), 10);
        if (!Number.isNaN(saved)) {
            applyAiopsReportHeight(saved, false);
            return;
        }
    } catch (_) { /* ignore */ }
    applyAiopsReportHeight(defaultAiopsReportHeight(), false);
}

function initReportResize() {
    const handle = document.getElementById("aiops-report-resize");
    const split = document.getElementById("aiops-report-split");
    const page = aiopsPageEl();
    if (!handle || !split || !page) return;

    loadAiopsReportHeight();

    let dragging = false;
    let startY = 0;
    let startH = 0;

    const onMove = (e) => {
        if (!dragging) return;
        const clientY = e.touches ? e.touches[0].clientY : e.clientY;
        const delta = startY - clientY;
        applyAiopsReportHeight(startH + delta, false);
    };

    const onEnd = () => {
        if (!dragging) return;
        dragging = false;
        page.classList.remove("report-resizing");
        document.body.classList.remove("aiops-report-resizing");
        split.classList.remove("is-resizing");
        const h = parseInt(getComputedStyle(page).getPropertyValue("--aiops-report-height"), 10)
            || AIOPS_REPORT_HEIGHT_DEFAULT;
        applyAiopsReportHeight(h, true);
        document.removeEventListener("mousemove", onMove);
        document.removeEventListener("mouseup", onEnd);
        document.removeEventListener("touchmove", onMove);
        document.removeEventListener("touchend", onEnd);
    };

    const onStart = (e) => {
        if (!page.classList.contains("report-docked") && !page.classList.contains("has-report")) return;
        e.preventDefault();
        dragging = true;
        startY = e.touches ? e.touches[0].clientY : e.clientY;
        const cur = parseInt(getComputedStyle(page).getPropertyValue("--aiops-report-height"), 10);
        startH = Number.isNaN(cur) ? AIOPS_REPORT_HEIGHT_DEFAULT : cur;
        page.classList.add("report-resizing");
        document.body.classList.add("aiops-report-resizing");
        split.classList.add("is-resizing");
        document.addEventListener("mousemove", onMove);
        document.addEventListener("mouseup", onEnd);
        document.addEventListener("touchmove", onMove, { passive: false });
        document.addEventListener("touchend", onEnd);
    };

    handle.addEventListener("mousedown", onStart);
    handle.addEventListener("touchstart", onStart, { passive: false });
}

initAiopsModules();
initLiveTabs();
initAiopsStepStreamCollapse();
initReportResize();
ensureReportDocked();
resetAiopsReportContent(false);

document.getElementById("aiops-start").addEventListener("click", startAiops);
document.getElementById("aiops-stop").addEventListener("click", () => {
    if (aiopsAbortController) aiopsAbortController.abort();
});

const AIOPS_TOOLS_CRITICAL_FAIL = 3;

function syncToolsStatSubs(monitor) {
    if (!monitor) return;
    const ok = Math.max(0, monitor.toolCount - monitor.toolFail);
    setText("mon-tools-ok", `成功 ${ok}`);
    setText("mon-tools-fail", `失败 ${monitor.toolFail}`);
}

function syncAiopsStatColors(monitor) {
    const toolsStat = document.getElementById("mon-tools-stat");
    if (toolsStat && monitor) {
        toolsStat.classList.toggle("has-fail", monitor.toolFail > 0);
        toolsStat.classList.toggle("is-critical", monitor.toolFail >= AIOPS_TOOLS_CRITICAL_FAIL);
    }
    syncToolsStatSubs(monitor);
    const badge = document.getElementById("mon-tokens-badge");
    if (badge && monitor) {
        badge.classList.toggle("is-live", monitor.hasRealUsage);
    }
}

// 监控面板状态
const aiopsMonitor = {
    startTs: 0,
    timer: null,
    toolCount: 0,
    toolFail: 0,
    tokenCount: 0,           // 字符流粗估 (流过来即累加)
    realInputTokens: 0,      // LLM usage 真实 input
    realOutputTokens: 0,     // LLM usage 真实 output
    realTotalTokens: 0,
    cacheHitTokens: 0,       // DeepSeek 才有
    cacheMissTokens: 0,
    hasRealUsage: false,
    reset() {
        this.startTs = Date.now();
        this.toolCount = 0;
        this.toolFail = 0;
        this.tokenCount = 0;
        this.realInputTokens = 0;
        this.realOutputTokens = 0;
        this.realTotalTokens = 0;
        this.cacheHitTokens = 0;
        this.cacheMissTokens = 0;
        this.hasRealUsage = false;
        setText("mon-step", "—");
        setText("mon-step-label", "Skill Router 工作中...");
        setText("mon-elapsed", "0.0s");
        setText("mon-tools", "0");
        setText("mon-tokens", "0");
        setText("mon-tokens-detail", "输入 0 · 输出 0");
        setText("mon-tokens-badge", "~估算");
        setText("mon-stream-hint", "等待中");
        syncToolsStatSubs(this);
        resetMonStreamLog();
        document.getElementById("mon-tool-feed").innerHTML =
            '<span class="aiops-empty">暂无工具调用</span>';
        if (window.AIOpsCharts) window.AIOpsCharts.resetAiopsCharts();
        syncAiopsStatColors(this);
        if (this.timer) clearInterval(this.timer);
        this.timer = setInterval(() => {
            const s = ((Date.now() - this.startTs) / 1000).toFixed(1);
            setText("mon-elapsed", `${s}s`);
        }, 100);
    },
    stop() {
        if (this.timer) {
            clearInterval(this.timer);
            this.timer = null;
        }
    },
};

const MON_STREAM_MAX_CHARS = 16000;

const monStreamLog = {
    segments: new Map(),
    totalChars: 0,
    rafId: 0,
    lastIter: 0,
};

function monStreamContainer() {
    return document.getElementById("mon-stream");
}

function resetMonStreamLog() {
    monStreamLog.segments.clear();
    monStreamLog.totalChars = 0;
    monStreamLog.lastIter = 0;
    if (monStreamLog.rafId) {
        cancelAnimationFrame(monStreamLog.rafId);
        monStreamLog.rafId = 0;
    }
    const el = monStreamContainer();
    if (el) {
        el.innerHTML =
            '<span class="aiops-empty">诊断开始后，模型生成的文本会实时显示在此...</span>';
    }
}

function ensureMonStreamSegment(iter, stepLabel = "") {
    const key = Number(iter);
    monStreamLog.lastIter = key;
    let seg = monStreamLog.segments.get(key);
    const container = monStreamContainer();
    if (!container) return seg;

    if (container.querySelector(".aiops-empty")) container.innerHTML = "";

    const label = (stepLabel || "").trim();
    if (seg) {
        if (label) seg.step = label;
        const labelEl = seg.elHead?.querySelector(".mon-stream-segment-label");
        if (labelEl && label) labelEl.textContent = label.slice(0, 80);
        seg.elWrap.classList.add("executing");
        seg.elWrap.classList.remove("done");
        const badge = seg.elHead?.querySelector(".mon-stream-segment-badge");
        if (badge) {
            badge.textContent = "生成中";
            badge.className = "mon-stream-segment-badge";
        }
        return seg;
    }

    const wrap = document.createElement("div");
    wrap.className = "mon-stream-segment executing";
    wrap.dataset.stepIter = String(key);

    const head = document.createElement("div");
    head.className = "mon-stream-segment-head";
    head.innerHTML = `<span class="mon-stream-segment-title">步骤 ${escapeHtml(String(key))}</span>
        <span class="mon-stream-segment-label">${escapeHtml(label.slice(0, 80))}</span>
        <span class="mon-stream-segment-badge">生成中</span>`;

    const body = document.createElement("div");
    body.className = "mon-stream-segment-body md-content";

    wrap.appendChild(head);
    wrap.appendChild(body);
    container.appendChild(wrap);
    container.scrollTop = container.scrollHeight;

    seg = { step: label, text: "", elWrap: wrap, elHead: head, elBody: body };
    monStreamLog.segments.set(key, seg);
    return seg;
}

function trimMonStreamLog(maxChars = MON_STREAM_MAX_CHARS) {
    while (monStreamLog.totalChars > maxChars && monStreamLog.segments.size > 0) {
        const keys = [...monStreamLog.segments.keys()].sort((a, b) => a - b);
        const oldest = keys[0];
        const seg = monStreamLog.segments.get(oldest);
        if (!seg) break;
        monStreamLog.totalChars -= seg.text.length;
        monStreamLog.segments.delete(oldest);
        seg.elWrap.remove();
    }
}

function scheduleMonStreamRender(seg) {
    if (!seg) return;
    if (monStreamLog.rafId) return;
    monStreamLog.rafId = requestAnimationFrame(() => {
        monStreamLog.rafId = 0;
        seg.elBody.innerHTML = renderMarkdown(seg.text);
        const container = monStreamContainer();
        if (container) container.scrollTop = container.scrollHeight;
    });
}

function appendMonStreamToken(iter, content) {
    if (!content) return;
    const key =
        iter != null && iter !== "" && !Number.isNaN(Number(iter))
            ? Number(iter)
            : monStreamLog.lastIter;
    let seg = monStreamLog.segments.get(key);
    if (!seg) seg = ensureMonStreamSegment(key, "");
    seg.text += content;
    monStreamLog.totalChars += content.length;
    trimMonStreamLog();
    scheduleMonStreamRender(seg);
}

function markMonStreamSegmentDone(iter) {
    const key = Number(iter);
    const seg = monStreamLog.segments.get(key);
    if (!seg) return;
    seg.elWrap.classList.remove("executing");
    seg.elWrap.classList.add("done");
    const badge = seg.elHead?.querySelector(".mon-stream-segment-badge");
    if (badge) {
        badge.textContent = "已完成";
        badge.className = "mon-stream-segment-badge done";
    }
    if (monStreamLog.rafId) {
        cancelAnimationFrame(monStreamLog.rafId);
        monStreamLog.rafId = 0;
    }
    seg.elBody.innerHTML = renderMarkdown(seg.text);
}

function ensureReportDocked() {
    const page = aiopsPageEl();
    page?.classList.add("report-docked");
}

function setAiopsReportContent(html) {
    const rep = document.getElementById("aiops-report");
    if (rep) rep.innerHTML = html;
}

function resetAiopsReportContent(pending = false) {
    ensureReportDocked();
    setAiopsReportContent(pending ? AIOPS_REPORT_PENDING_HTML : AIOPS_REPORT_PLACEHOLDER_HTML);
}

function showAiopsReport() {
    const page = aiopsPageEl();
    page?.classList.add("report-docked", "has-report");
    page?.classList.remove("report-collapsed");
    loadAiopsReportHeight();
    setAiopsPhase("report");
    const rep = document.getElementById("aiops-report");
    if (rep) rep.scrollTop = 0;
}

function resetAiopsReportPanel() {
    const page = aiopsPageEl();
    page?.classList.remove("report-collapsed");
    resetAiopsReportContent(false);
}

async function startAiops() {
    const query = document.getElementById("aiops-query").value.trim();
    if (!query) return alert("请输入告警内容");

    // UI reset
    const planEl = document.getElementById("aiops-plan");
    const stepsEl = document.getElementById("aiops-steps");
    const reportEl = document.getElementById("aiops-report");
    const statusEl = document.getElementById("aiops-status");
    planEl.innerHTML = '<span class="aiops-empty">等待 Planner...</span>';
    expandAiopsPlanModule();
    stepsEl.innerHTML = "";
    resetAiopsReportContent(true);
    setAiopsPhase("idle");
    aiopsMonitor.reset();
    setAiopsRunning(true);
    setAiopsStatusPill("running", "诊断中…");
    statusEl.textContent = "Skill Router 工作中...";
    clearSkillHighlight();

    document.getElementById("aiops-start").disabled = true;
    document.getElementById("aiops-stop").disabled = false;

    aiopsAbortController = new AbortController();
    try {
        const resp = await fetch(`${API}/aiops/diagnose`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ session_id: `web-${Date.now()}`, query }),
            signal: aiopsAbortController.signal,
        });
        await consumeSSE(resp, (ev) => handleAiopsEvent(ev, planEl, stepsEl, reportEl, statusEl));
        statusEl.textContent = "完成 ✓";
        setAiopsStatusPill("done", "已完成");
    } catch (e) {
        if (e.name === "AbortError") {
            statusEl.textContent = "已停止";
            setAiopsStatusPill("idle", "已停止");
        } else {
            statusEl.textContent = "失败 ✗";
            setAiopsStatusPill("error", "失败");
            showAiopsReport();
            reportEl.innerHTML = `<p class="text-err">错误: ${escapeHtml(e.message)}</p>`;
        }
    } finally {
        setAiopsRunning(false);
        document.getElementById("aiops-start").disabled = false;
        document.getElementById("aiops-stop").disabled = true;
        aiopsAbortController = null;
        aiopsMonitor.stop();
    }
}

function handleAiopsEvent(ev, planEl, stepsEl, reportEl, statusEl) {
    const t = ev.type;
    const d = ev.data || {};
    // 诊断: 把所有 SSE 事件类型打到控制台, 方便排查监控为什么是 0
    if (t !== "transition") {
        console.log("[AIOps SSE]", t, d);
    }

    if (t === "start") {
        statusEl.textContent = "Skill Router 工作中...";
        setAiopsPhase("router");
    } else if (t === "skill_selected") {
        highlightSkill(d.skill, d.reason);
        statusEl.textContent = `已选 Skill: ${d.skill || "(无)"}, Planner 工作中...`;
        setAiopsPhase("router");
    } else if (t === "plan") {
        expandAiopsPlanModule();
        planEl.innerHTML = "";
        (d.plan || []).forEach((step, i) => {
            const div = document.createElement("div");
            div.className = "plan-item";
            div.innerHTML = `<span class="plan-num">${i + 1}</span><span class="plan-text">${escapeHtml(step)}</span>`;
            planEl.appendChild(div);
        });
        statusEl.textContent = `已生成 ${d.plan.length} 步计划`;
        setAiopsPhase("plan");
    } else if (t === "step_start") {
        // 创建 "executing" 卡片, 后续 step_token 往里追加流式内容
        let div = stepsEl.querySelector(`[data-step-iter="${d.iteration}"]`);
        if (!div) {
            div = document.createElement("div");
            div.className = "step-item executing";
            div.dataset.stepIter = String(d.iteration);
            div.innerHTML = `<div class="step-title executing">▶ 步骤 ${escapeHtml(String(d.iteration))}</div>
                <div class="step-body">${escapeHtml(d.step || "")}</div>
                <div class="step-stream is-collapsed" title="点击展开预览"></div>`;
            stepsEl.appendChild(div);
        }
        stepsEl.scrollTop = stepsEl.scrollHeight;
        statusEl.textContent = `正在执行第 ${d.iteration} 步...`;
        setText("mon-step", String(d.iteration));
        setText("mon-step-label", (d.step || "").slice(0, 40));
        setText("mon-stream-hint", "生成中...");
        ensureMonStreamSegment(d.iteration, d.step || "");
        setAiopsPhase("execute");
        document.getElementById("live-tab-stream")?.click();
    } else if (t === "step_token") {
        const iter = d.iteration || 0;
        const content = d.content || "";
        let div = stepsEl.querySelector(`[data-step-iter="${iter}"]`);
        if (!div) {
            // 兜底: 没收到 step_start 就先建一张卡
            div = document.createElement("div");
            div.className = "step-item executing";
            div.dataset.stepIter = String(iter);
            div.innerHTML = `<div class="step-title executing">▶ 步骤 ${escapeHtml(String(iter))}</div>
                <div class="step-stream is-collapsed" title="点击展开预览"></div>`;
            stepsEl.appendChild(div);
        }
        const stream = div.querySelector(".step-stream");
        if (stream) {
            stream.textContent += content;
            if (stream.textContent.length > 2000) {
                stream.textContent = "..." + stream.textContent.slice(-1800);
            }
        }
        stepsEl.scrollTop = stepsEl.scrollHeight;
        appendMonStreamToken(iter, content);
        aiopsMonitor.tokenCount += content.length;
        // 真实 usage 还没回来时, 用字符流粗估占位; usage 一到就被覆盖.
        if (!aiopsMonitor.hasRealUsage) {
            setText("mon-tokens", String(aiopsMonitor.tokenCount));
            setText("mon-tokens-detail", `~流字符 ${aiopsMonitor.tokenCount}`);
        }
    } else if (t === "usage") {
        // 后端 tool_runner 在每轮 LLM 末帧 emit, DeepSeek/DashScope 都通过
        // stream_options.include_usage / stream_usage=true 拿到真实 token.
        // 这里把多轮累加, 给 SRE 看真实成本.
        aiopsMonitor.hasRealUsage = true;
        aiopsMonitor.realInputTokens  += d.input_tokens  || 0;
        aiopsMonitor.realOutputTokens += d.output_tokens || 0;
        aiopsMonitor.realTotalTokens  += d.total_tokens  || 0;
        if (d.cache_hit_tokens != null)  aiopsMonitor.cacheHitTokens  += d.cache_hit_tokens;
        if (d.cache_miss_tokens != null) aiopsMonitor.cacheMissTokens += d.cache_miss_tokens;
        setText("mon-tokens", String(aiopsMonitor.realOutputTokens));
        const parts = [
            `输入 ${aiopsMonitor.realInputTokens}`,
            `输出 ${aiopsMonitor.realOutputTokens}`,
        ];
        if (aiopsMonitor.cacheHitTokens > 0 || aiopsMonitor.cacheMissTokens > 0) {
            parts.push(`缓存命中 ${aiopsMonitor.cacheHitTokens}`);
        }
        const detailEl = document.getElementById("mon-tokens-detail");
        if (detailEl) {
            detailEl.textContent = parts.join(" · ");
            detailEl.title = `合计 ${aiopsMonitor.realTotalTokens} tokens` +
                (d.model ? ` · ${d.model}` : "");
        }
        setText("mon-tokens-badge", "API 实测");
        syncAiopsStatColors(aiopsMonitor);
        if (window.AIOpsCharts) window.AIOpsCharts.pushAiopsUsage(aiopsMonitor);
    } else if (t === "tool_call") {
        // 监控面板: 工具调用累计 + 流水列表
        aiopsMonitor.toolCount += 1;
        const ok = d.success !== false; // 后端 ok=true / success=true 都算成功
        if (!ok) aiopsMonitor.toolFail += 1;
        setText("mon-tools", String(aiopsMonitor.toolCount));
        syncAiopsStatColors(aiopsMonitor);
        const feed = document.getElementById("mon-tool-feed");
        if (feed) {
            // 首次清掉占位
            if (feed.querySelector(".aiops-empty")) feed.innerHTML = "";
            const row = document.createElement("div");
            const statusIcon = ok ? "✓" : "✗";
            const statusColor = ok ? "text-ok" : "text-err";
            const elapsed = d.elapsed_ms != null ? `${d.elapsed_ms}ms` : "";
            row.className = "tool-feed-row";
            row.innerHTML = `<span class="${statusColor} font-semibold">${statusIcon}</span>
                <span class="tool-name">${escapeHtml(d.name || "?")}</span>
                <span class="tool-time">${escapeHtml(elapsed)}</span>`;
            feed.appendChild(row);
            feed.scrollTop = feed.scrollHeight;
        }
        if (window.AIOpsCharts) window.AIOpsCharts.pushAiopsTool(d, aiopsMonitor);
    } else if (t === "step_complete") {
        // 把之前 executing 的卡片收紧成 done + 替换为结果预览
        const iter = d.iteration || 0;
        let div = stepsEl.querySelector(`[data-step-iter="${iter}"]`);
        if (!div) {
            div = document.createElement("div");
            div.dataset.stepIter = String(iter);
            stepsEl.appendChild(div);
        }
        div.className = "step-item done";
        div.innerHTML = `<div class="step-title done">✓ 步骤 ${escapeHtml(String(iter))}</div>
            <div class="step-body">${escapeHtml(d.step || "")}</div>
            <div class="step-preview">${escapeHtml((d.result_preview || "").slice(0, 200))}</div>`;
        stepsEl.scrollTop = stepsEl.scrollHeight;
        markMonStreamSegmentDone(iter);
        statusEl.textContent = `已完成 ${d.iteration} 步`;
    } else if (t === "replan") {
        const div = document.createElement("div");
        div.className = "step-item executing";
        div.innerHTML = `<div class="step-title executing">📐 Replanner 调整: 剩余 ${(d.plan || []).length} 步</div>`;
        stepsEl.appendChild(div);
        stepsEl.scrollTop = stepsEl.scrollHeight;
    } else if (t === "report") {
        showAiopsReport();
        reportEl.innerHTML = renderMarkdown(d.report || "");
        statusEl.textContent = "报告已生成";
        setAiopsStatusPill("done", "报告已生成");
        setText("mon-stream-hint", "已完成");
    } else if (t === "complete") {
        statusEl.textContent = "完成 ✓";
    } else if (t === "error") {
        showAiopsReport();
        reportEl.innerHTML = `<p class="text-err">错误: ${escapeHtml(ev.message)}</p>`;
        statusEl.textContent = "失败 ✗";
    }
}

// ============================================================
// RAG Chat
// ============================================================
const chatInput = document.getElementById("chat-input");
const chatSend = document.getElementById("chat-send");
const chatWebToggle = document.getElementById("chat-web-toggle");
const chatWebState = document.getElementById("chat-web-state");
const chatMcpToggle = document.getElementById("chat-mcp-toggle");
const chatMcpState = document.getElementById("chat-mcp-state");
let chatWebEnabled = false;
let chatMcpEnabled = true;

function renderChatWebToggle() {
    if (!chatWebToggle) return;
    chatWebToggle.className = chatWebEnabled
        ? "toggle chat-tool-btn on"
        : "toggle chat-tool-btn off";
    chatWebState.textContent = chatWebEnabled ? "开" : "关";
}
if (chatWebToggle) {
    chatWebToggle.addEventListener("click", () => {
        chatWebEnabled = !chatWebEnabled;
        renderChatWebToggle();
    });
    renderChatWebToggle();
}

function renderChatMcpToggle() {
    if (!chatMcpToggle) return;
    chatMcpToggle.className = chatMcpEnabled
        ? "toggle toggle-mcp chat-tool-btn on"
        : "toggle chat-tool-btn off";
    chatMcpState.textContent = chatMcpEnabled ? "开" : "关";
}
if (chatMcpToggle) {
    chatMcpToggle.addEventListener("click", () => {
        chatMcpEnabled = !chatMcpEnabled;
        renderChatMcpToggle();
    });
    renderChatMcpToggle();
}

if (chatSend) chatSend.addEventListener("click", sendChat);
if (chatInput) chatInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        sendChat();
    }
});

async function sendChat() {
    const question = chatInput.value.trim();
    if (!question) return;
    chatInput.value = "";

    appendChatMsg("user", question);
    const progressBox = appendChatProgress();
    const thinkingBubble = appendThinkingBubble();
    thinkingBubble.wrap.style.display = "none"; // 等有 reasoning 再显
    const assistantBubble = appendChatMsg("assistant", "");
    assistantBubble.parentElement.style.display = "none"; // 等第一个 token 再显
    if (chatSend) chatSend.disabled = true;

    try {
        const resp = await fetch(`${API}/chat/stream`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                session_id: "web-chat",
                question,
                top_k: 3,
                net_web_search: chatWebEnabled,
                mcp_tools: chatMcpEnabled,
            }),
        });

        let buf = "";
        let thinkBuf = "";
        let tokenStarted = false;
        let thinkingStarted = false;
        await consumeSSE(resp, (ev) => {
            if (ev.type === "progress") {
                appendChatProgressRow(progressBox, ev);
            } else if (ev.type === "thinking") {
                if (!thinkingStarted) {
                    thinkingStarted = true;
                    thinkingBubble.wrap.style.display = "";
                }
                thinkBuf += ev.content;
                thinkingBubble.content.textContent = thinkBuf;
                const container = document.getElementById("chat-messages");
                container.scrollTop = container.scrollHeight;
            } else if (ev.type === "token") {
                if (!tokenStarted) {
                    tokenStarted = true;
                    finalizeChatProgress(progressBox);
                    // 答案开始时把思考气泡自动折叠 (仍可点开)
                    if (thinkingStarted) collapseThinkingBubble(thinkingBubble);
                    assistantBubble.parentElement.style.display = "";
                }
                buf += ev.content;
                assistantBubble.innerHTML = renderMarkdown(buf);
                const container = document.getElementById("chat-messages");
                container.scrollTop = container.scrollHeight;
            } else if (ev.type === "error") {
                finalizeChatProgress(progressBox, true);
                assistantBubble.parentElement.style.display = "";
                assistantBubble.innerHTML = `<span class="text-err">错误: ${escapeHtml(ev.message)}</span>`;
            }
        });
        if (!tokenStarted) {
            // 没拿到任何 token, 清理占位气泡
            assistantBubble.parentElement.remove();
        }
        if (!thinkingStarted) {
            thinkingBubble.wrap.remove();
        }
    } catch (e) {
        finalizeChatProgress(progressBox, true);
        assistantBubble.parentElement.style.display = "";
        assistantBubble.innerHTML = `<span class="text-err">网络错误: ${e.message}</span>`;
    } finally {
        if (chatSend) chatSend.disabled = false;
        chatInput?.focus();
    }
}

// --- RAG Chat 思考过程气泡 (qwen3/qwen-plus-latest 等支持 thinking 的模型才会有) ---
function appendThinkingBubble() {
    const container = document.getElementById("chat-messages");
    const placeholder = container.querySelector(".chat-placeholder");
    if (placeholder) placeholder.remove();

    const wrap = document.createElement("div");
    wrap.className = "flex justify-start";
    wrap.innerHTML = `
      <div class="rag-thinking">
        <div class="rag-thinking-head">
          <span>🧠</span>
          <span>思考过程</span>
          <span class="rag-thinking-toggle" style="margin-left:auto;font-size:10px;color:var(--text-dim)">▼ 收起</span>
        </div>
        <pre class="rag-thinking-content"></pre>
      </div>`;
    container.appendChild(wrap);
    container.scrollTop = container.scrollHeight;

    const box = wrap.querySelector(".rag-thinking");
    const content = wrap.querySelector(".rag-thinking-content");
    const head = wrap.querySelector(".rag-thinking-head");
    const toggle = wrap.querySelector(".rag-thinking-toggle");
    head.addEventListener("click", () => {
        const hidden = content.classList.toggle("hidden");
        toggle.textContent = hidden ? "▶ 展开" : "▼ 收起";
    });
    return { wrap, box, content, head, toggle };
}

function collapseThinkingBubble(bundle) {
    if (!bundle || !bundle.content) return;
    bundle.content.classList.add("hidden");
    if (bundle.toggle) bundle.toggle.textContent = "▶ 展开";
}

// --- RAG Chat 进度条 (类似 AIOps 步骤卡片) ---
function appendChatProgress() {
    const container = document.getElementById("chat-messages");
    const placeholder = container.querySelector(".chat-placeholder");
    if (placeholder) placeholder.remove();

    const wrap = document.createElement("div");
    wrap.className = "flex justify-start";
    wrap.innerHTML = `
      <div class="rag-progress">
        <div class="rag-progress-head">
          <span class="rag-spinner"></span>
          <span>正在检索并生成回答…</span>
        </div>
        <div class="rag-progress-rows"></div>
      </div>`;
    container.appendChild(wrap);
    container.scrollTop = container.scrollHeight;
    return wrap.querySelector(".rag-progress");
}

function appendChatProgressRow(box, ev) {
    if (!box) return;
    const rows = box.querySelector(".rag-progress-rows");
    const icon = iconForRagStage(ev.stage);
    const elapsed = Number.isFinite(ev.elapsed_ms) && ev.elapsed_ms > 0
        ? `<span class="ml-1 text-[10px] text-accent">${ev.elapsed_ms}ms</span>`
        : "";

    const detailsHtml = renderRagStageDetails(ev.stage, ev.data || {});
    const hasDetails = !!detailsHtml;

    const row = document.createElement("div");
    row.className = "rag-progress-row";

    const headLine = document.createElement("div");
    headLine.className = "flex items-center gap-1.5 flex-wrap" + (hasDetails ? " cursor-pointer clickable" : "");
    headLine.innerHTML = `
      <span class="shrink-0">${icon}</span>
      <span class=" font-medium">${escapeHtml(ev.label || ev.stage || "")}</span>
      ${ev.detail ? `<span class="muted truncate">${escapeHtml(ev.detail)}</span>` : ""}
      ${elapsed}
      ${hasDetails ? `<span class="rag-toggle text-[10px] text-accent ml-auto select-none">▶ 详情</span>` : ""}`;
    row.appendChild(headLine);

    if (hasDetails) {
        const panel = document.createElement("div");
        panel.className = "rag-details mt-1 ml-5 hidden text-[11px] muted bg-white border border-indigo-100 rounded p-2 space-y-1";
        panel.innerHTML = detailsHtml;
        row.appendChild(panel);
        headLine.addEventListener("click", () => {
            const opened = !panel.classList.contains("hidden");
            panel.classList.toggle("hidden");
            const tog = headLine.querySelector(".rag-toggle");
            if (tog) tog.textContent = opened ? "▶ 详情" : "▼ 收起";
        });
    }

    rows.appendChild(row);
    const container = document.getElementById("chat-messages");
    container.scrollTop = container.scrollHeight;
}

function renderRagStageDetails(stage, data) {
    if (!data || typeof data !== "object") return "";
    if (stage === "rewrite_done") {
        const orig = data.original || "";
        const rew = data.rewritten || "";
        if (!orig && !rew) return "";
        return `
          <div><span class="muted">原始:</span> ${escapeHtml(orig)}</div>
          <div><span class="muted">改写:</span> ${escapeHtml(rew)}</div>`;
    }
    if (stage === "retrieve_done") {
        const hits = Array.isArray(data.hits) ? data.hits : [];
        if (!hits.length) return `<div class="muted">无命中片段</div>`;
        const meta = `<div class="muted mb-1">top_k=${data.top_k ?? "?"} · ${escapeHtml(data.mode || "")}</div>`;
        const items = hits.map((h, i) => {
            const score = (h.score !== null && h.score !== undefined) ? `<span class="text-ok">score ${h.score}</span>` : "";
            const chap = h.chapter ? ` · 章节: ${escapeHtml(h.chapter)}` : "";
            return `
              <div class="rag-hit">
                <div class="font-medium">${i + 1}. ${escapeHtml(h.source || "未知")} ${score}${chap}</div>
                <div class="muted">${escapeHtml(h.preview || "")}</div>
              </div>`;
        }).join("");
        return meta + items;
    }
    if (stage === "web_done") {
        const results = Array.isArray(data.results) ? data.results : [];
        if (!results.length) {
            const reason = data.skip_reason || "未触发联网";
            return `<div class="muted">${escapeHtml(reason)}</div>`;
        }
        const meta = data.provider ? `<div class="muted mb-1">provider=${escapeHtml(data.provider)}</div>` : "";
        const items = results.map((r, i) => {
            const url = r.url || "";
            const titleEsc = escapeHtml(r.title || "(无标题)");
            const titleHtml = url
                ? `<a href="${escapeHtml(url)}" target="_blank" rel="noopener" class="text-accent hover:underline">${titleEsc}</a>`
                : titleEsc;
            return `
              <div class="rag-hit">
                <div class="font-medium">${i + 1}. ${titleHtml}</div>
                ${url ? `<div class="text-[10px] muted break-all">${escapeHtml(url)}</div>` : ""}
                <div class="muted">${escapeHtml(r.snippet || "")}</div>
              </div>`;
        }).join("");
        return meta + items;
    }
    if (stage === "stats") {
        return `
          <div>模型: <span class="font-medium">${escapeHtml(data.model || "?")}</span></div>
          <div>输入 tokens: <span class="font-medium">${data.input_tokens ?? 0}</span></div>
          <div>输出 tokens: <span class="font-medium">${data.output_tokens ?? 0}</span></div>
          <div>合计 tokens: <span class="font-medium">${data.total_tokens ?? 0}</span></div>
          <div>生成耗时: <span class="font-medium">${data.llm_ms ?? 0} ms</span></div>
          <div>总耗时: <span class="font-medium">${data.total_ms ?? 0} ms</span></div>
          <div>回答字数: <span class="font-medium">${data.answer_chars ?? 0}</span></div>
          ${data.tools_enabled ? '<div class="text-ok">工具回合: 已启用</div>' : ''}`;
    }
    if (stage === "llm_start") {
        const tools = Array.isArray(data.tools) ? data.tools : [];
        if (data.tools_enabled && tools.length) {
            const chips = tools.map(name => `<span class="rag-chip">${escapeHtml(name)}</span>`).join("");
            return `
              <div class="muted mb-1">模型: <span class="font-medium">${escapeHtml(data.model || "?")}</span></div>
              <div class="muted mb-1">已为模型启用 ${tools.length} 个只读工具, 模型可按需自主调用:</div>
              <div class="flex flex-wrap">${chips}</div>`;
        }
        return `<div class="muted">模型: <span class="font-medium">${escapeHtml(data.model || "?")}</span> · 工具回合: 未启用</div>`;
    }
    if (stage === "tool_call") {
        const ok = (data.status || "").toLowerCase() === "ok";
        const statusColor = ok ? "text-ok" : "text-err";
        const statusIcon = ok ? "✓" : "✗";
        return `
          <div>工具: <span class="font-mono ">${escapeHtml(data.name || "?")}</span></div>
          <div>状态: <span class="${statusColor} font-medium">${statusIcon} ${escapeHtml(data.status || "?")}</span></div>
          <div>耗时: <span class="font-medium">${data.elapsed_ms ?? 0} ms</span></div>
          <div>输出: <span class="font-medium">${data.result_chars ?? 0} 字符</span></div>
          ${data.read_only === false ? '<div class="text-amber-600">⚠ 非只读工具</div>' : ''}`;
    }
    return "";
}

function finalizeChatProgress(box, failed = false) {
    if (!box) return;
    const head = box.querySelector(".rag-progress-head");
    if (head) {
        head.innerHTML = failed
            ? `<span class="text-err">✗ 检索流程中断</span>`
            : `<span class="text-ok">✓ 检索流程完成</span>`;
    }
}

function iconForRagStage(stage) {
    switch (stage) {
        case "rewrite":      return "✏️";
        case "rewrite_done": return "✅";
        case "retrieve":     return "🔍";
        case "retrieve_done":return "📚";
        case "web":          return "🌐";
        case "web_done":     return "🌐";
        case "llm_start":    return "🤖";
        case "tool_call":    return "🛠️";
        case "stats":        return "📊";
        default:             return "•";
    }
}

function appendChatMsg(role, content) {
    const container = document.getElementById("chat-messages");
    // 清掉初始提示
    const placeholder = container.querySelector(".chat-placeholder");
    if (placeholder) placeholder.remove();

    const wrap = document.createElement("div");
    wrap.className = "flex " + (role === "user" ? "justify-end" : "justify-start");
    const bubble = document.createElement("div");
    bubble.className = `chat-msg ${role}`;
    bubble.innerHTML = role === "user" ? escapeHtml(content) : renderMarkdown(content);
    wrap.appendChild(bubble);
    container.appendChild(wrap);
    container.scrollTop = container.scrollHeight;
    return bubble;
}

// ============================================================
// 知识库 Tab
// ============================================================
const KB_ADMIN_TOKEN_KEY = "langgraph_aiops_kb_admin_token";
const KB_DEFAULT_PAGE_SIZE = 10;
const kbState = {
    docs: [],
    totalChunks: null,
    pendingDelete: null,
    searchTimer: null,
    page: 1,
    pageSize: KB_DEFAULT_PAGE_SIZE,
};

function initKbPage() {
    syncKbTokenUi();
    loadDocs();
}

function syncKbTokenUi() {
    const statusEl = document.getElementById("kb-token-status");
    const inputEl = document.getElementById("kb-admin-token");
    const token = (sessionStorage.getItem(KB_ADMIN_TOKEN_KEY) || "").trim();
    if (inputEl && document.activeElement !== inputEl) {
        inputEl.value = token;
    }
    if (!statusEl) return;
    if (token) {
        statusEl.textContent = "已配置 · 可上传与删除";
        statusEl.dataset.status = "ok";
    } else {
        statusEl.textContent = "未配置 · 上传/删除需 Token（与 .env KB_ADMIN_TOKEN 一致）";
        statusEl.dataset.status = "missing";
    }
}

function getKbAdminToken({ required = true } = {}) {
    const token = (sessionStorage.getItem(KB_ADMIN_TOKEN_KEY) || "").trim();
    if (!token && required) {
        throw new Error("请先在上方保存管理员 Token");
    }
    return token;
}

function docTypeBadgeClass(source) {
    const s = (source || "").toLowerCase();
    if (s.includes("kb_corpus") || s.includes("awesome-prometheus") || s.includes("docs/sop")) {
        return "doc-type-badge doc-type-badge--corpus";
    }
    if (s.endsWith(".txt")) return "doc-type-badge doc-type-badge--txt";
    return "doc-type-badge doc-type-badge--md";
}

function docTypeLabel(source) {
    const s = (source || "").toLowerCase();
    if (s.includes("kb_corpus") || s.includes("awesome-prometheus")) return "语料";
    if (s.includes("docs/sop") || s.includes("sop/")) return "SOP";
    if (s.endsWith(".txt")) return "TXT";
    if (s.endsWith(".md") || s.endsWith(".markdown")) return "MD";
    return "DOC";
}

function updateKbStats(docs, totalChunksFromApi) {
    const totalDocs = docs.length;
    const sumChunks = docs.reduce((n, d) => n + (d.chunk_count || 0), 0);
    const chunks = totalChunksFromApi != null ? totalChunksFromApi : sumChunks;
    setText("kb-stat-docs", String(totalDocs));
    setText("kb-stat-chunks", String(chunks));
}

function sortKbDocs(docs, mode) {
    const list = [...docs];
    if (mode === "chunks-desc") {
        list.sort((a, b) => (b.chunk_count || 0) - (a.chunk_count || 0));
    } else if (mode === "chunks-asc") {
        list.sort((a, b) => (a.chunk_count || 0) - (b.chunk_count || 0));
    } else {
        list.sort((a, b) => String(a.source).localeCompare(String(b.source), "zh-CN"));
    }
    return list;
}

function filterKbDocs(docs, query) {
    const q = (query || "").trim().toLowerCase();
    if (!q) return docs;
    return docs.filter((d) => String(d.source || "").toLowerCase().includes(q));
}

function getKbListView() {
    const sortMode = document.getElementById("kb-doc-sort")?.value || "name";
    const query = document.getElementById("kb-doc-search")?.value || "";
    const filtered = filterKbDocs(kbState.docs, query);
    const sorted = sortKbDocs(filtered, sortMode);
    const pageSize = Math.max(1, kbState.pageSize || KB_DEFAULT_PAGE_SIZE);
    const total = sorted.length;
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    kbState.page = Math.min(Math.max(1, kbState.page), totalPages);
    const start = (kbState.page - 1) * pageSize;
    const pageItems = sorted.slice(start, start + pageSize);
    return { sorted, pageItems, total, totalPages, page: kbState.page, pageSize, query };
}

function updateKbPagination(view) {
    const nav = document.getElementById("kb-pagination");
    if (!nav) return;
    const { sorted, total, totalPages, page, pageSize, query } = view;
    if (kbState.docs.length === 0 || sorted.length === 0) {
        nav.classList.add("hidden");
        return;
    }
    nav.classList.remove("hidden");
    const filteredHint = query.trim() ? " · 已筛选" : "";
    setText("kb-page-summary", `共 ${total} 条${filteredHint}`);
    const from = (page - 1) * pageSize + 1;
    const to = Math.min(page * pageSize, total);
    setText("kb-page-indicator", `第 ${page} / ${totalPages} 页（${from}–${to}）`);
    const prev = document.getElementById("kb-page-prev");
    const next = document.getElementById("kb-page-next");
    if (prev) prev.disabled = page <= 1;
    if (next) next.disabled = page >= totalPages;
}

function hideKbPagination() {
    document.getElementById("kb-pagination")?.classList.add("hidden");
}

function hideKbDeleteConfirm() {
    kbState.pendingDelete = null;
    const bar = document.getElementById("kb-delete-confirm");
    if (bar) {
        bar.classList.add("hidden");
        bar.innerHTML = "";
    }
}

function showKbDeleteConfirm(source) {
    kbState.pendingDelete = source;
    const bar = document.getElementById("kb-delete-confirm");
    if (!bar) return;
    bar.classList.remove("hidden");
    bar.innerHTML = `
        <span>确认删除 <strong>${escapeHtml(source)}</strong>？将移除其全部向量 chunk。</span>
        <div class="kb-confirm-actions">
            <button type="button" class="btn-ghost kb-confirm-cancel">取消</button>
            <button type="button" class="btn-ghost kb-confirm-delete" style="color:var(--danger)">删除</button>
        </div>`;
    bar.querySelector(".kb-confirm-cancel")?.addEventListener("click", hideKbDeleteConfirm);
    bar.querySelector(".kb-confirm-delete")?.addEventListener("click", () => {
        const src = kbState.pendingDelete;
        hideKbDeleteConfirm();
        if (src) deleteDoc(src);
    });
}

function renderKbDocList() {
    const listEl = document.getElementById("docs-list");
    if (!listEl) return;

    const view = getKbListView();
    const { sorted, pageItems } = view;

    if (kbState.docs.length === 0) {
        hideKbPagination();
        listEl.innerHTML = `
            <div class="aiops-empty">
                <div>暂无已索引文档</div>
                <div style="margin-top:0.5rem;font-size:0.8rem;color:var(--text-secondary)">
                    上传 .md / .txt，或运行 <code>python scripts/ingest_kb_corpus.py --reset</code>
                </div>
            </div>`;
        return;
    }

    if (sorted.length === 0) {
        hideKbPagination();
        listEl.innerHTML = '<span class="aiops-empty">无匹配文档</span>';
        return;
    }

    updateKbPagination(view);

    listEl.innerHTML = "";
    pageItems.forEach((d) => {
        const div = document.createElement("div");
        div.className = "doc-card";
        const badgeClass = docTypeBadgeClass(d.source);
        div.innerHTML = `
            <div class="doc-card-main">
                <span class="${badgeClass}">${escapeHtml(docTypeLabel(d.source))}</span>
                <div class="doc-card-text">
                    <div class="doc-name" title="${escapeHtml(d.source)}">${escapeHtml(d.source)}</div>
                    <div class="doc-meta">${d.chunk_count} chunks</div>
                </div>
            </div>
            <button type="button" class="doc-delete" data-source="${escapeHtml(d.source)}"
                title="删除文档" aria-label="删除 ${escapeHtml(d.source)}">
                <span class="doc-delete-icon" aria-hidden="true">
                    <svg viewBox="0 0 24 24" width="16" height="16" fill="none"
                        stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M4 7h16"/>
                        <path d="M10 11v6M14 11v6"/>
                        <path d="M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12"/>
                        <path d="M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
                    </svg>
                </span>
                <span class="doc-delete-label">删除</span>
            </button>`;
        div.querySelector("button")?.addEventListener("click", () => showKbDeleteConfirm(d.source));
        listEl.appendChild(div);
    });
}

async function loadDocs() {
    const listEl = document.getElementById("docs-list");
    if (!listEl) return;
    listEl.innerHTML = '<span class="aiops-empty">加载中...</span>';
    hideKbPagination();
    hideKbDeleteConfirm();
    try {
        const r = await fetch(`${API}/documents`);
        const data = await r.json();
        if (data?.code !== "SUCCESS") throw new Error(data?.message || "加载失败");
        kbState.docs = data?.data?.documents || [];
        kbState.totalChunks = data?.data?.total_chunks ?? null;
        kbState.page = 1;
        updateKbStats(kbState.docs, kbState.totalChunks);
        renderKbDocList();
    } catch (e) {
        kbState.docs = [];
        kbState.page = 1;
        updateKbStats([], null);
        hideKbPagination();
        listEl.innerHTML = `
            <div class="aiops-empty">
                <div class="text-err">加载失败: ${escapeHtml(e.message)}</div>
                <button type="button" class="btn-ghost" id="kb-retry-load" style="margin-top:0.75rem">重试</button>
            </div>`;
        document.getElementById("kb-retry-load")?.addEventListener("click", loadDocs);
    }
}

function showUploadResult(html, visible = true) {
    const el = document.getElementById("upload-result");
    if (!el) return;
    el.innerHTML = html;
    el.hidden = !visible;
}

function showRecentUpload(payload) {
    const el = document.getElementById("kb-recent-upload");
    if (!el || !payload) return;
    const when = new Date().toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" });
    el.hidden = false;
    el.innerHTML = `
        <strong>最近上传</strong> · ${escapeHtml(payload.source)}
        · ${payload.chunks_indexed} chunks · ${payload.bytes} bytes · ${when}`;
}

async function uploadFile(file) {
    showUploadResult(`<div class="text-accent">上传中 ${escapeHtml(file.name)}…</div>`, true);
    const formData = new FormData();
    formData.append("file", file);
    try {
        const r = await fetch(`${API}/documents/upload`, {
            method: "POST",
            headers: { "X-KB-Admin-Token": getKbAdminToken() },
            body: formData,
        });
        const data = await r.json().catch(() => null);
        if (!r.ok) {
            if (r.status === 401 || r.status === 403) {
                sessionStorage.removeItem(KB_ADMIN_TOKEN_KEY);
                syncKbTokenUi();
            }
            throw new Error(data?.detail || data?.message || `HTTP ${r.status}`);
        }
        if (data.code === "SUCCESS") {
            showUploadResult(
                `<div class="text-ok">已索引 ${data.data.chunks_indexed} 个 chunk（${data.data.bytes} bytes）</div>`,
                true,
            );
            showRecentUpload(data.data);
            loadDocs();
        } else {
            showUploadResult(`<div class="text-err">${escapeHtml(data?.message || "上传失败")}</div>`, true);
        }
    } catch (e) {
        const hint = /Token|403|401/.test(e.message)
            ? " · 请检查管理员 Token 是否与 .env 中 KB_ADMIN_TOKEN 一致"
            : "";
        showUploadResult(`<div class="text-err">${escapeHtml(e.message)}${escapeHtml(hint)}</div>`, true);
    }
}

async function deleteDoc(source) {
    const btn = document.querySelector(`.doc-delete[data-source="${CSS.escape(source)}"]`);
    btn?.classList.add("is-busy");
    try {
        const r = await fetch(`${API}/documents/${encodeURIComponent(source)}`, {
            method: "DELETE",
            headers: { "X-KB-Admin-Token": getKbAdminToken() },
        });
        const data = await r.json().catch(() => null);
        if (!r.ok || data?.code !== "SUCCESS") {
            if (r.status === 401 || r.status === 403) {
                sessionStorage.removeItem(KB_ADMIN_TOKEN_KEY);
                syncKbTokenUi();
            }
            throw new Error(data?.detail || data?.message || `HTTP ${r.status}`);
        }
        await loadDocs();
    } catch (e) {
        alert(`删除失败: ${e.message}`);
    } finally {
        btn?.classList.remove("is-busy");
    }
}

function initKbDomListeners() {
    const uploadZone = document.getElementById("upload-zone");
    const uploadInput = document.getElementById("upload-input");
    if (uploadZone && uploadInput) {
        uploadZone.addEventListener("click", () => uploadInput.click());
        uploadInput.addEventListener("change", () => {
            if (uploadInput.files[0]) uploadFile(uploadInput.files[0]);
            uploadInput.value = "";
        });
        uploadZone.addEventListener("dragover", (e) => {
            e.preventDefault();
            uploadZone.classList.add("drag-over");
        });
        uploadZone.addEventListener("dragleave", () => uploadZone.classList.remove("drag-over"));
        uploadZone.addEventListener("drop", (e) => {
            e.preventDefault();
            uploadZone.classList.remove("drag-over");
            if (e.dataTransfer.files[0]) uploadFile(e.dataTransfer.files[0]);
        });
    }

    document.getElementById("docs-refresh")?.addEventListener("click", loadDocs);
    document.getElementById("kb-token-save")?.addEventListener("click", () => {
        const input = document.getElementById("kb-admin-token");
        const token = (input?.value || "").trim();
        if (!token) {
            alert("Token 不能为空");
            return;
        }
        sessionStorage.setItem(KB_ADMIN_TOKEN_KEY, token);
        syncKbTokenUi();
    });
    document.getElementById("kb-token-clear")?.addEventListener("click", () => {
        sessionStorage.removeItem(KB_ADMIN_TOKEN_KEY);
        const input = document.getElementById("kb-admin-token");
        if (input) input.value = "";
        syncKbTokenUi();
    });
    document.getElementById("kb-doc-search")?.addEventListener("input", () => {
        clearTimeout(kbState.searchTimer);
        kbState.searchTimer = setTimeout(() => {
            kbState.page = 1;
            renderKbDocList();
        }, 200);
    });
    document.getElementById("kb-doc-sort")?.addEventListener("change", () => {
        kbState.page = 1;
        renderKbDocList();
    });
    document.getElementById("kb-page-prev")?.addEventListener("click", () => {
        if (kbState.page > 1) {
            kbState.page -= 1;
            renderKbDocList();
            document.getElementById("docs-list")?.scrollIntoView({ behavior: "smooth", block: "nearest" });
        }
    });
    document.getElementById("kb-page-next")?.addEventListener("click", () => {
        const view = getKbListView();
        if (view.page < view.totalPages) {
            kbState.page = view.page + 1;
            renderKbDocList();
            document.getElementById("docs-list")?.scrollIntoView({ behavior: "smooth", block: "nearest" });
        }
    });
    document.getElementById("kb-page-size")?.addEventListener("change", (e) => {
        kbState.pageSize = parseInt(e.target.value, 10) || KB_DEFAULT_PAGE_SIZE;
        kbState.page = 1;
        renderKbDocList();
    });
}

initKbDomListeners();
if (sessionStorage.getItem(KB_ADMIN_TOKEN_KEY)) {
    syncKbTokenUi();
}

// ============================================================
// 工具函数
// ============================================================
async function consumeSSE(response, onEvent) {
    if (!response.ok) {
        const text = await response.text().catch(() => "");
        throw new Error(`HTTP ${response.status}: ${text.slice(0, 200)}`);
    }
    if (!response.body) {
        throw new Error("浏览器不支持 ReadableStream");
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder("utf-8");
    let buffer = "";

    // SSE 标准支持 \r\n / \n / \r 三种分隔, 这里全兼容
    const blockSplit = /\r?\n\r?\n|\n\n/;
    const lineSplit = /\r?\n/;

    while (true) {
        const { done, value } = await reader.read();
        if (done) {
            // 处理最后剩下的 buffer
            if (buffer.trim()) parseBlock(buffer);
            break;
        }
        buffer += decoder.decode(value, { stream: true });

        // 切出所有完整的 event block
        let parts = buffer.split(blockSplit);
        buffer = parts.pop();  // 最后一段可能不完整, 留到下次
        for (const block of parts) parseBlock(block);
    }

    function parseBlock(block) {
        for (const line of block.split(lineSplit)) {
            if (line.startsWith("data:")) {
                const payload = line.slice(5).trim();
                if (!payload) continue;
                try {
                    onEvent(JSON.parse(payload));
                } catch (e) {
                    console.warn("[SSE] JSON parse error:", payload, e);
                }
            }
        }
    }
}

function escapeHtml(s) {
    if (s == null) return "";
    return String(s)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}

// 极简 Markdown -> HTML (够用即可, 不引第三方库)
function renderMarkdown(md) {
    if (!md) return "";
    // 处理 LLM 偶尔输出 \n 字面量 (而非实际换行) 的 bug
    // (\\\\n 在 JS 字符串里就是 \n 两个字符, 把它替换成真换行)
    let s = String(md).replace(/\\n/g, "\n").replace(/\\t/g, "\t");
    let h = escapeHtml(s);
    // 代码块
    h = h.replace(/```([\s\S]*?)```/g, (_, code) => `<pre><code>${code}</code></pre>`);
    // 行内代码
    h = h.replace(/`([^`\n]+)`/g, "<code>$1</code>");
    // 标题
    h = h.replace(/^### (.+)$/gm, "<h3>$1</h3>");
    h = h.replace(/^## (.+)$/gm, "<h2>$1</h2>");
    h = h.replace(/^# (.+)$/gm, "<h1>$1</h1>");
    // 加粗
    h = h.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
    // 列表
    h = h.replace(/^[\-\*] (.+)$/gm, "<li>$1</li>");
    h = h.replace(/(<li>[\s\S]*?<\/li>)(\n<li>)/g, "$1$2");
    h = h.replace(/(<li>[\s\S]+?<\/li>)/g, (m) => `<ul>${m}</ul>`);
    h = h.replace(/<\/ul>\s*<ul>/g, "");
    // 段落
    h = h.replace(/\n\n/g, "</p><p>");
    h = h.replace(/\n/g, "<br>");
    return `<p>${h}</p>`;
}
