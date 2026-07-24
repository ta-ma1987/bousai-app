const OVERPASS_URL = "https://overpass-api.de/api/interpreter";
const SEARCH_RADIUS_M = 3000;

const mapStatusEl = document.getElementById("map-status");
const shelterListEl = document.getElementById("shelter-list");
const locateBtn = document.getElementById("locate-btn");

let map = null;
let shelterMarkers = [];
let userMarker = null;

// 国土地理院「重ねるハザードマップ」が公開しているハザードタイル(国土交通省 disaportal)。
const HAZARD_LAYERS = {
  "洪水浸水想定区域": "https://disaportaldata.gsi.go.jp/raster/01_flood_l2_shinsuishin_data/{z}/{x}/{y}.png",
  "津波浸水想定": "https://disaportaldata.gsi.go.jp/raster/04_tsunami_newlegend_data/{z}/{x}/{y}.png",
  "土砂災害警戒区域(土石流)": "https://disaportaldata.gsi.go.jp/raster/05_dosekiryukeikaikuiki/{z}/{x}/{y}.png",
  "土砂災害警戒区域(急傾斜地)": "https://disaportaldata.gsi.go.jp/raster/05_kyukeishakeikaikuiki/{z}/{x}/{y}.png",
};

function initMap(lat, lon) {
  if (map) return;
  map = L.map("map").setView([lat, lon], 15);
  window.bousaiMap = map;
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: "&copy; OpenStreetMap contributors",
    maxZoom: 19,
  }).addTo(map);

  const hazardOverlays = {};
  Object.entries(HAZARD_LAYERS).forEach(([label, url]) => {
    hazardOverlays[label] = L.tileLayer(url, {
      opacity: 0.6,
      maxNativeZoom: 17,
      attribution: "ハザードマップ: 国土交通省 重ねるハザードマップ",
    });
  });
  L.control.layers(null, hazardOverlays, { collapsed: true }).addTo(map);
}

function haversineDistanceMeters(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const toRad = (deg) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

async function fetchShelters(lat, lon, radius) {
  const query = `
    [out:json][timeout:25];
    (
      node["emergency"="assembly_point"](around:${radius},${lat},${lon});
      way["emergency"="assembly_point"](around:${radius},${lat},${lon});
      node["amenity"="shelter"](around:${radius},${lat},${lon});
      way["amenity"="shelter"](around:${radius},${lat},${lon});
    );
    out center tags;
  `;
  const res = await fetch(OVERPASS_URL, {
    method: "POST",
    body: "data=" + encodeURIComponent(query),
  });
  if (!res.ok) throw new Error("避難所データの取得に失敗しました");
  const data = await res.json();
  return data.elements
    .map((el) => {
      const elLat = el.lat ?? el.center?.lat;
      const elLon = el.lon ?? el.center?.lon;
      if (elLat == null || elLon == null) return null;
      return {
        name: el.tags?.name || el.tags?.["name:ja"] || "名称不明の避難場所",
        lat: elLat,
        lon: elLon,
        dist: haversineDistanceMeters(lat, lon, elLat, elLon),
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.dist - b.dist);
}

function renderShelters(shelters, originLat, originLon) {
  shelterMarkers.forEach((m) => map.removeLayer(m));
  shelterMarkers = [];
  shelterListEl.innerHTML = "";

  if (shelters.length === 0) {
    shelterListEl.innerHTML = "<li>近くに避難場所データが見つかりませんでした。地図をズームして確認してください。</li>";
    return;
  }

  const VISIBLE_COUNT = 5;
  const shown = shelters.slice(0, 20);

  shown.forEach((s, index) => {
    const marker = L.marker([s.lat, s.lon]).addTo(map).bindPopup(s.name);
    shelterMarkers.push(marker);

    const li = document.createElement("li");
    if (index >= VISIBLE_COUNT) li.hidden = true;
    const distText =
      s.dist >= 1000 ? `${(s.dist / 1000).toFixed(1)} km` : `${Math.round(s.dist)} m`;
    li.innerHTML = `<div class="name">${s.name}</div><div class="dist">現在地から約 ${distText}</div>`;
    li.addEventListener("click", () => {
      map.setView([s.lat, s.lon], 17);
      marker.openPopup();
    });
    shelterListEl.appendChild(li);
  });

  if (shown.length > VISIBLE_COUNT) {
    const moreBtn = document.createElement("li");
    moreBtn.className = "shelter-more-btn";
    moreBtn.textContent = `もっと見る（あと${shown.length - VISIBLE_COUNT}件）`;
    moreBtn.addEventListener("click", () => {
      shelterListEl.querySelectorAll("li[hidden]").forEach((el) => (el.hidden = false));
      moreBtn.remove();
    });
    shelterListEl.appendChild(moreBtn);
  }
}

async function locateAndSearch() {
  if (!("geolocation" in navigator)) {
    mapStatusEl.textContent = "この端末では位置情報が利用できません。";
    return;
  }
  mapStatusEl.textContent = "現在地を取得中…";
  locateBtn.disabled = true;

  navigator.geolocation.getCurrentPosition(
    async (pos) => {
      const { latitude: lat, longitude: lon } = pos.coords;
      initMap(lat, lon);
      map.setView([lat, lon], 15);

      if (userMarker) map.removeLayer(userMarker);
      userMarker = L.circleMarker([lat, lon], {
        radius: 8,
        color: "#1d4e89",
        fillColor: "#1d4e89",
        fillOpacity: 0.8,
      })
        .addTo(map)
        .bindPopup("現在地");

      mapStatusEl.textContent = "周辺の避難場所を検索中…";
      try {
        const shelters = await fetchShelters(lat, lon, SEARCH_RADIUS_M);
        renderShelters(shelters, lat, lon);
        mapStatusEl.textContent = `半径${SEARCH_RADIUS_M / 1000}km以内の避難場所 ${shelters.length}件`;
      } catch (err) {
        mapStatusEl.textContent = "避難場所データの取得に失敗しました。時間をおいて再試行してください。";
      } finally {
        locateBtn.disabled = false;
      }
    },
    (err) => {
      mapStatusEl.textContent = "位置情報を取得できませんでした。ブラウザの位置情報許可を確認してください。";
      locateBtn.disabled = false;
    },
    { enableHighAccuracy: true, timeout: 10000 }
  );
}

locateBtn.addEventListener("click", locateAndSearch);

initMap(35.681236, 139.767125);
