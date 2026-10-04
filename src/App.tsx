import "./styles.css";
import { useStore } from "./store";
import { EntryForm } from "./EntryForm";
import {
  CommitBanner,
  ComponentList,
  DefectMap,
  DimensionTable,
  FilterBar,
  RelationView,
  SettingsBar,
} from "./Views";

function App() {
  const store = useStore();

  if (!store.state.hydrated) {
    return (
      <main className="app">
        <p className="muted">正在载入本地构件版本…</p>
      </main>
    );
  }

  return (
    <main className="app">
      <header className="hero">
        <p>hxyfront-62013 · 古建木结构 · Port 62013</p>
        <h1>木结构榫卯构件测绘</h1>
        <span>
          复测截面、榫卯类型与病害标记坐标绑定为同一构件版本，一起校验通过后才更新当前值并驱动关系视图重算；
          两名测绘员平行提交时测量时间较晚者胜出，另一版留作冲突；截面或榫卯类型变更后旧修缮建议立即失效。
        </span>
      </header>

      <SettingsBar store={store} />
      <CommitBanner store={store} />
      <FilterBar store={store} />

      <div className="layout">
        <div className="col-main">
          <ComponentList store={store} />
          <DimensionTable store={store} />
        </div>
        <div className="col-side">
          <EntryForm store={store} />
        </div>
      </div>

      <DefectMap store={store} />
      <RelationView store={store} />

      <footer className="foot-note muted">
        数据保存在浏览器 localStorage：版本快照（构件清单/尺寸记录表/病害标记/关系视图共用同一版本源）、
        未提交草稿、建筑与榫卯类型筛选。
      </footer>
    </main>
  );
}

export default App;
