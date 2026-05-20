"""运维大盘接口."""

from typing import Any, Dict

from fastapi import APIRouter

from backend.core.host_metrics import collect_host_snapshot
from backend.schemas.common import ApiResponse

router = APIRouter(prefix="/dashboard", tags=["dashboard"])


@router.get(
    "/host",
    summary="本机资源快照（大盘轮询）",
    description="返回 CPU / 内存 / 磁盘结构化指标, 供前端 Chart.js 轮询.",
)
async def host_snapshot() -> ApiResponse[Dict[str, Any]]:
    from backend.config import settings

    data = collect_host_snapshot()
    data["redis_memory_enabled"] = settings.rag_chat_memory_enabled
    return ApiResponse.success(data=data)
