"""本机资源快照 — 供运维大盘 API 轮询.

与 system_tool 采集逻辑一致, 返回结构化 JSON 而非 Markdown.
轮询场景使用 cpu_percent(interval=None), 避免每次阻塞 1 秒;
进程内首次调用前会有一次 interval=0.1 的预热.
"""

from __future__ import annotations

import platform
import shutil
from typing import Any, Dict, List

import psutil

_cpu_warmed = False


def _warm_cpu_if_needed() -> None:
    global _cpu_warmed
    if not _cpu_warmed:
        psutil.cpu_percent(interval=0.1)
        _cpu_warmed = True


def collect_host_snapshot() -> Dict[str, Any]:
    """采集当前主机 CPU / 内存 / 磁盘快照."""
    _warm_cpu_if_needed()
    cpu_percent = psutil.cpu_percent(interval=None)
    memory = psutil.virtual_memory()
    swap = psutil.swap_memory()

    disks: List[Dict[str, Any]] = []
    for part in psutil.disk_partitions(all=False):
        try:
            usage = psutil.disk_usage(part.mountpoint)
        except (OSError, SystemError, PermissionError):
            continue
            disks.append(
                {
                    "device": part.device,
                    "mountpoint": part.mountpoint,
                    "fstype": part.fstype,
                    "total_gb": round(usage.total / 1024 ** 3, 2),
                    "used_gb": round(usage.used / 1024 ** 3, 2),
                    "free_gb": round(usage.free / 1024 ** 3, 2),
                    "percent": usage.percent,
                }
            )

    if not disks and platform.system() == "Windows":
        for fallback in ("C:\\", "C:/"):
            try:
                usage = psutil.disk_usage(fallback)
                disks.append(
                    {
                        "device": fallback,
                        "mountpoint": fallback,
                        "fstype": "NTFS",
                        "total_gb": round(usage.total / 1024 ** 3, 2),
                        "used_gb": round(usage.used / 1024 ** 3, 2),
                        "free_gb": round(usage.free / 1024 ** 3, 2),
                        "percent": usage.percent,
                    }
                )
                break
            except (OSError, SystemError, PermissionError):
                try:
                    du = shutil.disk_usage(fallback)
                    disks.append(
                        {
                            "device": fallback,
                            "mountpoint": fallback,
                            "fstype": "NTFS",
                            "total_gb": round(du.total / 1024 ** 3, 2),
                            "used_gb": round(du.used / 1024 ** 3, 2),
                            "free_gb": round(du.free / 1024 ** 3, 2),
                            "percent": round(du.used / du.total * 100, 1) if du.total else 0,
                        }
                    )
                    break
                except OSError:
                    continue

    return {
        "hostname": platform.node(),
        "platform": f"{platform.system()} {platform.release()}",
        "cpu_percent": round(cpu_percent, 1),
        "memory_percent": round(memory.percent, 1),
        "memory_used_gb": round(memory.used / 1024 ** 3, 2),
        "memory_total_gb": round(memory.total / 1024 ** 3, 2),
        "swap_percent": round(swap.percent, 1),
        "disks": disks,
    }
