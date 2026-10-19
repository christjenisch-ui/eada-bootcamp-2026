"""The Ames valuation model, evaluated in plain Python.

A line-by-line port of public/model.mjs from github.com/jordi-torras-ai/eada-bootcamp-2026:
the repo exports its scikit-learn pipeline (preprocessing + 180 boosted trees) to
ames/market-model.json, so no scikit-learn is needed here. test_ames_model.py checks the
results against the repo's own Python predictions.
"""
import json
import math
from pathlib import Path

ASSETS = Path(__file__).parent / "ames"
MODEL = json.loads((ASSETS / "market-model.json").read_text())
CONFIG = json.loads((ASSETS / "config.json").read_text())
MARKET = json.loads((ASSETS / "market.json").read_text())
CENTERS = json.loads((ASSETS / "neighborhood-centers.json").read_text())["centers"]

QUALITY = CONFIG["quality"]                      # Overall Qual score for levels 1-5
QUALITY_NAMES = ["Basic", "Modest", "Standard", "High-end", "Exceptional"]
NEIGHBORHOODS = {n["code"]: n["name"] for n in CONFIG["neighborhoods"]}
HOME_TYPES = ("house", "townhouse")
LIMITS = {  # the model's coverage, from the repo's validate()
    "area": (300, 5000, "Enter a living area between 300 and 5,000 sq ft (28–464 m²)."),
    "year": (1872, 2010, "Enter a year between 1872 and 2010, the model's historical coverage."),
    "bedrooms": (0, 8, "Choose between 0 and 8 bedrooms."),
    "bathrooms": (0, 5, "Choose between 0 and 5 full bathrooms."),
    "garage": (0, 4, "Choose between 0 and 4 garage spaces."),
    "quality": (1, 5, "Choose one of the five quality levels."),
}
FACTOR = MARKET["target_index"] / MARKET["reference_index"]
assert MODEL["sha256"] == MARKET["model_sha256"], "market.json does not belong to market-model.json"
assert abs(FACTOR - MARKET["adjustment_factor"]) < 1e-12


def _number(value):
    try:
        return float(value)
    except (TypeError, ValueError):
        return math.nan


def _category(value):
    # Match JavaScript's String(): 20.0 -> "20"
    if isinstance(value, float) and value.is_integer():
        value = int(value)
    return str(value)


def predict(features, model=MODEL):
    """Reference price (USD at the 2010Q2 market) for one full 75-column feature row."""
    missing = [features.get(c) is None or features.get(c) == "" for c in model["numeric"]]
    numeric = [model["medians"][i] if missing[i] else _number(features[c])
               for i, c in enumerate(model["numeric"])]
    numeric += [float(missing[i]) for i in model["indicators"]]
    vector = [(n - m) / s for n, m, s in zip(numeric, model["mean"], model["scale"])]
    for cat in model["categorical"]:
        raw = features.get(cat["column"])
        value = "__MISSING__" if raw is None or raw == "" else _category(raw)
        index = cat["mapping"].get(value, cat["unknown"])
        vector += [1.0 if i == index else 0.0 for i in range(cat["size"])]

    output = model["baseline"]
    for tree in model["trees"]:
        node = tree[0]
        while not node[5]:
            value = vector[node[1]]
            if math.isnan(value):
                node = tree[node[3] if node[6] else node[4]]
            else:
                node = tree[node[3] if value <= node[2] else node[4]]
        output += node[0]
    return math.expm1(output)


def validate(form):
    """Field -> message for anything outside the model's coverage (empty dict = OK)."""
    errors = {}
    if form.get("neighborhood") not in CONFIG["profiles"]:
        errors["neighborhood"] = "Choose a neighbourhood from the list."
    if form.get("type") not in HOME_TYPES:
        errors["type"] = "Ownly estimates cover houses and townhouses."
    for key, (lo, hi, message) in LIMITS.items():
        value = form.get(key)
        if (not isinstance(value, (int, float)) or isinstance(value, bool) or not math.isfinite(value)
                or not lo <= value <= hi or (key != "area" and not float(value).is_integer())):
            errors[key] = message
    return errors


def adapt(form):
    """Turn the 8 plain-language answers into a full feature row.

    Everything not asked is filled from a representative training home of the same
    neighbourhood and type (config.json "profiles"), exactly like the repo's adapt().
    """
    row = dict(CONFIG["profiles"][form["neighborhood"]][form["type"]]["features"])
    fraction = row["2nd Flr SF"] / max(row["Gr Liv Area"], 1)
    area, year = form["area"], int(form["year"])
    bedrooms, garage = int(form["bedrooms"]), int(form["garage"])
    row.update({
        "Neighborhood": form["neighborhood"], "Gr Liv Area": area,
        "Overall Qual": QUALITY[int(form["quality"]) - 1],
        "Year Built": year, "Year Remod/Add": max(year, row["Year Remod/Add"]),
        "Bedroom AbvGr": bedrooms, "Full Bath": int(form["bathrooms"]),
        "Garage Cars": garage, "Garage Area": garage * 240,
        "1st Flr SF": round(area * (1 - fraction)), "2nd Flr SF": round(area * fraction),
        "Low Qual Fin SF": 0, "TotRms AbvGrd": max(bedrooms + 3, 4),
    })
    if garage == 0:
        row.update({"Garage Type": "NA", "Garage Yr Blt": None, "Garage Finish": "NA",
                    "Garage Qual": "NA", "Garage Cond": "NA"})
    elif not row.get("Garage Yr Blt"):
        row.update({"Garage Type": "Attchd", "Garage Yr Blt": year, "Garage Finish": "Unf",
                    "Garage Qual": "TA", "Garage Cond": "TA"})
    return row


def estimate(form):
    """Price at today's market (latest index period) plus the 2010 reference value."""
    reference = predict(adapt(form))
    return {"price": reference * FACTOR, "reference": reference}
