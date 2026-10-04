import {
  CommitOutcome,
  CommitResult,
  ComponentVersion,
  CrossSection,
  DefectMark,
  DraftMark,
  JOINT_TYPES,
  ParsedDraft,
  SurveyDraft,
} from "./types";

/* ------------------------- 版本校验：截面 + 榫卯类型 + 标记坐标一起校验 ------------------------- */

export interface FieldErrors {
  componentId?: string;
  building?: string;
  role?: string;
  wood?: string;
  jointType?: string;
  section?: string;
  length?: string;
  surveyor?: string;
  measuredAt?: string;
  marks?: Record<number, { x?: string; y?: string; kind?: string; onComponentId?: string }>;
  consistency?: string[];
}

export interface DraftValidation {
  parsed?: ParsedDraft;
  errors: FieldErrors;
  valid: boolean;
}

const SECTION_MIN: Record<string, number> = { 梁: 60, 柱: 100, 斗拱: 30 };
const SECTION_MAX = 1200;

/** 不同榫卯类型对截面的工艺约束（复测值必须满足） */
function jointSectionRules(joint: string, s: CrossSection, role: string, length: number): string[] {
  const msgs: string[] = [];
  if (role === "梁") {
    if (joint === "透榫" && s.height < 100) {
      msgs.push(`透榫梁高需≥100mm（当前${s.height}mm）`);
    }
    if (joint === "燕尾榫" && s.width < 60) {
      msgs.push(`燕尾榫梁宽需≥60mm（当前${s.width}mm）`);
    }
    if (joint === "半榫" && length > 0 && s.height > 0 && length < s.height * 2) {
      msgs.push("半榫梁净跨长不应小于梁高的2倍");
    }
  }
  if (joint === "箍头榫") {
    const diff = Math.abs(s.width - s.height) / Math.max(s.width, s.height);
    if (diff > 0.15) {
      msgs.push(`箍头榫要求宽高接近（偏差${(diff * 100).toFixed(0)}%>15%）`);
    }
  }
  return msgs;
}

export function validateDraft(draft: SurveyDraft, allVersions: ComponentVersion[]): DraftValidation {
  const errors: FieldErrors = {};

  if (!draft.componentId.trim()) errors.componentId = "构件编号必填";
  if (!draft.building) errors.building = "请选择建筑";
  if (!draft.role) errors.role = "请选择构件类型";
  if (!draft.wood.trim()) errors.wood = "木材种类必填";
  if (!draft.jointType || !JOINT_TYPES.includes(draft.jointType)) errors.jointType = "请选择榫卯类型";
  if (!draft.surveyor.trim()) errors.surveyor = "测绘员必填";
  if (!draft.measuredAt) {
    errors.measuredAt = "测量时间必填";
  } else if (Number.isNaN(new Date(draft.measuredAt).getTime())) {
    errors.measuredAt = "测量时间格式无效";
  }

  const width = Number(draft.widthText);
  const height = Number(draft.heightText);
  const length = Number(draft.lengthText);
  let numericOk = true;
  if (draft.widthText.trim() === "" || !Number.isFinite(width) || width <= 0) {
    errors.section = "截面宽需为正数";
    numericOk = false;
  }
  if (draft.heightText.trim() === "" || !Number.isFinite(height) || height <= 0) {
    errors.section = (errors.section ?? "") + " 截面高需为正数";
    numericOk = false;
  }
  const minSize = SECTION_MIN[draft.role ?? ""] ?? 0;
  if (numericOk && (width < minSize || width > SECTION_MAX || height > SECTION_MAX)) {
    errors.section = `截面尺寸超出合理范围（${minSize}~${SECTION_MAX}mm）`;
    numericOk = false;
  }
  if (draft.lengthText.trim() === "" || !Number.isFinite(length) || length <= 0) {
    errors.length = "构件长度需为正数";
  }

  // 标记坐标随本版本一起解析校验
  const parsedMarks: DefectMark[] = [];
  const markErrs: NonNullable<FieldErrors["marks"]> = {};
  draft.marks.forEach((m: DraftMark, i: number) => {
    const e: NonNullable<FieldErrors["marks"]>[number] = {};
    const x = Number(m.xText);
    const y = Number(m.yText);
    if (m.xText.trim() === "" || !Number.isFinite(x) || x < 0 || x > 100) e.x = "0~100";
    if (m.yText.trim() === "" || !Number.isFinite(y) || y < 0 || y > 100) e.y = "0~100";
    if (!m.kind) e.kind = "选择病害";
    if (!m.onComponentId.trim()) e.onComponentId = "所属构件编号必填";
    if (Object.keys(e).length > 0) {
      markErrs[i] = e;
    } else {
      parsedMarks.push({
        id: m.markId,
        x,
        y,
        kind: m.kind as DefectMark["kind"],
        onComponentId: m.onComponentId.trim(),
        note: m.note.trim() || undefined,
      });
    }
  });
  if (Object.keys(markErrs).length > 0) errors.marks = markErrs;

  // 标记必须落在本建筑实际存在的构件上（复测后标记移到别的构件也要合法）
  const consistency: string[] = [];
  if (draft.componentId.trim() && draft.building) {
    const buildingComponentIds = new Set(
      allVersions
        .filter((v) => v.building === draft.building)
        .map((v) => v.componentId)
        .concat(draft.componentId.trim())
    );
    parsedMarks.forEach((m) => {
      if (!buildingComponentIds.has(m.onComponentId)) {
        consistency.push(`标记${m.id} 所属构件「${m.onComponentId}」不在${draft.building}`);
      }
    });
  }

  if (numericOk && draft.role && draft.jointType) {
    consistency.push(...jointSectionRules(draft.jointType, { width, height }, draft.role, length));
  }
  if (consistency.length > 0) errors.consistency = consistency;

  const valid = Object.keys(errors).length === 0;
  return {
    valid,
    errors,
    parsed: valid
      ? { width, height, length, measuredISO: new Date(draft.measuredAt).toISOString(), marks: parsedMarks }
      : undefined,
  };
}

/* ------------------------------- 并发提交仲裁 ------------------------------- */

interface ValidEntry {
  draft: SurveyDraft;
  parsed: ParsedDraft;
  order: number;
}

let versionSeq = 0;
export function newVersionId(): string {
  versionSeq += 1;
  return `v${Date.now().toString(36)}-${versionSeq}`;
}

function toVersion(draft: SurveyDraft, parsed: ParsedDraft, id: string): ComponentVersion {
  return {
    id,
    componentId: draft.componentId.trim(),
    building: draft.building,
    role: draft.role as ComponentVersion["role"],
    wood: draft.wood.trim(),
    jointType: draft.jointType as ComponentVersion["jointType"],
    section: { width: parsed.width, height: parsed.height },
    length: parsed.length,
    deformation: draft.deformation.trim(),
    marks: parsed.marks,
    repairAdvice: draft.repairAdvice.trim(),
    adviceValid: true,
    surveyor: draft.surveyor.trim(),
    measuredAt: parsed.measuredISO,
    submittedAt: new Date().toISOString(),
    status: "active",
    baseVersionId: draft.baseVersionId,
  };
}

/**
 * 批量提交：
 * 1) 所有草稿先一起做版本校验；不通过的留作冲突（validation-failed），不参与仲裁。
 * 2) 同一构件的有效草稿按测量时间排序，最晚者与当前值比较。
 * 3) 仅当测量时间晚于当前值（或首次提交）才接收为新的当前值，其余留作冲突。
 */
export function commitBatch(versions: ComponentVersion[], drafts: SurveyDraft[]): CommitResult {
  const outcomes: CommitOutcome[] = [];
  const invalids: { draft: SurveyDraft; errors: FieldErrors }[] = [];
  const valid: ValidEntry[] = [];

  drafts.forEach((draft) => {
    const result = validateDraft(draft, versions);
    if (!result.valid || !result.parsed) {
      invalids.push({ draft, errors: result.errors });
    } else {
      valid.push({ draft, parsed: result.parsed, order: 0 });
    }
  });

  // 不通过版本：留作冲突，不清退
  const appended: ComponentVersion[] = invalids.map(({ draft, errors }) => {
    const width = Number(draft.widthText);
    const height = Number(draft.heightText);
    const length = Number(draft.lengthText);
    const v: ComponentVersion = {
      id: newVersionId(),
      componentId: draft.componentId.trim() || "(未命名构件)",
      building: draft.building || "(未选建筑)",
      role: (draft.role || "梁") as ComponentVersion["role"],
      wood: draft.wood.trim() || "—",
      jointType: (draft.jointType || "透榫") as ComponentVersion["jointType"],
      section: { width: Number.isFinite(width) ? width : 0, height: Number.isFinite(height) ? height : 0 },
      length: Number.isFinite(length) ? length : 0,
      deformation: draft.deformation.trim(),
      marks: draft.marks
        .filter((m) => Number(m.xText) >= 0 && Number(m.yText) >= 0)
        .map((m) => ({
          id: m.markId,
          x: Number(m.xText),
          y: Number(m.yText),
          kind: (m.kind || "开裂") as DefectMark["kind"],
          onComponentId: m.onComponentId.trim() || "?",
          note: m.note.trim() || undefined,
        })),
      repairAdvice: draft.repairAdvice.trim(),
      adviceValid: false,
      surveyor: draft.surveyor.trim() || "—",
      measuredAt: draft.measuredAt ? new Date(draft.measuredAt).toISOString() : new Date(0).toISOString(),
      submittedAt: new Date().toISOString(),
      status: "conflict",
      conflictReason: "validation-failed",
      baseVersionId: draft.baseVersionId,
    };
    outcomes.push({
      draftId: draft.id,
      kind: "invalid",
      versionId: v.id,
      message: `校验未通过（${flattenErrors(errors)}），已留作冲突`,
    });
    return v;
  });

  // 按构件分组
  const groups = new Map<string, ValidEntry[]>();
  valid.forEach((entry, idx) => {
    const key = `${entry.draft.building}::${entry.draft.componentId.trim()}`;
    const list = groups.get(key) ?? [];
    list.push({ ...entry, order: idx });
    groups.set(key, list);
  });

  // 以现有版本为基础，逐组仲裁并派生新状态
  let working = versions.map((v) => ({ ...v }));

  groups.forEach((entries) => {
    // 测量时间晚者优先；相同时间以提交顺序稳定排序
    const sorted = [...entries].sort((a, b) => {
      const t = new Date(b.parsed.measuredISO).getTime() - new Date(a.parsed.measuredISO).getTime();
      if (t !== 0) return t;
      return a.order - b.order; // 同测量时间按提交顺序
    });
    const winner = sorted[0];
    const losers = sorted.slice(1);
    const cid = winner.draft.componentId.trim();

    const current = working.find((v) => v.componentId === cid && v.status === "active");

    // 胜者与当前值比较
    if (current && new Date(winner.parsed.measuredISO).getTime() <= new Date(current.measuredAt).getTime()) {
      // 测量时间不晚于当前值 → 全组留作冲突
      sorted.forEach((entry) => {
        const v = toVersion(entry.draft, entry.parsed, newVersionId());
        v.status = "conflict";
        v.conflictReason = "obsolete-late";
        v.adviceValid = false;
        working.push(v);
        outcomes.push({
          draftId: entry.draft.id,
          kind: "conflict",
          versionId: v.id,
          message: `测量时间 ${fmtDT(entry.parsed.measuredISO)} 不晚于当前值 ${fmtDT(
            current.measuredAt
          )}，留作冲突`,
        });
      });
      return;
    }

    // 截面或榫卯类型变了 → 当前值旧修缮建议立即失效
    if (current) {
      const sectionChanged =
        current.section.width !== winner.parsed.width || current.section.height !== winner.parsed.height;
      const jointChanged = current.jointType !== winner.draft.jointType;
      if (sectionChanged || jointChanged) {
        current.adviceValid = false;
        current.repairAdviceNote =
          current.repairAdviceNote ??
          `截面/榫卯类型已于${fmtDT(new Date().toISOString())}复测变更`;
      }
      current.status = "history";
    }

    const accepted = toVersion(winner.draft, winner.parsed, newVersionId());
    // 新版本若未重新编制修缮建议，则建议保持"待编制"，由界面提示
    if (!accepted.repairAdvice) {
      accepted.adviceValid = false;
    }
    working.push(accepted);
    outcomes.push({
      draftId: winner.draft.id,
      kind: "accepted",
      versionId: accepted.id,
      message: `已接收为「${cid}」当前值，关系视图按新截面重算`,
    });

    losers.forEach((entry) => {
      const v = toVersion(entry.draft, entry.parsed, newVersionId());
      v.status = "conflict";
      v.conflictReason = "obsolete-late";
      v.adviceValid = false;
      working.push(v);
      outcomes.push({
        draftId: entry.draft.id,
        kind: "conflict",
        versionId: v.id,
        message: `与${winner.draft.surveyor.trim()}同时提交，测量时间较早，留作冲突`,
      });
    });
  });

  appended.forEach((v) => working.push(v));

  return { nextVersions: working, outcomes: orderOutcomes(outcomes, drafts) };
}

/** 按草稿提交顺序输出结果 */
function orderOutcomes(outcomes: CommitOutcome[], drafts: SurveyDraft[]): CommitOutcome[] {
  const map = new Map(outcomes.map((o) => [o.draftId, o]));
  return drafts.map((d) => map.get(d.id)).filter((o): o is CommitOutcome => Boolean(o));
}

export function flattenErrors(errors: FieldErrors): string {
  const parts: string[] = [];
  if (errors.componentId) parts.push(errors.componentId);
  if (errors.building) parts.push(errors.building);
  if (errors.role) parts.push(errors.role);
  if (errors.wood) parts.push(errors.wood);
  if (errors.jointType) parts.push(errors.jointType);
  if (errors.section) parts.push(errors.section.trim());
  if (errors.length) parts.push(errors.length);
  if (errors.surveyor) parts.push(errors.surveyor);
  if (errors.measuredAt) parts.push(errors.measuredAt);
  if (errors.consistency) parts.push(...errors.consistency);
  if (errors.marks) parts.push(`${Object.keys(errors.marks).length} 个病害标记坐标不合法`);
  return parts.join("；") || "字段不合法";
}

export function fmtDT(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

/* ------------------------- 关系视图：只由当前值版本重算 ------------------------- */

export interface RelationGraph {
  building: string;
  signature: string;
  nodes: {
    componentId: string;
    role: string;
    jointType: string;
    sectionText: string;
    x: number;
    y: number;
  }[];
  edges: { from: string; to: string; joint: string }[];
}

export function buildRelationGraph(versions: ComponentVersion[], building: string): RelationGraph {
  const current = versions.filter((v) => v.building === building && v.status === "active");
  const columns = current.filter((v) => v.role === "柱");
  const beams = current.filter((v) => v.role === "梁");
  const brackets = current.filter((v) => v.role === "斗拱");

  const nodes: RelationGraph["nodes"] = [];
  const edges: RelationGraph["edges"] = [];
  const W = 760;
  const H = 300;

  columns.forEach((c, i) => {
    const x = columns.length === 1 ? W / 2 : 80 + (i * (W - 160)) / Math.max(columns.length - 1, 1);
    nodes.push({
      componentId: c.componentId,
      role: c.role,
      jointType: c.jointType,
      sectionText: `${c.section.width}×${c.section.height}`,
      x,
      y: H - 70,
    });
  });

  beams.forEach((b, i) => {
    const x = W / 2;
    const y = 150 - i * 56;
    nodes.push({
      componentId: b.componentId,
      role: b.role,
      jointType: b.jointType,
      sectionText: `${b.section.width}×${b.section.height}`,
      x,
      y,
    });
    // 梁两端通过榫卯连接到柱（透榫/半榫穿柱，燕尾榫拉结）
    if (columns.length >= 2) {
      edges.push({ from: b.componentId, to: columns[0].componentId, joint: b.jointType });
      edges.push({ from: b.componentId, to: columns[columns.length - 1].componentId, joint: b.jointType });
    }
  });

  brackets.forEach((bk, i) => {
    const anchor = columns[Math.min(i, Math.max(columns.length - 1, 0))];
    const anchorNode = anchor ? nodes.find((n) => n.componentId === anchor.componentId) : undefined;
    nodes.push({
      componentId: bk.componentId,
      role: bk.role,
      jointType: bk.jointType,
      sectionText: `${bk.section.width}×${bk.section.height}`,
      x: anchorNode ? anchorNode.x : 120 + i * 90,
      y: 70,
    });
    if (anchor) edges.push({ from: bk.componentId, to: anchor.componentId, joint: bk.jointType });
  });

  // 签名：当前值版本 id + 截面 + 榫卯类型；任一复测被接收后签名变化 → 视图重算
  const signature = current
    .map((v) => `${v.componentId}:${v.section.width}x${v.section.height}:${v.jointType}:${v.id.slice(-4)}`)
    .sort()
    .join("|");

  return { building, signature, nodes, edges };
}

/** 当前建筑内所有生效的病害标记（标记跟随最新版本，坐标按标记实际所属构件解析） */
export function liveMarks(versions: ComponentVersion[], building: string): DefectMark[] {
  const current = versions.filter((v) => v.building === building && v.status === "active");
  const byId = new Map<string, DefectMark>();
  current.forEach((v) => {
    v.marks.forEach((m) => byId.set(m.id, m)); // 后遍历到的新版本覆盖旧坐标
  });
  return [...byId.values()];
}
