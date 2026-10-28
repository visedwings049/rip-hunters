// Rip Hunters — Listing Builder

let allCards = [];
let gameColors = {};
let activeGame = "All";
let searchQuery = "";
let selected = new Map(); // id → card

// ─── Boot ────────────────────────────────────────────────────────────────
fetch("catalog.json")
  .then(r => r.json())
  .then(data => {
    allCards = data.cards;
    gameColors = data.game_colors || {};
    document.getElementById("gen-time").textContent =
      "Updated " + new Date(data.generated).toLocaleDateString();
    buildTabs(["All", ...data.games]);
    renderGrid();
  })
  .catch(() => {
    document.getElementById("grid").innerHTML =
      `<div class="state-msg"><div class="big">⚠</div><h3>Catalog not found</h3>
       <p>Run build.py to generate catalog.json</p></div>`;
  });

// ─── Page tabs ───────────────────────────────────────────────────────────
document.querySelectorAll(".lb-tab").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".lb-tab").forEach(t => t.classList.remove("active"));
    document.querySelectorAll(".lb-panel").forEach(p => p.classList.remove("active"));
    btn.classList.add("active");
    document.getElementById("panel-" + btn.dataset.panel).classList.add("active");
  });
});

// ─── Game tabs ───────────────────────────────────────────────────────────
function buildTabs(games) {
  const container = document.getElementById("game-tabs");
  container.innerHTML = "";
  games.forEach(g => {
    const btn = document.createElement("button");
    btn.className = "tab" + (g === "All" ? " active" : "");
    btn.textContent = g === "All" ? "All Games" : g;
    const color = gameColors[g] || "var(--gold)";
    btn.style.setProperty("--tab-color", color);
    btn.addEventListener("click", () => {
      document.querySelectorAll(".tab").forEach(t => t.classList.remove("active"));
      btn.classList.add("active");
      activeGame = g;
      renderGrid();
    });
    container.appendChild(btn);
  });
}

// ─── Search ──────────────────────────────────────────────────────────────
document.getElementById("search").addEventListener("input", e => {
  searchQuery = e.target.value.toLowerCase().trim();
  renderGrid();
});

// ─── Grid ────────────────────────────────────────────────────────────────
function filteredCards() {
  return allCards.filter(c => {
    if (activeGame !== "All" && c.game !== activeGame) return false;
    if (searchQuery) {
      const hay = `${c.name} ${c.set} ${c.game} ${c.rarity} ${c.variance}`.toLowerCase();
      if (!hay.includes(searchQuery)) return false;
    }
    return true;
  });
}

function renderGrid() {
  const grid = document.getElementById("grid");
  const cards = filteredCards();
  document.getElementById("results-count").textContent =
    `${cards.length.toLocaleString()} card${cards.length !== 1 ? "s" : ""}`;
  if (cards.length === 0) {
    grid.innerHTML = `<div class="state-msg" style="grid-column:1/-1">
      <div class="big">🔍</div><h3>No cards found</h3></div>`;
    return;
  }
  grid.innerHTML = cards.map(c => cardHTML(c)).join("");
  selected.forEach((_, id) => {
    const el = grid.querySelector(`[data-id="${CSS.escape(id)}"]`);
    if (el) el.classList.add("selected");
  });
}

function cardHTML(c) {
  const color = c.color || gameColors[c.game] || "#C9A000";
  const img = c.image_url
    ? `<img src="${c.image_url}" alt="${esc(c.name)}" loading="lazy"
           onerror="this.closest('.card-img-wrap').classList.add('no-image')">`
    : "";
  const badges = buildBadges(c);
  return `
<div class="card" data-id="${esc(c.id)}" style="--game-color:${color}" onclick="toggleCard(this,'${esc(c.id)}')">
  <div class="card-img-wrap${c.image_url ? "" : " no-image"}">
    ${img}
    <div class="img-placeholder">
      <span class="ph-game">${esc(c.game)}</span>
      <span class="ph-name">${esc(c.name)}</span>
    </div>
  </div>
  <div class="card-body">
    <div class="card-game-tag">${esc(c.game)}</div>
    <div class="card-name">${esc(c.name)}</div>
    <div class="card-set">${esc(c.set)}${c.number ? " · #" + esc(c.number) : ""}</div>
    <div class="card-badges">${badges}</div>
    <div class="card-footer">
      <span class="card-price">$${c.price.toFixed(2)}</span>
      <span class="card-qty">Qty: ${c.qty}</span>
    </div>
  </div>
</div>`;
}

function buildBadges(c) {
  const badges = [];
  if (c.rarity) {
    const cls = c.rarity.toLowerCase().replace(/[^a-z]/g, "");
    badges.push(`<span class="badge ${cls}">${esc(c.rarity)}</span>`);
  }
  if (c.variance && c.variance.toLowerCase() !== "normal") {
    const cls = c.variance.toLowerCase().replace(/[^a-z]/g, "");
    badges.push(`<span class="badge ${cls}">${esc(c.variance)}</span>`);
  }
  return badges.join("");
}

// ─── Selection ───────────────────────────────────────────────────────────
function toggleCard(el, id) {
  const card = allCards.find(c => c.id === id);
  if (!card) return;
  if (selected.has(id)) {
    selected.delete(id);
    el.classList.remove("selected");
  } else {
    selected.set(id, card);
    el.classList.add("selected");
  }
  updateComboBar();
}

function updateComboBar() {
  const bar = document.getElementById("combo-bar");
  const count = selected.size;
  if (count === 0) { bar.classList.remove("visible"); return; }
  bar.classList.add("visible");
  const total = [...selected.values()].reduce((s, c) => s + c.price, 0);
  document.getElementById("bar-count").textContent =
    `${count} card${count !== 1 ? "s" : ""} selected`;
  document.getElementById("bar-total").textContent =
    `$${total.toFixed(2)} market value`;
}

document.getElementById("btn-clear").addEventListener("click", () => {
  selected.clear();
  document.querySelectorAll(".card.selected").forEach(el => el.classList.remove("selected"));
  updateComboBar();
});

// ─── Create Combo → switch to pricing tab ────────────────────────────────
document.getElementById("btn-create-combo").addEventListener("click", () => {
  buildPricingPanel();
  document.querySelectorAll(".lb-tab").forEach(t => t.classList.remove("active"));
  document.querySelectorAll(".lb-panel").forEach(p => p.classList.remove("active"));
  document.querySelector('[data-panel="pricing"]').classList.add("active");
  document.getElementById("panel-pricing").classList.add("active");
});

function buildPricingPanel() {
  const items = [...selected.values()];
  const container = document.getElementById("pricing-content");

  if (items.length === 0) {
    container.innerHTML = `<div class="empty-pricing">
      <div class="big">🃏</div><h3>No cards selected</h3>
      <p style="color:var(--muted);margin-top:0.5rem">Go to Select Cards and pick a combo.</p>
    </div>`;
    return;
  }

  const marketTotal = items.reduce((s, c) => s + c.price, 0);

  const cardRows = items.map(c => `
    <div class="combo-item">
      <div>
        <div class="combo-item-name">${esc(c.name)}</div>
        <div class="combo-item-game">${esc(c.game)} · ${esc(c.set)}</div>
      </div>
      <div class="combo-item-price">$${c.price.toFixed(2)}</div>
    </div>`).join("");

  const pricingRows = [0, 10, 20, 30, 40, 50, 60, 70].map(pct => {
    const price = marketTotal * (1 - pct / 100);
    const savings = marketTotal - price;
    const isMarket = pct === 0;
    return `
    <div class="pricing-row${isMarket ? " market" : ""}">
      <span class="discount">${isMarket ? "Market value" : `-${pct}%`}</span>
      <span class="final-price">$${price.toFixed(2)}</span>
      <span class="savings">${isMarket ? "—" : `-$${savings.toFixed(2)}`}</span>
    </div>`;
  }).join("");

  container.innerHTML = `
    <div class="combo-card-list">
      <h3>${items.length} card${items.length !== 1 ? "s" : ""} in combo</h3>
      ${cardRows}
    </div>
    <div class="market-total">
      <span class="market-total-label">Market Value</span>
      <span class="market-total-value">$${marketTotal.toFixed(2)}</span>
    </div>
    <div class="pricing-table">
      <div class="pricing-table-head">
        <span>Discount</span>
        <span>List Price</span>
        <span>You Save</span>
      </div>
      ${pricingRows}
    </div>`;
}

// ─── Utility ─────────────────────────────────────────────────────────────
function esc(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
