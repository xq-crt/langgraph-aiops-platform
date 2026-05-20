"""Diagnosis eval case schema."""

from __future__ import annotations

from typing import List, Optional

from pydantic import BaseModel, Field


class DiagnosisEvalCase(BaseModel):
    id: str
    query: str
    expected_skill: str
    must_contain_keywords: List[str] = Field(default_factory=list)
    notes: Optional[str] = None


class DiagnosisEvalResult(BaseModel):
    case_id: str
    query: str
    expected_skill: str
    actual_skill: Optional[str] = None
    skill_hit: bool = False
    keyword_hits: List[str] = Field(default_factory=list)
    keyword_misses: List[str] = Field(default_factory=list)
    keyword_recall: float = 0.0
    total_tokens: int = 0
    tool_calls: int = 0
    elapsed_ms: int = 0
    error: Optional[str] = None


class DiagnosisEvalReport(BaseModel):
    run_at: str
    base_url: str
    total: int
    skill_accuracy: float
    avg_keyword_recall: float
    avg_tokens: float
    results: List[DiagnosisEvalResult]
