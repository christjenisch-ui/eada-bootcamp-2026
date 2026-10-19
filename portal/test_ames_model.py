"""Check that ames_model.py gives the same prices as the repo's original Python model.

Run (from the project root):  .venv/bin/python portal/test_ames_model.py
"""
import json
from pathlib import Path

import ames_model

fixtures = json.loads((Path(__file__).parent / "ames" / "tests" / "market-fixtures.json").read_text())

worst = 0.0
for i, row in enumerate(fixtures["rows"]):
    diff = abs(ames_model.predict(row) - fixtures["reference_predictions"][i])
    worst = max(worst, diff)
    assert diff < 1e-5, f"full-feature row {i} differs by {diff}"
for i, form in enumerate(fixtures["forms"]):
    result = ames_model.estimate(form)
    assert abs(result["reference"] - fixtures["adapted_reference_predictions"][i]) < 1e-5, f"form {i} reference"
    assert abs(result["price"] - fixtures["adapted_scenario_predictions"][i]) < 1e-5, f"form {i} 2026 price"
    worst = max(worst, abs(result["price"] - fixtures["adapted_scenario_predictions"][i]))

example = {"neighborhood": "NAmes", "type": "house", "area": 1500, "year": 1970,
           "quality": 3, "bedrooms": 3, "bathrooms": 2, "garage": 2}
assert ames_model.validate(example) == {}
for bad in ({"area": 0}, {"area": 5001}, {"year": 2026}, {"year": 1970.5}, {"type": "apartment"},
            {"quality": 0}, {"bedrooms": 9}, {"bathrooms": 1.5}, {"neighborhood": "Boston"}, {"area": True}):
    assert ames_model.validate({**example, **bad}), f"accepted invalid input {bad}"
for code in ames_model.NEIGHBORHOODS:
    assert code in ames_model.CENTERS, f"no map position for {code}"
    for kind in ames_model.HOME_TYPES:
        assert ames_model.estimate({**example, "neighborhood": code, "type": kind})["price"] > 0
no_garage = ames_model.adapt({**example, "garage": 0})
assert no_garage["Garage Area"] == 0 and no_garage["Garage Type"] == "NA"

print(f"PASS: {len(fixtures['rows'])} full-feature and {len(fixtures['forms'])} simple-form predictions "
      f"match the repo's Python model (largest difference ${worst:.8f}).")
print("PASS: invalid inputs rejected; all 28 neighbourhoods work for houses and townhouses.")
