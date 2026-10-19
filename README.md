# EADA Bootcamp 2026 · Housing

Housing data-science work from the EADA bootcamp, centred on **Ownly**: a web app that
estimates home prices in Ames, Iowa and lets people list homes and contact sellers.

## Ownly (`portal/`)

- **Estimate**: pick one of Ames's 28 neighbourhoods on a map, answer eight simple questions
  (house or townhouse, living area, year built, quality, bedrooms, bathrooms, garage) and get
  today's price, with what drives it, similar real sales and a neighbourhood profile.
- **Marketplace**: register with email + password, list a home (with a live Ownly estimate),
  browse listings on a map, and message sellers. Data is stored in SQLite.

```bash
python3 -m venv .venv && .venv/bin/pip install pandas
.venv/bin/python portal/build_ames.py     # build the data the site shows
.venv/bin/python portal/seed_demo.py      # optional: demo accounts + listings
.venv/bin/python portal/server.py         # open http://localhost:8000
```

The price model and Ames data come from
[jordi-torras-ai/eada-bootcamp-2026](https://github.com/jordi-torras-ai/eada-bootcamp-2026);
see [portal/README.md](portal/README.md) for how it's wired in and [portal/ames/SOURCE.md](portal/ames/SOURCE.md)
for the copied files.

## Other material

| Path | What it is |
|---|---|
| `Data/ames/` | The Ames Housing dataset: 2,930 sales (2006–2010) and its data dictionary. |
| `Data/market/` | FHFA house-price index for Ames, used to bring old prices to today's market. |
| `Data/housing.csv` | The classic **Boston** Housing dataset (506 census tracts, 1970s). |
| `course/` | "EDA Crash Course": an interactive intro to exploratory data analysis on the Boston data. Open `course/index.html`. |
| `house_price_models.py` | Compares 8 models (linear regression to XGBoost) on the Boston data; writes `model_results.json` and `model_report.html`. |
| `model_report.html` | The resulting model comparison report. |
