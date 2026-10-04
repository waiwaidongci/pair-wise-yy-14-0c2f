import { TENON_TYPES, type DraftInput } from "./types";

/**
 * 复测数据一起校验：截面尺寸、榫卯类型、病害标记坐标必须同时满足要求，
 * 任一不通过则整版驳回，不更新当前值。
 */
export function validateDraft(d: DraftInput): string[] {
  const errors: string[] = [];

  if (!d.building.trim()) errors.push("建筑名称不能为空");
  if (!d.code.trim()) errors.push("构件编号不能为空");
  if (!d.woodType.trim()) errors.push("木材种类不能为空");

  if (!TENON_TYPES.includes(d.tenonType)) {
    errors.push("榫卯类型必须为：燕尾榫 / 透榫 / 半榫 / 箍头榫");
  }

  if (!(d.sectionW >= 50 && d.sectionW <= 800)) {
    errors.push("截面宽度应在 50–800mm 之间");
  }
  if (!(d.sectionH >= 50 && d.sectionH <= 1200)) {
    errors.push("截面高度应在 50–1200mm 之间");
  }
  if (d.sectionW > 0 && d.sectionH > 0) {
    const ratio = d.sectionH / d.sectionW;
    if (ratio > 4 || ratio < 0.4) {
      errors.push("截面高宽比异常（需在 0.4–4 之间），请核对复测尺寸");
    }
  }

  // 标记坐标与截面一起校验：截面改了，标记必须仍落在新截面范围内
  if (!Number.isFinite(d.markerX) || d.markerX < 0 || d.markerX > d.sectionW) {
    errors.push("病害标记 X 坐标超出截面宽度范围（0–截面宽）");
  }
  if (!Number.isFinite(d.markerY) || d.markerY < 0 || d.markerY > d.sectionH) {
    errors.push("病害标记 Y 坐标超出截面高度范围（0–截面高）");
  }

  if (!d.disease.trim()) errors.push("病害位置不能为空");
  if (!d.surveyor.trim()) errors.push("测绘员不能为空");
  if (!(d.measuredAt > 0)) errors.push("测量时间无效");

  return errors;
}
