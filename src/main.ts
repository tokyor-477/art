import paper from "paper";
import type { Tool } from "./tools/types";
import { Brush } from "./tools/brush";
import { ShapeTool, type ShapeKind } from "./tools/shape";
import { SelectTool } from "./tools/select";
import { DirectSelectTool } from "./tools/direct";
import { PenTool } from "./tools/pen";
import { TextTool } from "./tools/text";
import { EyedropperTool } from "./tools/eyedropper";
import { attachPointerInput } from "./input/pointer";
import { History } from "./engine/history";
import { applyStyle } from "./engine/style";
import { getSelection, onSelectionChange } from "./engine/selection";
import { drawSelectionHandles } from "./engine/handles";
import { saveDoc, loadDoc } from "./store/db";
import {
  setupPanels, refreshLayers, docLayers,
  currentStyle, currentBrushColor, currentBrushSize, currentFontSize,
  setPickedColors, onStyleChange,
} from "./ui/panels";
import { setupActions } from "./ui/actions";

const canvas = document.getElementById("canvas") as HTMLCanvasElement;
paper.setup(canvas);
(window as unknown as { paper: typeof paper }).paper = paper; // デバッグ用
paper.project.activeLayer.name = "レイヤー 1";

const history = new History();
const commit = () => history.snapshot();

// --- ツール ---

const brush = new Brush({ color: "#111111", size: 8 });
const brushTool: Tool = {
  begin(x, y, p) {
    brush.settings.color = currentBrushColor();
    brush.settings.size = currentBrushSize();
    brush.begin(x, y, p);
  },
  move: (x, y, p) => brush.move(x, y, p),
  end() { if (brush.end()) commit(); },
  cancel: () => brush.cancel(),
};

const selectTool = new SelectTool(commit);
const directTool = new DirectSelectTool(commit);
const tools: Record<string, Tool> = {
  brush: brushTool,
  select: selectTool,
  direct: directTool,
  pen: new PenTool(currentStyle, commit),
  text: new TextTool(currentStyle, currentFontSize, commit),
  eyedropper: new EyedropperTool(setPickedColors),
};
for (const kind of ["rect", "ellipse", "line", "polygon", "star"] as ShapeKind[]) {
  tools[kind] = new ShapeTool(kind, currentStyle, commit);
}

let activeTool: Tool = brushTool;
function setTool(name: string) {
  activeTool.deactivate?.();
  activeTool = tools[name] ?? brushTool;
}

onSelectionChange(drawSelectionHandles);

// --- 自動保存: 履歴が動くたびに1秒デバウンスで IndexedDB へ ---

let saveTimer = 0;
history.onRestore = () => { selectTool.reset(); directTool.reset(); }; // 参照が無効になるため
history.onChange = () => {
  refreshLayers();
  clearTimeout(saveTimer);
  saveTimer = window.setTimeout(() => {
    const json = history.current();
    if (json) saveDoc(json);
  }, 1000);
};

// --- 入力・UI 配線 ---

attachPointerInput(
  canvas,
  {
    begin: (x, y, p) => activeTool.begin(x, y, p),
    move: (x, y, p) => activeTool.move(x, y, p),
    end: () => activeTool.end(),
    cancel: () => activeTool.cancel(),
  },
  () => history.undo(),
);

setupPanels({
  onUndo: () => history.undo(),
  onRedo: () => history.redo(),
  onDocChange: commit,
  onToolChange: setTool,
});

setupActions(commit);

// スタイル変更を選択中アイテムに反映
onStyleChange(() => {
  const items = getSelection();
  if (!items.length) return;
  const s = currentStyle();
  for (const it of items) applyStyle(it, s);
  commit();
});

// 起動時に前回のドキュメントを復元
loadDoc().then((json) => {
  if (json) {
    paper.project.clear();
    paper.project.importJSON(json);
    docLayers().at(-1)?.activate();
  }
  history.snapshot(); // 初期状態を履歴の底に積む
});
