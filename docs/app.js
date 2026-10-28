// Rip Hunters — storefront app
// Formspree: replace YOUR_FORM_ID with your real id from formspree.io
const FORMSPREE_URL = "https://formspree.io/f/xeaagyyz";

const WEIGHT_OZ_PER_CARD = 0.15;
// Shipping brackets: [{max_oz, rate, label}]
// ≤1 oz / ≤2 oz / ≤3 oz → USPS First Class PWE (no tracking)
// 21+ cards → UPS Ground Advantage (tracked)
const SHIPPING_BRACKETS = [
  { max_oz: 1,        rate: 0.99,  label: "USPS First Class" },
  { max_oz: 2,        rate: 1.50,  label: "USPS First Class" },
  { max_oz: 3,        rate: 1.99,  label: "USPS First Class" },
  { max_oz: Infinity, rate: 6.99,  label: "UPS Ground (tracked)" },
];

// ─── State ─────────────────────────────────────────────────────────────
let allCards = [];
let gameColors = {};
let activeGame = "All";
let searchQuery = "";
let selected = new Map(); // id → card object

// ─── Boot ───────────────────────────────────────────────────────────────
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

// ─── Tabs ───────────────────────────────────────────────────────────────
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

// ─── Search ─────────────────────────────────────────────────────────────
document.getElementById("search").addEventListener("input", e => {
  searchQuery = e.target.value.toLowerCase().trim();
  renderGrid();
});

// ─── Grid ───────────────────────────────────────────────────────────────
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
      <div class="big">🔍</div><h3>No cards found</h3>
      <p>Try a different game or search term.</p></div>`;
    return;
  }

  grid.innerHTML = cards.map(c => cardHTML(c)).join("");

  // Restore selected state visually
  selected.forEach((_, id) => {
    const el = grid.querySelector(`[data-id="${CSS.escape(id)}"]`);
    if (el) el.classList.add("selected");
  });
}

function cardHTML(c) {
  const color = c.color || gameColors[c.game] || "#C9A000";
  const img = c.image_url
    ? `<img src="${c.image_url}" alt="${esc(c.name)}"
           loading="lazy"
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

// ─── Selection ──────────────────────────────────────────────────────────
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
  updateOrderBar();
  updateCartPill();
}

function updateOrderBar() {
  const bar = document.getElementById("order-bar");
  const count = selected.size;
  if (count === 0) {
    bar.classList.remove("visible");
    return;
  }
  bar.classList.add("visible");

  const subtotal = [...selected.values()].reduce((s, c) => s + c.price, 0);
  const shipping = calcShipping(count);
  const fee = calcProcessingFee(subtotal, shipping.rate);
  const total = subtotal + shipping.rate + fee;
  document.getElementById("bar-count").textContent =
    `${count} card${count !== 1 ? "s" : ""} selected`;
  document.getElementById("bar-total").textContent =
    `$${total.toFixed(2)} est. total`;
}

function updateCartPill() {
  const pill = document.getElementById("cart-pill");
  const count = selected.size;
  pill.querySelector(".cart-count").textContent = count;
  pill.classList.toggle("has-items", count > 0);
}

function calcProcessingFee(subtotal, shippingRate) {
  return Math.round(((subtotal + shippingRate) * 0.029 + 0.30) * 100) / 100;
}

function calcShipping(cardCount) {
  const oz = cardCount * WEIGHT_OZ_PER_CARD;
  for (const bracket of SHIPPING_BRACKETS) {
    if (oz <= bracket.max_oz) return bracket;
  }
  return SHIPPING_BRACKETS[SHIPPING_BRACKETS.length - 1];
}

document.getElementById("btn-clear").addEventListener("click", () => {
  selected.clear();
  document.querySelectorAll(".card.selected").forEach(el => el.classList.remove("selected"));
  updateOrderBar();
  updateCartPill();
});

// ─── Order modal ─────────────────────────────────────────────────────────
function openModal() {
  const modal = document.getElementById("modal-bg");
  const items = [...selected.values()];
  const subtotal = items.reduce((s, c) => s + c.price, 0);
  const shipping = calcShipping(items.length);
  const fee = calcProcessingFee(subtotal, shipping.rate);
  const total = subtotal + shipping.rate + fee;

  // Populate preview list
  const list = document.getElementById("modal-items");
  list.innerHTML = items.map(c =>
    `<div class="order-item-row">
       <span>${esc(c.name)} <small style="color:var(--muted)">${esc(c.game)}</small></span>
       <span class="item-price">$${c.price.toFixed(2)}</span>
     </div>`
  ).join("") +
  `<div class="order-item-row">
     <span style="color:var(--muted)">${esc(shipping.label)} (${items.length} card${items.length!==1?"s":""})</span>
     <span class="item-price">$${shipping.rate.toFixed(2)}</span>
   </div>
   <div class="order-item-row">
     <span style="color:var(--muted)">Processing fee (2.9% + $0.30)</span>
     <span class="item-price">$${fee.toFixed(2)}</span>
   </div>`;

  document.getElementById("modal-total-amount").textContent = `$${total.toFixed(2)}`;

  modal.classList.add("open");
}

function closeModal() {
  document.getElementById("modal-bg").classList.remove("open");
  document.getElementById("form-status").textContent = "";
  document.getElementById("form-status").className = "form-status";
}

document.getElementById("btn-order").addEventListener("click", openModal);
document.getElementById("cart-pill").addEventListener("click", () => {
  if (selected.size > 0) openModal();
});
document.getElementById("modal-close").addEventListener("click", closeModal);
document.getElementById("modal-bg").addEventListener("click", e => {
  if (e.target === document.getElementById("modal-bg")) closeModal();
});

// ─── Form submit → Formspree ──────────────────────────────────────────────
document.getElementById("order-form").addEventListener("submit", async e => {
  e.preventDefault();
  const btn = document.getElementById("btn-submit");
  const status = document.getElementById("form-status");
  btn.disabled = true;
  status.textContent = "Sending…";
  status.className = "form-status";

  const items = [...selected.values()];
  const subtotal = items.reduce((s, c) => s + c.price, 0);
  const shipping = calcShipping(items.length);
  const fee = calcProcessingFee(subtotal, shipping.rate);
  const orderSummary = items.map(c =>
    `${c.name} (${c.game} · ${c.set}) — $${c.price.toFixed(2)}`
  ).join("\n");

  const payload = {
    name: document.getElementById("f-name").value,
    email: document.getElementById("f-email").value,
    address: document.getElementById("f-address").value,
    notes: document.getElementById("f-notes").value,
    order_summary: orderSummary,
    card_count: items.length,
    subtotal: "$" + subtotal.toFixed(2),
    shipping_method: shipping.label,
    estimated_shipping: "$" + shipping.rate.toFixed(2),
    processing_fee: "$" + fee.toFixed(2),
    estimated_total: "$" + (subtotal + shipping.rate + fee).toFixed(2),
    order_json: JSON.stringify(items.map(c => ({
      id: c.id, name: c.name, game: c.game, set: c.set,
      number: c.number, rarity: c.rarity, variance: c.variance,
      price: c.price, tcgplayer_id: c.tcgplayer_id
    })))
  };

  try {
    const res = await fetch(FORMSPREE_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Accept": "application/json" },
      body: JSON.stringify(payload),
    });
    if (res.ok) {
      status.textContent = "✓ Order request sent! We'll be in touch shortly.";
      status.className = "form-status success";
      document.getElementById("order-form").reset();
      // Clear selection after successful submit
      setTimeout(() => {
        selected.clear();
        document.querySelectorAll(".card.selected").forEach(el => el.classList.remove("selected"));
        updateOrderBar();
        updateCartPill();
        closeModal();
      }, 2500);
    } else {
      const data = await res.json().catch(() => ({}));
      status.textContent = data.error || "Something went wrong. Please try again.";
      status.className = "form-status error";
      btn.disabled = false;
    }
  } catch {
    status.textContent = "Network error. Please try again.";
    status.className = "form-status error";
    btn.disabled = false;
  }
});

// ─── Utility ─────────────────────────────────────────────────────────────
function esc(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
