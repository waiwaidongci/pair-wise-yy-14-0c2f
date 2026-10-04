import { ComponentVersion, DraftMark, SurveyDraft } from "./types";

export function nowLocalInput(): string {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
}

export function laterLocalInput(minutes: number): string {
  const d = new Date(Date.now() + minutes * 60000);
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
}

let draftSeq = 0;
export function newDraftId(): string {
  draftSeq += 1;
  return `draft-${Date.now().toString(36)}-${draftSeq}`;
}

let markSeq = 0;
export function newMarkId(): string {
  markSeq += 1;
  return `MK${Date.now().toString(36).slice(-4)}${markSeq}`;
}

export function emptyMark(onComponentId = ""): DraftMark {
  return { markId: newMarkId(), xText: "50", yText: "50", kind: "开裂", onComponentId, note: "" };
}

/** 基于当前值版本创建复测草稿（默认带出旧截面、榫卯类型、标记坐标） */
export function draftFromVersion(v: ComponentVersion | null, building = "正殿"): SurveyDraft {
  return {
    id: newDraftId(),
    componentId: v?.componentId ?? "",
    building: v?.building ?? building,
    role: v?.role ?? "梁",
    wood: v?.wood ?? "",
    jointType: v?.jointType ?? "透榫",
    widthText: v ? String(v.section.width) : "180",
    heightText: v ? String(v.section.height) : "240",
    lengthText: v ? String(v.length) : "4000",
    deformation: v?.deformation ?? "",
    repairAdvice: "",
    marks: v
      ? v.marks.map((m) => ({
          markId: m.id,
          xText: String(m.x),
          yText: String(m.y),
          kind: m.kind,
          onComponentId: m.onComponentId,
          note: m.note ?? "",
        }))
      : [emptyMark()],
    surveyor: "",
    measuredAt: nowLocalInput(),
    baseVersionId: v?.id,
  };
}

export function blankDraft(building: string): SurveyDraft {
  return draftFromVersion(null, building);
}

/** 双人同时复测：复制共享字段，第二名测绘员使用独立的测量时间/修缮建议 */
export function pairDraftOf(base: SurveyDraft): SurveyDraft {
  return {
    ...base,
    id: newDraftId(),
    pairId: base.id,
    repairAdvice: "",
    surveyor: "",
    measuredAt: laterLocalInput(35),
    marks: base.marks.map((m) => ({ ...m })),
  };
}
