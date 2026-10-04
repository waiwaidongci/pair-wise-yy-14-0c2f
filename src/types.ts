export const TENON_TYPES = ["燕尾榫", "透榫", "半榫", "箍头榫"] as const;
export type TenonType = (typeof TENON_TYPES)[number];

/** 构件版本状态：当前值 / 冲突版本 / 历史版本 */
export type VersionStatus = "current" | "conflict" | "history";

/** 构件版本——构件清单、尺寸记录、病害标记、关系视图共用同一份版本数据 */
export interface ComponentVersion {
  id: string;
  /** 稳定的构件标识，同一构件的所有版本共用 */
  componentId: string;
  building: string;
  code: string;
  woodType: string;
  tenonType: TenonType;
  /** 截面宽 mm */
  sectionW: number;
  /** 截面高 mm */
  sectionH: number;
  disease: string;
  deformation: string;
  suggestion: string;
  /** 病害标记坐标（mm，以截面左下角为原点） */
  markerX: number;
  markerY: number;
  /** 测量时间（两名测绘员同时提交时，较晚者优先） */
  measuredAt: number;
  surveyor: string;
  status: VersionStatus;
  /** 截面或榫卯类型变更后，旧修缮建议立即失效 */
  suggestionValid: boolean;
  parentId: string | null;
  createdAt: number;
}

export type DraftInput = Omit<
  ComponentVersion,
  "id" | "status" | "suggestionValid" | "parentId" | "createdAt"
>;

/** 构件关系边——节点位置固定，配合类型随当前版本重算兼容性 */
export interface RelationEdge {
  id: string;
  from: string;
  to: string;
  joint: TenonType;
}

export interface PersistState {
  version: number;
  versions: ComponentVersion[];
  relations: RelationEdge[];
}

/** 本地保存失败后保留的未提交版本，可重试 */
export interface PendingSave {
  key: string;
  candidate: ComponentVersion;
  error: string;
}

export type StatusFilter = "all" | VersionStatus;
