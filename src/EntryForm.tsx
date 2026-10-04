import { useMemo, useState } from "react";
import { BUILDINGS, COMPONENT_ROLES, DEFECT_KINDS, JOINT_TYPES, SurveyDraft } from "./types";
import { Store } from "./store";
import { blankDraft, draftFromVersion, emptyMark, pairDraftOf } from "./draftFactory";
import { FieldErrors, fmtDT } from "./domain";

interface Props {
  store: Store;
}

/** 复测录入：截面、榫卯类型、病害标记坐标同属一个待提交版本；
 *  支持两名测绘员同时提交同一构件（平行草稿，按测量时间仲裁）。 */
export function EntryForm({ store }: Props) {
  const { state, dispatch, submitDrafts } = store;
  const currentBuilding = state.filter.building;

  const [primaryId, setPrimaryId] = useState<string | null>(null);
  const [pairMode, setPairMode] = useState(false);
  const [errorsById, setErrorsById] = useState<Record<string, FieldErrors>>({});

  const primary = state.drafts.find((d) => d.id === primaryId) ?? null;
  const pair = pairMode && primary ? state.drafts.find((d) => d.pairId === primary.id) ?? null : null;

  const currentOfTarget = useMemo(() => {
    if (!primary) return null;
    return (
      state.versions.find(
        (v) => v.componentId === primary.componentId.trim() && v.building === primary.building && v.status === "active"
      ) ?? null
    );
  }, [primary, state.versions]);

  function startNew() {
    const d = blankDraft(currentBuilding);
    dispatch({ type: "upsertDraft", draft: d });
    setPrimaryId(d.id);
    setPairMode(false);
    setErrorsById({});
  }

  function startResume(componentId: string) {
    const v = state.versions.find((x) => x.componentId === componentId && x.status === "active") ?? null;
    const d = draftFromVersion(v, currentBuilding);
    dispatch({ type: "upsertDraft", draft: d });
    setPrimaryId(d.id);
    setPairMode(false);
    setErrorsById({});
  }

  function update(patch: Partial<SurveyDraft>, target: SurveyDraft) {
    dispatch({ type: "upsertDraft", draft: { ...target, ...patch, saveFailed: false, saveError: undefined } });
  }

  function updateShared(patch: Partial<SurveyDraft>) {
    if (!primary) return;
    update(patch, primary);
    if (pair) {
      // 平行草稿共享构件截面/榫卯复测数据，仅测量时间与测绘员各自填写
      const { surveyor: _s, measuredAt: _m, repairAdvice: _a, ...shared } = patch;
      void _s;
      void _m;
      void _a;
      if (Object.keys(shared).length > 0) update(shared, pair);
    }
  }

  function togglePair(on: boolean) {
    if (!primary) return;
    if (on) {
      const p = pairDraftOf(primary);
      dispatch({ type: "upsertDraft", draft: p });
    } else if (pair) {
      dispatch({ type: "removeDraft", id: pair.id });
    }
    setPairMode(on);
  }

  function doSubmit() {
    if (!primary) return;
    const targets = [primary, pair].filter((d): d is SurveyDraft => Boolean(d));
    const errs: Record<string, FieldErrors> = {};
    targets.forEach((d) => {
      const r = store.validate(d);
      if (!r.valid) errs[d.id] = r.errors;
    });
    setErrorsById(errs);
    if (Object.keys(errs).length > 0) return;
    submitDrafts(targets);
  }

  const buildingComponents = state.versions.filter((v) => v.building === currentBuilding && v.status === "active");

  return (
    <section className="panel entry-panel">
      <div className="heading">
        <div>
          <p>同一构件版本</p>
          <h2>复测录入与提交</h2>
        </div>
        {!primary && <button className="primary" onClick={startNew}>新建复测版本</button>}
      </div>

      {!primary ? (
        <div className="entry-start">
          <p className="muted">截面、榫卯类型、病害标记坐标将作为同一版本一起校验，通过后才更新当前值并重算关系视图。</p>
          <div className="resume-list">
            <span>或基于当前值复测：</span>
            {buildingComponents.map((v) => (
              <button key={v.id} className="link-btn" onClick={() => startResume(v.componentId)}>
                {v.componentId}（{v.jointType} {v.section.width}×{v.section.height}）
              </button>
            ))}
          </div>
        </div>
      ) : (
        <>
          {currentOfTarget && (
            <div className="base-note">
              复测基线：{currentOfTarget.id} · {currentOfTarget.jointType} · {currentOfTarget.section.width}×
              {currentOfTarget.section.height}mm · 测于 {fmtDT(currentOfTarget.measuredAt)}
            </div>
          )}

          <div className="field-grid">
            <label>
              <span>建筑名称</span>
              <select value={primary.building} onChange={(e) => updateShared({ building: e.target.value })}>
                {BUILDINGS.map((b) => (
                  <option key={b}>{b}</option>
                ))}
              </select>
            </label>
            <label>
              <span>构件编号</span>
              <input
                value={primary.componentId}
                placeholder="如 ZD-B01"
                onChange={(e) => updateShared({ componentId: e.target.value })}
              />
              <FieldErr msg={errorsById[primary.id]?.componentId} />
            </label>
            <label>
              <span>构件类型</span>
              <select value={primary.role} onChange={(e) => updateShared({ role: e.target.value as SurveyDraft["role"] })}>
                {COMPONENT_ROLES.map((r) => (
                  <option key={r}>{r}</option>
                ))}
              </select>
            </label>
            <label>
              <span>木材种类</span>
              <input value={primary.wood} onChange={(e) => updateShared({ wood: e.target.value })} />
              <FieldErr msg={errorsById[primary.id]?.wood} />
            </label>
            <label>
              <span>榫卯类型</span>
              <select
                value={primary.jointType}
                onChange={(e) => updateShared({ jointType: e.target.value as SurveyDraft["jointType"] })}
              >
                <option value="">请选择</option>
                {JOINT_TYPES.map((j) => (
                  <option key={j}>{j}</option>
                ))}
              </select>
              <FieldErr msg={errorsById[primary.id]?.jointType} />
            </label>
            <label>
              <span>变形情况</span>
              <input value={primary.deformation} onChange={(e) => updateShared({ deformation: e.target.value })} />
            </label>
          </div>

          <div className="section-row">
            <label>
              <span>截面宽 mm</span>
              <input value={primary.widthText} onChange={(e) => updateShared({ widthText: e.target.value })} />
            </label>
            <label>
              <span>截面高 mm</span>
              <input value={primary.heightText} onChange={(e) => updateShared({ heightText: e.target.value })} />
            </label>
            <label>
              <span>构件长 mm</span>
              <input value={primary.lengthText} onChange={(e) => updateShared({ lengthText: e.target.value })} />
            </label>
          </div>
          <FieldErr msg={errorsById[primary.id]?.section || errorsById[primary.id]?.length} block />

          <MarkEditor target={primary} store={store} errors={errorsById[primary.id]?.marks} onChangeShared={updateShared} />

          <div className="pair-toggle">
            <label className="inline">
              <input type="checkbox" checked={pairMode} onChange={(e) => togglePair(e.target.checked)} />
              两名测绘员同时提交该构件
            </label>
            {pairMode && <span className="muted">两人独立填写测绘员与测量时间；时间较晚且校验通过者成为当前值，另一版留作冲突。</span>}
          </div>

          <div className={pairMode ? "surveyor-grid two" : "surveyor-grid"}>
            <SurveyorBox
              tag="测绘员甲"
              draft={primary}
              errors={errorsById[primary.id]}
              onChange={(patch) => update(patch, primary)}
            />
            {pairMode && pair && (
              <SurveyorBox
                tag="测绘员乙"
                draft={pair}
                errors={errorsById[pair.id]}
                onChange={(patch) => update(patch, pair)}
              />
            )}
          </div>

          {Object.values(errorsById).some((e) => e.consistency?.length) && (
            <ul className="error-box">
              {Object.values(errorsById).flatMap((e) => (e.consistency ?? []).map((c, i) => <li key={i}>{c}</li>))}
            </ul>
          )}

          <div className="entry-actions">
            <button
              onClick={() => {
                dispatch({ type: "removeDraft", id: primary.id });
                if (pair) dispatch({ type: "removeDraft", id: pair.id });
                setPrimaryId(null);
                setPairMode(false);
              }}
            >
              暂存并关闭
            </button>
            <span className="muted">草稿实时保存在本机，保存提交失败也不会丢失</span>
            <button className="primary" onClick={doSubmit}>
              {pairMode ? "同时提交两版并校验" : "校验通过后提交"}
            </button>
          </div>
        </>
      )}
    </section>
  );
}

function FieldErr({ msg, block }: { msg?: string; block?: boolean }) {
  if (!msg) return null;
  return <small className={block ? "field-err block" : "field-err"}>{msg}</small>;
}

function MarkEditor({
  target,
  errors,
  onChangeShared,
}: {
  target: SurveyDraft;
  store: Store;
  errors?: FieldErrors["marks"];
  onChangeShared: (patch: Partial<SurveyDraft>) => void;
}) {
  const marks = target.marks;

  function setMark(i: number, patch: Partial<SurveyDraft["marks"][number]>) {
    const next = marks.map((m, idx) => (idx === i ? { ...m, ...patch } : m));
    onChangeShared({ marks: next });
  }

  return (
    <div className="marks-edit">
      <div className="sub-heading">
        <h3>病害标记（随本版本坐标一起校验）</h3>
        <button onClick={() => onChangeShared({ marks: [...marks, emptyMark(target.componentId)] })}>+ 添加标记</button>
      </div>
      <div className="mark-rows">
        {marks.map((m, i) => (
          <div className="mark-row" key={m.markId}>
            <code>{m.markId}</code>
            <label>
              <span>x%</span>
              <input value={m.xText} onChange={(e) => setMark(i, { xText: e.target.value })} />
              {errors?.[i]?.x && <small className="field-err">{errors[i].x}</small>}
            </label>
            <label>
              <span>y%</span>
              <input value={m.yText} onChange={(e) => setMark(i, { yText: e.target.value })} />
              {errors?.[i]?.y && <small className="field-err">{errors[i].y}</small>}
            </label>
            <label>
              <span>病害</span>
              <select value={m.kind} onChange={(e) => setMark(i, { kind: e.target.value as SurveyDraft["marks"][number]["kind"] })}>
                <option value="">选择</option>
                {DEFECT_KINDS.map((k) => (
                  <option key={k}>{k}</option>
                ))}
              </select>
            </label>
            <label className="grow">
              <span>标记所属构件（复测后可能移件）</span>
              <input value={m.onComponentId} onChange={(e) => setMark(i, { onComponentId: e.target.value })} />
              {errors?.[i]?.onComponentId && <small className="field-err">{errors[i].onComponentId}</small>}
            </label>
            <label className="grow">
              <span>说明</span>
              <input value={m.note} onChange={(e) => setMark(i, { note: e.target.value })} />
            </label>
            <button
              className="danger-btn"
              onClick={() => onChangeShared({ marks: marks.filter((_, idx) => idx !== i) })}
            >
              删
            </button>
          </div>
        ))}
        {marks.length === 0 && <p className="muted">无病害标记。</p>}
      </div>
    </div>
  );
}

function SurveyorBox({
  tag,
  draft,
  errors,
  onChange,
}: {
  tag: string;
  draft: SurveyDraft;
  errors?: FieldErrors;
  onChange: (patch: Partial<SurveyDraft>) => void;
}) {
  return (
    <div className="surveyor-box">
      <h4>{tag}</h4>
      <div className="field-grid">
        <label>
          <span>测绘员</span>
          <input value={draft.surveyor} onChange={(e) => onChange({ surveyor: e.target.value })} />
          {errors?.surveyor && <small className="field-err">{errors.surveyor}</small>}
        </label>
        <label>
          <span>测量时间</span>
          <input type="datetime-local" value={draft.measuredAt} onChange={(e) => onChange({ measuredAt: e.target.value })} />
          {errors?.measuredAt && <small className="field-err">{errors.measuredAt}</small>}
        </label>
        <label className="full">
          <span>修缮建议（截面或榫卯类型变更后，旧建议已失效，需重新编制）</span>
          <input
            value={draft.repairAdvice}
            placeholder="如：端部注胶加钢夹板"
            onChange={(e) => onChange({ repairAdvice: e.target.value })}
          />
        </label>
      </div>
      {draft.saveFailed && <small className="field-err block">{draft.saveError}</small>}
    </div>
  );
}
