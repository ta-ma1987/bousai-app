const AREA_MASTER_URL = "https://www.jma.go.jp/bosai/common/const/area.json";
const WARNING_URL = (code) => `https://www.jma.go.jp/bosai/warning/data/warning/${code}.json`;

// 気象庁「警報・注意報の種類」で公開されている代表的な種別コード。
// 未知のコードは名称の代わりにコードをそのまま表示する。
const WARNING_KIND_NAMES = {
  "02": "暴風雪警報",
  "03": "大雨警報",
  "04": "洪水警報",
  "05": "暴風警報",
  "06": "大雪警報",
  "07": "波浪警報",
  "08": "高潮警報",
  "10": "大雨注意報",
  "12": "大雪注意報",
  "13": "風雪注意報",
  "14": "雷注意報",
  "15": "強風注意報",
  "16": "波浪注意報",
  "17": "融雪注意報",
  "18": "洪水注意報",
  "19": "高潮注意報",
  "20": "濃霧注意報",
  "21": "乾燥注意報",
  "22": "なだれ注意報",
  "23": "低温注意報",
  "24": "霜注意報",
  "25": "着氷注意報",
  "26": "着雪注意報",
  "35": "顕著な大雪に関する情報",
};

const areaSelectEl = document.getElementById("area-select");
const warningStatusEl = document.getElementById("warning-status");
const warningResultEl = document.getElementById("warning-result");
const locateWarningBtn = document.getElementById("locate-warning-btn");

// 警報データの areaTypes[0]/[1] は area.json の class10s / class20s のコード体系に対応する。
// (offices の子は class10s、class10s の子は class20s という階層)
let areaNameMaps = { class10s: {}, class20s: {}, offices: {} };

function resolveAreaName(code) {
  return (
    areaNameMaps.class10s[code]?.name ||
    areaNameMaps.class20s[code]?.name ||
    areaNameMaps.offices[code]?.name ||
    `地域コード:${code}`
  );
}

async function loadAreaOptions() {
  warningStatusEl.textContent = "地域一覧を読み込み中…";
  try {
    const res = await fetch(AREA_MASTER_URL);
    if (!res.ok) throw new Error("failed");
    const data = await res.json();
    const offices = data.offices || {};
    const centers = data.centers || {};
    areaNameMaps = {
      class10s: data.class10s || {},
      class20s: data.class20s || {},
      offices,
    };

    const officeCodes = Object.keys(offices).sort();
    const byCenter = {};
    officeCodes.forEach((code) => {
      const office = offices[code];
      const centerCode = office.parent;
      const centerName = centers[centerCode]?.name || "その他";
      if (!byCenter[centerName]) byCenter[centerName] = [];
      byCenter[centerName].push({ code, name: office.name });
    });

    Object.keys(byCenter)
      .sort()
      .forEach((centerName) => {
        const group = document.createElement("optgroup");
        group.label = centerName;
        byCenter[centerName].forEach(({ code, name }) => {
          const opt = document.createElement("option");
          opt.value = code;
          opt.textContent = name;
          group.appendChild(opt);
        });
        areaSelectEl.appendChild(group);
      });

    warningStatusEl.textContent = "地域を選択すると最新の警報・注意報を表示します。";
  } catch (err) {
    warningStatusEl.textContent = "地域一覧の読み込みに失敗しました。時間をおいて再読み込みしてください。";
  }
}

function warningLabel(code) {
  return WARNING_KIND_NAMES[code] || `警報コード:${code}`;
}

function renderWarnings(data) {
  warningResultEl.innerHTML = "";

  const areaTypes = data?.areaTypes;
  if (!Array.isArray(areaTypes)) {
    warningResultEl.innerHTML = "<div class='warning-card'>データの形式を解釈できませんでした。</div>";
    return;
  }

  const activeItems = [];
  areaTypes.forEach((areaType) => {
    (areaType.areas || []).forEach((area) => {
      const warnings = (area.warnings || []).filter(
        (w) => w.code && w.code !== "00" && w.status !== "解除"
      );
      if (warnings.length > 0) {
        activeItems.push({ areaName: resolveAreaName(area.code), warnings });
      }
    });
  });

  if (activeItems.length === 0) {
    warningResultEl.innerHTML =
      "<div class='warning-card none'><h3>現在発表中の警報・注意報はありません</h3></div>";
    return;
  }

  const reportTime = data.reportDatetime ? new Date(data.reportDatetime) : null;
  if (reportTime) {
    const timeEl = document.createElement("p");
    timeEl.className = "status-text";
    timeEl.textContent = `発表時刻: ${reportTime.toLocaleString("ja-JP")}`;
    warningResultEl.appendChild(timeEl);
  }

  activeItems.forEach(({ areaName, warnings }) => {
    const card = document.createElement("div");
    card.className = "warning-card";
    const names = warnings.map((w) => warningLabel(w.code));
    if (names.some((n) => n.includes("特別警報"))) card.classList.add("emergency");

    card.innerHTML = `<h3>${areaName}</h3><ul>${names
      .map((n) => `<li>${n}</li>`)
      .join("")}</ul>`;
    warningResultEl.appendChild(card);
  });
}

async function loadWarnings(officeCode) {
  warningStatusEl.textContent = "警報・注意報を取得中…";
  warningResultEl.innerHTML = "";
  try {
    const res = await fetch(WARNING_URL(officeCode));
    if (!res.ok) throw new Error("failed");
    const data = await res.json();
    renderWarnings(data);
    warningStatusEl.textContent = "";
  } catch (err) {
    warningStatusEl.textContent = "警報・注意報の取得に失敗しました。時間をおいて再試行してください。";
  }
}

areaSelectEl.addEventListener("change", () => {
  const code = areaSelectEl.value;
  if (code) loadWarnings(code);
  else warningResultEl.innerHTML = "";
});

// 都道府県コード(JIS X 0401、01=北海道〜47=沖縄)を気象庁の発表官署コードに変換する。
// 北海道・沖縄県は複数の官署に分かれているため、代表的な地域(石狩=札幌 / 沖縄本島)を採用する。
function prefNumberToOfficeCode(prefNumber) {
  const padded = String(prefNumber).padStart(2, "0");
  if (padded === "01") return "016000";
  if (padded === "47") return "471000";
  return padded + "0000";
}

async function locateAndSetArea() {
  if (!("geolocation" in navigator)) {
    warningStatusEl.textContent = "この端末では位置情報が利用できません。";
    return;
  }
  locateWarningBtn.disabled = true;
  warningStatusEl.textContent = "現在地を取得中…";

  navigator.geolocation.getCurrentPosition(
    async (pos) => {
      const { latitude: lat, longitude: lon } = pos.coords;
      try {
        warningStatusEl.textContent = "お住まいの地域を確認中…";
        const res = await fetch(
          `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}&accept-language=ja&zoom=10`
        );
        if (!res.ok) throw new Error("reverse geocode failed");
        const geo = await res.json();
        const isoPref = geo.address?.["ISO3166-2-lvl4"];
        const prefNumber = isoPref ? isoPref.split("-")[1] : null;
        if (!prefNumber) throw new Error("prefecture not found");

        await areaOptionsReady;
        const officeCode = prefNumberToOfficeCode(prefNumber);
        const optionExists = areaSelectEl.querySelector(`option[value="${officeCode}"]`);
        if (!optionExists) throw new Error("office code not in list");

        areaSelectEl.value = officeCode;
        loadWarnings(officeCode);
      } catch (err) {
        warningStatusEl.textContent = "現在地から地域を特定できませんでした。手動で選択してください。";
      } finally {
        locateWarningBtn.disabled = false;
      }
    },
    () => {
      warningStatusEl.textContent = "位置情報を取得できませんでした。ブラウザの位置情報許可を確認してください。";
      locateWarningBtn.disabled = false;
    },
    { enableHighAccuracy: true, timeout: 10000 }
  );
}

locateWarningBtn.addEventListener("click", locateAndSetArea);

const areaOptionsReady = loadAreaOptions();

// ホーム画面のカードから再利用するためのヘルパー。
window.prefNumberToOfficeCode = prefNumberToOfficeCode;
window.fetchActiveWarnings = async function (officeCode) {
  await areaOptionsReady;
  const res = await fetch(WARNING_URL(officeCode));
  if (!res.ok) throw new Error("failed");
  const data = await res.json();
  const areaTypes = data?.areaTypes;
  if (!Array.isArray(areaTypes)) return [];

  const activeItems = [];
  areaTypes.forEach((areaType) => {
    (areaType.areas || []).forEach((area) => {
      const warnings = (area.warnings || []).filter(
        (w) => w.code && w.code !== "00" && w.status !== "解除"
      );
      if (warnings.length > 0) {
        activeItems.push({
          areaName: resolveAreaName(area.code),
          names: warnings.map((w) => warningLabel(w.code)),
        });
      }
    });
  });
  return activeItems;
};
