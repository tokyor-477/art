import paper from "paper";
import { getSelection, setSelection } from "../engine/selection";
import { drawSelectionHandles } from "../engine/handles";

// シンボル: 選択を SymbolDefinition 化してパレットから再配置。
// ponytail: 定義リストは配置済みインスタンスから復元する(未使用定義は保存されない)。
let defs: { name: string; def: paper.SymbolDefinition }[] = [];
let seq = 0;
let commit: () => void = () => {};

const $ = (id: string) => document.getElementById(id)!;

export function setupSymbols(onCommit: () => void) {
  commit = onCommit;
  $("symbol-add").onclick = register;
  refreshSymbols();
}

/** 選択中アイテムをシンボル定義に変換し、元の位置にインスタンスを置く */
function register() {
  const items = getSelection();
  if (!items.length) return;
  items.sort((a, b) => a.index - b.index);
  const source = items.length === 1 ? items[0] : new paper.Group(items);
  const center = source.bounds.center;
  const def = new paper.SymbolDefinition(source); // sourceはプロジェクトから外れる
  const inst = def.place(center);
  defs.push({ name: `シンボル ${++seq}`, def });
  setSelection([inst]);
  drawSelectionHandles();
  renderList();
  commit();
}

/** プロジェクト内の SymbolItem から定義リストを再構築(読込・undo後) */
export function refreshSymbols() {
  const seen = new Set<paper.SymbolDefinition>();
  const found: paper.SymbolDefinition[] = [];
  for (const layer of paper.project.layers) {
    for (const item of layer.getItems({ class: paper.SymbolItem })) {
      const d = (item as paper.SymbolItem).definition;
      if (!seen.has(d)) { seen.add(d); found.push(d); }
    }
  }
  // 既知の名前を維持しつつ、未知の定義には新しい名前を振る
  const known = new Map(defs.map((e) => [e.def, e.name]));
  defs = found.map((def) => ({ def, name: known.get(def) ?? `シンボル ${++seq}` }));
  renderList();
}

function renderList() {
  const list = $("symbol-list");
  list.innerHTML = "";
  for (const e of defs) {
    const b = document.createElement("button");
    b.textContent = e.name;
    b.onclick = () => {
      const inst = e.def.place(paper.view.center);
      setSelection([inst]);
      drawSelectionHandles();
      commit();
    };
    list.appendChild(b);
  }
}
