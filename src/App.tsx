import { useEffect, useMemo, useState } from "react";
import { ComponentList } from "./components/ComponentList";
import { DimensionTable } from "./components/DimensionTable";
import { MarkerDiagram } from "./components/MarkerDiagram";
import { RelationView } from "./components/RelationView";
import {
  buildNext,
  clearPersisted,
  getSimulateFail,
  loadState,
  persist,
  seedState,
  setSimulateFail,
} from "./store";
import type {
  ComponentVersion,
  DraftInput,
  PersistState,
  StatusFilter,
  TenonType,
} from "./types";
import { TENON_TYPES } from "./types";

const FILTERS_KEY = "mortise-survey-filters-v1";

interface FormState {
  building: string;
  code: string;
  woodType: string;
  tenonType: TenonType;
  sectionW: string;
  sectionH: string;
  disease: string;
  deformation: string;
  suggestion: string;
  markerX: string;
  markerY: string;
  surveyor: string;
  measuredAt: string;
}

const EMPTY_FORM: FormState = {
  building: "",
  code: "",
  woodType: "",
  tenonType: "透榫",
  sectionW: "",
  sectionH: "",
  disease: "",
  deformation: "",
  suggestion: "",
  markerX: "",
  markerY: "",
  surveyor: "",
  measuredAt: "",
};

function toLocalInput(ts: number): string {
  return new Date(ts).toISOString().slice(0, 16);
}

function loadFilters(): { building: string; tenon: string; tab: StatusFilter } {
  try {
    const raw = localStorage.getItem(FILTERS_KEY);
    if (raw) return JSON.parse(raw);
  } catch {
    /* ignore */
  }
  return { building: "all", tenon: "all", tab: "all" };
}

export default function App() {
  const [persisted, setPersisted] = useState<PersistState>(() => loadState());
  const [buildingFilter, setBuildingFilter] = useState(loadFilters().building);
  const [tenonFilter, setTenonFilter] = useState(loadFilters().tenon);
  const [statusTab, setStatusTab] = useState<StatusFilter>(loadFilters().tab);
  const [selectedId, setSelectedId] = useState<string>(
    () => loadState().versions.find((v) => v.status === "current")?.componentId ?? ""
  );
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [formErrors, setFormErrors] = useState<string[]>([]);
  const [pending, setPending] = useState<
    { key: string; draft: DraftInput; now: number; error: string }[]
  >([]);
  const [simulateFail, setSimulateFailState] = useState(getSimulateFail());
  const [recalcNonce, setRecalcNonce] = useState(0);
  const [message, setMessage] = useState<string | null>(null);
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(null);

  useEffect(() => {
    localStorage.setItem(
      FILTERS_KEY,
      JSON.stringify({ building: buildingFilter, tenon: tenonFilter, tab: statusTab })
    );
  }, [buildingFilter, tenonFilter, statusTab]);

  useEffect(() => {
    if (!message) return;
    const t = setTimeout(() => setMessage(null), 6000);
    return () => clearTimeout(t);
  }, [message]);

  const versions = persisted.versions;

  const buildings = useMemo(
    () => Array.from(new Set(versions.map((v) => v.building))),
    [versions]
  );

  const filtered = useMemo(() => {
    return versions.filter((v) => {
      if (buildingFilter !== "all" && v.building !== buildingFilter) return false;
      if (tenonFilter !== "all" && v.tenonType !== tenonFilter) return false;
      if (statusTab !== "all" && v.status !== statusTab) return false;
      return true;
    });
  }, [versions, buildingFilter, tenonFilter, statusTab]);

  const currents = useMemo(
    () => versions.filter((v) => v.status === "current"),
    [versions]
  );

  const metrics = useMemo(
    () => ({
      components: currents.length,
      diseases: currents.filter((v) => v.disease.trim()).length,
      tenons: new Set(currents.map((v) => v.tenonType)).size,
      todo: currents.filter((v) => !v.suggestionValid).length,
    }),
    [currents]
  );

  const selectedCurrent =
    currents.find((v) => v.componentId === selectedId) ??
    (buildingFilter !== "all"
      ? currents.find((v) => v.building === buildingFilter)
      : undefined) ??
    currents[0];

  const relationBuilding =
    buildingFilter !== "all" ? buildingFilter : buildings[0] ?? "";

  // -------------------------------------------------------------------------
  // 表单
  // -------------------------------------------------------------------------

  function selectComponent(componentId: string) {
    const v = versions.find(
      (x) => x.componentId === componentId && x.status === "current"
    );
    setSelectedId(componentId);
    setFormErrors([]);
    if (v) {
      setForm({
        building: v.building,
        code: v.code,
        woodType: v.woodType,
        tenonType: v.tenonType,
        sectionW: String(v.sectionW),
        sectionH: String(v.sectionH),
        disease: v.disease,
        deformation: v.deformation,
        suggestion: v.suggestion,
        markerX: String(v.markerX),
        markerY: String(v.markerY),
        surveyor: v.surveyor,
        measuredAt: toLocalInput(Date.now()),
      });
    }
  }

  function updateForm<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function draftFromForm(): DraftInput {
    return {
      componentId: selectedCurrent?.componentId ?? `c-${Date.now()}`,
      building: form.building.trim(),
      code: form.code.trim(),
      woodType: form.woodType.trim(),
      tenonType: form.tenonType,
      sectionW: Number(form.sectionW),
      sectionH: Number(form.sectionH),
      disease: form.disease.trim(),
      deformation: form.deformation.trim(),
      suggestion: form.suggestion.trim(),
      markerX: Number(form.markerX),
      markerY: Number(form.markerY),
      surveyor: form.surveyor.trim(),
      measuredAt: form.measuredAt ? Date.parse(form.measuredAt) : Date.now(),
    };
  }

  function applyCommit(
    draft: DraftInput,
    now: number,
    opts: { silent?: boolean; base?: PersistState } = {}
  ): { ok: boolean; next?: PersistState } {
    const base = opts.base ?? persisted;
    const result = buildNext(base, draft, now);
    if (!result.ok) {
      setFormErrors(result.errors);
      return { ok: false };
    }
    try {
      persist(result.next);
    } catch (err) {
      // 本地保存失败：保留未提交版本，可重试
      const key = `pending-${now}-${Math.random().toString(36).slice(2, 6)}`;
      setPending((p) => [
        ...p,
        { key, draft, now, error: err instanceof Error ? err.message : String(err) },
      ]);
      setMessage("本地保存失败：未提交版本已保留，可在下方重试");
      return { ok: false };
    }
    setPersisted(result.next);
    setLastSavedAt(Date.now());
    setPending((p) => p.filter((x) => x.now !== now));
    if (!opts.silent) {
      const rival = result.candidate.status === "conflict";
      setMessage(
        rival
          ? `已保存，但测量时间早于已有版本，留作冲突版本：${result.candidate.code}`
          : `已保存：${result.candidate.code} 已更新为当前值，构件关系视图已重算`
      );
    }
    return { ok: true, next: result.next };
  }

  function submit() {
    setFormErrors([]);
    const draft = draftFromForm();
    if (!draft.code) {
      setFormErrors(["构件编号不能为空"]);
      return;
    }
    applyCommit(draft, Date.now());
  }

  function retrySave(item: { key: string; draft: DraftInput; now: number }) {
    const result = buildNext(persisted, item.draft, item.now);
    if (!result.ok) {
      setPending((p) => p.filter((x) => x.key !== item.key));
      setFormErrors(result.errors);
      return;
    }
    try {
      persist(result.next);
    } catch (err) {
      setPending((p) =>
        p.map((x) =>
          x.key === item.key
            ? { ...x, error: err instanceof Error ? err.message : String(err) }
            : x
        )
      );
      return;
    }
    setPersisted(result.next);
    setLastSavedAt(Date.now());
    setPending((p) => p.filter((x) => x.key !== item.key));
    setMessage(`重试成功：${result.candidate.code} 已提交`);
  }

  function discardPending(key: string) {
    setPending((p) => p.filter((x) => x.key !== key));
  }

  /** 模拟两名测绘员同时提交同一构件：测量时间较晚且校验通过者接收，另一版留作冲突 */
  function simultaneousSubmit() {
    const target = selectedCurrent ?? currents[0];
    if (!target) return;
    const base: DraftInput = {
      componentId: target.componentId,
      building: target.building,
      code: target.code,
      woodType: target.woodType,
      tenonType: target.tenonType,
      sectionW: target.sectionW,
      sectionH: target.sectionH,
      disease: target.disease,
      deformation: target.deformation,
      suggestion: target.suggestion,
      markerX: target.markerX,
      markerY: target.markerY,
      surveyor: "",
      measuredAt: 0,
    };
    const now = Date.now();
    const earlier: DraftInput = {
      ...base,
      sectionW: target.sectionW - 5,
      surveyor: "王测绘",
      measuredAt: now - 3000,
    };
    const later: DraftInput = {
      ...base,
      sectionW: target.sectionW + 10,
      surveyor: "赵测绘",
      measuredAt: now + 2000,
    };
    // 两版连续提交：后一版必须在前一版结果的基础上比对测量时间
    const r1 = applyCommit(earlier, now, { silent: true });
    const r2 = r1.ok
      ? applyCommit(later, now + 1, { silent: true, base: r1.next })
      : applyCommit(later, now + 1, { silent: true });
    if (r2.ok) {
      setMessage(
        `两名测绘员同时提交 ${target.code}：赵测绘 测量时间更晚，已接收为当前值；王测绘 的版本留作冲突`
      );
    }
  }

  function recalcRelations() {
    setRecalcNonce((n) => n + 1);
    setMessage("构件关系视图已按最新当前版本重算");
  }

  function reloadFromStorage() {
    setPersisted(loadState());
    setMessage("已从本地存档重新读取（模拟重开页面）");
  }

  function toggleSimulateFail(on: boolean) {
    setSimulateFail(on);
    setSimulateFailState(on);
  }

  function resetAll() {
    clearPersisted();
    setPersisted(seedState());
    setPending([]);
    setMessage("已清空本地存档并恢复种子数据");
  }

  function refreshSuggestion(v: ComponentVersion) {
    const next: PersistState = {
      ...persisted,
      versions: persisted.versions.map((x) =>
        x.componentId === v.componentId && x.status === "current"
          ? { ...x, suggestionValid: true, suggestion: form.suggestion.trim() || x.suggestion }
          : x
      ),
    };
    try {
      persist(next);
    } catch (err) {
      setMessage(`保存失败：${err instanceof Error ? err.message : String(err)}`);
      return;
    }
    setPersisted(next);
    setMessage(`${v.code} 修缮建议已重新评估并生效`);
  }

  // -------------------------------------------------------------------------
  // 渲染
  // -------------------------------------------------------------------------

  return (
    <main className="app">
      <section className="hero">
        <p>hxyfront-62013 · 木结构榫卯构件测绘</p>
        <h1>构件版本协同平台</h1>
        <span>
          复测的截面、榫卯类型与病害标记坐标按同一版本一起校验，通过后才更新当前值并重算构件关系视图；
          两名测绘员同时提交时只接收测量时间较晚且校验通过的版本，另一版留作冲突；
          截面或榫卯类型变更后旧修缮建议立即失效；本地保存失败保留未提交版本并可重试。
        </span>
      </section>

      <section className="metrics">
        <article>
          <small>构件数量（当前值）</small>
          <strong>{metrics.components}</strong>
        </article>
        <article>
          <small>病害点</small>
          <strong>{metrics.diseases}</strong>
        </article>
        <article>
          <small>榫卯类型</small>
          <strong>{metrics.tenons}</strong>
        </article>
        <article>
          <small>待修缮（建议失效）</small>
          <strong>{metrics.todo}</strong>
        </article>
      </section>

      {message && <div className="banner">{message}</div>}

      <section className="panel toolbar">
        <div className="toolbar-group">
          <label className="inline-label">
            <span>建筑筛选</span>
            <select
              value={buildingFilter}
              onChange={(e) => setBuildingFilter(e.target.value)}
            >
              <option value="all">全部建筑</option>
              {buildings.map((b) => (
                <option key={b} value={b}>
                  {b}
                </option>
              ))}
            </select>
          </label>
          <label className="inline-label">
            <span>榫卯类型筛选</span>
            <select
              value={tenonFilter}
              onChange={(e) => setTenonFilter(e.target.value)}
            >
              <option value="all">全部类型</option>
              {TENON_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </label>
          <label className="inline-label">
            <span>版本状态</span>
            <select
              value={statusTab}
              onChange={(e) => setStatusTab(e.target.value as StatusFilter)}
            >
              <option value="all">全部</option>
              <option value="current">当前值</option>
              <option value="conflict">冲突版本</option>
              <option value="history">历史版本</option>
            </select>
          </label>
        </div>
        <div className="toolbar-group">
          <label className="check-label">
            <input
              type="checkbox"
              checked={simulateFail}
              onChange={(e) => toggleSimulateFail(e.target.checked)}
            />
            模拟本地存储失败
          </label>
          <button onClick={simultaneousSubmit}>模拟两人同时提交</button>
          <button onClick={recalcRelations}>重算关系视图</button>
          <button onClick={reloadFromStorage}>重开页面（读档）</button>
          <button onClick={resetAll}>清空存档</button>
        </div>
      </section>

      <section className="workspace">
        <aside className="panel">
          <h2>构件清单</h2>
          <p className="panel-hint">
            按建筑 + 榫卯类型筛选，当前值 / 冲突版本 / 历史版本分开显示
          </p>
          <ComponentList versions={filtered} onSelect={selectComponent} />
        </aside>

        <section className="panel form-panel">
          <div className="heading">
            <div>
              <p>复测录入</p>
              <h2>提交构件新版本</h2>
            </div>
            <div className="heading-actions">
              {lastSavedAt && (
                <span className="saved-hint">
                  已保存 {new Date(lastSavedAt).toLocaleTimeString("zh-CN", { hour12: false })}
                </span>
              )}
              <button className="primary" onClick={submit}>
                校验并保存
              </button>
            </div>
          </div>

          {formErrors.length > 0 && (
            <div className="form-errors">
              <strong>校验未通过，本版已驳回：</strong>
              <ul>
                {formErrors.map((e) => (
                  <li key={e}>{e}</li>
                ))}
              </ul>
            </div>
          )}

          <div className="field-grid">
            <label>
              <span>建筑名称</span>
              <input
                value={form.building}
                onChange={(e) => updateForm("building", e.target.value)}
                placeholder="如：大雄宝殿"
              />
            </label>
            <label>
              <span>构件编号</span>
              <input
                value={form.code}
                onChange={(e) => updateForm("code", e.target.value)}
                placeholder="如：梁架 A-03"
              />
            </label>
            <label>
              <span>木材种类</span>
              <input
                value={form.woodType}
                onChange={(e) => updateForm("woodType", e.target.value)}
                placeholder="如：杉木"
              />
            </label>
            <label>
              <span>榫卯类型</span>
              <select
                value={form.tenonType}
                onChange={(e) => updateForm("tenonType", e.target.value as TenonType)}
              >
                {TENON_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>截面宽 (mm)</span>
              <input
                type="number"
                value={form.sectionW}
                onChange={(e) => updateForm("sectionW", e.target.value)}
              />
            </label>
            <label>
              <span>截面高 (mm)</span>
              <input
                type="number"
                value={form.sectionH}
                onChange={(e) => updateForm("sectionH", e.target.value)}
              />
            </label>
            <label>
              <span>病害标记 X (mm)</span>
              <input
                type="number"
                value={form.markerX}
                onChange={(e) => updateForm("markerX", e.target.value)}
              />
            </label>
            <label>
              <span>病害标记 Y (mm)</span>
              <input
                type="number"
                value={form.markerY}
                onChange={(e) => updateForm("markerY", e.target.value)}
              />
            </label>
            <label>
              <span>病害位置</span>
              <input
                value={form.disease}
                onChange={(e) => updateForm("disease", e.target.value)}
                placeholder="如：梁端开裂"
              />
            </label>
            <label>
              <span>变形情况</span>
              <input
                value={form.deformation}
                onChange={(e) => updateForm("deformation", e.target.value)}
                placeholder="如：无明显变形"
              />
            </label>
            <label>
              <span>测绘员</span>
              <input
                value={form.surveyor}
                onChange={(e) => updateForm("surveyor", e.target.value)}
                placeholder="如：陈一"
              />
            </label>
            <label>
              <span>测量时间</span>
              <input
                type="datetime-local"
                value={form.measuredAt}
                onChange={(e) => updateForm("measuredAt", e.target.value)}
              />
            </label>
          </div>
          <label className="suggestion-field">
            <span>修缮建议（截面或榫卯类型变更后需重新评估生效）</span>
            <input
              value={form.suggestion}
              onChange={(e) => updateForm("suggestion", e.target.value)}
              placeholder="如：裂缝灌胶加固"
            />
          </label>
          {selectedCurrent && !selectedCurrent.suggestionValid && (
            <div className="invalid-banner">
              「{selectedCurrent.code}」当前版本的修缮建议已因截面/榫卯类型变更失效，
              请在上方填写新建议后
              <button className="link-btn" onClick={() => refreshSuggestion(selectedCurrent)}>
                重新评估生效
              </button>
            </div>
          )}
        </section>
      </section>

      {pending.length > 0 && (
        <section className="panel pending-panel">
          <div className="heading">
            <div>
              <p>未提交版本</p>
              <h2>本地保存失败 · {pending.length} 版待重试</h2>
            </div>
          </div>
          <div className="pending-list">
            {pending.map((p) => (
              <article key={p.key} className="pending-card">
                <div>
                  <strong>{p.draft.code}</strong>
                  <span className="meta">
                    {" "}
                    · {p.draft.surveyor} · 测量于{" "}
                    {new Date(p.draft.measuredAt).toLocaleString("zh-CN", { hour12: false })}
                  </span>
                  <p className="pending-error">失败原因：{p.error}</p>
                </div>
                <div className="pending-actions">
                  <button className="primary" onClick={() => retrySave(p)}>
                    重试保存
                  </button>
                  <button onClick={() => discardPending(p.key)}>放弃</button>
                </div>
              </article>
            ))}
          </div>
        </section>
      )}

      <section className="panel">
        <div className="heading">
          <div>
            <p>尺寸记录</p>
            <h2>复测尺寸表（按版本状态分开）</h2>
          </div>
        </div>
        <DimensionTable versions={filtered} />
      </section>

      <section className="workspace">
        <section className="panel">
          <div className="heading">
            <div>
              <p>病害标记图</p>
              <h2>
                {selectedCurrent ? selectedCurrent.code : "请选择构件"} · 标记随当前版本联动
              </h2>
            </div>
          </div>
          {selectedCurrent ? (
            <MarkerDiagram version={selectedCurrent} />
          ) : (
            <p className="empty">暂无当前版本构件</p>
          )}
        </section>

        <section className="panel">
          <div className="heading">
            <div>
              <p>构件关系视图</p>
              <h2>{relationBuilding} · 随当前版本重算</h2>
            </div>
            <button onClick={recalcRelations}>重算</button>
          </div>
          {relationBuilding ? (
            <RelationView
              building={relationBuilding}
              versions={versions}
              relations={persisted.relations}
              recalcNonce={recalcNonce}
            />
          ) : (
            <p className="empty">暂无建筑</p>
          )}
          <p className="panel-hint">
            绿色实线为节点匹配，红色虚线为截面或榫卯类型不匹配——复测更新当前值后自动重算。
          </p>
        </section>
      </section>

      <footer className="footer">
        <span>hxyfront-62013 · 木结构榫卯构件测绘 · 构件版本协同</span>
      </footer>
    </main>
  );
}
