import paper from "paper";
import { Brush } from "./tools/brush";
import { attachPointerInput } from "./input/pointer";
import { History } from "./engine/history";
import { saveDoc, loadDoc } from "./store/db";
import { setupPanels, refreshLayers, currentColor, currentSize } from "./ui/panels";

const canvas = document.getElementById("canvas") as HTMLCanvasElement;
paper.setup(canvas);
paper.project.activeLayer.name = "レイヤー 1";

const history = new History();
const brush = new Brush({ color: "#111111", size: 8 });

// 自動保存: 履歴が動くたびに1秒デバウンスで IndexedDB へ
let saveTimer = 0;
history.onChange = () => {
  refreshLayers();
  clearTimeout(saveTimer);
  saveTimer = window.setTimeout(() => {
    const json = history.current();
    if (json) saveDoc(json);
  }, 1000);
};

attachPointerInput(
  canvas,
  {
    begin(x, y, pressure) {
      brush.settings.color = currentColor();
      brush.settings.size = currentSize();
      brush.begin(x, y, pressure);
    },
    move: (x, y, pressure) => brush.move(x, y, pressure),
    end() {
      if (brush.end()) history.snapshot();
    },
    cancel: () => brush.cancel(),
  },
  () => history.undo(),
);

setupPanels({
  onUndo: () => history.undo(),
  onRedo: () => history.redo(),
  onDocChange: () => history.snapshot(),
});

// 起動時に前回のドキュメントを復元
loadDoc().then((json) => {
  if (json) {
    paper.project.clear();
    paper.project.importJSON(json);
    paper.project.layers[paper.project.layers.length - 1]?.activate();
  }
  history.snapshot(); // 初期状態を履歴の底に積む
});
