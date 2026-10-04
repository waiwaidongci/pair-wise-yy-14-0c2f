// 古建筑木结构榫卯构件测绘 —— 领域类型定义
// 核心概念：同一构件编号(componentId)下有多个构件版本(ComponentVersion)，
// 任意时刻最多一个当前值(active)，其余为冲突版本(conflict)或历史版本(history)。

export type JointType = "燕尾榫" | "透榫" | "半榫" | "箍头榫";

export type ComponentRole = "梁" | "柱" | "斗拱";

export type DefectKind = "开裂" | "糟朽" | "变形" | "虫蛀";

export type Building = "正殿" | "山门";

export const JOINT_TYPES: JointType[] = ["燕尾榫", "透榫", "半榫", "箍头榫"];
export const COMPONENT_ROLES: ComponentRole[] = ["梁", "柱", "斗拱"];
export const DEFECT_KINDS: DefectKind[] = ["开裂", "糟朽", "变形", "虫蛀"];
export const BUILDINGS: Building[] = ["正殿", "山门"];

/** 截面尺寸（复测值，mm） */
export interface CrossSection {
  width: number;
  height: number;
}

/** 病害标记：标记坐标以"构件全长百分比 x / 截面高度百分比 y"表示，
 *  onComponentId 表示病害实际附着的构件（复测后标记可能移到别的构件上）。 */
export interface DefectMark {
  id: string;
  x: number;
  y: number;
  kind: DefectKind;
  onComponentId: string;
  note?: string;
}

export type VersionStatus = "active" | "conflict" | "history";

/** 留作冲突的原因：测量时间晚者胜出，其余平行版本按过期留存 */
export type ConflictReason = "obsolete-late" | "validation-failed";

/** 构件的一个测绘版本：截面、榫卯类型、标记坐标绑定在同一版本里一起校验 */
export interface ComponentVersion {
  id: string;
  componentId: string;
  building: string;
  role: ComponentRole;
  wood: string;
  jointType: JointType;
  section: CrossSection;
  length: number;
  deformation: string;
  marks: DefectMark[];
  /** 修缮建议：截面或榫卯类型变更后立即失效 */
  repairAdvice: string;
  adviceValid: boolean;
  /** 建议失效原因（复测截面/榫卯类型变更） */
  repairAdviceNote?: string;
  surveyor: string;
  /** 测量时间：并发提交时只接收时间最晚的校验通过版本 */
  measuredAt: string; // ISO
  submittedAt: string; // ISO
  status: VersionStatus;
  conflictReason?: ConflictReason;
  /** 基于哪个版本复测 */
  baseVersionId?: string;
}

/** 录入中的病害标记行（文本态，提交时统一解析校验） */
export interface DraftMark {
  markId: string;
  xText: string;
  yText: string;
  kind: DefectKind | "";
  onComponentId: string;
  note: string;
}

/** 未提交的测绘草稿：本地保存失败时原样保留，可修改后重试 */
export interface SurveyDraft {
  id: string;
  pairId?: string;
  componentId: string;
  building: string;
  role: ComponentRole | "";
  wood: string;
  jointType: JointType | "";
  widthText: string;
  heightText: string;
  lengthText: string;
  deformation: string;
  repairAdvice: string;
  marks: DraftMark[];
  surveyor: string;
  measuredAt: string; // datetime-local
  baseVersionId?: string;
  /** 本地保存失败标记 */
  saveFailed?: boolean;
  saveError?: string;
}

export interface ParsedDraft {
  width: number;
  height: number;
  length: number;
  measuredISO: string;
  marks: DefectMark[];
}

export type OutcomeKind = "accepted" | "conflict" | "invalid";

export interface CommitOutcome {
  draftId: string;
  kind: OutcomeKind;
  versionId?: string;
  message: string;
}

/** 一次提交（可含两名测绘员的平行草稿）的纯计算结果 */
export interface CommitResult {
  nextVersions: ComponentVersion[];
  outcomes: CommitOutcome[];
}
