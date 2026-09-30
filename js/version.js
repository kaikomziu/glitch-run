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
];
const VERSION = CHANGELOG[CHANGELOG.length - 1].version;
document.addEventListener("DOMContentLoaded", () => {
  const el = document.getElementById("ver");
  if (el) el.textContent = "v" + VERSION;
});
