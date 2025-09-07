// Context menu create/recreate
function createMenu() {
  try {
    chrome.contextMenus.removeAll(() => {
      chrome.contextMenus.create({
        id: "ls-save",
        title: "Save to Link Saver",
        contexts: ["page", "link", "selection"]
      });
    });
  } catch (e) {}
}
chrome.runtime.onInstalled.addListener(createMenu);
chrome.runtime.onStartup?.addListener(createMenu);
createMenu();

// On click: save into "Unsorted"
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId !== "ls-save") return;

  const url = info.linkUrl || tab?.url;
  if (!url) return;

  const title = (info.selectionText?.trim()) || tab?.title || url;
  const icon = tab?.favIconUrl || "";

  await saveIntoCategory("Unsorted", { url, title, icon });
});

async function saveIntoCategory(category, { url, title, icon }) {
  const id = crypto.randomUUID ? crypto.randomUUID() : String(Date.now());
  const item = { id, url, title, icon, createdAt: Date.now(), tags: [], notes: "" };

  const data = await chrome.storage.sync.get(["categories", "links"]);
  // migrate old 'links' to categories if needed
  let cats = data.categories || {};
  if (!Object.keys(cats).length && Array.isArray(data.links)) {
    cats = { Unsorted: data.links };
  }

  cats[category] = cats[category] || [];
  if (!cats[category].some(x => x.url === url)) {
    cats[category].unshift(item);
    await chrome.storage.sync.set({ categories: cats, links: undefined });
  }
}