import paper from "paper";
import { withGuiHidden, resetGui } from "./gui";

// Undo/Redo。ponytail: スナップショット方式(project全体のJSON)。
// ドキュメントが巨大化して遅くなったらコマンドパターンに移行する。
export class History {
  private stack: string[] = [];
  private index = -1;
  private readonly limit = 50;
  onChange: (() => void) | null = null; // UI更新・自動保存のフック
  onRestore: (() => void) | null = null; // undo/redo後(アイテム参照が無効になる)

  /** 現在の状態を積む(操作完了ごとに呼ぶ) */
  snapshot() {
    this.stack.length = this.index + 1;
    this.stack.push(withGuiHidden(() => paper.project.exportJSON()));
    if (this.stack.length > this.limit) this.stack.shift();
    this.index = this.stack.length - 1;
    this.onChange?.();
  }

  undo() { if (this.index > 0) this.restore(--this.index); }
  redo() { if (this.index < this.stack.length - 1) this.restore(++this.index); }

  private restore(i: number) {
    const activeName = paper.project.activeLayer.name;
    paper.project.clear();
    resetGui();
    paper.project.importJSON(this.stack[i]);
    // importJSON後もアクティブレイヤーを維持(なければ最後のレイヤー)
    const layer = paper.project.layers.find((l) => l.name === activeName);
    (layer ?? paper.project.layers[paper.project.layers.length - 1])?.activate();
    this.onRestore?.();
    this.onChange?.();
  }

  current(): string | undefined { return this.stack[this.index]; }
}
