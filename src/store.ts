import type {
  ComponentVersion,
  DraftInput,
  PersistState,
  RelationEdge,
  VersionStatus,
} from "./types";
import { validateDraft } from "./validation";

const STORAGE_KEY = "mortise-survey-versions-v1";
const FAIL_FLAG = "mortise-survey-simulate-fail";

/** 两名测绘员“同时提交”的判定窗口：60 秒内 */
export const SIMULTANEITY_MS = 60_000;

// ---------------------------------------------------------------------------
// 种子数据
// ---------------------------------------------------------------------------

function t(date: string): number {
  return Date.parse(date);
}

function seedVersions(): ComponentVersion[] {
  const make = (
    v: Partial<ComponentVersion> &
      Pick<
        ComponentVersion,
        | "componentId"
        | "building"
        | "code"
        | "tenonType"
        | "sectionW"
        | "sectionH"
        | "measuredAt"
        | "surveyor"
        | "status"
      >
  ): ComponentVersion => ({
    id: `${v.componentId}-${v.status}-${v.measuredAt}`,
    woodType: "杉木",
    disease: "",
    deformation: "",
    suggestion: "",
    markerX: 0,
    markerY: 0,
    suggestionValid: true,
    parentId: null,
    createdAt: v.measuredAt,
    ...v,
  });

  return [
    // 大雄宝殿 · 梁架 A-01（含一条历史版本）
    make({
      componentId: "bxd-a01",
      building: "大雄宝殿",
      code: "梁架 A-01",
      woodType: "杉木",
      tenonType: "透榫",
      sectionW: 250,
      sectionH: 400,
      disease: "梁端开裂",
      deformation: "无明显变形",
      suggestion: "裂缝灌胶加固，继续监测",
      markerX: 30,
      markerY: 360,
      measuredAt: t("2026-09-10T09:30:00"),
      surveyor: "陈一",
      status: "current",
    }),
    make({
      componentId: "bxd-a01",
      building: "大雄宝殿",
      code: "梁架 A-01",
      woodType: "杉木",
      tenonType: "透榫",
      sectionW: 240,
      sectionH: 380,
      disease: "梁端开裂",
      deformation: "无明显变形",
      suggestion: "继续监测",
      markerX: 28,
      markerY: 340,
      measuredAt: t("2026-08-02T14:00:00"),
      surveyor: "陈一",
      status: "history",
    }),
    // 大雄宝殿 · 柱网 C-01
    make({
      componentId: "bxd-c01",
      building: "大雄宝殿",
      code: "柱网 C-01",
      woodType: "楠木",
      tenonType: "半榫",
      sectionW: 280,
      sectionH: 280,
      disease: "柱脚糟朽",
      deformation: "柱身微倾",
      suggestion: "剔除糟朽，局部墩接",
      markerX: 140,
      markerY: 25,
      measuredAt: t("2026-09-10T10:00:00"),
      surveyor: "李二",
      status: "current",
    }),
    // 大雄宝殿 · 斗拱 D-01（含一条冲突版本）
    make({
      componentId: "bxd-d01",
      building: "大雄宝殿",
      code: "斗拱 D-01",
      woodType: "楠木",
      tenonType: "燕尾榫",
      sectionW: 120,
      sectionH: 180,
      disease: "斗耳残缺",
      deformation: "无明显变形",
      suggestion: "按原制补配斗耳",
      markerX: 60,
      markerY: 150,
      measuredAt: t("2026-09-11T09:00:00"),
      surveyor: "陈一",
      status: "current",
    }),
    make({
      componentId: "bxd-d01",
      building: "大雄宝殿",
      code: "斗拱 D-01",
      woodType: "楠木",
      tenonType: "燕尾榫",
      sectionW: 115,
      sectionH: 175,
      disease: "斗耳残缺",
      deformation: "无明显变形",
      suggestion: "按原制补配斗耳",
      markerX: 58,
      markerY: 145,
      measuredAt: t("2026-09-09T16:00:00"),
      surveyor: "李二",
      status: "conflict",
    }),
    // 大雄宝殿 · 枋 F-01
    make({
      componentId: "bxd-f01",
      building: "大雄宝殿",
      code: "枋 F-01",
      woodType: "杉木",
      tenonType: "透榫",
      sectionW: 180,
      sectionH: 250,
      disease: "枋身开裂",
      deformation: "无明显变形",
      suggestion: "裂缝灌胶封闭",
      markerX: 20,
      markerY: 210,
      measuredAt: t("2026-09-12T11:00:00"),
      surveyor: "李二",
      status: "current",
    }),
    // 山门 · 梁架 A-02
    make({
      componentId: "sm-a02",
      building: "山门",
      code: "梁架 A-02",
      woodType: "杉木",
      tenonType: "箍头榫",
      sectionW: 220,
      sectionH: 360,
      disease: "梁端开裂",
      deformation: "无明显变形",
      suggestion: "裂缝灌胶加固",
      markerX: 25,
      markerY: 320,
      measuredAt: t("2026-09-08T09:30:00"),
      surveyor: "陈一",
      status: "current",
    }),
    // 山门 · 柱网 C-02
    make({
      componentId: "sm-c02",
      building: "山门",
      code: "柱网 C-02",
      woodType: "楠木",
      tenonType: "半榫",
      sectionW: 260,
      sectionH: 260,
      disease: "柱脚糟朽",
      deformation: "无明显变形",
      suggestion: "局部墩接",
      markerX: 130,
      markerY: 20,
      measuredAt: t("2026-09-08T10:30:00"),
      surveyor: "李二",
      status: "current",
    }),
    // 山门 · 斗拱 D-02
    make({
      componentId: "sm-d02",
      building: "山门",
      code: "斗拱 D-02",
      woodType: "楠木",
      tenonType: "燕尾榫",
      sectionW: 110,
      sectionH: 160,
      disease: "斗耳残缺",
      deformation: "轻微变形",
      suggestion: "继续监测，必要时补配",
      markerX: 55,
      markerY: 130,
      measuredAt: t("2026-09-08T11:00:00"),
      surveyor: "陈一",
      status: "current",
    }),
  ];
}

function seedRelations(): RelationEdge[] {
  return [
    { id: "r1", from: "bxd-a01", to: "bxd-c01", joint: "透榫" },
    { id: "r2", from: "bxd-a01", to: "bxd-d01", joint: "燕尾榫" },
    { id: "r3", from: "bxd-a01", to: "bxd-f01", joint: "透榫" },
    { id: "r4", from: "sm-a02", to: "sm-c02", joint: "箍头榫" },
    { id: "r5", from: "sm-a02", to: "sm-d02", joint: "燕尾榫" },
  ];
}

/** 关系视图节点位置（立面示意，mm 坐标） */
export const NODE_POS: Record<string, { x: number; y: number }> = {
  "bxd-c01": { x: 120, y: 360 },
  "bxd-a01": { x: 120, y: 180 },
  "bxd-d01": { x: 120, y: 60 },
  "bxd-f01": { x: 420, y: 180 },
  "sm-c02": { x: 120, y: 360 },
  "sm-a02": { x: 120, y: 180 },
  "sm-d02": { x: 120, y: 60 },
};

export function seedState(): PersistState {
  return { version: 1, versions: seedVersions(), relations: seedRelations() };
}

// ---------------------------------------------------------------------------
// 本地持久化
// ---------------------------------------------------------------------------

export function loadState(): PersistState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && Array.isArray(parsed.versions)) {
        return {
          version: parsed.version ?? 1,
          versions: parsed.versions,
          relations: Array.isArray(parsed.relations) ? parsed.relations : seedRelations(),
        };
      }
    }
  } catch (err) {
    console.warn("读取本地存档失败，使用种子数据：", err);
  }
  return seedState();
}

export function persist(state: PersistState): void {
  if (localStorage.getItem(FAIL_FLAG) === "1") {
    throw new Error("模拟本地存储写入失败");
  }
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (err) {
    throw new Error(
      `本地存储写入失败：${err instanceof Error ? err.message : "未知错误"}`
    );
  }
}

export function setSimulateFail(on: boolean): void {
  if (on) localStorage.setItem(FAIL_FLAG, "1");
  else localStorage.removeItem(FAIL_FLAG);
}

export function getSimulateFail(): boolean {
  return localStorage.getItem(FAIL_FLAG) === "1";
}

export function clearPersisted(): void {
  localStorage.removeItem(STORAGE_KEY);
}

// ---------------------------------------------------------------------------
// 版本提交逻辑（纯函数，便于重试）
// ---------------------------------------------------------------------------

export interface CommitSuccess {
  ok: true;
  next: PersistState;
  candidate: ComponentVersion;
  demoted: ComponentVersion[];
}

export interface CommitFailure {
  ok: false;
  errors: string[];
}

export type CommitResult = CommitSuccess | CommitFailure;

/**
 * 提交一版复测数据：
 * 1. 截面 / 榫卯类型 / 标记坐标一起校验，不过则整版驳回；
 * 2. 与同构件已有版本比对测量时间——较晚且通过校验的一版成为当前值，
 *    同时提交（60s 窗口）的较早版本留作冲突，非同时的旧当前值降为历史；
 * 3. 截面或榫卯类型相对当前值发生变化时，新修缮建议立即失效。
 */
export function buildNext(
  prev: PersistState,
  draft: DraftInput,
  now: number
): CommitResult {
  const errors = validateDraft(draft);
  if (errors.length) return { ok: false, errors };

  const current = prev.versions.find(
    (v) => v.componentId === draft.componentId && v.status === "current"
  );

  const candidate: ComponentVersion = {
    ...draft,
    id: `v-${now}-${Math.random().toString(36).slice(2, 8)}`,
    status: "current",
    suggestionValid: true,
    parentId: current?.id ?? null,
    createdAt: now,
  };

  // 截面或榫卯类型改了 → 修缮建议失效，需重新评估
  if (
    current &&
    (current.tenonType !== candidate.tenonType ||
      current.sectionW !== candidate.sectionW ||
      current.sectionH !== candidate.sectionH)
  ) {
    candidate.suggestionValid = false;
  }

  // 已有更晚的非历史版本 → 本版留作冲突
  const laterRival = prev.versions.find(
    (v) =>
      v.componentId === candidate.componentId &&
      v.status !== "history" &&
      v.measuredAt > candidate.measuredAt
  );
  if (laterRival) candidate.status = "conflict";

  const simultaneous =
    current != null && now - current.createdAt <= SIMULTANEITY_MS;

  const demoted: ComponentVersion[] = [];
  const versions = prev.versions.map((v) => {
    if (v.componentId !== candidate.componentId) return v;
    if (v.status === "current") {
      const nextStatus: VersionStatus =
        candidate.status === "current"
          ? simultaneous
            ? "conflict"
            : "history"
          : "current";
      if (nextStatus !== "current") {
        const d = { ...v, status: nextStatus };
        demoted.push(d);
        return d;
      }
      return v;
    }
    // 新当前值产生后，旧冲突版本一律降为历史
    if (v.status === "conflict" && candidate.status === "current") {
      const d = { ...v, status: "history" as const };
      demoted.push(d);
      return d;
    }
    return v;
  });
  versions.push(candidate);

  return {
    ok: true,
    next: { ...prev, versions },
    candidate,
    demoted,
  };
}

/** 关系边兼容性：节点当前版本的榫卯类型须与节点一致，且截面相差不超过 120mm */
export function edgeCompatible(
  edge: RelationEdge,
  currentOf: (id: string) => ComponentVersion | undefined
): { compatible: boolean; reason?: string } {
  const from = currentOf(edge.from);
  const to = currentOf(edge.to);
  if (!from || !to) return { compatible: false, reason: "节点版本缺失" };
  if (from.tenonType !== edge.joint || to.tenonType !== edge.joint) {
    return {
      compatible: false,
      reason: `榫卯类型不一致（节点为 ${from.tenonType}/${to.tenonType}，节点应为 ${edge.joint}）`,
    };
  }
  if (Math.abs(from.sectionW - to.sectionW) > 120) {
    return { compatible: false, reason: "截面尺寸相差过大，节点不匹配" };
  }
  return { compatible: true };
}
