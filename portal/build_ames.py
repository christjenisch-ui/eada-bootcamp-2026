"""Build the data the Ownly website shows about Ames: neighbourhoods, sales and the model.

Run (from the project root):  .venv/bin/python portal/build_ames.py
Reads Data/ames/ames_housing.csv, Data/market/ames_hpi.csv and portal/ames/*,
writes portal/ames/site_data.json. Re-run it after refreshing the files from the repo.
"""
import csv
import json
from pathlib import Path

import pandas as pd

import ames_model

PORTAL = Path(__file__).parent
ROOT = PORTAL.parent
TOWNHOUSE = {"Twnhs", "TwnhsE"}
# One row per sale, kept as compact arrays for the browser.
SALE_COLUMNS = ["order", "neighborhood", "type", "area", "year", "quality", "bedrooms",
                "bathrooms", "garage", "lot", "price", "yr_sold", "mo_sold", "today"]


def main():
    df = pd.read_csv(ROOT / "Data" / "ames" / "ames_housing.csv", keep_default_na=False, na_values=[""])
    df["Neighborhood"] = df["Neighborhood"].str.strip()
    hpi = pd.read_csv(ROOT / "Data" / "market" / "ames_hpi.csv").set_index("period")["index"]
    target = ames_model.MARKET["target_index"]

    # Bring every historical sale to today's market level with the FHFA index of its sale quarter.
    quarter = df["Yr Sold"].astype(str) + "Q" + ((df["Mo Sold"] - 1) // 3 + 1).astype(str)
    df["today"] = df["SalePrice"] * target / quarter.map(hpi)
    df["type"] = df["Bldg Type"].str.strip().isin(TOWNHOUSE).astype(int)
    df["Garage Cars"] = df["Garage Cars"].fillna(0)

    sales = [[int(r["Order"]), r["Neighborhood"], int(r["type"]), int(r["Gr Liv Area"]),
              int(r["Year Built"]), int(r["Overall Qual"]), int(r["Bedroom AbvGr"]),
              int(r["Full Bath"]), int(r["Garage Cars"]), int(r["Lot Area"]),
              int(r["SalePrice"]), int(r["Yr Sold"]), int(r["Mo Sold"]), round(float(r["today"]))]
             for _, r in df.iterrows()]

    neighborhoods = []
    for code, name in ames_model.NEIGHBORHOODS.items():
        g = df[df["Neighborhood"] == code]
        lat, lon = ames_model.CENTERS[code]
        neighborhoods.append({"code": code, "name": name, "lat": lat, "lon": lon,
                              "count": len(g), "typical": round(float(g["today"].median()))})

    with open(PORTAL / "ames" / "model_metrics.csv") as f:
        leaderboard = [{"model": r["model"], "r2": float(r["test_r2"]), "mae": float(r["test_mae"]),
                        "within_20": float(r["test_within_20"])} for r in csv.DictReader(f)]

    market = ames_model.MARKET
    data = {
        "model": {
            "name": market["selected_model"], "factor": ames_model.FACTOR,
            "reference_period": market["reference_period"], "target_period": market["target_period"],
            "index_title": market["index_source"]["title"], "validation": market["simplified_validation"],
        },
        "quality": {"names": ames_model.QUALITY_NAMES, "scores": ames_model.QUALITY},
        "limits": {k: [lo, hi] for k, (lo, hi, _) in ames_model.LIMITS.items()},
        "neighborhoods": sorted(neighborhoods, key=lambda n: n["name"]),
        "sale_columns": SALE_COLUMNS,
        "sales": sales,
        "hpi": [[p, float(v)] for p, v in hpi.items()],
        "leaderboard": leaderboard,
    }
    out = PORTAL / "ames" / "site_data.json"
    out.write_text(json.dumps(data, separators=(",", ":")))
    print(f"Wrote {out.relative_to(ROOT)}: {len(sales)} sales, {len(neighborhoods)} neighbourhoods.")


if __name__ == "__main__":
    main()
