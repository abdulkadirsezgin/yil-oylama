const POLL_ID = "2026-awards";
const LS_WORKER_URL = "admin:workerUrl";

const el = (id) => document.getElementById(id);

function setStatus(target, msg, cls) {
  target.classList.remove("ok","bad","muted");
  if (cls) target.classList.add(cls);
  target.textContent = msg;
}

function normalizeBaseUrl(u) {
  return u.replace(/\/+$/, "");
}

function getWorkerBaseUrl() {
  const v = localStorage.getItem(LS_WORKER_URL) || "";
  return v ? normalizeBaseUrl(v) : "";
}

function saveWorkerBaseUrl(url) {
  localStorage.setItem(LS_WORKER_URL, normalizeBaseUrl(url));
}

function escapeHtml(s) {
  return String(s)
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;")
    .replaceAll('"',"&quot;")
    .replaceAll("'","&#039;");
}

async function loadMeta() {
  // kategorileri/kişileri repo’dan alıyoruz
  const categories = await fetch("./categories.json").then(r=>r.json());
  const people = await fetch("./people.json").then(r=>r.json());
  categories.sort((a,b)=>(a.order??0)-(b.order??0));

  const peopleById = {};
  for (const p of people) peopleById[p.id] = p.name;

  return { categories, peopleById };
}

async function fetchResultsFull(baseUrl) {
  const url = `${baseUrl}/results/full?pollId=${encodeURIComponent(POLL_ID)}`;
  const res = await fetch(url);
  const data = await res.json().catch(()=> ({}));
  if (!res.ok || !data.ok) {
    throw new Error(data?.message || `Sonuçlar alınamadı (${res.status})`);
  }
  return data;
}

function renderTables({ categories, peopleById }, apiData) {
  const wrap = el("tables");
  wrap.innerHTML = "";

  const counts = apiData.counts || {};

  for (const cat of categories) {
    const catCounts = counts[cat.id] || {};

    // personId -> count listesi
    const rows = Object.entries(catCounts)
      .map(([pid, c]) => ({ pid, name: peopleById[pid] ?? pid, count: Number(c || 0) }))
      .sort((a,b) => b.count - a.count);

    const card = document.createElement("div");
    card.className = "card";

    const title = document.createElement("h2");
    title.textContent = cat.name;
    card.appendChild(title);

    if (rows.length === 0) {
      const p = document.createElement("p");
      p.className = "muted";
      p.textContent = "Henüz bu kategoride oy yok.";
      card.appendChild(p);
      wrap.appendChild(card);
      continue;
    }

    const table = document.createElement("table");
    table.style.width = "100%";
    table.style.borderCollapse = "collapse";

    const thead = document.createElement("thead");
    thead.innerHTML = `
      <tr>
        <th style="text-align:left; padding:8px; border-bottom:1px solid #2b3853;">Sıra</th>
        <th style="text-align:left; padding:8px; border-bottom:1px solid #2b3853;">Kişi</th>
        <th style="text-align:right; padding:8px; border-bottom:1px solid #2b3853;">Oy</th>
      </tr>
    `;
    table.appendChild(thead);

    const tbody = document.createElement("tbody");
    rows.forEach((r, idx) => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td style="padding:8px; border-bottom:1px solid #1f2a40;">${idx + 1}</td>
        <td style="padding:8px; border-bottom:1px solid #1f2a40;">${escapeHtml(r.name)}</td>
        <td style="padding:8px; border-bottom:1px solid #1f2a40; text-align:right;">${r.count}</td>
      `;
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);

    card.appendChild(table);
    wrap.appendChild(card);
  }
}

async function refresh() {
  const err = el("err");
  setStatus(err, "", "muted");

  const baseUrl = getWorkerBaseUrl();
  if (!baseUrl) {
    setStatus(err, "Worker URL girmen gerekiyor.", "bad");
    return;
  }

  try {
    setStatus(el("summary"), "Yükleniyor...", "muted");

    const meta = await loadMeta();
    const apiData = await fetchResultsFull(baseUrl);

    setStatus(el("summary"), `Toplam oy: ${apiData.totalVotes}`, "ok");
    renderTables(meta, apiData);
  } catch (e) {
    setStatus(el("summary"), "Hata oluştu.", "bad");
    setStatus(err, String(e?.message || e), "bad");
  }
}

el("btnSave").addEventListener("click", () => {
  const v = el("workerUrl").value.trim();
  if (!v) return;
  saveWorkerBaseUrl(v);
  refresh();
});

el("btnRefresh").addEventListener("click", refresh);

// ilk yükleme
const existing = getWorkerBaseUrl();
if (existing) el("workerUrl").value = existing;
refresh();
