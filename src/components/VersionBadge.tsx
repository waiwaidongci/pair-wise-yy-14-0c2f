import type { VersionStatus } from "../types";

const LABEL: Record<VersionStatus, string> = {
  current: "当前值",
  conflict: "冲突版本",
  history: "历史版本",
};

const CLS: Record<VersionStatus, string> = {
  current: "badge badge-current",
  conflict: "badge badge-conflict",
  history: "badge badge-history",
};

export function VersionBadge({ status }: { status: VersionStatus }) {
  return <span className={CLS[status]}>{LABEL[status]}</span>;
}
