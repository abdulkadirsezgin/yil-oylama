const API_BASE = "https://yil-oylama.abdulkadir-sezginn.workers.dev"; // <- değiştir
const POLL_ID = "2026-awards"; // istersen değiştir

let categories = [];
let people = [];
let selected = {};   // { [catId]: Set(personId) }
let verifiedToken = null;

const el = (id) => document.getElementById(id);

function setStatus(target, msg, cls) {
  target.classList.remove("ok", "bad", "muted");
  if (cls) target.classList.add(cls);
  target.textContent = msg;
}

async function loadData() {
  categories = await fetch("./categories.json").then(r => r.json());
  people = await fetch("./people.json").then(r => r.json());
  categories.sort((a,b) => (a.order ?? 0) - (b.order ?? 0));
  renderCategories();
  updateCompletion();
}

function resetSelections() {
  // tüm kategorilerde seçimi temizle
  categories.forEach(c => {
    selected[c.id] = new Set();
  });

  // chip ve sayaçları güncelle
  rerenderAllChips();

  // submit mesajını temizle
  const submitStatus = el("submitStatus");
  if (submitStatus) submitStatus.textContent = "";

  updateCompletion();
}

function renderCategories() {
  const wrap = el("categoriesWrap");
  wrap.innerHTML = "";

  const grid = document.createElement("div");
  grid.className = "grid";

  categories.forEach(cat => {
    selected[cat.id] = selected[cat.id] || new Set();

    const card = document.createElement("section");
    card.className = "card";

    const header = document.createElement("div");
    header.className = "catTitle";

    const title = document.createElement("h2");
    title.textContent = cat.name;

    const counter = document.createElement("div");
    counter.className = "counter";
    counter.id = `ctr_${cat.id}`;
    counter.textContent = `0 / ${cat.maxSelections}`;

    header.appendChild(title);
    header.appendChild(counter);

    const select = document.createElement("select");
    select.id = `sel_${cat.id}`;

    const opt0 = document.createElement("option");
    opt0.value = "";
    opt0.textContent = "Kişi seç...";
    select.appendChild(opt0);

    people.forEach(p => {
      const opt = document.createElement("option");
      opt.value = p.id;
      opt.textContent = p.name;
      select.appendChild(opt);
    });

    select.addEventListener("change", () => {
      const pid = select.value;
      select.value = "";
      if (!pid) return;
      addSelection(cat.id, pid, cat.maxSelections);
    });

    const chips = document.createElement("div");
    chips.className = "chips";
    chips.id = `chips_${cat.id}`;

    card.appendChild(header);
    card.appendChild(select);
    card.appendChild(chips);

    grid.appendChild(card);
  });

  wrap.appendChild(grid);
  rerenderAllChips();
}

function addSelection(catId, personId, maxSel) {
  const set = selected[catId];
  if (set.has(personId)) return;

  if (set.size >= maxSel) {
    alert(`Bu kategoride en fazla ${maxSel} kişi seçebilirsin.`);
    return;
  }
  set.add(personId);
  rerenderChips(catId);
  updateCompletion();
}

function removeSelection(catId, personId) {
  selected[catId].delete(personId);
  rerenderChips(catId);
  updateCompletion();
}

function rerenderChips(catId) {
  const chipsEl = el(`chips_${catId}`);
  const set = selected[catId];
  chipsEl.innerHTML = "";

  const cat = categories.find(c => c.id === catId);
  el(`ctr_${catId}`).textContent = `${set.size} / ${cat.maxSelections}`;

  [...set].forEach(pid => {
    const p = people.find(x => x.id === pid);
    const chip = document.createElement("span");
    chip.className = "chip";
    chip.textContent = p ? p.name : pid;

    const btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = "X";
    btn.addEventListener("click", () => removeSelection(catId, pid));

    chip.appendChild(btn);
    chipsEl.appendChild(chip);
  });
}

function rerenderAllChips() {
  categories.forEach(c => rerenderChips(c.id));
}

function countCompletedCategories() {
  return categories.reduce((acc, c) => acc + (selected[c.id]?.size > 0 ? 1 : 0), 0);
}

function updateCompletion() {
  const completed = countCompletedCategories();
  el("completionText").textContent = `Seçimler: ${completed} / ${categories.length}`;
  el("btnSubmit").disabled = !(verifiedToken && completed === categories.length);
}

function lockVotingUI(msg) {
  const cd = el("countdown");
  if (cd) {
    cd.textContent = msg;
    cd.classList.remove("running");
    cd.classList.add("closed");
  }

  el("btnVerify").disabled = true;
  el("btnSubmit").disabled = true;

  const tokenInput = el("tokenInput");
  if (tokenInput) tokenInput.disabled = true;

  el("pollArea").classList.add("hidden");
  setStatus(el("tokenStatus"), "Oylama kapandı.", "muted");
}

async function verifyToken() {
  // normalize: boşlukları kırp, büyük harfe çevir
  const token = el("tokenInput").value.trim().toUpperCase();
  const status = el("tokenStatus");

  if (!token) {
    setStatus(status, "Token girmen gerekiyor.", "bad");
    return;
  }

  setStatus(status, "Kontrol ediliyor...", "muted");

  try {
    const res = await fetch(`${API_BASE}/verify`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ pollId: POLL_ID, token })
    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      verifiedToken = null;
      setStatus(status, data?.message || "Token geçersiz ya da kullanılmış.", "bad");
      el("pollArea").classList.add("hidden");
      updateCompletion();
      return;
    }

    verifiedToken = token;

    // yeni token ile yeni oy başlıyor → önce formu sıfırla
    resetSelections();

    setStatus(status, "Token geçerli. Oylamaya başlayabilirsin.", "ok");
    el("pollArea").classList.remove("hidden");
    updateCompletion();

  } catch (e) {
    verifiedToken = null;
    setStatus(status, "Bağlantı hatası. API erişilemiyor.", "bad");
    el("pollArea").classList.add("hidden");
    updateCompletion();
  }
}

function buildPayload() {
  return {
    pollId: POLL_ID,
    token: verifiedToken,
    selections: categories.map(c => ({
      categoryId: c.id,
      personIds: [...(selected[c.id] || new Set())]
    }))
  };
}

async function startCountdown() {
  const cdEl = el("countdown");
  if (!cdEl) return;

  try {
    const res = await fetch(`${API_BASE}/status`);
    const data = await res.json().catch(() => ({}));
    if (!data.ok) throw new Error("Status alınamadı");

    const endAt = Date.parse(data.endAt);
    const serverNow = Date.parse(data.now);
    const offset = serverNow - Date.now(); // server-client farkı

    const format = (ms) => {
      if (ms <= 0) return "00:00:00";
      const total = Math.floor(ms / 1000);
      const s = total % 60;
      const m = Math.floor(total / 60) % 60;
      const h = Math.floor(total / 3600) % 24;
      const d = Math.floor(total / 86400);
      const pad = (n) => String(n).padStart(2, "0");
      return d > 0
        ? `${d} gün ${pad(h)}:${pad(m)}:${pad(s)}`
        : `${pad(h)}:${pad(m)}:${pad(s)}`;
    };

    const tick = () => {
      const now = Date.now() + offset;
      const left = endAt - now;

      if (left <= 0 || data.closed) {
        lockVotingUI("Oylama sona erdi (09.01.2026 16:35 – Ankara saati)");
        return;
      }

      cdEl.textContent = `Kalan süre: ${format(left)} (Ankara saati)`;
      cdEl.classList.add("running");
      setTimeout(tick, 1000);
    };

    tick();
  } catch (e) {
    cdEl.textContent = "Sayaç yüklenemedi.";
  }
}

async function submitVote() {
  const submitStatus = el("submitStatus");
  if (!verifiedToken) {
    setStatus(submitStatus, "Önce token doğrulamalısın.", "bad");
    return;
  }

  // frontend doğrulama: her kategori dolu mu?
  const completed = countCompletedCategories();
  if (completed !== categories.length) {
    setStatus(submitStatus, "Tüm kategorilerde en az 1 kişi seçmelisin.", "bad");
    return;
  }

  el("btnSubmit").disabled = true;
  setStatus(submitStatus, "Oy gönderiliyor...", "muted");

  try {
    const res = await fetch(`${API_BASE}/vote`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(buildPayload())
    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      setStatus(submitStatus, data?.message || "Gönderim başarısız.", "bad");
      updateCompletion();
      return;
    }

    setStatus(submitStatus, "Oyun alındı. Teşekkürler!", "ok");

    // bir sonraki token için form temiz kalsın
    resetSelections();

    // token artık kullanıldı: UI’ı kilitle
    verifiedToken = null;
    el("pollArea").classList.add("hidden");
    el("tokenInput").value = "";
    setStatus(el("tokenStatus"), "Token kullanıldı. Tekrar oy kullanılamaz.", "muted");

  } catch (e) {
    setStatus(submitStatus, "Bağlantı hatası. Tekrar dene.", "bad");
    updateCompletion();
  }
}

el("btnVerify").addEventListener("click", verifyToken);
el("btnSubmit").addEventListener("click", submitVote);

// init
loadData();
startCountdown();
