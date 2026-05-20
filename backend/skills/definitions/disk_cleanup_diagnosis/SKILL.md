---
name: disk_cleanup_diagnosis
display_name: 磁盘空间扫描与清理建议
description: 磁盘快满、释放空间、扫描大文件/大目录、清理建议（只读扫描，不自动删除）
triggers:
  - 磁盘清理
  - 清理磁盘
  - 释放空间
  - 扫描磁盘
  - 大文件占用
  - 哪个文件夹最大
  - C 盘满了
  - D 盘空间不足
  - disk cleanup
  - large files
  - 清理 C 盘
  - 腾空间
allowed_tools:
  - kb_search_sop
  - clock_now
  - host_disk_partitions
  - host_scan_dir_usage
  - host_find_large_files
  - host_cleanup_hints
risk_level: low
---

# 磁盘空间扫描与清理建议 Playbook

## 推荐诊断计划（Planner 参考）

1. **先本机证据**：`host_disk_partitions` 看各分区使用率与剩余空间
2. **再定位占用**：`host_scan_dir_usage` 和/或 `host_find_large_files` 找 Top 目录与大文件
3. **可选知识库**：`kb_search_sop`，query **必须包含**「磁盘 / 空间不足 / 清理 / no space / C盘」等词；
   示例：`磁盘使用率告警 清理 Temp 大文件 du find`
   **禁止**只搜「类似问题」「处理经验」等泛化词
4. **汇总结论**：`host_cleanup_hints` + 人工确认步骤（路径、收益、风险）

## 适用场景
- 用户关心 **谁占满了盘、怎么腾空间、清理清单**，而非仅「磁盘是否告警」
- `no space left on device`、C/D 盘剩余个位数百分比
- 需要目录 TopN、大文件列表、可人工执行的清理步骤

**不适用**：纯 CPU/内存卡顿、无磁盘空间诉求 → `host_resource_diagnosis`；网络/Docker 专项 → 对应 Skill。

## Phase 1: 分区快照（必做）
1. 调 `host_disk_partitions` 确认哪块盘告急、使用率与剩余 GB
2. 确定扫描根路径（默认系统盘，如 `C:\`）

## Phase 2: 目录占用扫描
1. 调 `host_scan_dir_usage`（`max_depth=2`, `top_n=15`）定位 Top 目录
2. 对可疑子路径可再扫一层（勿无限递归）

## Phase 3: 大文件定位
1. 调 `host_find_large_files`（`min_size_mb=100` 或按场景调整）
2. 结合 Phase 2 归因：是日志、缓存、下载还是开发产物

## Phase 4: 清理建议（只读）
1. 调 `host_cleanup_hints` 对照常见可清理项
2. 可选 `kb_search_sop`，query 示例：`磁盘空间不足 C盘清理 Temp 日志 大文件`
3. 输出 **人工确认步骤**：每条写清路径、预估收益、风险（禁止声称已自动删除）

## 纪律
- **只读**：不得调用写操作或暗示已执行删除
- 扫描超时/未扫完须在报告中说明
- 禁止编造未出现在工具输出中的路径与大小
