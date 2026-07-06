// 全ツール共通インターフェイス。pointer.ts から project 座標+筆圧で呼ばれる。
export interface Tool {
  begin(x: number, y: number, pressure: number): void;
  move(x: number, y: number, pressure: number): void;
  end(): void;
  cancel(): void;
  /** ツール切替時の後始末(ペンのパス確定など) */
  deactivate?(): void;
}

/** 塗り/線の現在スタイル(パネルから取得) */
export interface Style {
  fill: string | null;
  stroke: string | null;
  strokeWidth: number;
  cap: string;
  join: string;
}
