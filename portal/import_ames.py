"""Refresh Ownly's Ames model and data from a checkout of the bootcamp repo.

Run (from the project root):
    git clone https://github.com/jordi-torras-ai/eada-bootcamp-2026 ../eada-bootcamp-2026
    .venv/bin/python portal/import_ames.py ../eada-bootcamp-2026

Copies the files listed below, checks the model still matches the repo's own predictions
(test_ames_model.py) and rebuilds ames/site_data.json (build_ames.py).
"""
import shutil
import subprocess
import sys
from pathlib import Path

PORTAL = Path(__file__).parent
ROOT = PORTAL.parent

# repo path -> path in this project
FILES = {
    "portal/public/assets/market-model.json": "portal/ames/market-model.json",
    "portal/public/assets/config.json": "portal/ames/config.json",
    "portal/public/assets/market.json": "portal/ames/market.json",
    "portal/public/assets/neighborhood-centers.json": "portal/ames/neighborhood-centers.json",
    "portal/tests/market-fixtures.json": "portal/ames/tests/market-fixtures.json",
    "models/ames/model_metrics.csv": "portal/ames/model_metrics.csv",
    "dat/ames/ames_housing.csv": "Data/ames/ames_housing.csv",
    "dat/ames/data_description.txt": "Data/ames/data_description.txt",
    "dat/ames/source.json": "Data/ames/source.json",
    "dat/market/ames_hpi.csv": "Data/market/ames_hpi.csv",
    "dat/market/source.json": "Data/market/source.json",
}


def main():
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    repo = Path(sys.argv[1]).resolve()
    missing = [src for src in FILES if not (repo / src).exists()]
    if missing:
        sys.exit(f"Not found in {repo}: {', '.join(missing)}")
    for src, dest in FILES.items():
        (ROOT / dest).parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(repo / src, ROOT / dest)
        print(f"copied {src}")
    for script in ("test_ames_model.py", "build_ames.py"):
        subprocess.run([sys.executable, str(PORTAL / script)], check=True)
    print("Done. Restart the server to use the new model.")


if __name__ == "__main__":
    main()
