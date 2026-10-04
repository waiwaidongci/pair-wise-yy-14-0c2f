import type { ComponentVersion } from "../types";
import { VersionBadge } from "./VersionBadge";

interface Props {
  versions: ComponentVersion[];
  onSelect: (componentId: string) => void;
}

function fmtTime(ts: number): string {
  return new Date(ts).toLocaleString("zh-CN", { hour12: false });
}

/**
 * 构件清单：同一构件的当前值 / 冲突版本 / 历史版本分开展示，
 * 截面或榫卯类型变更后修缮建议立即标记失效。
 */
export function ComponentList({ versions, onSelect }: Props) {
  if (versions.length === 0) {
    return <p className="empty">当前筛选条件下没有构件版本。</p>;
  }
  return (
    <div className="version-list">
      {versions.map((v) => (
        <article key={v.id} className="version-card">
          <div className="version-card-head">
            <h3>{v.code}</h3>
            <VersionBadge status={v.status} />
          </div>
          <p className="version-meta">
            {v.building} · {v.woodType} · {v.tenonType} · 截面 {v.sectionW}×{v.sectionH}mm
          </p>
          <p className="version-disease">
            病害：{v.disease || "—"}；变形：{v.deformation || "—"}
          </p>
          <p className={v.suggestionValid ? "version-suggestion" : "version-suggestion invalid"}>
            修缮建议：
            {v.suggestionValid ? (
              v.suggestion || "—"
            ) : (
              <>
                <span className="invalid-tag">已失效</span>
                截面或榫卯类型已变更，原建议「{v.suggestion}」不再适用，需重新评估
              </>
            )}
          </p>
          <div className="version-card-foot">
            <span className="version-surveyor">
              {v.surveyor} · 测量于 {fmtTime(v.measuredAt)}
            </span>
            <button className="link-btn" onClick={() => onSelect(v.componentId)}>
              复测此构件
            </button>
          </div>
        </article>
      ))}
    </div>
  );
}
