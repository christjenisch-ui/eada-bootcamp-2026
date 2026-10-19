# Where these files come from

Copied from https://github.com/jordi-torras-ai/eada-bootcamp-2026
at commit `ad0b5f92d27d49d47450fe3b330c8331875b5650` (2026-10-19). The repo has no license file.

| File here | In the repo | What it is |
|---|---|---|
| `market-model.json` | `portal/public/assets/` | The trained Ames model (histogram gradient boosting, 180 trees + preprocessing) exported to JSON. Predicts the price at the 2010Q2 market. |
| `config.json` | `portal/public/assets/` | The 5 quality levels, the 28 neighbourhoods, and a representative home per neighbourhood and type, used to fill in everything the 8-question form doesn't ask. |
| `market.json` | `portal/public/assets/` | FHFA house-price index metadata: 2010Q2 = 166.78, 2026Q2 = 324.78, so today's price = model price × 1.947. |
| `neighborhood-centers.json` | `portal/public/assets/` | Approximate map centre of each neighbourhood. |
| `model_metrics.csv` | `models/ames/` | The benchmark of 7 models + a baseline on 2010 sales. |
| `tests/market-fixtures.json` | `portal/tests/` | The repo's own Python predictions, used by `../test_ames_model.py`. |
| `../../Data/ames/*` | `dat/ames/` | The 2,930 Ames sales (De Cock dataset) and its data dictionary. |
| `../../Data/market/*` | `dat/market/` | The FHFA Ames house-price index, 1986Q4–2026Q2. |

`site_data.json` is generated here by `../build_ames.py`, not copied.

To refresh everything from a newer version of the repo: `.venv/bin/python portal/import_ames.py <path to repo checkout>`.
