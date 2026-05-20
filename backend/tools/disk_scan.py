"""Disk scan helpers (read-only) for host_scan_dir_usage / host_find_large_files."""

from __future__ import annotations

import heapq
import os
import time
from pathlib import Path
from typing import Iterable, List, Tuple

DEFAULT_SKIP_NAMES = {
    "$recycle.bin",
    "system volume information",
    "pagefile.sys",
    "hiberfil.sys",
    "swapfile.sys",
}


def _norm_root(root: str) -> Path:
    p = Path(root).expanduser().resolve()
    if not p.exists():
        raise ValueError(f"路径不存在: {root}")
    if not p.is_dir():
        raise ValueError(f"不是目录: {root}")
    return p


def _should_skip_dir(name: str) -> bool:
    low = name.lower()
    if low in DEFAULT_SKIP_NAMES:
        return True
    if low.startswith("$"):
        return True
    return False


def scan_dir_usage(
    root: str,
    *,
    max_depth: int = 2,
    top_n: int = 15,
    timeout_sec: float = 30.0,
) -> Tuple[List[dict], bool, str]:
    """Aggregate immediate child directory sizes under root (BFS by depth)."""
    base = _norm_root(root)
    max_depth = max(1, min(int(max_depth), 4))
    top_n = max(1, min(int(top_n), 30))
    deadline = time.monotonic() + timeout_sec
    truncated = False

    # dir_path -> total bytes (direct children files only at each level walk)
    totals: dict[str, int] = {}

    def walk_dir(path: Path, depth: int) -> None:
        nonlocal truncated
        if time.monotonic() > deadline:
            truncated = True
            return
        try:
            with os.scandir(path) as it:
                for entry in it:
                    if time.monotonic() > deadline:
                        truncated = True
                        return
                    try:
                        if entry.is_file(follow_symlinks=False):
                            totals[str(path)] = totals.get(str(path), 0) + entry.stat(
                                follow_symlinks=False
                            ).st_size
                        elif entry.is_dir(follow_symlinks=False) and depth < max_depth:
                            if _should_skip_dir(entry.name):
                                continue
                            child = Path(entry.path)
                            walk_dir(child, depth + 1)
                            # attribute child size to parent aggregate at this level
                            child_key = str(child)
                            if child_key in totals:
                                totals[str(path)] = totals.get(str(path), 0) + totals[child_key]
                    except OSError:
                        continue
        except OSError:
            return

    walk_dir(base, 1)

    # Rank immediate subdirs of root
    rows: List[dict] = []
    try:
        with os.scandir(base) as it:
            for entry in it:
                if not entry.is_dir(follow_symlinks=False):
                    continue
                if _should_skip_dir(entry.name):
                    continue
                p = str(Path(entry.path))
                size = totals.get(p, 0)
                rows.append(
                    {
                        "path": p,
                        "size_gb": round(size / 1024**3, 2),
                        "size_bytes": size,
                    }
                )
    except OSError as e:
        return [], True, str(e)

    rows.sort(key=lambda r: r["size_bytes"], reverse=True)
    return rows[:top_n], truncated, ""


def find_large_files(
    root: str,
    *,
    min_size_mb: int = 100,
    top_n: int = 20,
    max_depth: int = 4,
    timeout_sec: float = 30.0,
) -> Tuple[List[dict], bool]:
    base = _norm_root(root)
    min_bytes = max(1, int(min_size_mb)) * 1024 * 1024
    top_n = max(1, min(int(top_n), 50))
    max_depth = max(1, min(int(max_depth), 6))
    deadline = time.monotonic() + timeout_sec
    heap: List[Tuple[int, str]] = []
    truncated = False

    def walk(path: Path, depth: int) -> None:
        nonlocal truncated
        if time.monotonic() > deadline:
            truncated = True
            return
        try:
            with os.scandir(path) as it:
                for entry in it:
                    if time.monotonic() > deadline:
                        truncated = True
                        return
                    try:
                        if entry.is_file(follow_symlinks=False):
                            st = entry.stat(follow_symlinks=False)
                            if st.st_size >= min_bytes:
                                heapq.heappush(heap, (st.st_size, entry.path))
                                if len(heap) > top_n:
                                    heapq.heappop(heap)
                        elif entry.is_dir(follow_symlinks=False) and depth < max_depth:
                            if _should_skip_dir(entry.name):
                                continue
                            walk(Path(entry.path), depth + 1)
                    except OSError:
                        continue
        except OSError:
            return

    walk(base, 0)
    rows = [
        {
            "path": p,
            "size_gb": round(sz / 1024**3, 2),
            "size_mb": round(sz / 1024**2, 1),
        }
        for sz, p in sorted(heap, reverse=True)
    ]
    return rows, truncated


def cleanup_hints_markdown() -> str:
    """Read-only hints for common cleanup locations (no deletion)."""
    lines = [
        "## 可清理项提示（只读，需人工确认后操作）",
        "",
        "| 类别 | 说明 | 风险 |",
        "|---|---|---|",
        "| 用户 Temp | `%TEMP%` / `C:\\Users\\<you>\\AppData\\Local\\Temp` | 低：关闭程序后清理 |",
        "| 下载目录 | `Downloads` 中大文件/安装包 | 低：确认不需要再删 |",
        "| 回收站 | `$Recycle.Bin` | 低：清空回收站 |",
        "| Docker | `docker system df` / 容器日志目录 | 中：可能影响运行中容器 |",
        "| 系统更新缓存 | `C:\\Windows\\SoftwareDistribution\\Download` | 中：更新可能需重下 |",
        "| 开发缓存 | `node_modules`、`.venv`、`target` 等 | 中：可重建但耗时 |",
        "",
        "**禁止**：本工具不执行删除；生产环境清理前请备份并走变更流程。",
    ]
    return "\n".join(lines)
