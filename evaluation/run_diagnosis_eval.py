#!/usr/bin/env python3
"""Run diagnosis agent offline eval against live API (SSE)."""

from __future__ import annotations

import argparse
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

import httpx

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from evaluation.schema import DiagnosisEvalCase, DiagnosisEvalReport, DiagnosisEvalResult


def load_cases(path: Path) -> list[DiagnosisEvalCase]:
    cases: list[DiagnosisEvalCase] = []
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line:
            continue
        cases.append(DiagnosisEvalCase.model_validate_json(line))
    return cases


def run_case(base_url: str, case: DiagnosisEvalCase, timeout: float) -> DiagnosisEvalResult:
    url = f"{base_url.rstrip('/')}/api/v1/aiops/diagnose"
    actual_skill = None
    report = ""
    total_tokens = 0
    tool_calls = 0
    elapsed_ms = 0
    error = None

    try:
        with httpx.Client(timeout=timeout) as client:
            with client.stream(
                "POST",
                url,
                json={"query": case.query, "session_id": f"eval-{case.id}"},
                headers={"Accept": "text/event-stream"},
            ) as resp:
                resp.raise_for_status()
                for line in resp.iter_lines():
                    if not line or not line.startswith("data:"):
                        continue
                    raw = line[5:].strip()
                    if not raw:
                        continue
                    try:
                        ev = json.loads(raw)
                    except json.JSONDecodeError:
                        continue
                    etype = ev.get("type")
                    data = ev.get("data") or {}
                    if etype == "skill_selected":
                        actual_skill = data.get("skill") or data.get("skill_name")
                    elif etype == "report":
                        report = data.get("report") or report
                    elif etype == "usage_stats":
                        total_tokens = int(data.get("total_tokens") or total_tokens)
                        tool_calls = int(data.get("tool_calls") or tool_calls)
                        elapsed_ms = int(data.get("total_ms") or elapsed_ms)
                    elif etype == "error":
                        error = ev.get("message") or str(data)
    except Exception as e:
        error = f"{type(e).__name__}: {e}"

    text = (report or "").lower()
    hits = [kw for kw in case.must_contain_keywords if kw.lower() in text]
    misses = [kw for kw in case.must_contain_keywords if kw.lower() not in text]
    kw_recall = len(hits) / len(case.must_contain_keywords) if case.must_contain_keywords else 1.0

    return DiagnosisEvalResult(
        case_id=case.id,
        query=case.query,
        expected_skill=case.expected_skill,
        actual_skill=actual_skill,
        skill_hit=actual_skill == case.expected_skill,
        keyword_hits=hits,
        keyword_misses=misses,
        keyword_recall=kw_recall,
        total_tokens=total_tokens,
        tool_calls=tool_calls,
        elapsed_ms=elapsed_ms,
        error=error,
    )


def main() -> None:
    parser = argparse.ArgumentParser(description="Diagnosis agent eval (SSE)")
    parser.add_argument("--base-url", default="http://127.0.0.1:9900")
    parser.add_argument(
        "--cases",
        default=str(ROOT / "data" / "diagnosis_eval_cases.jsonl"),
    )
    parser.add_argument(
        "--out",
        default=str(ROOT / "reports" / "diagnosis_eval_latest.json"),
    )
    parser.add_argument("--timeout", type=float, default=300.0)
    parser.add_argument("--limit", type=int, default=0, help="Max cases (0=all)")
    args = parser.parse_args()

    cases = load_cases(Path(args.cases))
    if args.limit > 0:
        cases = cases[: args.limit]

    results: list[DiagnosisEvalResult] = []
    for i, case in enumerate(cases, 1):
        print(f"[{i}/{len(cases)}] {case.id} ...", flush=True)
        results.append(run_case(args.base_url, case, args.timeout))

    skill_hits = sum(1 for r in results if r.skill_hit)
    report = DiagnosisEvalReport(
        run_at=datetime.now(timezone.utc).isoformat(),
        base_url=args.base_url,
        total=len(results),
        skill_accuracy=skill_hits / len(results) if results else 0.0,
        avg_keyword_recall=sum(r.keyword_recall for r in results) / len(results) if results else 0.0,
        avg_tokens=sum(r.total_tokens for r in results) / len(results) if results else 0.0,
        results=results,
    )

    out_path = Path(args.out)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(report.model_dump_json(indent=2), encoding="utf-8")
    print(
        f"Done: skill_accuracy={report.skill_accuracy:.1%} "
        f"keyword_recall={report.avg_keyword_recall:.1%} -> {out_path}"
    )


if __name__ == "__main__":
    main()
