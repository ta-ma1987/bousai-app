const navTargets = document.querySelectorAll("[data-tab]");
const tabPanels = document.querySelectorAll(".tab-panel");
const homeBackBtn = document.getElementById("home-back-btn");

function activateTab(target) {
  tabPanels.forEach((p) => p.classList.toggle("active", p.id === target));
  homeBackBtn.hidden = target === "tab-home";

  if (target === "tab-map" && window.bousaiMap) {
    setTimeout(() => window.bousaiMap.invalidateSize(), 50);
  }
  if (target === "tab-home") {
    renderHomeExpiryAlert();
    renderHomeQuake();
    renderHomeTyphoon();
    renderHomeWeather();
  }
}

navTargets.forEach((el) => {
  el.addEventListener("click", () => activateTab(el.dataset.tab));
});

function renderHomeDate() {
  const dateEl = document.getElementById("home-date");
  if (!dateEl) return;
  const now = new Date();
  dateEl.textContent = now.toLocaleDateString("ja-JP", {
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "long",
  });
}

function intensityLabel(maxi) {
  const specialLabels = { "5-": "5弱", "5+": "5強", "6-": "6弱", "6+": "6強" };
  return "震度" + (specialLabels[maxi] || maxi);
}

let lastQuakeList = [];

function formatQuakeTime(at) {
  return new Date(at).toLocaleString("ja-JP", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

async function renderHomeQuake() {
  const cardEl = document.getElementById("home-quake-card");
  if (!cardEl) return;
  cardEl.innerHTML = `<p class="home-card-title">🌏 地震情報を取得中…</p>`;

  try {
    const res = await fetch("https://www.jma.go.jp/bosai/quake/data/list.json");
    if (!res.ok) throw new Error("failed");
    const data = await res.json();
    lastQuakeList = data;

    // maxi は "1"〜"7" や "5-"/"5+" 等の表記。震度3未満(1・2)を除外する。
    const withIntensity = data.filter((q) => q.maxi && parseInt(q.maxi, 10) >= 3);

    if (withIntensity.length === 0) {
      cardEl.innerHTML = `<p class="home-card-title">🌏 地震情報</p><p class="home-card-oneline home-card-ok">✅ 震度3以上の地震はありません</p>`;
      return;
    }

    const latest = withIntensity[0];
    cardEl.innerHTML = `
      <p class="home-card-title">🌏 最新の地震情報</p>
      <p class="home-card-oneline">${latest.anm || "震源不明"} 最大${intensityLabel(latest.maxi)}（${formatQuakeTime(latest.at)}）</p>
      <button type="button" class="home-detail-link" id="quake-detail-btn">🔍 詳細</button>
    `;
    document.getElementById("quake-detail-btn").addEventListener("click", openQuakeDialog);
  } catch (err) {
    cardEl.innerHTML = `<p class="home-card-title">🌏 地震情報を取得できませんでした</p>`;
  }
}

function openQuakeDialog() {
  const dialog = document.getElementById("quake-dialog");
  const body = document.getElementById("quake-dialog-body");
  if (!dialog || !body) return;

  // 震度3以上のみ、ホームカードと同じ基準にそろえる。
  const recent = lastQuakeList.filter((q) => q.maxi && parseInt(q.maxi, 10) >= 3).slice(0, 20);
  const link = `<a class="home-card-link" href="https://www.jma.go.jp/bosai/" target="_blank" rel="noopener">気象庁 防災情報でさらに詳しく見る →</a>`;

  if (recent.length === 0) {
    body.innerHTML = `<p class="status-text">震度3以上の地震情報はありません。</p>${link}`;
  } else {
    const rows = recent
      .map((q) => {
        const time = formatQuakeTime(q.at);
        const place = q.anm || "震源不明";
        const mag = q.mag ? `M${q.mag}` : "";
        return `<li><span class="quake-time">${time}</span><span class="quake-place">${place}</span><span class="quake-mag">${mag}</span><span class="quake-maxi">最大${intensityLabel(q.maxi)}</span></li>`;
      })
      .join("");
    body.innerHTML = `<ul class="dialog-quake-list">${rows}</ul>${link}`;
  }

  dialog.showModal();
}

const quakeDialogEl = document.getElementById("quake-dialog");
const quakeDialogCloseBtn = document.getElementById("quake-dialog-close");
if (quakeDialogCloseBtn) quakeDialogCloseBtn.addEventListener("click", () => quakeDialogEl.close());
if (quakeDialogEl) {
  quakeDialogEl.addEventListener("click", (e) => {
    if (e.target === quakeDialogEl) quakeDialogEl.close();
  });
}

async function renderHomeTyphoon() {
  const cardEl = document.getElementById("home-typhoon-card");
  if (!cardEl) return;
  cardEl.innerHTML = `<p class="home-card-title">🌀 台風情報を取得中…</p>`;

  try {
    const res = await fetch("https://www.jma.go.jp/bosai/typhoon/data/targetTc.json");
    if (!res.ok) throw new Error("failed");
    const list = await res.json();

    if (!list.length) {
      cardEl.className = "home-typhoon-card none";
      cardEl.innerHTML = `<p class="home-card-title">🌀 台風情報</p><p class="home-card-oneline home-card-ok">✅ 発生中の台風はありません</p>`;
      return;
    }

    cardEl.className = "home-typhoon-card";
    const first = list[0];
    let name = "";
    try {
      const fRes = await fetch(
        `https://www.jma.go.jp/bosai/typhoon/data/${first.tropicalCyclone}/forecast.json`
      );
      const fData = await fRes.json();
      name = fData[0]?.name?.jp || "";
    } catch (err) {
      /* 名称が取れなくても号数だけは表示する */
    }
    const num = parseInt(first.typhoonNumber.slice(2), 10);
    const extra = list.length > 1 ? `ほか${list.length - 1}件` : "";

    cardEl.innerHTML = `
      <p class="home-card-title">🌀 台風情報</p>
      <p class="home-card-oneline">台風第${num}号${name ? `「${name}」` : ""} ${extra}</p>
      <a class="home-card-link" href="https://www.jma.go.jp/bosai/typhoon/" target="_blank" rel="noopener">詳しく見る →</a>
    `;
  } catch (err) {
    cardEl.innerHTML = `<p class="home-card-title">🌀 台風情報を取得できませんでした</p>`;
  }
}

// JIS X 0401 の都道府県コード(01〜47)順の名称。ISO3166-2-lvl4 (例:"JP-13")と対応する。
const PREF_NAMES = [
  "北海道", "青森県", "岩手県", "宮城県", "秋田県", "山形県", "福島県", "茨城県", "栃木県", "群馬県",
  "埼玉県", "千葉県", "東京都", "神奈川県", "新潟県", "富山県", "石川県", "福井県", "山梨県", "長野県",
  "岐阜県", "静岡県", "愛知県", "三重県", "滋賀県", "京都府", "大阪府", "兵庫県", "奈良県", "和歌山県",
  "鳥取県", "島根県", "岡山県", "広島県", "山口県", "徳島県", "香川県", "愛媛県", "高知県", "福岡県",
  "佐賀県", "長崎県", "熊本県", "大分県", "宮崎県", "鹿児島県", "沖縄県",
];

function weatherIconAndLabel(text) {
  if (text.includes("雷")) return { icon: "⛈️", label: "雷雨" };
  if (text.includes("雪")) return { icon: "❄️", label: "雪" };
  if (text.includes("雨") && text.includes("晴")) return { icon: "🌦️", label: "晴れ時々雨" };
  if (text.includes("雨")) return { icon: "🌧️", label: "雨" };
  if (text.includes("曇") && text.includes("晴")) return { icon: "⛅", label: "晴れ時々曇り" };
  if (text.includes("曇")) return { icon: "☁️", label: "くもり" };
  if (text.includes("晴")) return { icon: "☀️", label: "晴れ" };
  return { icon: "🌤️", label: "" };
}

function renderHomeWeather() {
  const el = document.getElementById("home-weather");
  if (!el) return;
  if (!("geolocation" in navigator)) {
    el.innerHTML = "";
    return;
  }

  el.innerHTML = `<span class="home-weather-loading">天気を取得中…</span>`;

  navigator.geolocation.getCurrentPosition(
    async (pos) => {
      try {
        const { latitude: lat, longitude: lon } = pos.coords;
        const res = await fetch(
          `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}&accept-language=ja&zoom=10`
        );
        if (!res.ok) throw new Error("reverse geocode failed");
        const geo = await res.json();
        const isoPref = geo.address?.["ISO3166-2-lvl4"];
        const prefNumber = isoPref ? isoPref.split("-")[1] : null;
        if (!prefNumber) throw new Error("prefecture not found");

        const officeCode = window.prefNumberToOfficeCode(prefNumber);
        const fRes = await fetch(`https://www.jma.go.jp/bosai/forecast/data/forecast/${officeCode}.json`);
        if (!fRes.ok) throw new Error("forecast fetch failed");
        const fData = await fRes.json();

        const series = fData[0]?.timeSeries?.[0];
        const area = series?.areas?.[0];
        if (!area) throw new Error("no forecast area");

        const weatherText = area.weathers?.[0] || "";
        const { icon, label } = weatherIconAndLabel(weatherText);

        const popSeries = fData[0]?.timeSeries?.[1];
        const popArea =
          popSeries?.areas?.find((a) => a.area.code === area.area.code) || popSeries?.areas?.[0];
        let pop = null;
        if (popArea) {
          const todayPops = popArea.pops.slice(0, 2).map(Number).filter((n) => !isNaN(n));
          if (todayPops.length) pop = Math.max(...todayPops);
        }

        el.innerHTML = `<span class="home-weather-icon">${icon}</span><span class="home-weather-text">${label}${
          pop !== null ? ` ${pop}%` : ""
        }</span>`;
        el.title = `${area.area.name}: ${weatherText}`;
      } catch (err) {
        el.innerHTML = "";
      }
    },
    () => {
      el.innerHTML = "";
    },
    { enableHighAccuracy: false, timeout: 8000 }
  );
}

const homeHeatBtn = document.getElementById("home-heat-btn");
if (homeHeatBtn) homeHeatBtn.addEventListener("click", locateForHeatAlert);

function locateForHeatAlert() {
  const resultEl = document.getElementById("home-heat-result");
  if (!("geolocation" in navigator)) {
    resultEl.textContent = "この端末では位置情報が利用できません。";
    return;
  }
  homeHeatBtn.disabled = true;
  resultEl.textContent = "現在地を確認中…";

  navigator.geolocation.getCurrentPosition(
    async (pos) => {
      try {
        const { latitude: lat, longitude: lon } = pos.coords;
        const res = await fetch(
          `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}&accept-language=ja&zoom=8`
        );
        if (!res.ok) throw new Error("reverse geocode failed");
        const geo = await res.json();
        const isoPref = geo.address?.["ISO3166-2-lvl4"];
        const prefNumber = isoPref ? parseInt(isoPref.split("-")[1], 10) : null;
        const prefName = prefNumber ? PREF_NAMES[prefNumber - 1] : null;

        if (!prefName) throw new Error("prefecture not found");

        resultEl.innerHTML = `
          <p class="home-card-oneline">📍 ${prefName} <a class="home-card-link" href="https://www.wbgt.env.go.jp/alert.php" target="_blank" rel="noopener">確認 →</a></p>
        `;
      } catch (err) {
        resultEl.textContent = "現在地から地域を特定できませんでした。";
      } finally {
        homeHeatBtn.disabled = false;
      }
    },
    () => {
      resultEl.textContent = "位置情報を取得できませんでした。ブラウザの位置情報許可を確認してください。";
      homeHeatBtn.disabled = false;
    },
    { enableHighAccuracy: true, timeout: 10000 }
  );
}

const homeWarningBtn = document.getElementById("home-warning-btn");
if (homeWarningBtn) homeWarningBtn.addEventListener("click", locateForHomeWarning);

function locateForHomeWarning() {
  const resultEl = document.getElementById("home-warning-result");
  if (!("geolocation" in navigator)) {
    resultEl.textContent = "この端末では位置情報が利用できません。";
    return;
  }
  homeWarningBtn.disabled = true;
  resultEl.textContent = "現在地を確認中…";

  navigator.geolocation.getCurrentPosition(
    async (pos) => {
      try {
        const { latitude: lat, longitude: lon } = pos.coords;
        const res = await fetch(
          `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}&accept-language=ja&zoom=10`
        );
        if (!res.ok) throw new Error("reverse geocode failed");
        const geo = await res.json();
        const isoPref = geo.address?.["ISO3166-2-lvl4"];
        const prefNumber = isoPref ? isoPref.split("-")[1] : null;
        if (!prefNumber) throw new Error("prefecture not found");

        const officeCode = window.prefNumberToOfficeCode(prefNumber);
        const items = await window.fetchActiveWarnings(officeCode);

        if (items.length === 0) {
          resultEl.innerHTML = `<p class="home-card-oneline home-card-ok">✅ 警報なし</p>`;
        } else {
          const first = items[0];
          const extra = items.length > 1 ? `ほか${items.length - 1}地域` : "";
          resultEl.innerHTML = `<p class="home-card-oneline">${first.areaName} ${first.names.join("・")} ${extra}</p>`;
        }
      } catch (err) {
        resultEl.textContent = "現在地から地域を特定できませんでした。";
      } finally {
        homeWarningBtn.disabled = false;
      }
    },
    () => {
      resultEl.textContent = "位置情報を取得できませんでした。ブラウザの位置情報許可を確認してください。";
      homeWarningBtn.disabled = false;
    },
    { enableHighAccuracy: true, timeout: 10000 }
  );
}

const EXPIRY_ALERT_WINDOW_DAYS = 14;

function renderHomeExpiryAlert() {
  const cardEl = document.getElementById("home-expiry-card");
  if (!cardEl) return;

  let items = [];
  try {
    const raw = localStorage.getItem("bousai-checklist-v2");
    items = raw ? JSON.parse(raw) : [];
  } catch (err) {
    items = [];
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const nearExpiry = items
    .filter((i) => i.expiry)
    .map((i) => {
      const expDate = new Date(i.expiry + "T00:00:00");
      const diffDays = Math.round((expDate - today) / 86400000);
      return { ...i, diffDays };
    })
    .filter((i) => i.diffDays <= EXPIRY_ALERT_WINDOW_DAYS)
    .sort((a, b) => a.diffDays - b.diffDays);

  if (nearExpiry.length === 0) {
    cardEl.hidden = true;
    cardEl.innerHTML = "";
    return;
  }

  cardEl.hidden = false;
  const meta = window.CATEGORY_META || {};
  const rows = nearExpiry
    .slice(0, 6)
    .map((i) => {
      const icon = meta[i.category]?.icon || "📦";
      const label =
        i.diffDays < 0
          ? `期限切れ（${Math.abs(i.diffDays)}日経過）`
          : i.diffDays === 0
          ? "本日が期限"
          : `あと${i.diffDays}日`;
      const cls = i.diffDays < 0 ? "expiry-expired" : "expiry-soon";
      return `<li><span class="expiry-alert-name">${icon} ${i.label}</span><span class="expiry-tag ${cls}">${label}</span></li>`;
    })
    .join("");

  cardEl.innerHTML = `
    <p class="home-expiry-title">⚠️ 期限が近い備蓄品（${nearExpiry.length}件）</p>
    <ul class="expiry-alert-list">${rows}</ul>
  `;
}

renderHomeDate();
renderHomeExpiryAlert();
renderHomeQuake();
renderHomeTyphoon();
renderHomeWeather();

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("service-worker.js").catch(() => {});
  });
}
