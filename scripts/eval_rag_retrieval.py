#!/usr/bin/env python3
"""Offline RAG retrieval eval: R@1, R@3, MRR on golden queries."""

from __future__ import annotations

import argparse
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

# Golden queries: (query, expected_source_substring in doc metadata source)
GOLDEN_QUERIES = [
    ("Redis 内存使用率过高怎么办", "redis"),
    ("MySQL 主从复制延迟", "mysql"),
    ("CPU 使用率持续高于 80", "cpu"),
    ("磁盘空间不足 No space left", "disk"),
    ("OOMKilled 容器重启", "oom"),
    ("Prometheus Alertmanager 配置重载失败", "alertmanager"),
    ("HTTP 502 Bad Gateway 排查", "502"),
    ("DNS 解析失败", "dns"),
    ("Docker 容器一直重启", "docker"),
    ("Windows 事件日志蓝屏", "windows"),
    ("连接数过多 too many connections", "connection"),
    ("inode 用尽", "inode"),
    ("负载过高 load average", "load"),
    ("网络丢包 ping", "packet"),
    ("日志磁盘占满", "log"),
    ("JVM 堆内存溢出", "heap"),
    ("证书过期 TLS", "certificate"),
    ("Kafka 消费延迟 lag", "kafka"),
    ("Elasticsearch 集群 red", "elastic"),
    ("Postgres 连接池耗尽", "postgres"),
    ("Nginx 502 upstream", "nginx"),
    ("磁盘清理临时文件", "temp"),
    ("内存泄漏排查步骤", "memory"),
    ("告警风暴 alert storm", "alert"),
]


def _sources_at_k(docs, k: int) -> list[str]:
    return [(d.metadata or {}).get("source", "") for d in docs[:k]]


def run_eval(*, hybrid: bool) -> dict:
    from backend.config import settings
    from backend.core.vector_store import safe_similarity_search

    settings.rag_hybrid_enabled = hybrid

    r1 = r3 = mrr_sum = 0
    n = len(GOLDEN_QUERIES)
    details = []

    for query, needle in GOLDEN_QUERIES:
        docs = safe_similarity_search(query, k=5)
        sources = _sources_at_k(docs, 5)
        hit_at = None
        for i, src in enumerate(sources, start=1):
            if needle.lower() in (src or "").lower():
                hit_at = i
                break
        r1 += 1 if hit_at == 1 else 0
        r3 += 1 if hit_at and hit_at <= 3 else 0
        mrr_sum += (1.0 / hit_at) if hit_at else 0.0
        details.append(
            {
                "query": query,
                "needle": needle,
                "hit_rank": hit_at,
                "top_source": sources[0] if sources else "",
            }
        )

    return {
        "hybrid_enabled": hybrid,
        "queries": n,
        "R_at_1": round(r1 / n, 4) if n else 0,
        "R_at_3": round(r3 / n, 4) if n else 0,
        "MRR": round(mrr_sum / n, 4) if n else 0,
        "details": details,
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--out",
        default=str(ROOT / "reports" / "rag_eval.json"),
    )
    args = parser.parse_args()

    vector_only = run_eval(hybrid=False)
    hybrid = run_eval(hybrid=True)

    payload = {
        "run_at": datetime.now(timezone.utc).isoformat(),
        "vector_only": vector_only,
        "hybrid": hybrid,
        "note": "needle 为 source 路径子串匹配；需 Milvus 已 ingest",
    }
    out = Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(payload, indent=2, ensure_ascii=False), encoding="utf-8")
    print(f"vector R@1={vector_only['R_at_1']} R@3={vector_only['R_at_3']} MRR={vector_only['MRR']}")
    print(f"hybrid R@1={hybrid['R_at_1']} R@3={hybrid['R_at_3']} MRR={hybrid['MRR']}")
    print(f"written -> {out}")


if __name__ == "__main__":
    main()
