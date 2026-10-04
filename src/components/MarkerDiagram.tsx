import type { ComponentVersion } from "../types";

/**
 * 病害标记图：按当前版本的截面尺寸按比例绘制，标记坐标随版本联动。
 * 截面复测后，标记位置必须仍落在新截面内（校验在提交时拦截）。
 */
export function MarkerDiagram({ version }: { version: ComponentVersion }) {
  const W = 360;
  const H = 300;
  const pad = 30;
  const drawW = W - pad * 2;
  const drawH = H - pad * 2;

  const scale = Math.min(drawW / version.sectionW, drawH / version.sectionH);
  const rectW = version.sectionW * scale;
  const rectH = version.sectionH * scale;
  const ox = pad + (drawW - rectW) / 2;
  const oy = pad + (drawH - rectH) / 2;

  // 标记坐标（mm，原点左下）→ SVG 坐标
  const mx = ox + version.markerX * scale;
  const my = oy + rectH - version.markerY * scale;

  const outOfBounds =
    version.markerX < 0 ||
    version.markerX > version.sectionW ||
    version.markerY < 0 ||
    version.markerY > version.sectionH;

  return (
    <div className="marker-diagram">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="病害标记图">
        <rect x={ox} y={oy} width={rectW} height={rectH} fill="#fbfdff" stroke="#854d0e" strokeWidth={2} />
        {/* 尺寸标注 */}
        <text x={ox + rectW / 2} y={oy - 8} textAnchor="middle" fontSize="12" fill="#64748b">
          {version.sectionW}mm
        </text>
        <text
          x={ox - 10}
          y={oy + rectH / 2}
          textAnchor="middle"
          fontSize="12"
          fill="#64748b"
          transform={`rotate(-90 ${ox - 10} ${oy + rectH / 2})`}
        >
          {version.sectionH}mm
        </text>
        {/* 病害标记 */}
        <circle cx={mx} cy={my} r={9} fill="#dc2626" stroke="#fff" strokeWidth={2} />
        <circle cx={mx} cy={my} r={15} fill="none" stroke="#dc2626" strokeWidth={1.5} opacity={0.5} />
        <text x={mx + 16} y={my + 4} fontSize="12" fill="#dc2626">
          {version.disease || "病害点"}
        </text>
        {outOfBounds && (
          <text x={W / 2} y={H - 8} textAnchor="middle" fontSize="12" fill="#dc2626">
            ⚠ 标记坐标超出截面范围
          </text>
        )}
      </svg>
      <p className="marker-caption">
        {version.code} · 截面 {version.sectionW}×{version.sectionH}mm · 标记 (
        {version.markerX}, {version.markerY})mm
      </p>
    </div>
  );
}
