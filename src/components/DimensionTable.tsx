import type { ComponentVersion } from "../types";
import { VersionBadge } from "./VersionBadge";

interface Props {
  versions: ComponentVersion[];
}

function fmtTime(ts: number): string {
  return new Date(ts).toLocaleString("zh-CN", { hour12: false });
}

/** 尺寸记录表：每个构件版本一行，按建筑 + 榫卯类型筛选后仍可区分状态 */
export function DimensionTable({ versions }: Props) {
  if (versions.length === 0) {
    return <p className="empty">当前筛选条件下没有尺寸记录。</p>;
  }
  return (
    <div className="table-wrap">
      <table className="dim-table">
        <thead>
          <tr>
            <th>构件编号</th>
            <th>建筑</th>
            <th>榫卯类型</th>
            <th>截面(mm)</th>
            <th>标记坐标</th>
            <th>病害位置</th>
            <th>测量时间</th>
            <th>测绘员</th>
            <th>状态</th>
          </tr>
        </thead>
        <tbody>
          {versions.map((v) => (
            <tr key={v.id}>
              <td>{v.code}</td>
              <td>{v.building}</td>
              <td>{v.tenonType}</td>
              <td>
                {v.sectionW}×{v.sectionH}
              </td>
              <td>
                ({v.markerX}, {v.markerY})
              </td>
              <td>{v.disease || "—"}</td>
              <td>{fmtTime(v.measuredAt)}</td>
              <td>{v.surveyor}</td>
              <td>
                <VersionBadge status={v.status} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
