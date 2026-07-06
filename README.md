# art — iPad ベクターお絵かき Web アプリ

Apple Pencil の筆圧に対応した、Illustrator ライクなベクター描画 PWA(開発中)。

## 進捗状況

- **Phase 1 完了** ✅
  - 筆圧フリーハンド描画(perfect-freehand、Apple Pencil 対応)
  - 無限キャンバス(ピンチズーム / 1〜2本指パン / 2本指タップで Undo)
  - パームリジェクション(描画はペン・マウスのみ、指はジェスチャ専用)
  - 基本シェイプ(長方形・楕円・直線・多角形・星)※多角形=6角・星=5芒固定
  - ペンツール(クリックでアンカー、ドラッグでハンドル、始点クリックで閉じて確定、ツール切替でも確定)
  - 選択+変形(移動 / 角ハンドルで拡大縮小 / 上ハンドルで回転)※単一選択
  - 塗り / 線(色・線幅・線端 cap・角 join)、スウォッチ、スポイト
  - レイヤーパネル(追加・削除・表示切替・並べ替え・選択)
  - Undo / Redo、自動保存(IndexedDB)、SVG / PNG 書き出し
  - PWA(Service Worker で全アセットキャッシュ、オフライン動作、ホーム画面追加対応)
- **Phase 2 完了** ✅
  - 複数選択(空白ドラッグでマーキー選択)
  - パスファインダー(合体・前面型抜き・交差・中マド)
  - グラデーション(線形・円形、2色)
  - ダイレクト選択(アンカー・ハンドル単位の編集)、スムーズ、パス簡略化
  - 整列(6種)・分布(横/縦等分)
  - グループ化/解除、クリッピングマスク(最前面がマスク)
  - 不透明度、描画モード(乗算・スクリーン等7種)
  - リフレクト(左右/上下反転)、シアー(横/縦、ボタンで±段階適用)
  - 破線ストローク
  - テキストツール(ポイント文字、タップで作成・再タップで編集)
  - スマートガイド/スナップ(移動時に他オブジェクトの端・中心に吸着)
  - コピー&ペースト、複製、削除
  - ※ 曲線ツールはペン+ダイレクト選択で代替。可変線幅パスは Phase 3 送り(ブラシは筆圧対応済み)
- **Phase 3(グラデーションメッシュ・画像トレース以外完了)**
  - ✅ シンボル(選択を「シンボル登録」→ パレットから配置。定義は配置済みインスタンスから復元されるため、インスタンスを全削除すると定義も消える)
  - ✅ ブラシライブラリ(標準・カリグラフィ・マーカー・鉛筆・パターン点描)
  - ✅ PDF 書き出し(jspdf + svg2pdf.js、ベクター保持、動的ロード)
  - ✅ 複数アートボード(白矩形ベースの軽量実装。追加・ジャンプ・削除・領域SVG書き出し)
  - ⬜ グラデーションメッシュ・画像トレース(高難度のため実装方針を相談のうえ着手)

## 技術スタック

Vite + TypeScript / Paper.js(ベクターエンジン) / perfect-freehand(筆圧ストローク) / idb(IndexedDB) / Pointer Events API

## 開発

```bash
npm install
npm run dev     # --host 付き。LAN 内からアクセス可能
npm run build   # 型チェック + 本番ビルド → dist/
```

## iPad で動かす手順

### 開発中の確認(PC + iPad が同じ Wi-Fi)

1. PC で `npm run dev` を実行(`--host` 付きなので LAN に公開される)
2. 起動ログに表示される `Network: http://<PCのIP>:5173` の URL を控える
   (IP がわからない場合は Windows なら `ipconfig`、Mac なら `ifconfig` で確認)
3. iPad の Safari でその URL を開く
4. Apple Pencil で描いて動作確認

### 本番用(ホーム画面のアプリとして使う)

Service Worker(オフライン機能)は HTTPS が必須のため、無料の静的ホスティングにデプロイします。以下は Cloudflare Pages の例(Netlify / Vercel / GitHub Pages でも同様):

1. `npm run build` で `dist/` に本番ビルドを生成
2. Cloudflare Pages にデプロイ:
   - [dash.cloudflare.com](https://dash.cloudflare.com) → Workers & Pages → Create → Pages
   - 「Direct Upload」で `dist/` フォルダをアップロード(または GitHub 連携で自動デプロイ)
   - `https://<プロジェクト名>.pages.dev` が発行される
3. iPad の Safari でその URL を開く
4. **共有ボタン → 「ホーム画面に追加」** でアプリ化
5. 以後はホーム画面のアイコンから全画面で起動でき、一度読み込めばオフラインでも動作します

### (任意)ネイティブアプリ化

Capacitor でラップして Mac + Xcode から iPad にインストールする方法もあります。
無料 Apple ID では 7 日ごとに再署名が必要、有料開発者アカウント(年間)なら 1 年有効。
PWA で十分動くため、これは任意です。

## 構成

```
src/
├── main.ts            # 起動・各モジュールの配線
├── input/pointer.ts   # Pointer Events(ペン優先・ジェスチャ・coalesced events)
├── tools/brush.ts     # 筆圧ブラシ(perfect-freehand)
├── engine/history.ts  # Undo/Redo(スナップショット方式)
├── store/db.ts        # IndexedDB 永続化
└── ui/panels.ts       # ツールバー・レイヤーパネル
```

設計メモ: 独自のドキュメントモデルは持たず、Paper.js の project(Layer→Item)を
そのままドキュメントとして扱う。保存は `exportJSON`、書き出しは `exportSVG`。
