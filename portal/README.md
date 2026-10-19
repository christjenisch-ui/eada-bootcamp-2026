# Ownly

A home-price estimator for **Ames, Iowa** plus a small property marketplace: people can register,
list a home, browse listings and contact sellers.

```bash
.venv/bin/python portal/build_ames.py     # build the neighbourhood/sales data the site shows
.venv/bin/python portal/seed_demo.py      # optional: demo accounts + 5 demo listings
.venv/bin/python portal/server.py         # then open http://localhost:8000
```

Only pandas is needed (for `build_ames.py`); the server, model, database and login use
Python's standard library.

## Where the model comes from

The model and data come from the bootcamp repo
[jordi-torras-ai/eada-bootcamp-2026](https://github.com/jordi-torras-ai/eada-bootcamp-2026),
which trained it on 2,930 Ames home sales (2006–2010). See `ames/SOURCE.md` for every copied file.

- The repo exports its scikit-learn model (histogram gradient boosting, 180 trees) to
  `ames/market-model.json`. `ames_model.py` evaluates that JSON in plain Python, a line-by-line
  port of the repo's `public/model.mjs`, so no scikit-learn version has to match.
- `test_ames_model.py` checks the port against the repo's own Python predictions
  (341 full-feature and 317 simple-form homes match to within $0.00001).
- Eight plain questions (neighbourhood, house/townhouse, living area, year built, quality 1–5,
  bedrooms, full bathrooms, garage spaces) are turned into the model's 75 inputs by filling
  everything else from a representative home of the same neighbourhood and type (`ames/config.json`).
- The model predicts the price at the 2010Q2 market; it's multiplied by the FHFA Ames
  house-price index ratio (2026Q2 ÷ 2010Q2 = 1.947) to give today's price.
- Coverage: houses and townhouses, built 1872–2010, 300–5,000 sq ft, up to 8 bedrooms,
  5 full bathrooms and 4 garage spaces. Other listings show "No Ownly estimate" with the reason.

To pick up a newer version of the repo:

```bash
.venv/bin/python portal/import_ames.py <path to a checkout of eada-bootcamp-2026>
```

## Pages

| Page | What it does |
|---|---|
| `/` (Estimate) | Map of the 28 neighbourhoods, the 8 questions, today's estimate, what moves the price, similar sales, a neighbourhood profile, every sale in the neighbourhood, a size-vs-value chart of all sales, the price-index history and the model comparison. |
| `/homes.html` | Browse listings with filters (neighbourhood, type, max price, bedrooms, sort) and a map. |
| `/home.html?id=N` | One listing: details, Ownly estimate vs. asking price, seller contact + message form. |
| `/sell.html` | Create or edit (`?id=N`) a listing, with a live Ownly estimate. Requires sign-in. |
| `/account.html` | My listings (edit, mark sold, delete), inbox of buyer messages, sent messages. |
| `/signin.html` | Sign in / create account (email + password, name optional). |

The estimator's "List a home like this" pre-fills the sell form, and a listing's
"See why in the estimator" opens the estimator with the listing's details.

## Accounts, listings and messages

- **Database**: SQLite at `portal/ownly.db`, created automatically (schema in `db.py`).
  Tables: `users`, `sessions`, `listings`, `messages`. Delete the file to start fresh.
- **Accounts**: email + password (8+ characters). Email addresses are only checked for
  shape; there is no verification email yet.
- **Passwords** are stored as salted PBKDF2-SHA256 hashes, never in plain text.
- **Sessions**: a random token in an `HttpOnly`, `SameSite=Lax` cookie; only its SHA-256 hash
  is stored. Sessions last 30 days.
- **Who sees what**: anyone can browse listings; seller contact details and the message form
  are only shown to signed-in users. Only a listing's owner can edit, mark sold or delete it.
- **API**: JSON under `/api/` (routes in `server.py`). Write requests must be JSON and
  same-site, which blocks forms on other websites from acting on a signed-in user's behalf.
- Demo logins are listed at the top of `seed_demo.py` (local testing only).

Before putting this on the internet you would still want: HTTPS (and the `Secure` cookie flag),
email verification and password reset, rate-limiting on sign-in, photo uploads, and a real
address geocoder (listings are shown near their neighbourhood's centre on maps).

## Files

| File | Purpose |
|---|---|
| `server.py` | Web server: static pages + JSON API (estimates, accounts, listings, messages). |
| `ames_model.py` | The Ames model in plain Python (predict, fill-in, coverage checks, today's price). |
| `build_ames.py` | Builds `ames/site_data.json` (neighbourhoods, sales at today's prices, index, benchmark). |
| `import_ames.py` | Re-copies the model and data from a checkout of the bootcamp repo. |
| `test_ames_model.py` | Checks `ames_model.py` against the repo's predictions. |
| `db.py` | SQLite schema, password hashing and sessions. |
| `seed_demo.py` | Demo accounts and listings. |
| `static/` | The website (HTML, CSS, JavaScript). |
