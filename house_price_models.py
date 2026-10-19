"""Train and compare house-price models on the Boston Housing data.

Run:  .venv/bin/python house_price_models.py
Writes model_results.json and model_report.html next to this script.
"""
import json
import time
from pathlib import Path

import numpy as np
import pandas as pd
from lightgbm import LGBMRegressor
from sklearn.compose import TransformedTargetRegressor
from sklearn.ensemble import RandomForestRegressor, StackingRegressor
from sklearn.inspection import permutation_importance
from sklearn.linear_model import LinearRegression, RidgeCV
from sklearn.metrics import (mean_absolute_error, mean_absolute_percentage_error,
                             mean_squared_error, r2_score)
from sklearn.model_selection import KFold, cross_val_score, train_test_split
from sklearn.neural_network import MLPRegressor
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler
from sklearn.svm import SVR
from sklearn.tree import DecisionTreeRegressor
from xgboost import XGBRegressor

ROOT = Path(__file__).parent
SEED = 42
COLUMNS = ["CRIM", "ZN", "INDUS", "CHAS", "NOX", "RM", "AGE", "DIS",
           "RAD", "TAX", "PTRATIO", "B", "LSTAT", "MEDV"]
FEATURE_DESCRIPTIONS = {
    "CRIM": "Per-capita crime rate",
    "ZN": "Share of residential land zoned for large lots",
    "INDUS": "Share of non-retail business acres",
    "CHAS": "Borders the Charles River (1/0)",
    "NOX": "Nitric oxide concentration",
    "RM": "Average rooms per dwelling",
    "AGE": "Share of units built before 1940",
    "DIS": "Distance to employment centres",
    "RAD": "Highway accessibility index",
    "TAX": "Property-tax rate per $10k",
    "PTRATIO": "Pupil-teacher ratio",
    "B": "Demographic index (1000(Bk - 0.63)^2)",
    "LSTAT": "% lower-status population",
}


def build_models():
    """Deliberately small models: every one trains in a few seconds on a laptop."""
    scaled = lambda est: make_pipeline(StandardScaler(), est)
    rf = RandomForestRegressor(n_estimators=200, max_features=0.5, min_samples_leaf=1,
                               n_jobs=-1, random_state=SEED)
    xgb = XGBRegressor(n_estimators=400, learning_rate=0.05, max_depth=4, subsample=0.8,
                       colsample_bytree=0.8, n_jobs=-1, random_state=SEED)
    svr = scaled(SVR(kernel="rbf", C=20, epsilon=0.5, gamma="scale"))
    return {
        "Linear Regression": scaled(LinearRegression()),
        "Decision Tree": DecisionTreeRegressor(max_depth=5, min_samples_leaf=5, random_state=SEED),
        "Random Forest": rf,
        "XGBoost": xgb,
        "Neural Network (MLP)": TransformedTargetRegressor(
            regressor=scaled(MLPRegressor(hidden_layer_sizes=(64, 32), alpha=1e-3,
                                          learning_rate_init=1e-3, max_iter=2000,
                                          early_stopping=True, n_iter_no_change=30,
                                          random_state=SEED)),
            transformer=StandardScaler()),
        "SVR (RBF kernel)": svr,
        "LightGBM": LGBMRegressor(n_estimators=300, learning_rate=0.05, num_leaves=15,
                                  min_child_samples=10, subsample=0.8, subsample_freq=1,
                                  colsample_bytree=0.8, random_state=SEED, verbose=-1),
        "Stacking Ensemble": StackingRegressor(
            estimators=[("rf", rf), ("xgb", xgb), ("svr", svr)],
            final_estimator=RidgeCV(), cv=5, n_jobs=-1),
    }


MODEL_NOTES = {
    "Linear Regression": "Baseline. Straight-line fit on standardized features.",
    "Decision Tree": "Single tree, max depth 5, at least 5 houses per leaf.",
    "Random Forest": "200 trees, each split sees 50% of features.",
    "XGBoost": "400 boosted trees, depth 4, learning rate 0.05, 80% row/column sampling.",
    "Neural Network (MLP)": "2 hidden layers (64, 32), early stopping, standardized inputs and target.",
    "SVR (RBF kernel)": "Extra: support-vector regression with an RBF kernel, C=20.",
    "LightGBM": "Extra: 300 leaf-wise boosted trees, 15 leaves each.",
    "Stacking Ensemble": "Extra: Random Forest + XGBoost + SVR, blended by a ridge regression.",
}
REQUESTED = {"Linear Regression", "Decision Tree", "Random Forest", "XGBoost", "Neural Network (MLP)"}


def rmse(y, p):
    return float(np.sqrt(mean_squared_error(y, p)))


def main():
    df = pd.read_csv(ROOT / "Data" / "housing.csv", sep=r"\s+", header=None, names=COLUMNS)
    X, y = df.drop(columns="MEDV"), df["MEDV"]
    X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=SEED)
    cv = KFold(n_splits=5, shuffle=True, random_state=SEED)

    results = []
    fitted = {}
    for name, model in build_models().items():
        print(f"Training {name} ...", flush=True)
        cv_scores = -cross_val_score(model, X_train, y_train, cv=cv,
                                     scoring="neg_root_mean_squared_error", n_jobs=1)
        start = time.perf_counter()
        model.fit(X_train, y_train)
        fit_seconds = time.perf_counter() - start
        pred_train, pred_test = model.predict(X_train), model.predict(X_test)
        fitted[name] = model
        results.append({
            "model": name,
            "requested": name in REQUESTED,
            "note": MODEL_NOTES[name],
            "test_rmse": rmse(y_test, pred_test),
            "test_mae": float(mean_absolute_error(y_test, pred_test)),
            "test_r2": float(r2_score(y_test, pred_test)),
            "test_mape": float(mean_absolute_percentage_error(y_test, pred_test) * 100),
            "train_rmse": rmse(y_train, pred_train),
            "train_r2": float(r2_score(y_train, pred_train)),
            "cv_rmse_mean": float(cv_scores.mean()),
            "cv_rmse_std": float(cv_scores.std()),
            "fit_seconds": fit_seconds,
            "predictions": [[round(float(a), 2), round(float(p), 2)]
                            for a, p in zip(y_test, pred_test)],
        })

    results.sort(key=lambda r: r["cv_rmse_mean"])
    best = results[0]["model"]
    print(f"Computing permutation importance for {best} ...", flush=True)
    imp = permutation_importance(fitted[best], X_test, y_test, n_repeats=20,
                                 random_state=SEED, scoring="neg_root_mean_squared_error")
    importance = sorted(
        [{"feature": f, "description": FEATURE_DESCRIPTIONS[f],
          "mean": float(m), "std": float(s)}
         for f, m, s in zip(X.columns, imp.importances_mean, imp.importances_std)],
        key=lambda d: -d["mean"])

    payload = {
        "dataset": {"rows": len(df), "features": X.shape[1], "train_rows": len(X_train),
                    "test_rows": len(X_test), "target_mean": float(y.mean()),
                    "target_min": float(y.min()), "target_max": float(y.max()),
                    "capped_at_50": int((y >= 50).sum())},
        "baseline_rmse": rmse(y_test, np.full(len(y_test), y_train.mean())),
        "best_model": best,
        "results": results,
        "importance": importance,
    }
    (ROOT / "model_results.json").write_text(json.dumps(payload, indent=2))

    template = (ROOT / "report_template.html").read_text()
    (ROOT / "model_report.html").write_text(
        template.replace("/*__DATA__*/null", json.dumps(payload)))

    print("\nRanked by 5-fold CV RMSE (lower is better):")
    print(f"{'Model':24s} {'CV RMSE':>12s} {'Test RMSE':>10s} {'Test R2':>8s} {'Fit s':>7s}")
    for r in results:
        print(f"{r['model']:24s} {r['cv_rmse_mean']:6.2f} ±{r['cv_rmse_std']:4.2f} "
              f"{r['test_rmse']:10.2f} {r['test_r2']:8.3f} {r['fit_seconds']:7.2f}")
    print(f"\nReport written to {ROOT / 'model_report.html'}")


if __name__ == "__main__":
    main()
