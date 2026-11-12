"""
Generate docs/cyberpunk-cards.json for the deck builder.
Run: python CYBERPUNK/make_deck_data.py
"""
import csv, json, re
from pathlib import Path

BASE = Path(__file__).resolve().parent.parent
CHECKLIST = BASE / "CYBERPUNK" / "CARDS" / "welcome_to_night_city_beta_checklist.csv"
CATALOG   = BASE / "docs" / "catalog.json"
OUT       = BASE / "docs" / "cyberpunk-cards.json"

# ── Legend character → color / RAM ───────────────────────────────────────────
# Colors: red | green | blue | yellow
# RAM is typically 2 per legend
CHAR_COLOR = {
    "adam smasher":    "red",
    "dexter deshawn":  "yellow",
    "johnny silverhand": "red",
    "royce":           "red",
    "v":               "red",
    "dum dum":         "red",
    "kerry eurodyne":  "green",
    "muamar reyes":    "green",
    "river ward":      "blue",
    "rogue amendiares": "yellow",
    "goro takemura":   "yellow",
    "hanako arasaka":  "yellow",
    "jackie welles":   "red",
    "padre":           "green",
    "panam palmer":    "green",
    "alt cunningham":  "blue",
    "evelyn parker":   "blue",
    "judy alvarez":    "blue",
    "wakako okada":    "yellow",
    "sasha yakovleva": "blue",
    "yorinobu arasaka": "yellow",
    "sandayu oda":     "yellow",
    "viktor vektor":   "blue",
    "meredith stout":  "yellow",
    "placide":         "green",
    "lizzy wizzy":     "green",
    "rogue":           "yellow",   # fallback for bare 'Rogue' names
}

# Card numbers known to be Legend cards (these go in the legend pool)
# Key: stripped number string (no "B", no leading zeros where applicable)
LEGEND_NUMBERS = {
    # Adam Smasher
    "001", "041", "141", "160",
    # Dexter DeShawn
    "002", "142",
    # Johnny Silverhand
    "003", "011", "159", "168",
    # Royce
    "004", "143",
    # V
    "005a", "005b", "020", "144",
    # Dum Dum
    "036", "145",
    # Kerry Eurodyne
    "012", "037", "146",
    # Muamar Reyes / El Capitan
    "038", "147",
    # River Ward
    "039", "148",
    # Rogue Amendiares
    "040", "126", "149", "166",
    # Goro Takemura
    "071", "150",
    # Hanako Arasaka
    "046", "072", "151", "162",
    # Jackie Welles
    "048", "073", "152",
    # Padre
    "074", "153",
    # Panam Palmer
    "075", "085", "154", "165", "170",
    # Alt Cunningham
    "042", "106", "155", "161",
    # Evelyn Parker
    "107", "113", "156",
    # Judy Alvarez
    "108", "116", "157", "171",
    # Wakako Okada
    "110", "158",
    # Sasha Yakovleva
    "109", "169",
    # Others likely legends
    "014",   # Meredith Stout
    "057",   # Viktor Vektor
    "058",   # Viktor Vektor variant
    "117",   # Lizzy Wizzy
    "123",   # Placide
}

# ILegend / IO / ISecret rarities — also legend-pool items, never go in deck
LEGEND_RARITIES = {"IL", "IO", "IS"}


def card_key(number: str) -> str:
    """Normalize checklist number for lookup (strip B, lowercase)."""
    return number.lstrip("Bb").lower()


def extract_character(name: str) -> str | None:
    """Return character name slug if the card name matches a known legend."""
    # Strip rarity label in parens like "(Epic)", "(Rare)", "(ILegend)" etc.
    clean = re.sub(r"\s*\([^)]*\)\s*$", "", name).strip()
    # Character name is everything before the first " - "
    base = clean.split(" - ")[0].strip().lower()
    if base in CHAR_COLOR:
        return base
    # Try full cleaned name (for single-word names like "Padre")
    full = clean.lower()
    if full in CHAR_COLOR:
        return full
    return None


def build():
    # ── Load catalog image URLs ───────────────────────────────────────────
    img_map: dict[str, str] = {}  # normalized_name → image_url
    with open(CATALOG, encoding="utf-8") as f:
        catalog = json.load(f)
    for card in catalog.get("cards", []):
        if card.get("game") == "Cyberpunk" and card.get("image_url"):
            # Normalize name (strip rarity parens, lower)
            n = re.sub(r"\s*\([^)]*\)\s*$", "", card["name"]).strip().lower()
            if n not in img_map:
                img_map[n] = card["image_url"]
            # Also try with number
            if card.get("number"):
                img_map[f"num_{card['number'].lstrip('0')}"] = card["image_url"]

    # ── Parse checklist ───────────────────────────────────────────────────
    legends: list[dict] = []
    cards: list[dict] = []

    with open(CHECKLIST, newline="", encoding="utf-8-sig") as f:
        for row in csv.DictReader(f):
            num     = row["Number"].strip()          # e.g. "B001"
            rarity  = row["Rarity"].strip()          # e.g. "E", "IL", "C"
            name    = row["Name"].strip()
            num_key = card_key(num)                  # "001"

            # Determine if legend pool card
            is_legend_num    = num_key in LEGEND_NUMBERS
            is_legend_rarity = rarity in LEGEND_RARITIES

            character = extract_character(name)
            is_legend_char = character is not None

            is_legend = is_legend_num or is_legend_rarity or is_legend_char

            # Look up image URL
            clean_name = re.sub(r"\s*\([^)]*\)\s*$", "", name).strip()
            img = (
                img_map.get(clean_name.lower())
                or img_map.get(f"num_{num_key.lstrip('0')}")
                or ""
            )

            entry = {
                "id":       num,
                "name":     name,
                "clean":    clean_name,
                "number":   num_key,
                "rarity":   rarity,
                "image":    img,
            }

            if is_legend:
                entry["character"] = character or clean_name.split(" - ")[0].strip()
                entry["color"]     = CHAR_COLOR.get(
                    (character or ""), "red"
                )
                entry["ram"]       = 2
                entry["is_foil"]   = rarity in LEGEND_RARITIES
                legends.append(entry)
            else:
                cards.append(entry)

    # Sort
    legends.sort(key=lambda c: (c["character"].lower(), c["is_foil"], c["name"].lower()))
    cards.sort(key=lambda c: c["clean"].lower())

    output = {
        "set":     "Welcome to Night City",
        "legends": legends,
        "cards":   cards,
    }
    OUT.write_text(json.dumps(output, indent=2, ensure_ascii=False), encoding="utf-8")
    print(f"✓ Wrote {len(legends)} legends + {len(cards)} cards → {OUT.relative_to(BASE)}")


if __name__ == "__main__":
    build()
