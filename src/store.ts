import { useCallback, useEffect, useMemo, useReducer, useRef } from "react";
import { commitBatch, validateDraft } from "./domain";
import { seedVersions } from "./seed";
import { CommitOutcome, ComponentVersion, SurveyDraft } from "./types";

const VERSIONS_KEY = "sunmao.versions.v1";
const DRAFTS_KEY = "sunmao.drafts.v1";
const FILTER_KEY = "sunmao.filter.v1";
const SETTINGS_KEY = "sunmao.settings.v1";

/** 本地存储开关：打开后保存必失败，用于演示"保存失败 → 保留未提交版本 → 重试" */
export interface Settings {
  forceFail: boolean;
}

export interface FilterState {
  building: string;
  jointType: string; // "" = 全部
  tab: "current" | "conflict" | "history";
}

export interface PendingCommit {
  draftIds: string[];
  attempts: number;
  lastError: string;
  results?: CommitOutcome[];
}

interface State {
  hydrated: boolean;
  versions: ComponentVersion[];
  drafts: SurveyDraft[];
  filter: FilterState;
  settings: Settings;
  pending: PendingCommit | null;
  lastResults: CommitOutcome[] | null;
}

type Action =
  | { type: "hydrate"; payload: Partial<State> }
  | { type: "upsertDraft"; draft: SurveyDraft }
  | { type: "removeDraft"; id: string }
  | { type: "setFilter"; filter: Partial<FilterState> }
  | { type: "setSettings"; settings: Settings }
  | { type: "commitStart"; pending: PendingCommit }
  | { type: "commitDone"; versions: ComponentVersion[]; results: CommitOutcome[]; clearDraftIds: string[] }
  | { type: "commitFail"; pending: PendingCommit }
  | { type: "clearResults" }
  | { type: "repairAdvice"; versionId: string; advice: string }
  | { type: "resetDemo" };

function load<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function persist(key: string, value: unknown, forceFail: boolean): void {
  if (forceFail) {
    throw new Error("本地存储不可用（演示：保存失败开关已打开）");
  }
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (e) {
    throw new Error(`写入失败：${e instanceof Error ? e.message : String(e)}`);
  }
}

const initialFilter: FilterState = { building: "正殿", jointType: "", tab: "current" };

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "hydrate":
      return { ...state, ...action.payload, hydrated: true };
    case "upsertDraft": {
      const idx = state.drafts.findIndex((d) => d.id === action.draft.id);
      const drafts =
        idx >= 0 ? state.drafts.map((d) => (d.id === action.draft.id ? action.draft : d)) : [...state.drafts, action.draft];
      return { ...state, drafts };
    }
    case "removeDraft":
      return { ...state, drafts: state.drafts.filter((d) => d.id !== action.id) };
    case "setFilter":
      return { ...state, filter: { ...state.filter, ...action.filter } };
    case "setSettings":
      return { ...state, settings: action.settings };
    case "commitStart":
      return { ...state, pending: action.pending, lastResults: null };
    case "commitDone": {
      const clear = new Set(action.clearDraftIds);
      // 保存成功：清除已被处理（接收或留冲突）的草稿；校验未通过的草稿保留可改
      const drafts = state.drafts.filter((d) => !clear.has(d.id));
      return { ...state, versions: action.versions, drafts, pending: null, lastResults: action.results };
    }
    case "commitFail":
      return { ...state, pending: action.pending };
    case "clearResults":
      return { ...state, lastResults: null };
    case "repairAdvice": {
      // 为当前值补编修缮建议（不改截面/榫卯，直接生效）
      const versions = state.versions.map((v) =>
        v.id === action.versionId ? { ...v, repairAdvice: action.advice, adviceValid: true, repairAdviceNote: undefined } : v
      );
      return { ...state, versions };
    }
    case "resetDemo":
      return {
        ...state,
        versions: seedVersions(),
        drafts: [],
        pending: null,
        lastResults: null,
      };
    default:
      return state;
  }
}

export function useStore() {
  const [state, dispatch] = useReducer(reducer, {
    hydrated: false,
    versions: [],
    drafts: [],
    filter: initialFilter,
    settings: { forceFail: false },
    pending: null,
    lastResults: null,
  });

  // 页面重开：恢复当前值、未提交草稿、筛选条件、设置
  useEffect(() => {
    const versions = load<ComponentVersion[]>(VERSIONS_KEY, seedVersions());
    const drafts = load<SurveyDraft[]>(DRAFTS_KEY, []);
    const filter = load<FilterState>(FILTER_KEY, initialFilter);
    const settings = load<Settings>(SETTINGS_KEY, { forceFail: false });
    dispatch({
      type: "hydrate",
      payload: { versions, drafts, filter: { ...initialFilter, ...filter }, settings },
    });
  }, []);

  // 草稿实时备份：即使保存提交失败/页面重开，未提交版本仍在
  useEffect(() => {
    if (!state.hydrated) return;
    try {
      localStorage.setItem(DRAFTS_KEY, JSON.stringify(state.drafts));
    } catch {
      /* 草稿备份尽力而为，不阻断 */
    }
  }, [state.drafts, state.hydrated]);

  useEffect(() => {
    if (!state.hydrated) return;
    try {
      localStorage.setItem(FILTER_KEY, JSON.stringify(state.filter));
    } catch {
      /* ignore */
    }
  }, [state.filter, state.hydrated]);

  const saving = useRef(false);

  const submitDrafts = useCallback(
    (draftsToCommit: SurveyDraft[]) => {
      if (saving.current) return;
      saving.current = true;
      const result = commitBatch(state.versions, draftsToCommit);
      const invalidIds = new Set(result.outcomes.filter((o) => o.kind === "invalid").map((o) => o.draftId));
      const clearIds = draftsToCommit.filter((d) => !invalidIds.has(d.id)).map((d) => d.id);

      const prev = state.pending;
      dispatch({
        type: "commitStart",
        pending: {
          draftIds: draftsToCommit.map((d) => d.id),
          attempts: (prev?.attempts ?? 0) + 1,
          lastError: "",
          results: result.outcomes,
        },
      });

      // 模拟本地保存（同版本快照原子写入）
      try {
        persist(VERSIONS_KEY, result.nextVersions, state.settings.forceFail);
        dispatch({
          type: "commitDone",
          versions: result.nextVersions,
          results: result.outcomes,
          clearDraftIds: clearIds,
        });
      } catch (e) {
        dispatch({
          type: "commitFail",
          pending: {
            draftIds: draftsToCommit.map((d) => d.id),
            attempts: (prev?.attempts ?? 0) + 1,
            lastError: e instanceof Error ? e.message : String(e),
            results: result.outcomes,
          },
        });
      } finally {
        saving.current = false;
      }
    },
    [state.versions, state.pending, state.settings.forceFail]
  );

  const retryPending = useCallback(() => {
    const drafts = state.drafts.filter((d) => state.pending?.draftIds.includes(d.id));
    if (drafts.length > 0) submitDrafts(drafts);
  }, [state.drafts, state.pending, submitDrafts]);

  const setSettings = useCallback(
    (s: Settings) => {
      dispatch({ type: "setSettings", settings: s });
      try {
        localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
      } catch {
        /* ignore */
      }
    },
    []
  );

  const resetDemo = useCallback(() => {
    persist(VERSIONS_KEY, seedVersions(), false);
    localStorage.removeItem(DRAFTS_KEY);
    dispatch({ type: "resetDemo" });
  }, []);

  const validate = useCallback((d: SurveyDraft) => validateDraft(d, state.versions), [state.versions]);

  return useMemo(
    () => ({
      state,
      dispatch,
      submitDrafts,
      retryPending,
      setSettings,
      resetDemo,
      validate,
    }),
    [state, submitDrafts, retryPending, setSettings, resetDemo, validate]
  );
}

export type Store = ReturnType<typeof useStore>;
