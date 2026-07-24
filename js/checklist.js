const STORAGE_KEY = "bousai-checklist-v2";
const LEGACY_STORAGE_KEY = "bousai-checklist-v1";

const CATEGORY_META = {
  "食品・飲料": { icon: "🍚", color: "#2e8b6f" },
  "医薬品・救急": { icon: "🩹", color: "#d1435b" },
  "衛生・トイレ用品": { icon: "🧻", color: "#2a9d9d" },
  "情報・照明": { icon: "🔦", color: "#e0932b" },
  "貴重品・書類": { icon: "💴", color: "#6a4fb6" },
  "防寒・衣類": { icon: "🧥", color: "#a15c2b" },
  "その他": { icon: "📦", color: "#6b7785" },
};
const CATEGORY_ORDER = Object.keys(CATEGORY_META);
window.CATEGORY_META = CATEGORY_META;

const DEFAULT_ITEMS = [
  { label: "飲料水（1人1日3L目安）", category: "食品・飲料" },
  { label: "非常食", category: "食品・飲料" },
  { label: "懐中電灯", category: "情報・照明" },
  {
    label: "電池",
    category: "情報・照明",
    children: [{ label: "単3電池 ×8本" }, { label: "単2電池 ×4本" }],
  },
  { label: "モバイルバッテリー", category: "情報・照明" },
  { label: "携帯ラジオ", category: "情報・照明" },
  { label: "救急セット・常備薬", category: "医薬品・救急" },
  { label: "軍手・マスク", category: "衛生・トイレ用品" },
  { label: "現金（小銭）", category: "貴重品・書類" },
  { label: "健康保険証のコピー", category: "貴重品・書類" },
  { label: "ヘルメット・防災頭巾", category: "その他" },
];

const formEl = document.getElementById("checklist-form");
const inputEl = document.getElementById("item-input");
const categorySelectEl = document.getElementById("category-select");
const expiryInputEl = document.getElementById("expiry-input");
const groupsEl = document.getElementById("checklist-groups");
const summaryEl = document.getElementById("checklist-summary");

function loadItems() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch (err) {
    /* 破損データは無視して初期値を使う */
  }

  // v1(カテゴリー導入前)のデータがあれば「その他」として引き継ぐ
  try {
    const legacyRaw = localStorage.getItem(LEGACY_STORAGE_KEY);
    if (legacyRaw) {
      const legacyItems = JSON.parse(legacyRaw);
      const migrated = legacyItems.map((item) => ({
        id: item.id || crypto.randomUUID(),
        label: item.label,
        category: "その他",
        done: !!item.done,
        expiry: null,
      }));
      saveItems(migrated);
      return migrated;
    }
  } catch (err) {
    /* 無視 */
  }

  const initial = DEFAULT_ITEMS.map(({ label, category, children }) => ({
    id: crypto.randomUUID(),
    label,
    category,
    done: false,
    expiry: null,
    children: children
      ? children.map((c) => ({ id: crypto.randomUUID(), label: c.label, done: false, expiry: null }))
      : undefined,
  }));
  saveItems(initial);
  return initial;
}

function saveItems(items) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
}

let items = loadItems();
const openCategories = new Set();
let editingId = null;
let addingVariantId = null;

function isParent(item) {
  return Array.isArray(item.children) && item.children.length > 0;
}

function expiryInfo(expiry) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const expDate = new Date(expiry + "T00:00:00");
  const diffDays = Math.round((expDate - today) / 86400000);

  if (diffDays < 0) return { text: "期限切れ", cls: "expiry-expired" };
  if (diffDays === 0) return { text: "本日が期限", cls: "expiry-soon" };
  if (diffDays <= 14) return { text: `期限まであと${diffDays}日`, cls: "expiry-soon" };
  return { text: `期限: ${expiry}`, cls: "expiry-ok" };
}

// 親アイテム(バリエーションあり)は「全子アイテムが完了か」「一番近い子の期限」を代表値として扱う。
function sortKey(item) {
  if (isParent(item)) {
    const allDone = item.children.every((c) => c.done);
    const expiries = item.children.map((c) => c.expiry).filter(Boolean).sort();
    return { done: allDone, expiry: expiries[0] || null };
  }
  return { done: item.done, expiry: item.expiry || null };
}

function sortItems(a, b) {
  const ka = sortKey(a);
  const kb = sortKey(b);
  if (ka.done !== kb.done) return ka.done ? 1 : -1;
  if (ka.expiry && kb.expiry) return ka.expiry.localeCompare(kb.expiry);
  if (ka.expiry) return -1;
  if (kb.expiry) return 1;
  return 0;
}

// 親アイテム自体はカウントせず、子アイテム(または子を持たない通常アイテム)だけを1件として数える。
function countLeaves(itemList) {
  let total = 0;
  let done = 0;
  itemList.forEach((item) => {
    if (isParent(item)) {
      total += item.children.length;
      done += item.children.filter((c) => c.done).length;
    } else {
      total += 1;
      if (item.done) done += 1;
    }
  });
  return { total, done };
}

let dragState = null;
let hoverOpenTimer = null;

function createGhost(label, icon) {
  const ghost = document.createElement("div");
  ghost.className = "drag-ghost";
  ghost.textContent = `${icon} ${label}`;
  document.body.appendChild(ghost);
  return ghost;
}

function positionGhost(ghost, x, y) {
  ghost.style.left = x + "px";
  ghost.style.top = y + "px";
}

function clearDragOver() {
  document.querySelectorAll(".category-group.drag-over").forEach((el) => el.classList.remove("drag-over"));
}

function handlePointerMove(e) {
  if (!dragState) return;
  positionGhost(dragState.ghost, e.clientX, e.clientY);

  const elUnder = document.elementFromPoint(e.clientX, e.clientY);
  const group = elUnder ? elUnder.closest(".category-group") : null;
  const newCategory = group ? group.dataset.category : null;

  if (newCategory !== dragState.hoveredCategory) {
    clearDragOver();
    dragState.hoveredCategory = newCategory;
    if (hoverOpenTimer) clearTimeout(hoverOpenTimer);
    if (group) {
      group.classList.add("drag-over");
      if (!group.open) {
        hoverOpenTimer = setTimeout(() => {
          group.open = true;
        }, 400);
      }
    }
  }
}

function handlePointerUp(e) {
  if (!dragState) return;
  const { item, ghost, hoveredCategory, li } = dragState;

  if (hoverOpenTimer) {
    clearTimeout(hoverOpenTimer);
    hoverOpenTimer = null;
  }
  clearDragOver();
  ghost.remove();
  li.classList.remove("dragging");

  const handle = e.currentTarget;
  handle.removeEventListener("pointermove", handlePointerMove);
  handle.removeEventListener("pointerup", handlePointerUp);
  handle.removeEventListener("pointercancel", handlePointerUp);

  dragState = null;

  if (hoveredCategory && hoveredCategory !== item.category) {
    item.category = hoveredCategory;
    openCategories.add(hoveredCategory);
    saveItems(items);
    renderChecklist();
  }
}

function handlePointerDown(e, item, li) {
  e.preventDefault();
  const meta = CATEGORY_META[item.category] || { icon: "📦" };
  const ghost = createGhost(item.label, meta.icon);
  positionGhost(ghost, e.clientX, e.clientY);
  li.classList.add("dragging");

  dragState = { item, ghost, li, hoveredCategory: null };

  const handle = e.currentTarget;
  handle.setPointerCapture(e.pointerId);
  handle.addEventListener("pointermove", handlePointerMove);
  handle.addEventListener("pointerup", handlePointerUp);
  handle.addEventListener("pointercancel", handlePointerUp);
}

function buildItemRow(item) {
  const li = document.createElement("li");
  li.className = "checklist-item" + (item.done ? " done" : "");

  const handle = document.createElement("span");
  handle.className = "drag-handle";
  handle.textContent = "⠿";
  handle.title = "ドラッグして別のカテゴリーへ移動";
  handle.addEventListener("pointerdown", (e) => handlePointerDown(e, item, li));
  li.appendChild(handle);

  const checkLabel = document.createElement("label");
  checkLabel.className = "check-label";

  const checkbox = document.createElement("input");
  checkbox.type = "checkbox";
  checkbox.checked = item.done;
  checkbox.addEventListener("change", () => {
    item.done = checkbox.checked;
    saveItems(items);
    renderChecklist();
  });

  const textWrap = document.createElement("span");
  textWrap.className = "item-text";

  const label = document.createElement("span");
  label.className = "item-label";
  label.textContent = item.label;
  textWrap.appendChild(label);

  if (item.expiry) {
    const { text, cls } = expiryInfo(item.expiry);
    const expirySpan = document.createElement("span");
    expirySpan.className = "expiry-tag " + cls;
    expirySpan.textContent = text;
    textWrap.appendChild(expirySpan);
  }

  checkLabel.append(checkbox, textWrap);

  const addVariantBtn = document.createElement("button");
  addVariantBtn.type = "button";
  addVariantBtn.className = "edit-btn";
  addVariantBtn.title = "バリエーション（種類違い）を追加";
  addVariantBtn.textContent = "＋";
  addVariantBtn.addEventListener("click", () => {
    addingVariantId = item.id;
    renderChecklist();
  });

  const editBtn = document.createElement("button");
  editBtn.type = "button";
  editBtn.className = "edit-btn";
  editBtn.title = "編集";
  editBtn.textContent = "✎";
  editBtn.addEventListener("click", () => {
    editingId = item.id;
    renderChecklist();
  });

  const removeBtn = document.createElement("button");
  removeBtn.type = "button";
  removeBtn.className = "remove";
  removeBtn.title = "削除";
  removeBtn.textContent = "✕";
  removeBtn.addEventListener("click", () => {
    items = items.filter((i) => i.id !== item.id);
    saveItems(items);
    renderChecklist();
  });

  li.append(checkLabel, addVariantBtn, editBtn, removeBtn);
  return li;
}

function buildEditRow(item) {
  const li = document.createElement("li");
  li.className = "checklist-item editing";

  const labelInput = document.createElement("input");
  labelInput.type = "text";
  labelInput.value = item.label;
  labelInput.className = "edit-label-input";

  const categorySelect = document.createElement("select");
  categorySelect.className = "edit-category-select";
  CATEGORY_ORDER.forEach((cat) => {
    const opt = document.createElement("option");
    opt.value = cat;
    opt.textContent = `${CATEGORY_META[cat].icon} ${cat}`;
    if (cat === item.category) opt.selected = true;
    categorySelect.appendChild(opt);
  });

  const row2 = document.createElement("div");
  row2.className = "edit-row";
  row2.appendChild(categorySelect);

  let getExpiry = () => item.expiry || null;
  if (!isParent(item)) {
    const expiryInput = document.createElement("input");
    expiryInput.type = "date";
    expiryInput.value = item.expiry || "";
    expiryInput.title = "賞味期限・使用期限（任意）";
    expiryInput.className = "edit-expiry-input";
    row2.appendChild(expiryInput);

    getExpiry = () => expiryInput.value || null;
  }

  const actions = document.createElement("div");
  actions.className = "edit-actions";

  const saveBtn = document.createElement("button");
  saveBtn.type = "button";
  saveBtn.className = "primary-btn edit-save";
  saveBtn.textContent = "保存";
  saveBtn.addEventListener("click", () => {
    const newLabel = labelInput.value.trim();
    if (!newLabel) return;
    item.label = newLabel;
    item.category = categorySelect.value;
    item.expiry = getExpiry();
    openCategories.add(item.category);
    saveItems(items);
    editingId = null;
    renderChecklist();
  });

  const cancelBtn = document.createElement("button");
  cancelBtn.type = "button";
  cancelBtn.className = "edit-cancel";
  cancelBtn.textContent = "キャンセル";
  cancelBtn.addEventListener("click", () => {
    editingId = null;
    renderChecklist();
  });

  actions.append(saveBtn, cancelBtn);
  li.append(labelInput, row2, actions);
  return li;
}

function buildAddVariantRow(item) {
  const li = document.createElement("li");
  li.className = "checklist-item editing";

  const labelInput = document.createElement("input");
  labelInput.type = "text";
  labelInput.className = "edit-label-input";
  labelInput.placeholder = "例: 単3電池 ×8本";

  const row2 = document.createElement("div");
  row2.className = "edit-row";

  const expiryInput = document.createElement("input");
  expiryInput.type = "date";
  expiryInput.title = "期限（任意）";
  expiryInput.className = "edit-expiry-input";
  row2.appendChild(expiryInput);

  const actions = document.createElement("div");
  actions.className = "edit-actions";

  const saveBtn = document.createElement("button");
  saveBtn.type = "button";
  saveBtn.className = "primary-btn edit-save";
  saveBtn.textContent = "追加";
  saveBtn.addEventListener("click", () => {
    const label = labelInput.value.trim();
    if (!label) return;
    if (!Array.isArray(item.children)) item.children = [];
    item.children.push({
      id: crypto.randomUUID(),
      label,
      done: false,
      expiry: expiryInput.value || null,
    });
    addingVariantId = null;
    saveItems(items);
    renderChecklist();
  });

  const cancelBtn = document.createElement("button");
  cancelBtn.type = "button";
  cancelBtn.className = "edit-cancel";
  cancelBtn.textContent = "キャンセル";
  cancelBtn.addEventListener("click", () => {
    addingVariantId = null;
    renderChecklist();
  });

  actions.append(saveBtn, cancelBtn);
  li.append(labelInput, row2, actions);
  return li;
}

function buildChildRow(item, child) {
  const li = document.createElement("li");
  li.className = "checklist-child" + (child.done ? " done" : "");

  const checkLabel = document.createElement("label");
  checkLabel.className = "check-label";

  const checkbox = document.createElement("input");
  checkbox.type = "checkbox";
  checkbox.checked = child.done;
  checkbox.addEventListener("change", () => {
    child.done = checkbox.checked;
    saveItems(items);
    renderChecklist();
  });

  const textWrap = document.createElement("span");
  textWrap.className = "item-text";

  const label = document.createElement("span");
  label.className = "item-label";
  label.textContent = child.label;
  textWrap.appendChild(label);

  if (child.expiry) {
    const { text, cls } = expiryInfo(child.expiry);
    const expirySpan = document.createElement("span");
    expirySpan.className = "expiry-tag " + cls;
    expirySpan.textContent = text;
    textWrap.appendChild(expirySpan);
  }

  checkLabel.append(checkbox, textWrap);

  const removeBtn = document.createElement("button");
  removeBtn.type = "button";
  removeBtn.className = "remove";
  removeBtn.title = "削除";
  removeBtn.textContent = "✕";
  removeBtn.addEventListener("click", () => {
    item.children = item.children.filter((c) => c.id !== child.id);
    saveItems(items);
    renderChecklist();
  });

  li.append(checkLabel, removeBtn);
  return li;
}

function buildParentRow(item) {
  const wrapper = document.createElement("li");
  wrapper.className = "checklist-item parent-item";

  const handle = document.createElement("span");
  handle.className = "drag-handle";
  handle.textContent = "⠿";
  handle.title = "ドラッグして別のカテゴリーへ移動";
  handle.addEventListener("pointerdown", (e) => handlePointerDown(e, item, wrapper));

  const headerRow = document.createElement("div");
  headerRow.className = "parent-header";

  const doneCount = item.children.filter((c) => c.done).length;

  const label = document.createElement("span");
  label.className = "item-label parent-label";
  label.textContent = item.label;

  const count = document.createElement("span");
  count.className = "parent-count";
  count.textContent = `${doneCount}/${item.children.length}`;

  const addBtn = document.createElement("button");
  addBtn.type = "button";
  addBtn.className = "edit-btn";
  addBtn.title = "バリエーション（種類違い）を追加";
  addBtn.textContent = "＋";
  addBtn.addEventListener("click", () => {
    addingVariantId = item.id;
    renderChecklist();
  });

  const editBtn = document.createElement("button");
  editBtn.type = "button";
  editBtn.className = "edit-btn";
  editBtn.title = "編集";
  editBtn.textContent = "✎";
  editBtn.addEventListener("click", () => {
    editingId = item.id;
    renderChecklist();
  });

  const removeBtn = document.createElement("button");
  removeBtn.type = "button";
  removeBtn.className = "remove";
  removeBtn.title = "グループごと削除";
  removeBtn.textContent = "✕";
  removeBtn.addEventListener("click", () => {
    items = items.filter((i) => i.id !== item.id);
    saveItems(items);
    renderChecklist();
  });

  headerRow.append(handle, label, count, addBtn, editBtn, removeBtn);
  wrapper.appendChild(headerRow);

  const childList = document.createElement("ul");
  childList.className = "checklist-children";
  item.children.forEach((child) => childList.appendChild(buildChildRow(item, child)));
  wrapper.appendChild(childList);

  if (addingVariantId === item.id) {
    wrapper.appendChild(buildAddVariantRow(item));
  }

  return wrapper;
}

function renderChecklist() {
  groupsEl.innerHTML = "";

  const categoriesPresent = CATEGORY_ORDER.filter((cat) =>
    items.some((i) => i.category === cat)
  );

  categoriesPresent.forEach((category) => {
    const groupItems = items.filter((i) => i.category === category).sort(sortItems);
    const { total, done: doneCount } = countLeaves(groupItems);
    const pct = total ? Math.round((doneCount / total) * 100) : 0;
    const meta = CATEGORY_META[category] || { icon: "📦", color: "#6b7785" };

    const details = document.createElement("details");
    details.className = "category-group";
    details.dataset.category = category;
    details.style.setProperty("--cat-color", meta.color);
    details.open = openCategories.has(category);
    details.addEventListener("toggle", () => {
      if (details.open) openCategories.add(category);
      else openCategories.delete(category);
    });

    const summary = document.createElement("summary");
    summary.className = "category-title";
    summary.innerHTML = `
      <div class="category-title-row">
        <span class="cat-icon">${meta.icon}</span>
        <span class="cat-name">${category}</span>
        <span class="cat-count">${doneCount}/${total}</span>
        <span class="cat-chevron">▾</span>
      </div>
      <div class="category-progress"><div class="category-progress-fill" style="width:${pct}%"></div></div>
    `;
    details.appendChild(summary);

    const ul = document.createElement("ul");
    ul.className = "checklist";
    groupItems.forEach((item) => {
      if (editingId === item.id) {
        ul.appendChild(buildEditRow(item));
      } else if (isParent(item)) {
        ul.appendChild(buildParentRow(item));
      } else {
        ul.appendChild(buildItemRow(item));
        if (addingVariantId === item.id) {
          ul.appendChild(buildAddVariantRow(item));
        }
      }
    });
    details.appendChild(ul);

    groupsEl.appendChild(details);
  });

  const { total, done: doneCount } = countLeaves(items);
  summaryEl.textContent = total
    ? `準備済み ${doneCount} / ${total} 件`
    : "リストは空です。持ち出し品を追加してください。";
}

formEl.addEventListener("submit", (e) => {
  e.preventDefault();
  const label = inputEl.value.trim();
  if (!label) return;
  items.push({
    id: crypto.randomUUID(),
    label,
    category: categorySelectEl.value,
    done: false,
    expiry: expiryInputEl.value || null,
  });
  saveItems(items);
  inputEl.value = "";
  expiryInputEl.value = "";
  renderChecklist();
});

renderChecklist();
