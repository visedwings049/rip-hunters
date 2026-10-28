"""
Rip Hunters — daily catalog builder.
Reads portfolio_import.csv, applies filters + pricing, writes docs/catalog.json.

Run once after collectr_exporter.py each morning, then git push.
"""

import csv
import json
import re
from datetime import datetime
from pathlib import Path

BASE = Path(__file__).resolve().parent.parent
PORTFOLIO_CSV = BASE / "INVENTORY_ALL" / "portfolio_import.csv"
DOCS_DIR = BASE / "docs"

GAME_FOLDERS = {
    "Cyberpunk":           "CYBERPUNK",
    "Star Wars: Unlimited": "STARWARS_UNLIMITED",
    "Pokemon":             "POKEMON",
    "Lorcana":             "LORCANA",
    "One Piece":           "ONE_PIECE",
    "YuGiOh":              "YUGIOH",
}

GAME_COLORS = {
    "Star Wars: Unlimited": "#00AAFF",
    "Cyberpunk":            "#FF00CC",
    "Pokemon":              "#FFCB05",
    "Lorcana":              "#9B6FFF",
    "One Piece":            "#FF5500",
    "YuGiOh":              "#CC2200",
}


def is_listed(row: dict) -> bool:
    """True if the card is in the 'Listed' portfolio (e.g. on eBay) — exclude from site."""
    return row.get("Portfolio Name", "").strip().lower() == "listed"


def apply_pricing(raw: str) -> float:
    try:
        p = float(raw or 0)
    except (ValueError, TypeError):
        p = 0.0
    if p <= 0:
        return 0.50
    if p < 0.50:
        return 0.50
    if p < 1.00:
        return 1.00
    return round(p, 2)


def normalize(name: str) -> str:
    return re.sub(r"[^a-z0-9 ]", "", (name or "").lower().strip())


def load_id_lookups() -> dict[str, dict[str, int]]:
    """Return {category: {normalized_name: tcgplayer_product_id}}."""
    lookups: dict[str, dict[str, int]] = {}
    for category, folder in GAME_FOLDERS.items():
        db_path = BASE / folder / "CARDS" / "card_database.json"
        if not db_path.exists():
            continue
        with open(db_path, encoding="utf-8") as f:
            db = json.load(f)
        cards = db.get("cards", db) if isinstance(db, dict) else db
        name_map: dict[str, int] = {}
        for card in cards:
            raw_name = card.get("display_name") or card.get("name") or ""
            pid = card.get("tcgplayer_product_id")
            if pid:
                name_map[normalize(raw_name)] = int(pid)
        lookups[category] = name_map
    return lookups


def main() -> None:
    DOCS_DIR.mkdir(exist_ok=True)
    lookups = load_id_lookups()

    with open(PORTFOLIO_CSV, encoding="utf-8-sig") as f:
        reader = csv.DictReader(f)
        price_col = next(
            (k for k in (reader.fieldnames or []) if k.startswith("Market Price")), None
        )

        cards = []
        for row in reader:
            if is_listed(row):
                continue

            try:
                qty = float(row.get("Quantity", 0) or 0)
            except ValueError:
                qty = 0
            if qty <= 0:
                continue

            raw_price = row.get(price_col, "0") if price_col else "0"
            price = apply_pricing(raw_price)

            category = row["Category"]
            name = row["Product Name"]

            game_lookup = lookups.get(category, {})
            product_id = game_lookup.get(normalize(name))
            image_url = (
                f"https://product-images.tcgplayer.com/fit-in/284x394/{product_id}.jpg"
                if product_id
                else None
            )

            cards.append({
                "id": f"{category}|{row['Set']}|{name}|{row['Card Number']}|{row['Variance']}",
                "name": name,
                "game": category,
                "set": row["Set"],
                "number": row["Card Number"],
                "rarity": row["Rarity"],
                "variance": row["Variance"],
                "condition": row["Card Condition"],
                "qty": int(qty),
                "price": price,
                "image_url": image_url,
                "tcgplayer_id": product_id,
                "color": GAME_COLORS.get(category, "#C9A000"),
            })

    cards.sort(key=lambda c: -c["price"])
    games = sorted({c["game"] for c in cards})

    catalog = {
        "generated": datetime.now().isoformat(timespec="seconds"),
        "total": len(cards),
        "games": games,
        "game_colors": {g: GAME_COLORS.get(g, "#C9A000") for g in games},
        "cards": cards,
    }

    out = DOCS_DIR / "catalog.json"
    with open(out, "w", encoding="utf-8") as f:
        json.dump(catalog, f, separators=(",", ":"))

    print(f"OK: {len(cards)} cards / {len(games)} games -> {out}")
    print(f"  Excluded (noted/zero-qty): filtered automatically")
    print(f"  Games: {', '.join(games)}")


if __name__ == "__main__":
    main()
