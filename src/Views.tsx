import { useMemo, useState } from "react";
import { buildRelationGraph, fmtDT, liveMarks } from "./domain";
import { ComponentVersion, JOINT_TYPES, JointType } from "./types";
import { Store } from "./store";

/* -------------------------------- 筛选 + 指标 -------------------------------- */

export function FilterBar({ store }: { store: Store }) {
  const { state, dispatch } = store;
  const counts = useMemo(() => {
    const inBuilding = state.versions.filter((v) => v.building === state.filter.building);
    return {
      current: inBuilding.filter((v) => v.status === "active").length,
      conflict: inBuilding.filter((v) => v.status === "conflict").length,
      history: inBuilding.filter((v) => v.status === "history").length,
      marks: liveMarks(state.versions, state.filter.building).length,
      adviceStale: inBuilding.filter((v) => v.status === "active" && !v.adviceValid).length,
    };
  }, [state.versions, state.filter.building]);

  return (
    <section className="panel filter-bar">
      <div className="filter-line">
        <div className="seg">
          {["正殿", "山门"].map((b) => (
            <button
              key={b}
              className={state.filter.building === b ? "seg-on" : ""}
              onClick={() => dispatch({ type: "setFilter", filter: { building: b } })}
            >
              {b}
            </button>
          ))}
        </div>
        <div className="seg">
          <button
            className={state.filter.jointType === "" ? "seg-on" : ""}
            onClick={() => dispatch({ type: "setFilter", filter: { jointType: "" } })}
          >
            全部榫卯
          </button>
          {JOINT_TYPES.map((j: JointType) => (
            <button
              key={j}
              className={state.filter.jointType === j ? "seg-on" : ""}
              onClick={() => dispatch({ type: "setFilter", filter: { jointType: j } })}
            >
              {j}
            </button>
          ))}
        </div>
      </div>
      <div className="tab-line">
        {(
          [
            ["current", `当前值 ${counts.current}`],
            ["conflict", `冲突版本 ${counts.conflict}`],
            ["history", `历史版本 ${counts.history}`],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            className={state.filter.tab === key ? "tab-on" : ""}
            onClick={() => dispatch({ type: "setFilter", filter: { tab: key } })}
          >
            {label}
          </button>
        ))}
        <span className="metric-inline">病害点 {counts.marks} · 建议待编制 {counts.adviceStale}</span>
      </div>
    </section>
  );
}

/* -------------------------------- 构件清单 -------------------------------- */

export function ComponentList({ store }: { store: Store }) {
  const { state, dispatch } = store;
  const rows = state.versions
    .filter(
      (v) =>
        v.building === state.filter.building &&
        v.status === state.filter.tab &&
        (state.filter.jointType === "" || v.jointType === state.filter.jointType)
    )
    .sort((a, b) => a.componentId.localeCompare(b.componentId) || +new Date(b.measuredAt) - +new Date(a.measuredAt));

  const [selected, setSelected] = useState<string | null>(null);

  return (
    <section className="panel">
      <div className="heading">
        <div>
          <p>{state.filter.building} · {state.filter.jointType || "全部榫卯"}</p>
          <h2>
            构件清单 ——{" "}
            {state.filter.tab === "current" ? "当前值" : state.filter.tab === "conflict" ? "冲突版本" : "历史版本"}
          </h2>
        </div>
      </div>
      {rows.length === 0 ? (
        <p className="muted">该筛选下没有{state.filter.tab === "current" ? "当前值" : state.filter.tab === "conflict" ? "冲突" : "历史"}版本。</p>
      ) : (
        <div className="version-cards">
          {rows.map((v) => (
            <article
              key={v.id}
              className={`v-card ${selected === v.id ? "sel" : ""} status-${v.status}`}
              onClick={() => setSelected((s) => (s === v.id ? null : v.id))}
            >
              <div className="v-card-head">
                <strong>{v.componentId}</strong>
                <StatusTag v={v} />
              </div>
              <p className="v-line">
                {v.role} · {v.wood} · <b>{v.jointType}</b> · 截面 {v.section.width}×{v.section.height}mm · L{v.length}
              </p>
              <p className="v-line muted">
                {v.surveyor} 测于 {fmtDT(v.measuredAt)} · 提交 {fmtDT(v.submittedAt)}
              </p>
              {!v.adviceValid && (
                <p className="stale-advice">
                  ⚠ 修缮建议已失效{v.repairAdviceNote ? `：${v.repairAdviceNote}` : "（截面/榫卯类型变更）"}
                  {v.repairAdvice && <>；旧建议：{v.repairAdvice}</>}
                </p>
              )}
              {v.adviceValid && v.repairAdvice && <p className="advice-ok">修缮建议：{v.repairAdvice}</p>}
              {v.status === "active" && !v.adviceValid && <AdviceEditor store={store} v={v} />}
              {selected === v.id && (
                <div className="v-detail">
                  <span>变形：{v.deformation || "—"}</span>
                  <span>版本ID：{v.id}</span>
                  {v.baseVersionId && <span>复测基线：{v.baseVersionId}</span>}
                  {v.marks.length > 0 && (
                    <ul>
                      {v.marks.map((m) => (
                        <li key={m.id}>
                          {m.id} · {m.kind} · ({m.x}%,{m.y}%) · 所属 {m.onComponentId}
                          {m.note ? ` · ${m.note}` : ""}
                        </li>
                      ))}
                    </ul>
                  )}
                  {v.status === "conflict" && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        dispatch({
                          type: "repairAdvice",
                          versionId: v.id,
                          advice: v.repairAdvice,
                        });
                      }}
                      title="冲突版本仅供留存核对，不会覆盖当前值"
                    >
                      仅留存核对（不覆盖当前值）
                    </button>
                  )}
                </div>
              )}
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

function StatusTag({ v }: { v: ComponentVersion }) {
  if (v.status === "active") return <span className="tag tag-active">当前值</span>;
  if (v.status === "history") return <span className="tag tag-history">历史</span>;
  return (
    <span className="tag tag-conflict" title={v.conflictReason === "validation-failed" ? "校验未通过" : "测量时间较早"}>
      冲突{v.conflictReason === "validation-failed" ? "·校验未过" : "·时间较早"}
    </span>
  );
}

function AdviceEditor({ store, v }: { store: Store; v: ComponentVersion }) {
  const [text, setText] = useState(v.repairAdvice ?? "");
  const [open, setOpen] = useState(false);
  if (!open) {
    return (
      <button className="link-btn" onClick={(e) => { e.stopPropagation(); setOpen(true); }}>
        重新编制修缮建议
      </button>
    );
  }
  return (
    <div className="advice-edit" onClick={(e) => e.stopPropagation()}>
      <input value={text} onChange={(e) => setText(e.target.value)} placeholder="编制新的修缮建议" />
      <button
        className="primary"
        disabled={!text.trim()}
        onClick={() => {
          store.dispatch({ type: "repairAdvice", versionId: v.id, advice: text.trim() });
          setOpen(false);
        }}
      >
        生效
      </button>
    </div>
  );
}

/* -------------------------------- 尺寸记录表 -------------------------------- */

export function DimensionTable({ store }: { store: Store }) {
  const { state } = store;
  const rows = state.versions
    .filter(
      (v) =>
        v.building === state.filter.building &&
        v.status === "active" &&
        (state.filter.jointType === "" || v.jointType === state.filter.jointType)
    )
    .sort((a, b) => a.componentId.localeCompare(b.componentId));

  return (
    <section className="panel">
      <div className="heading">
        <div>
          <p>仅取当前值版本</p>
          <h2>尺寸记录表</h2>
        </div>
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>构件编号</th>
              <th>类型</th>
              <th>木材</th>
              <th>榫卯类型</th>
              <th>截面宽(mm)</th>
              <th>截面高(mm)</th>
              <th>长度(mm)</th>
              <th>测量时间</th>
              <th>版本</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((v) => (
              <tr key={v.id}>
                <td>{v.componentId}</td>
                <td>{v.role}</td>
                <td>{v.wood}</td>
                <td>{v.jointType}</td>
                <td>{v.section.width}</td>
                <td>{v.section.height}</td>
                <td>{v.length}</td>
                <td>{fmtDT(v.measuredAt)}</td>
                <td><code title={v.id}>{v.id.slice(-6)}</code></td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={9} className="muted">无当前值记录</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

/* -------------------------------- 病害标记图 -------------------------------- */

const KIND_COLOR: Record<string, string> = {
  开裂: "#b91c1c",
  糟朽: "#854d0e",
  变形: "#475569",
  虫蛀: "#0f766e",
};

export function DefectMap({ store }: { store: Store }) {
  const { state } = store;
  const current = state.versions
    .filter(
      (v) =>
        v.building === state.filter.building &&
        v.status === "active" &&
        (state.filter.jointType === "" || v.jointType === state.filter.jointType)
    )
    .sort((a, b) => a.componentId.localeCompare(b.componentId));
  const marks = liveMarks(state.versions, state.filter.building).filter((m) =>
    current.some((v) => v.componentId === m.onComponentId)
  );

  return (
    <section className="panel">
      <div className="heading">
        <div>
          <p>坐标随复测版本更新</p>
          <h2>病害标记图（{state.filter.building}）</h2>
        </div>
        <div className="legend">
          {Object.entries(KIND_COLOR).map(([k, c]) => (
            <span key={k}><i style={{ background: c }} />{k}</span>
          ))}
        </div>
      </div>
      <div className="defect-lanes">
        {current.map((v) => {
          const laneMarks = marks.filter((m) => m.onComponentId === v.componentId);
          return (
            <div className="lane" key={v.id}>
              <div className="lane-label">
                <strong>{v.componentId}</strong>
                <small>{v.role} · {v.jointType}</small>
              </div>
              <div className={`lane-bar role-${v.role}`}>
                <span className="lane-size">{v.section.width}×{v.section.height}</span>
                {laneMarks.map((m) => (
                  <i
                    key={m.id}
                    className="mark-dot"
                    style={{ left: `${m.x}%`, top: `${m.y}%`, background: KIND_COLOR[m.kind] }}
                    title={`${m.id} ${m.kind} (${m.x}%,${m.y}%)${m.note ? " " + m.note : ""}`}
                  >
                    <em>{m.id}</em>
                  </i>
                ))}
              </div>
            </div>
          );
        })}
        {current.length === 0 && <p className="muted">该筛选下无当前值构件。</p>}
      </div>
    </section>
  );
}

/* -------------------------------- 构件关系视图 -------------------------------- */

export function RelationView({ store }: { store: Store }) {
  const { state } = store;
  const graph = useMemo(
    () => buildRelationGraph(state.versions, state.filter.building),
    [state.versions, state.filter.building]
  );
  const pos = new Map(graph.nodes.map((n) => [n.componentId, n]));
  const W = 760;
  const H = 300;

  return (
    <section className="panel">
      <div className="heading">
        <div>
          <p>仅由当前值版本重算</p>
          <h2>构件关系视图（{state.filter.building}）</h2>
        </div>
        <code className="signature" title="当前值版本签名：复测被接收后变化，触发重算">
          sig: {graph.signature ? graph.signature.slice(0, 42) + (graph.signature.length > 42 ? "…" : "") : "（空）"}
        </code>
      </div>
      <svg className="relation-svg" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="构件关系图">
        {graph.edges.map((e, i) => {
          const a = pos.get(e.from);
          const b = pos.get(e.to);
          if (!a || !b) return null;
          return (
            <g key={i}>
              <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="#94a3b8" strokeWidth={2} strokeDasharray="6 4" />
              <text x={(a.x + b.x) / 2} y={(a.y + b.y) / 2 - 5} className="edge-label">
                {e.joint}
              </text>
            </g>
          );
        })}
        {graph.nodes.map((n) => (
          <g key={n.componentId} transform={`translate(${n.x},${n.y})`}>
            <rect
              x={-46}
              y={-22}
              width={92}
              height={44}
              rx={7}
              className={`node-rect role-${n.role}`}
            />
            <text x={0} y={-4} textAnchor="middle" className="node-text">
              {n.componentId}
            </text>
            <text x={0} y={14} textAnchor="middle" className="node-sub">
              {n.sectionText}
            </text>
          </g>
        ))}
        {graph.nodes.length === 0 && <text x={W / 2} y={H / 2} textAnchor="middle" className="node-sub">暂无当前值构件</text>}
      </svg>
      <p className="muted">
        边标注榫卯类型；复测版本通过校验并接收为当前值后，节点截面与连接关系立即按新值重算，冲突/历史版本不参与关系计算。
      </p>
    </section>
  );
}

/* ---------------------------- 提交结果 / 保存失败横幅 ---------------------------- */

export function CommitBanner({ store }: { store: Store }) {
  const { state, dispatch, retryPending } = store;

  if (state.pending) {
    return (
      <section className="panel banner banner-fail">
        <div>
          <strong>本地保存失败，未提交版本已保留（第 {state.pending.attempts} 次尝试）</strong>
          <p>{state.pending.lastError}</p>
          <ul>
            {(state.pending.results ?? []).map((r) => (
              <li key={r.draftId} className={`outcome-${r.kind}`}>
                {r.kind === "accepted" ? "✓" : r.kind === "conflict" ? "⚔" : "✕"} {r.message}
              </li>
            ))}
          </ul>
          <p className="muted">草稿仍保留在录入区，可修改后重试；页面重开也会带回。</p>
        </div>
        <div className="banner-actions">
          <button className="primary" onClick={retryPending}>重试保存</button>
        </div>
      </section>
    );
  }

  if (state.lastResults && state.lastResults.length > 0) {
    return (
      <section className="panel banner banner-ok">
        <div>
          <strong>本次提交结果</strong>
          <ul>
            {state.lastResults.map((r) => (
              <li key={r.draftId} className={`outcome-${r.kind}`}>
                {r.kind === "accepted" ? "✓" : r.kind === "conflict" ? "⚔" : "✕"} {r.message}
              </li>
            ))}
          </ul>
        </div>
        <div className="banner-actions">
          <button onClick={() => dispatch({ type: "clearResults" })}>知道了</button>
        </div>
      </section>
    );
  }
  return null;
}

/* -------------------------------- 设置条 -------------------------------- */

export function SettingsBar({ store }: { store: Store }) {
  const { state, setSettings, resetDemo } = store;
  return (
    <section className="panel settings-bar">
      <label className="inline">
        <input
          type="checkbox"
          checked={state.settings.forceFail}
          onChange={(e) => setSettings({ forceFail: e.target.checked })}
        />
        模拟本地保存失败（验证未提交版本保留与重试）
      </label>
      <button onClick={resetDemo}>恢复演示数据</button>
      <span className="muted">筛选条件与未提交草稿在页面重开后自动恢复。</span>
    </section>
  );
}
