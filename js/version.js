// 更新履歴
const CHANGELOG = [
  {
    version: "1.0.0",
    date: "2026-10-01",
    notes: [
      "GLITCH RUN DELUXE 公開",
      "全5ステージのRTA・ステージ練習・バグ図鑑(全6種)・世界ランキングを実装",
    ],
  },
  {
    version: "1.1.0",
    date: "2026-10-07",
    notes: [
      "キー設定を追加（全操作を自由に割り当て可能・1操作につき3つまで・ゲームパッド対応）",
      "看板の操作説明が割り当てたキーに合わせて表示されるように",
      "新ステージ5つを追加（地下水路／棘の回廊／金庫破り／ハイパー回廊／最終試験）、全10ステージに",
      "世界ランキングを全10ステージのコースに切り替え（通しの自己ベストはリセット、ステージ別ベストは維持）",
    ],
  },
];
const VERSION = CHANGELOG[CHANGELOG.length - 1].version;
document.addEventListener("DOMContentLoaded", () => {
  const el = document.getElementById("ver");
  if (el) el.textContent = "v" + VERSION;
});
