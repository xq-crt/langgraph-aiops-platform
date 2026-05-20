import os
import platform
import sys
from pathlib import Path
from typing import Any, Dict, List

import psutil
from fastmcp import FastMCP

# MCP 独立进程需把项目根加入 path（与 websearch_server 一致）
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from backend.tools.disk_scan import cleanup_hints_markdown, find_large_files, scan_dir_usage

mcp = FastMCP(name="LocalSystemServer")


@mcp.tool(
    name="host_snapshot",
    description="获取当前电脑的 CPU、内存、磁盘和系统基础信息。只读操作，用于本机故障诊断。",
)
def host_snapshot() -> str:
    cpu_percent = psutil.cpu_percent(interval=1)
    memory = psutil.virtual_memory()
    swap = psutil.swap_memory()
    disks = []
    for part in psutil.disk_partitions(all=False):
        try:
            usage = psutil.disk_usage(part.mountpoint)
        except OSError:
            continue
        disks.append(
            {
                "device": part.device,
                "mountpoint": part.mountpoint,
                "fstype": part.fstype,
                "total_gb": round(usage.total / 1024**3, 2),
                "used_gb": round(usage.used / 1024**3, 2),
                "free_gb": round(usage.free / 1024**3, 2),
                "percent": usage.percent,
            }
        )

    lines = [
        "## 本机系统概览",
        "",
        f"- 系统: {platform.system()} {platform.release()} ({platform.version()})",
        f"- 机器: {platform.machine()}",
        f"- CPU 核心: 物理 {psutil.cpu_count(logical=False) or '未知'} / 逻辑 {psutil.cpu_count(logical=True) or '未知'}",
        f"- CPU 使用率: {cpu_percent}%",
        f"- 内存使用率: {memory.percent}% ({round(memory.used / 1024**3, 2)}GB / {round(memory.total / 1024**3, 2)}GB)",
        f"- Swap 使用率: {swap.percent}% ({round(swap.used / 1024**3, 2)}GB / {round(swap.total / 1024**3, 2)}GB)",
        "",
        "## 磁盘",
        "",
        "| 挂载点 | 文件系统 | 已用 | 可用 | 总量 | 使用率 |",
        "|---|---|---:|---:|---:|---:|",
    ]
    for disk in disks:
        lines.append(
            f"| {disk['mountpoint']} | {disk['fstype']} | {disk['used_gb']}GB | {disk['free_gb']}GB | {disk['total_gb']}GB | {disk['percent']}% |"
        )
    return "\n".join(lines)


@mcp.tool(
    name="host_cpu_memory",
    description="获取当前电脑 CPU 和内存使用情况。只读操作，用于判断本机是否存在 CPU 或内存压力。",
)
def host_cpu_memory() -> str:
    cpu_total = psutil.cpu_percent(interval=1)
    cpu_per_core = psutil.cpu_percent(interval=None, percpu=True)
    memory = psutil.virtual_memory()
    lines = [
        "## 本机 CPU / 内存",
        "",
        f"- CPU 总使用率: {cpu_total}%",
        f"- 每核心 CPU: {cpu_per_core}",
        f"- 内存使用率: {memory.percent}%",
        f"- 内存已用: {round(memory.used / 1024**3, 2)}GB",
        f"- 内存可用: {round(memory.available / 1024**3, 2)}GB",
        f"- 内存总量: {round(memory.total / 1024**3, 2)}GB",
    ]
    return "\n".join(lines)


@mcp.tool(
    name="host_disk_partitions",
    description="获取当前电脑磁盘分区使用情况。只读操作，用于排查本机磁盘空间不足。",
)
def host_disk_partitions() -> str:
    lines = [
        "## 本机磁盘使用情况",
        "",
        "| 设备 | 挂载点 | 文件系统 | 已用 | 可用 | 总量 | 使用率 |",
        "|---|---|---|---:|---:|---:|---:|",
    ]
    for part in psutil.disk_partitions(all=False):
        try:
            usage = psutil.disk_usage(part.mountpoint)
        except OSError:
            continue
        lines.append(
            f"| {part.device} | {part.mountpoint} | {part.fstype} | {round(usage.used / 1024**3, 2)}GB | {round(usage.free / 1024**3, 2)}GB | {round(usage.total / 1024**3, 2)}GB | {usage.percent}% |"
        )
    return "\n".join(lines)


@mcp.tool(
    name="host_top_processes",
    description="列出当前电脑资源占用最高的进程。只读操作，用于定位 CPU 或内存占用来源。",
)
def host_top_processes(sort_by: str = "memory", limit: int = 10) -> List[Dict[str, Any]]:
    sort_by = (sort_by or "memory").lower().strip()
    if sort_by not in {"memory", "cpu"}:
        sort_by = "memory"
    limit = max(1, min(int(limit or 10), 30))

    processes = []
    for proc in psutil.process_iter(["pid", "name", "username", "cpu_percent", "memory_percent", "memory_info"]):
        try:
            info = proc.info
            mem_info = info.get("memory_info")
            processes.append(
                {
                    "pid": info.get("pid"),
                    "name": info.get("name"),
                    "username": info.get("username"),
                    "cpu_percent": round(float(info.get("cpu_percent") or 0), 2),
                    "memory_percent": round(float(info.get("memory_percent") or 0), 2),
                    "rss_mb": round((mem_info.rss if mem_info else 0) / 1024**2, 2),
                }
            )
        except (psutil.NoSuchProcess, psutil.AccessDenied, psutil.ZombieProcess):
            continue

    key = "cpu_percent" if sort_by == "cpu" else "memory_percent"
    return sorted(processes, key=lambda item: item[key], reverse=True)[:limit]


@mcp.tool(
    name="host_scan_dir_usage",
    description=(
        "仅扫描运行本服务的主机（非 SSH 远程）。在指定根路径下按目录聚合占用 TopN，"
        "只读，不删除文件。用于磁盘满时定位大目录。"
    ),
)
def host_scan_dir_usage(
    root: str = "",
    max_depth: int = 2,
    top_n: int = 15,
) -> str:
    root = root or os.environ.get("SystemDrive", "C:") + "\\"
    rows, truncated, err = scan_dir_usage(root, max_depth=max_depth, top_n=top_n)
    if err:
        return f"目录扫描失败: {err}"
    lines = [
        f"## 目录占用 Top {top_n}（根: `{root}`）",
        "",
        "| 路径 | 估算占用 (GB) |",
        "|---|---:|",
    ]
    for r in rows:
        lines.append(f"| `{r['path']}` | {r['size_gb']} |")
    if truncated:
        lines.append("", "*扫描因超时或深度限制未完全结束，结果仅供参考。*")
    return "\n".join(lines)


@mcp.tool(
    name="host_find_large_files",
    description=(
        "仅在本机指定路径下查找大于阈值的大文件 TopN。只读，不删除。"
    ),
)
def host_find_large_files(
    root: str = "",
    min_size_mb: int = 100,
    top_n: int = 20,
) -> str:
    root = root or os.environ.get("SystemDrive", "C:") + "\\"
    rows, truncated = find_large_files(root, min_size_mb=min_size_mb, top_n=top_n)
    lines = [
        f"## 大文件 Top {top_n}（≥ {min_size_mb} MB，根: `{root}`）",
        "",
        "| 路径 | 大小 (GB) |",
        "|---|---:|",
    ]
    for r in rows:
        lines.append(f"| `{r['path']}` | {r['size_gb']} |")
    if not rows:
        lines.append("| （无匹配） | — |")
    if truncated:
        lines.append("", "*扫描未完全结束（超时/深度限制）。*")
    return "\n".join(lines)


@mcp.tool(
    name="host_cleanup_hints",
    description="只读汇总常见可清理项与风险说明，不执行任何删除。",
)
def host_cleanup_hints() -> str:
    return cleanup_hints_markdown()


if __name__ == "__main__":
    print("[mcp] system_server starting on http://0.0.0.0:8005/mcp ...")
    mcp.run(transport="streamable-http", host="0.0.0.0", port=8005)
