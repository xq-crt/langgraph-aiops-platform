// ============================================================
// Chart.js helpers — dark ops theme (overview + AIOps live)
// ============================================================

const CHART_COLORS = {
    text: "#8b9cb3",
    grid: "#2a3544",
    accent: "#22d3ee",
    success: "#34d399",
    warn: "#fbbf24",
    danger: "#f87171",
    mem: "#a78bfa",
};

const AIOPS_CHART_COLORS = {
    tokensIn: "#06b6d4",
    tokensOut: "#60a5fa",
    toolsPie: ["#10b981", "#ef4444"],
    toolsBar: "rgba(6, 182, 212, 0.75)",
    grid: "#334155",
    tick: "#64748b",
};

const OVERVIEW_HISTORY_MAX = 30;

function applyChartDefaults() {
    if (typeof Chart === "undefined") return;
    Chart.defaults.color = CHART_COLORS.text;
    Chart.defaults.borderColor = CHART_COLORS.grid;
    Chart.defaults.font.family = "'Segoe UI', system-ui, sans-serif";
    Chart.defaults.font.size = 11;
}

function destroyChart(chart) {
    if (chart) {
        chart.destroy();
    }
}

function gaugeColors(value) {
    if (value >= 90) return [CHART_COLORS.danger, CHART_COLORS.grid];
    if (value >= 75) return [CHART_COLORS.warn, CHART_COLORS.grid];
    return [CHART_COLORS.accent, CHART_COLORS.grid];
}

function createGauge(canvasId, value, label) {
    const canvas = document.getElementById(canvasId);
    if (!canvas || typeof Chart === "undefined") return null;
    const v = Math.min(100, Math.max(0, Number(value) || 0));
    const [fg, bg] = gaugeColors(v);
    return new Chart(canvas, {
        type: "doughnut",
        data: {
            labels: [label, ""],
            datasets: [{
                data: [v, 100 - v],
                backgroundColor: [fg, bg],
                borderWidth: 0,
            }],
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            cutout: "72%",
            plugins: {
                legend: { display: false },
                tooltip: { enabled: false },
            },
        },
        plugins: [{
            id: "gaugeCenter",
            afterDraw(chart) {
                const { ctx, chartArea } = chart;
                if (!chartArea) return;
                const pct = Math.round(chart.data.datasets[0]?.data[0] ?? 0);
                const centerLabel = chart.data.labels[0] || label;
                const cx = (chartArea.left + chartArea.right) / 2;
                const cy = (chartArea.top + chartArea.bottom) / 2;
                ctx.save();
                ctx.fillStyle = "#e8edf4";
                ctx.font = "bold 1.25rem Segoe UI, sans-serif";
                ctx.textAlign = "center";
                ctx.textBaseline = "middle";
                ctx.fillText(`${pct}%`, cx, cy - 6);
                ctx.fillStyle = CHART_COLORS.text;
                ctx.font = "0.65rem Segoe UI, sans-serif";
                ctx.fillText(centerLabel, cx, cy + 14);
                ctx.restore();
            },
        }],
    });
}

function updateGauge(chart, value, label) {
    if (!chart) return;
    const v = Math.min(100, Math.max(0, Number(value) || 0));
    const [fg, bg] = gaugeColors(v);
    chart.data.labels[0] = label;
    chart.data.datasets[0].data = [v, 100 - v];
    chart.data.datasets[0].backgroundColor = [fg, bg];
    chart.update();
}

// ---------- Overview charts ----------
const overviewState = {
    cpuGauge: null,
    memGauge: null,
    diskGauge: null,
    trendLine: null,
    alertBar: null,
    history: [],
};

function initOverviewCharts() {
    applyChartDefaults();
    destroyChart(overviewState.cpuGauge);
    destroyChart(overviewState.memGauge);
    destroyChart(overviewState.diskGauge);
    destroyChart(overviewState.trendLine);
    destroyChart(overviewState.alertBar);
    overviewState.history = [];

    overviewState.cpuGauge = createGauge("chart-cpu-gauge", 0, "CPU");
    overviewState.memGauge = createGauge("chart-mem-gauge", 0, "内存");
    overviewState.diskGauge = createGauge("chart-disk-gauge", 0, "磁盘");

    const trendCanvas = document.getElementById("chart-host-trend");
    if (trendCanvas) {
        overviewState.trendLine = new Chart(trendCanvas, {
            type: "line",
            data: {
                labels: [],
                datasets: [
                    {
                        label: "CPU %",
                        data: [],
                        borderColor: CHART_COLORS.accent,
                        backgroundColor: "rgba(34, 211, 238, 0.08)",
                        fill: true,
                        tension: 0.3,
                        pointRadius: 0,
                    },
                    {
                        label: "内存 %",
                        data: [],
                        borderColor: CHART_COLORS.mem,
                        backgroundColor: "rgba(167, 139, 250, 0.06)",
                        fill: true,
                        tension: 0.3,
                        pointRadius: 0,
                    },
                ],
            },
            options: lineOptions("本机资源趋势 (近 5 分钟)"),
        });
    }

    const barCanvas = document.getElementById("chart-alert-bar");
    if (barCanvas) {
        overviewState.alertBar = new Chart(barCanvas, {
            type: "bar",
            data: {
                labels: [],
                datasets: [{
                    label: "告警条数",
                    data: [],
                    backgroundColor: [
                        CHART_COLORS.danger,
                        CHART_COLORS.warn,
                        CHART_COLORS.accent,
                        CHART_COLORS.text,
                    ],
                }],
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    title: {
                        display: true,
                        text: "Webhook 告警 severity 分布",
                        color: CHART_COLORS.text,
                        font: { size: 12 },
                    },
                },
                scales: {
                    x: { grid: { display: false } },
                    y: { beginAtZero: true, ticks: { stepSize: 1 } },
                },
            },
        });
    }
}

function lineOptions(title) {
    return {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: "index", intersect: false },
        plugins: {
            legend: { position: "top", labels: { boxWidth: 10 } },
            title: {
                display: !!title,
                text: title,
                color: CHART_COLORS.text,
                font: { size: 12 },
            },
        },
        scales: {
            x: { grid: { color: CHART_COLORS.grid } },
            y: {
                min: 0,
                max: 100,
                grid: { color: CHART_COLORS.grid },
                ticks: { callback: (v) => `${v}%` },
            },
        },
    };
}

function aiopsLineOptions(title) {
    const grid = AIOPS_CHART_COLORS.grid || CHART_COLORS.grid;
    const tick = AIOPS_CHART_COLORS.tick || CHART_COLORS.text;
    return {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: "index", intersect: false },
        plugins: {
            legend: { position: "top", labels: { boxWidth: 10, color: tick } },
            title: {
                display: !!title,
                text: title,
                color: tick,
                font: { size: 12 },
            },
        },
        scales: {
            x: {
                grid: { color: grid },
                ticks: { color: tick },
            },
            y: {
                beginAtZero: true,
                grid: { color: grid },
                ticks: { color: tick },
            },
        },
    };
}

function pickSystemDisk(disks) {
    if (!disks || !disks.length) return null;
    const win = disks.find((d) => /^[cC]:[\\/]?$/.test(d.mountpoint) || d.mountpoint === "C:\\");
    return win || disks[0];
}

function updateOverviewNumericLabels(host) {
    if (!host) return;
    const set = (id, text) => {
        const el = document.getElementById(id);
        if (el) el.textContent = text;
    };
    set("dash-cpu-pct", `${host.cpu_percent ?? 0}%`);
    set("dash-mem-pct", `${host.memory_percent ?? 0}%`);
    const disk = pickSystemDisk(host.disks);
    const diskPct = disk ? disk.percent : 0;
    const diskLabel = disk ? disk.mountpoint.replace(/\\/g, "") : "磁盘";
    set("dash-disk-pct", `${diskPct}%`);
    set("dash-host-sub", `${host.hostname || ""} · ${host.platform || ""}`);
    const memSub = document.getElementById("dash-mem-sub");
    if (memSub && host.memory_used_gb != null) {
        memSub.textContent = `${host.memory_used_gb} / ${host.memory_total_gb} GB`;
    }
    const diskSub = document.getElementById("dash-disk-sub");
    if (diskSub && disk) {
        diskSub.textContent = `${diskLabel} · ${disk.used_gb}/${disk.total_gb} GB`;
    }
}

function pushOverviewHostSnapshot(host) {
    if (!host) return;
    updateOverviewNumericLabels(host);
    updateGauge(overviewState.cpuGauge, host.cpu_percent, "CPU");
    updateGauge(overviewState.memGauge, host.memory_percent, "内存");
    const disk = pickSystemDisk(host.disks);
    const diskPct = disk ? disk.percent : 0;
    const diskLabel = disk ? disk.mountpoint.replace(/\\/g, "") : "磁盘";
    updateGauge(overviewState.diskGauge, diskPct, diskLabel);

    const now = new Date();
    const label = now.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
    overviewState.history.push({
        label,
        cpu: host.cpu_percent,
        mem: host.memory_percent,
    });
    if (overviewState.history.length > OVERVIEW_HISTORY_MAX) {
        overviewState.history.shift();
    }

    const line = overviewState.trendLine;
    if (line) {
        line.data.labels = overviewState.history.map((h) => h.label);
        line.data.datasets[0].data = overviewState.history.map((h) => h.cpu);
        line.data.datasets[1].data = overviewState.history.map((h) => h.mem);
        line.update("none");
    }
}

function updateOverviewAlertBar(items) {
    const bar = overviewState.alertBar;
    if (!bar) return;
    const counts = {};
    (items || []).forEach((rec) => {
        const sev = (rec?.alert?.labels?.severity || rec?.alert?.severity || "unknown").toLowerCase();
        counts[sev] = (counts[sev] || 0) + 1;
    });
    const labels = Object.keys(counts);
    if (labels.length === 0) {
        labels.push("无数据");
        counts["无数据"] = 0;
    }
    bar.data.labels = labels;
    bar.data.datasets[0].data = labels.map((k) => counts[k]);
    bar.update("none");
}

function resizeOverviewCharts() {
    [overviewState.cpuGauge, overviewState.memGauge, overviewState.diskGauge,
        overviewState.trendLine, overviewState.alertBar].forEach((c) => {
        if (c) c.resize();
    });
}

function destroyOverviewCharts() {
    destroyChart(overviewState.cpuGauge);
    destroyChart(overviewState.memGauge);
    destroyChart(overviewState.diskGauge);
    destroyChart(overviewState.trendLine);
    destroyChart(overviewState.alertBar);
    overviewState.cpuGauge = null;
    overviewState.memGauge = null;
    overviewState.diskGauge = null;
    overviewState.trendLine = null;
    overviewState.alertBar = null;
    overviewState.history = [];
}

// ---------- AIOps live charts ----------
const aiopsState = {
    tokenLine: null,
    toolDoughnut: null,
    toolBar: null,
    diagStartTs: 0,
    toolOk: 0,
    toolFail: 0,
    recentTools: [],
};

function initAiopsCharts() {
    applyChartDefaults();
    aiopsState.diagStartTs = Date.now();
    aiopsState.toolOk = 0;
    aiopsState.toolFail = 0;
    aiopsState.recentTools = [];

    const tokenCanvas = document.getElementById("chart-aiops-tokens");
    if (tokenCanvas) {
        destroyChart(aiopsState.tokenLine);
        aiopsState.tokenLine = new Chart(tokenCanvas, {
            type: "line",
            data: {
                labels: [],
                datasets: [
                    {
                        label: "输入 tokens (累计)",
                        data: [],
                        borderColor: AIOPS_CHART_COLORS.tokensIn,
                        tension: 0.2,
                        pointRadius: 2,
                    },
                    {
                        label: "输出 tokens (累计)",
                        data: [],
                        borderColor: AIOPS_CHART_COLORS.tokensOut,
                        tension: 0.2,
                        pointRadius: 2,
                    },
                ],
            },
            options: aiopsLineOptions("Token 消耗 (累计)"),
        });
    }

    const doughnutCanvas = document.getElementById("chart-aiops-tools-pie");
    if (doughnutCanvas) {
        destroyChart(aiopsState.toolDoughnut);
        aiopsState.toolDoughnut = new Chart(doughnutCanvas, {
            type: "doughnut",
            data: {
                labels: ["成功", "失败"],
                datasets: [{
                    data: [0, 0],
                    backgroundColor: AIOPS_CHART_COLORS.toolsPie,
                    borderWidth: 0,
                }],
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                cutout: "55%",
                plugins: {
                    legend: { position: "bottom", labels: { boxWidth: 10, color: CHART_COLORS.text } },
                    title: { display: false },
                },
            },
        });
    }

    const barCanvas = document.getElementById("chart-aiops-tools-bar");
    if (barCanvas) {
        destroyChart(aiopsState.toolBar);
        aiopsState.toolBar = new Chart(barCanvas, {
            type: "bar",
            data: {
                labels: [],
                datasets: [{
                    label: "耗时 (ms)",
                    data: [],
                    backgroundColor: AIOPS_CHART_COLORS.toolsBar,
                }],
            },
            options: {
                indexAxis: "y",
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    title: { display: false },
                },
                scales: {
                    x: {
                        beginAtZero: true,
                        grid: { color: AIOPS_CHART_COLORS.grid },
                        ticks: { color: AIOPS_CHART_COLORS.tick },
                    },
                    y: { grid: { display: false }, ticks: { color: AIOPS_CHART_COLORS.tick } },
                },
            },
        });
    }
}

function resetAiopsCharts() {
    initAiopsCharts();
}

function pushAiopsUsage(monitor) {
    const chart = aiopsState.tokenLine;
    if (!chart || !monitor) return;
    const sec = ((Date.now() - (aiopsState.diagStartTs || Date.now())) / 1000).toFixed(1);
    chart.data.labels.push(`${sec}s`);
    chart.data.datasets[0].data.push(monitor.realInputTokens || 0);
    chart.data.datasets[1].data.push(monitor.realOutputTokens || 0);
    chart.update("none");
}

function pushAiopsTool(d, monitor) {
    const ok = d.success !== false;
    if (ok) aiopsState.toolOk += 1;
    else aiopsState.toolFail += 1;

    if (monitor) {
        aiopsState.toolOk = monitor.toolCount - (monitor.toolFail || 0);
        aiopsState.toolFail = monitor.toolFail || 0;
    }

    const pie = aiopsState.toolDoughnut;
    if (pie) {
        pie.data.datasets[0].data = [aiopsState.toolOk, aiopsState.toolFail];
        pie.update("none");
    }

    const name = (d.name || "?").slice(0, 24);
    const ms = d.elapsed_ms != null ? Number(d.elapsed_ms) : 0;
    aiopsState.recentTools.push({ name, ms });
    if (aiopsState.recentTools.length > 8) aiopsState.recentTools.shift();

    const bar = aiopsState.toolBar;
    if (bar) {
        bar.data.labels = aiopsState.recentTools.map((t) => t.name);
        bar.data.datasets[0].data = aiopsState.recentTools.map((t) => t.ms);
        bar.update("none");
    }
}

function destroyAiopsCharts() {
    destroyChart(aiopsState.tokenLine);
    destroyChart(aiopsState.toolDoughnut);
    destroyChart(aiopsState.toolBar);
    aiopsState.tokenLine = null;
    aiopsState.toolDoughnut = null;
    aiopsState.toolBar = null;
}

function resizeAiopsCharts() {
    [aiopsState.tokenLine, aiopsState.toolDoughnut, aiopsState.toolBar].forEach((c) => {
        if (c) c.resize();
    });
}

window.AIOpsCharts = {
    initOverviewCharts,
    pushOverviewHostSnapshot,
    updateOverviewNumericLabels,
    updateOverviewAlertBar,
    resizeOverviewCharts,
    destroyOverviewCharts,
    chartJsReady: () => typeof Chart !== "undefined",
    resetAiopsCharts,
    pushAiopsUsage,
    pushAiopsTool,
    destroyAiopsCharts,
    resizeAiopsCharts,
};
