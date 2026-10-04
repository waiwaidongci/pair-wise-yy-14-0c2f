import { edgeCompatible, NODE_POS } from "../store";
import type { ComponentVersion, RelationEdge } from "../types";

interface Props {
  building: string;
  versions: ComponentVersion[];
  relations: RelationEdge[];
  recalcNonce: number;
}

/**
 * 构件关系视图：单栋建筑的构件节点图。节点取当前版本，
 * 边的兼容性随当前版本重算——截面或榫卯类型一变，节点关系立即重算。
 */
export function RelationView({ building, versions, relations, recalcNonce }: Props) {
  const buildingVersions = versions.filter((v) => v.building === building);
  const currentOf = (id: string) =>
    versions.find((v) => v.componentId === id && v.status === "current");

  const buildingIds = new Set(buildingVersions.map((v) => v.componentId));
  const edges = relations.filter(
    (e) => buildingIds.has(e.from) && buildingIds.has(e.to)
  );

  const W = 560;
  const H = 460;

  return (
    <div className="relation-view">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="构件关系视图" key={recalcNonce}>
        {edges.map((e) => {
          const from = NODE_POS[e.from];
          const to = NODE_POS[e.to];
          if (!from || !to) return null;
          const { compatible } = edgeCompatible(e, currentOf);
          return (
            <g key={e.id}>
              <line
                x1={from.x}
                y1={from.y}
                x2={to.x}
                y2={to.y}
                stroke={compatible ? "#0f766e" : "#dc2626"}
                strokeWidth={compatible ? 3 : 2}
                strokeDasharray={compatible ? undefined : "6 4"}
              />
              <text
                x={(from.x + to.x) / 2}
                y={(from.y + to.y) / 2 - 6}
                textAnchor="middle"
                fontSize="11"
                fill={compatible ? "#0f766e" : "#dc2626"}
              >
                {e.joint}
                {compatible ? "" : "（不匹配）"}
              </text>
            </g>
          );
        })}
        {buildingVersions.map((v) => {
          const pos = NODE_POS[v.componentId];
          if (!pos) return null;
          return (
            <g key={v.componentId}>
              <rect
                x={pos.x - 70}
                y={pos.y - 26}
                width={140}
                height={52}
                rx={8}
                fill="#fff"
                stroke="#854d0e"
                strokeWidth={2}
              />
              <text x={pos.x} y={pos.y - 4} textAnchor="middle" fontSize="13" fontWeight="700">
                {v.code}
              </text>
              <text x={pos.x} y={pos.y + 14} textAnchor="middle" fontSize="11" fill="#64748b">
                {v.tenonType} · {v.sectionW}×{v.sectionH}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
