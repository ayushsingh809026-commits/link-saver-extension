const els = {
  saveTabBtn: document.getElementById("saveTabBtn"),
  search: document.getElementById("search"),
  list: document.getElementById("list"),
  tpl: document.getElementById("itemTemplate"),
  newCategory: document.getElementById("newCategory"),
  addCategoryBtn: document.getElementById("addCategoryBtn"),
  removeCategoryBtn: document.getElementById("removeCategoryBtn"),
  categoryFilter: document.getElementById("categoryFilter"),
  qaTitle: document.getElementById("qaTitle"),
  qaUrl: document.getElementById("qaUrl"),
  qaTags: document.getElementById("qaTags"),
  qaCategory: document.getElementById("qaCategory"),
  qaSaveBtn: document.getElementById("qaSaveBtn")
};

let state = { categories: {}, filterCategory: "All", query: "" };

init();

async function init() {
  await migrateIfNeeded();
  await loadCats();
  fillCategorySelectors();
  render();

  els.search.addEventListener("input", e => { state.query = (e.target.value||"").toLowerCase(); render(); });
  els.addCategoryBtn.addEventListener("click", addCategory);
  els.removeCategoryBtn.addEventListener("click", onRemoveCategory);
  els.categoryFilter.addEventListener("change", e => { state.filterCategory = e.target.value; render(); });
  els.qaSaveBtn.addEventListener("click", quickAdd);
  els.saveTabBtn.addEventListener("click", saveCurrentTab);
}

/** -------- Storage Helpers ---------- */

async function migrateIfNeeded() {
  const data = await chrome.storage.sync.get(["categories", "links"]);
  if (!data.categories && Array.isArray(data.links)) {
    await chrome.storage.sync.set({ categories: { Unsorted: data.links }, links: undefined });
  }
}

async function loadCats() {
  const data = await chrome.storage.sync.get(["categories"]);
  state.categories = data.categories || { Unsorted: [] };
}

async function setCats(cats) {
  await chrome.storage.sync.set({ categories: cats });
  await loadCats();
}

/** -------- UI Helpers ---------- */

function fillCategorySelectors() {
  const names = Object.keys(state.categories);
  els.categoryFilter.innerHTML = ["All", ...names].map(c => `<option${c===state.filterCategory?' selected':''}>${c}</option>`).join("");
  els.qaCategory.innerHTML = names.map(c => `<option>${c}</option>`).join("");
  if (!els.qaCategory.value && names.length) els.qaCategory.value = names[0];
}

function normalize(s){ return (s||"").toLowerCase(); }
function matchesQuery(item, q){
  if (!q) return true;
  return normalize(item.title).includes(q)
      || normalize(item.url).includes(q)
      || (item.tags||[]).some(t => normalize(t).includes(q));
}

function render() {
  els.list.innerHTML = "";
  const cats = state.categories;
  const selected = state.filterCategory;
  const showFrom = selected === "All" ? Object.keys(cats) : [selected];

  const rows = [];
  showFrom.forEach(cat => (cats[cat]||[]).forEach(item => {
    if (matchesQuery(item, state.query)) rows.push({ ...item, category: cat });
  }));
  rows.sort((a,b)=>b.createdAt-a.createdAt);

  for (const item of rows) addRow(item);
}

function addRow(item){
  const li = els.tpl.content.firstElementChild.cloneNode(true);
  const iconEl = li.querySelector(".icon");
  const titleEl = li.querySelector(".title");
  const urlEl = li.querySelector(".url");
  const badgesEl = li.querySelector(".badges");
  const delBtn = li.querySelector(".deleteBtn");
  const moveSel = li.querySelector(".moveSelect");

  iconEl.src = item.icon || `https://www.google.com/s2/favicons?domain=${safeHost(item.url)}`;
  titleEl.textContent = item.title || item.url;
  titleEl.href = item.url;
  urlEl.textContent = item.url;

  (item.tags||[]).forEach(t=>{
    const b = document.createElement("span");
    b.className = "tag";
    b.textContent = t;
    badgesEl.appendChild(b);
  });

  // fill move dropdown
  const names = Object.keys(state.categories);
  moveSel.innerHTML = names.map(c => `<option${c===item.category?' selected':''}>${c}</option>`).join("");
  moveSel.addEventListener("change", e => moveItem(item, e.target.value));

  delBtn.addEventListener("click", () => removeItem(item));
  els.list.appendChild(li);
}

function safeHost(u){ try { return new URL(u).hostname; } catch { return ""; } }

/** -------- Category Actions ---------- */

async function addCategory(){
  const name = (els.newCategory.value||"").trim();
  if (!name) return;
  const cats = { ...state.categories };
  if (!cats[name]) cats[name] = [];
  await setCats(cats);
  els.newCategory.value = "";
  fillCategorySelectors();
  render();
}

async function onRemoveCategory(){
  const name = els.categoryFilter.value;
  if (name === "All") { alert("Select a specific category to remove."); return; }
  if (name === "Unsorted") { alert("Default category 'Unsorted' cannot be removed."); return; }
  if (!confirm(`Remove category "${name}"?\n(All its links will move to "Unsorted".)`)) return;

  const cats = { ...state.categories };
  cats["Unsorted"] = (cats["Unsorted"] || []).concat(cats[name] || []);
  delete cats[name];

  await setCats(cats);
  state.filterCategory = "All";
  fillCategorySelectors();
  render();
}

/** -------- Item Actions ---------- */

function makeItem({url,title,icon,tags}){
  return {
    id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()),
    url, title, icon, tags: tags||[], notes: "", createdAt: Date.now()
  };
}

function parseTags(s){ return (s||"").split(",").map(x=>x.trim()).filter(Boolean); }

async function addToCategory(category, item){
  const cats = { ...state.categories };
  cats[category] = cats[category] || [];
  if (!cats[category].some(x => x.url === item.url)) cats[category].unshift(item);
  await setCats(cats);
}

async function moveItem(item, newCategory){
  if (newCategory === item.category) return;
  const cats = { ...state.categories };
  // remove from old
  cats[item.category] = (cats[item.category] || []).filter(x => x.id !== item.id);
  // add to new
  cats[newCategory] = cats[newCategory] || [];
  if (!cats[newCategory].some(x => x.url === item.url)) {
    cats[newCategory].unshift({ ...item, category: newCategory });
  }
  await setCats(cats);
  render();
}

async function removeItem(item){
  const cats = { ...state.categories };
  cats[item.category] = (cats[item.category] || []).filter(x => x.id !== item.id);
  await setCats(cats);
  render();
}

/** -------- Save / Quick Add ---------- */

async function quickAdd(){
  const url = (els.qaUrl.value||"").trim();
  if (!url) return;
  const category = els.qaCategory.value || "Unsorted";
  const link = makeItem({
    url,
    title: (els.qaTitle.value||"").trim() || url,
    icon: "",
    tags: parseTags(els.qaTags.value)
  });
  await addToCategory(category, link);
  els.qaTitle.value = els.qaUrl.value = els.qaTags.value = "";
  render();
}

async function saveCurrentTab(){
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.url) return;
  const category = els.qaCategory.value || "Unsorted";
  const link = makeItem({
    url: tab.url,
    title: tab.title || tab.url,
    icon: tab.favIconUrl || ""
  });
  await addToCategory(category, link);
  render();
}