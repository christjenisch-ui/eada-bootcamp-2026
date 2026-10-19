"""Serve Ownly: the Ames home-price estimator plus accounts, listings and messages.

Run (from the project root):  .venv/bin/python portal/server.py
Then open http://localhost:8000
"""
import json
import math
import re
import sqlite3
import sys
import traceback
from datetime import date
from http.cookies import CookieError, SimpleCookie
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from types import SimpleNamespace
from urllib.parse import parse_qs, urlsplit

import ames_model
import db

PORTAL = Path(__file__).parent
STATIC = PORTAL / "static"
PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8000
MAX_BODY = 64 * 1024
COOKIE = "ownly_session"

SITE_DATA = PORTAL / "ames" / "site_data.json"
if not SITE_DATA.exists():
    sys.exit("ames/site_data.json not found - run: .venv/bin/python portal/build_ames.py")
SITE = json.loads(SITE_DATA.read_text())
NEIGHBORHOODS = {n["code"]: n for n in SITE["neighborhoods"]}
TYPICAL_ERROR = SITE["model"]["validation"]["mape"] / 100   # mean absolute % error of the simple form


# ---------------------------------------------------------------- estimates
def _median(values):
    values = sorted(values)
    return values[len(values) // 2]


_cols = SITE["sale_columns"]
# A "typical Ames home", used as the comparison point for "why this price".
TYPICAL = {"type": "house", "quality": 3,
           **{k: _median(sale[_cols.index(k)] for sale in SITE["sales"])
              for k in ("area", "year", "bedrooms", "bathrooms", "garage")}}
FACTORS = [("Neighbourhood", "neighborhood"), ("Living area", "area"), ("Quality", "quality"),
           ("Year built", "year"), ("Bedrooms", "bedrooms"), ("Full bathrooms", "bathrooms"),
           ("Garage", "garage"), ("Home type", "type")]


def rounded(price):
    return int(round(price / 1000) * 1000)


def price_range(price):
    return {"estimate": rounded(price), "estimate_low": rounded(price * (1 - TYPICAL_ERROR)),
            "estimate_high": rounded(price * (1 + TYPICAL_ERROR))}


def average_over_neighborhoods(form):
    return sum(ames_model.estimate({**form, "neighborhood": code})["price"]
               for code in NEIGHBORHOODS) / len(NEIGHBORHOODS)


def explain(form):
    """Estimate for the estimator page, plus how much each answer moves it.

    Each effect = price as entered minus the price with that one answer set to a typical
    Ames value (for the neighbourhood: averaged over all 28), so positive = raises the price.
    """
    result = ames_model.estimate(form)
    price = result["price"]
    factors = []
    for label, key in FACTORS:
        if key == "neighborhood":
            other = average_over_neighborhoods(form)
        elif form[key] == TYPICAL[key]:
            other = price
        else:
            other = ames_model.estimate({**form, key: TYPICAL[key]})["price"]
        factors.append({"name": label, "effect": price - other})
    typical = average_over_neighborhoods({**TYPICAL, "neighborhood": form["neighborhood"]})
    return {**price_range(price), "price": price, "reference": result["reference"],
            "typical": typical, "factors": factors}


COVERAGE_NOTES = {
    "area": "Ownly estimates cover homes with 300–5,000 sq ft of living area.",
    "year": "Ownly estimates cover homes built between 1872 and 2010.",
    "bedrooms": "Ownly estimates cover homes with up to 8 bedrooms.",
    "bathrooms": "Ownly estimates cover homes with up to 5 full bathrooms.",
    "garage": "Ownly estimates cover homes with up to 4 garage spaces.",
}


def listing_form(item):
    """The model's 8 answers for a listing, or (None, reason) when it's outside the model's coverage."""
    kind = {"House": "house", "Townhouse": "townhouse"}.get(item["property_type"])
    if not kind:
        return None, "Ownly estimates cover houses and townhouses only."
    form = {"neighborhood": item["area"], "type": kind, "area": item["sqft"], "year": item["year_built"],
            "quality": item["quality"], "bedrooms": item["bedrooms"],
            "bathrooms": int(item["bathrooms"] or 0), "garage": item["garage"]}
    errors = ames_model.validate(form)
    if errors:
        key = next(iter(errors))
        return None, COVERAGE_NOTES.get(key, errors[key])
    return form, None


def estimate_listings(items):
    """Ownly estimate (today's market) for listing dicts; estimate is None when not covered."""
    out = []
    for item in items:
        form, reason = listing_form(item)
        out.append(price_range(ames_model.estimate(form)["price"]) if form
                   else {"estimate": None, "estimate_low": None, "estimate_high": None, "estimate_note": reason})
    return out


# ---------------------------------------------------------------- routing
class ApiError(Exception):
    def __init__(self, status, message, fields=None):
        super().__init__(message)
        self.status, self.message, self.fields = status, message, fields or {}


ROUTES = []


def route(method, pattern, login=False):
    def register(fn):
        ROUTES.append((method, re.compile(pattern + "$"), fn, login))
        return fn
    return register


# ---------------------------------------------------------------- validation
PROPERTY_TYPES = ("House", "Apartment", "Condo", "Townhouse")
LISTING_FIELDS = ("title", "property_type", "area", "address", "price", "sqft", "year_built",
                  "bedrooms", "bathrooms", "garage", "quality", "description",
                  "contact_name", "contact_email", "contact_phone")
EMAIL_RE = re.compile(r"[^@\s]+@[^@\s]+")  # shape only - addresses are not verified


def clean_listing(data):
    out, errors = {}, {}

    def text(key, label, max_len, required=True):
        value = str(data.get(key) or "").strip()
        if required and not value:
            errors[key] = f"{label} is required."
        elif len(value) > max_len:
            errors[key] = f"{label} can be at most {max_len} characters."
        out[key] = value

    def number(key, label, lo, hi, required=True, cast=int):
        value = data.get(key)
        out[key] = None
        if value in (None, ""):
            if required:
                errors[key] = f"{label} is required."
            return
        try:
            n = cast(value)
            if not math.isfinite(n):
                raise ValueError
        except (TypeError, ValueError):
            errors[key] = f"{label} must be a number."
            return
        if not lo <= n <= hi:
            errors[key] = f"{label} must be between {lo:,} and {hi:,}."
        out[key] = n

    def choice(key, label, options):
        value = data.get(key)
        if value not in options:
            errors[key] = f"Choose a {label}."
        out[key] = value

    text("title", "Title", 100)
    choice("property_type", "property type", PROPERTY_TYPES)
    choice("area", "neighbourhood", NEIGHBORHOODS)
    text("address", "Street address", 200)
    number("price", "Asking price", 10_000, 100_000_000)
    number("sqft", "Living area", 100, 100_000)
    number("year_built", "Year built", 1700, date.today().year + 2)
    number("bedrooms", "Bedrooms", 0, 20)
    number("bathrooms", "Bathrooms", 0, 20, cast=float)
    number("garage", "Garage spaces", 0, 10, required=False)
    out["garage"] = out["garage"] or 0
    number("quality", "Quality", 1, 5)
    text("description", "Description", 4000, required=False)
    text("contact_name", "Contact name", 100)
    text("contact_email", "Contact email", 254)
    text("contact_phone", "Phone", 40, required=False)

    if out["contact_email"] and "contact_email" not in errors and not EMAIL_RE.fullmatch(out["contact_email"]):
        errors["contact_email"] = "Enter an email address like name@example.com."
    if errors:
        raise ApiError(400, "Please fix the highlighted fields.", errors)
    return out


# ---------------------------------------------------------------- listings helpers
PUBLIC_FIELDS = ("id", "title", "property_type", "area", "address", "price", "sqft", "year_built",
                 "bedrooms", "bathrooms", "garage", "quality", "description", "status",
                 "created_at", "updated_at")


def map_position(listing_id, place):
    """Listings aren't geocoded: spread them around their neighbourhood's centre so markers don't overlap."""
    angle = listing_id * 2.39996
    radius = 0.0018 * math.sqrt(listing_id % 7 + 1)
    return place["lat"] + radius * math.sin(angle), place["lon"] + radius * 1.35 * math.cos(angle)


def serialize(rows, user, contact=False):
    rows = [dict(r) for r in rows]
    out = []
    for row, est in zip(rows, estimate_listings(rows)):
        place = NEIGHBORHOODS[row["area"]]
        item = {k: row[k] for k in PUBLIC_FIELDS}
        lat, lon = map_position(row["id"], place)
        item.update(est, area_name=place["name"], quality_name=ames_model.QUALITY_NAMES[row["quality"] - 1],
                    lat=lat, lon=lon, is_owner=bool(user and user["id"] == row["user_id"]))
        if contact:
            item.update({k: row[k] for k in ("contact_name", "contact_email", "contact_phone")})
        for extra in ("message_count", "unread_count"):
            if extra in row:
                item[extra] = row[extra]
        out.append(item)
    return out


def fetch_listing(conn, listing_id):
    row = conn.execute("SELECT * FROM listings WHERE id = ?", (int(listing_id),)).fetchone()
    if not row:
        raise ApiError(404, "This listing doesn't exist (any more).")
    return row


def owned_listing(req, listing_id):
    row = fetch_listing(req.conn, listing_id)
    if row["user_id"] != req.user["id"]:
        raise ApiError(403, "Only the seller can change this listing.")
    return row


def start_session(req, user_id):
    token = db.create_session(req.conn, user_id)
    req.cookies.append(f"{COOKIE}={token}; Path=/; HttpOnly; SameSite=Lax; Max-Age={db.SESSION_DAYS * 86400}")


def public_user(row):
    return {"id": row["id"], "email": row["email"], "name": row["name"]}


# ---------------------------------------------------------------- estimator API
@route("GET", "/api/meta")
def get_meta(req):
    return SITE


@route("GET", "/api/areas")
def get_areas(req):
    """Light-weight neighbourhood list for the listing pages."""
    return {"areas": [{"id": n["code"], "name": n["name"], "lat": n["lat"], "lon": n["lon"]}
                      for n in SITE["neighborhoods"]],
            "property_types": PROPERTY_TYPES, "quality_names": ames_model.QUALITY_NAMES}


def read_form(body):
    form = {"neighborhood": body.get("neighborhood"), "type": body.get("type")}
    for key in ("area", "year", "quality", "bedrooms", "bathrooms", "garage"):
        value = body.get(key)
        form[key] = value if isinstance(value, (int, float)) and not isinstance(value, bool) else None
    errors = ames_model.validate(form)
    if errors:
        raise ApiError(400, next(iter(errors.values())), errors)
    return form


@route("POST", "/api/predict")
def post_predict(req):
    """Estimator page: today's estimate plus the factor breakdown."""
    return explain(read_form(req.body))


@route("POST", "/api/estimate")
def post_estimate(req):
    """Sell form: estimate for the listing being typed (estimate is None if not covered)."""
    body = req.body
    if body.get("area") not in NEIGHBORHOODS:
        raise ApiError(400, "Pick a neighbourhood.")
    item = {k: body.get(k) for k in ("area", "property_type", "sqft", "year_built", "bedrooms",
                                      "bathrooms", "garage", "quality")}
    for key in ("sqft", "year_built", "bedrooms", "garage", "quality"):
        if not isinstance(item[key], (int, float)) or isinstance(item[key], bool):
            item[key] = None
    if not isinstance(item["bathrooms"], (int, float)):
        item["bathrooms"] = 0
    item["garage"] = item["garage"] or 0
    if None in (item["sqft"], item["year_built"], item["bedrooms"], item["quality"]):
        return {"estimate": None, "estimate_note": "Add the living area, year built, bedrooms and quality to see an estimate."}
    return estimate_listings([item])[0]


# ---------------------------------------------------------------- accounts API
@route("POST", "/api/register")
def register(req):
    email = str(req.body.get("email") or "").strip()
    password = str(req.body.get("password") or "")
    name = str(req.body.get("name") or "").strip()[:100]
    errors = {}
    if len(email) > 254 or not EMAIL_RE.fullmatch(email):
        errors["email"] = "Enter an email address like name@example.com."
    if len(password) < 8:
        errors["password"] = "Use at least 8 characters."
    elif len(password) > 200:
        errors["password"] = "That password is too long (200 characters max)."
    if errors:
        raise ApiError(400, "Please fix the highlighted fields.", errors)
    try:
        cur = req.conn.execute(
            "INSERT INTO users (email, name, password_hash, created_at) VALUES (?, ?, ?, ?)",
            (email, name, db.hash_password(password), db.now()))
    except sqlite3.IntegrityError:
        raise ApiError(409, "An account with this email already exists. Try signing in instead.",
                       {"email": "This email is already registered."})
    start_session(req, cur.lastrowid)
    return {"user": {"id": cur.lastrowid, "email": email, "name": name}}


@route("POST", "/api/login")
def login(req):
    email = str(req.body.get("email") or "").strip()
    password = str(req.body.get("password") or "")
    row = req.conn.execute("SELECT * FROM users WHERE email = ?", (email,)).fetchone()
    valid = db.check_password(password, row["password_hash"] if row else db.DUMMY_HASH)
    if not (row and valid):
        raise ApiError(401, "That email and password don't match an account.")
    start_session(req, row["id"])
    return {"user": public_user(row)}


@route("POST", "/api/logout")
def logout(req):
    if req.token:
        db.delete_session(req.conn, req.token)
    req.cookies.append(f"{COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0")
    return {"ok": True}


@route("GET", "/api/me")
def me(req):
    if not req.user:
        return {"user": None, "unread": 0}
    unread = req.conn.execute(
        """SELECT COUNT(*) FROM messages m JOIN listings l ON l.id = m.listing_id
           WHERE l.user_id = ? AND m.read_at IS NULL""", (req.user["id"],)).fetchone()[0]
    return {"user": req.user, "unread": unread}


# ---------------------------------------------------------------- listings API
@route("GET", "/api/listings")
def list_listings(req):
    q = req.query
    where, args = ["status = 'active'"], []
    if q.get("area") in NEIGHBORHOODS:
        where.append("area = ?")
        args.append(q["area"])
    if q.get("type") in PROPERTY_TYPES:
        where.append("property_type = ?")
        args.append(q["type"])
    for key, clause in (("max_price", "price <= ?"), ("min_beds", "bedrooms >= ?")):
        if q.get(key, "").isdigit():
            where.append(clause)
            args.append(int(q[key]))
    sort = q.get("sort", "newest")
    order = {"price_asc": "price ASC", "price_desc": "price DESC"}.get(sort, "created_at DESC, id DESC")
    rows = req.conn.execute(
        f"SELECT * FROM listings WHERE {' AND '.join(where)} ORDER BY {order} LIMIT 300", args).fetchall()
    items = serialize(rows, req.user)
    if sort == "value":
        items.sort(key=lambda item: item["price"] / item["estimate"] if item["estimate"] else math.inf)
    return {"listings": items}


@route("GET", r"/api/listings/(\d+)")
def get_listing(req, listing_id):
    row = fetch_listing(req.conn, listing_id)
    # Contact details are only shown to signed-in users.
    return {"listing": serialize([row], req.user, contact=req.user is not None)[0]}


@route("POST", "/api/listings", login=True)
def create_listing(req):
    data = clean_listing(req.body)
    ts = db.now()
    cols = LISTING_FIELDS + ("user_id", "created_at", "updated_at")
    cur = req.conn.execute(
        f"INSERT INTO listings ({', '.join(cols)}) VALUES ({', '.join('?' * len(cols))})",
        [data[c] for c in LISTING_FIELDS] + [req.user["id"], ts, ts])
    return {"id": cur.lastrowid}


@route("PUT", r"/api/listings/(\d+)", login=True)
def update_listing(req, listing_id):
    owned_listing(req, listing_id)
    if set(req.body) == {"status"}:
        if req.body["status"] not in ("active", "sold"):
            raise ApiError(400, "Status must be active or sold.")
        req.conn.execute("UPDATE listings SET status = ?, updated_at = ? WHERE id = ?",
                         (req.body["status"], db.now(), int(listing_id)))
        return {"id": int(listing_id)}
    data = clean_listing(req.body)
    req.conn.execute(
        f"UPDATE listings SET {', '.join(f'{c} = ?' for c in LISTING_FIELDS)}, updated_at = ? WHERE id = ?",
        [data[c] for c in LISTING_FIELDS] + [db.now(), int(listing_id)])
    return {"id": int(listing_id)}


@route("DELETE", r"/api/listings/(\d+)", login=True)
def delete_listing(req, listing_id):
    owned_listing(req, listing_id)
    req.conn.execute("DELETE FROM listings WHERE id = ?", (int(listing_id),))
    return {"ok": True}


@route("GET", "/api/my/listings", login=True)
def my_listings(req):
    rows = req.conn.execute(
        """SELECT l.*,
                  (SELECT COUNT(*) FROM messages m WHERE m.listing_id = l.id) AS message_count,
                  (SELECT COUNT(*) FROM messages m WHERE m.listing_id = l.id AND m.read_at IS NULL) AS unread_count
           FROM listings l WHERE l.user_id = ? ORDER BY l.created_at DESC, l.id DESC""",
        (req.user["id"],)).fetchall()
    return {"listings": serialize(rows, req.user, contact=True)}


# ---------------------------------------------------------------- messages API
@route("POST", r"/api/listings/(\d+)/messages", login=True)
def contact_seller(req, listing_id):
    row = fetch_listing(req.conn, listing_id)
    if row["user_id"] == req.user["id"]:
        raise ApiError(400, "This is your own listing.")
    if row["status"] != "active":
        raise ApiError(400, "This home is no longer for sale.")
    body = str(req.body.get("message") or "").strip()
    phone = str(req.body.get("phone") or "").strip()
    if not body:
        raise ApiError(400, "Write a message to the seller.", {"message": "Write a message to the seller."})
    if len(body) > 2000 or len(phone) > 40:
        raise ApiError(400, "Your message is too long (2,000 characters max).")
    req.conn.execute(
        "INSERT INTO messages (listing_id, sender_id, body, phone, created_at) VALUES (?, ?, ?, ?, ?)",
        (int(listing_id), req.user["id"], body, phone, db.now()))
    return {"ok": True}


@route("GET", "/api/my/messages", login=True)
def my_messages(req):
    uid = req.user["id"]
    received = req.conn.execute(
        """SELECT m.id, m.body, m.phone, m.created_at, m.read_at, l.id AS listing_id,
                  l.title AS listing_title, u.name AS sender_name, u.email AS sender_email
           FROM messages m JOIN listings l ON l.id = m.listing_id JOIN users u ON u.id = m.sender_id
           WHERE l.user_id = ? ORDER BY m.created_at DESC, m.id DESC""", (uid,)).fetchall()
    sent = req.conn.execute(
        """SELECT m.id, m.body, m.created_at, l.id AS listing_id, l.title AS listing_title,
                  l.contact_name AS seller_name
           FROM messages m JOIN listings l ON l.id = m.listing_id
           WHERE m.sender_id = ? ORDER BY m.created_at DESC, m.id DESC""", (uid,)).fetchall()
    return {"received": [dict(r) for r in received], "sent": [dict(r) for r in sent]}


@route("POST", "/api/my/messages/read", login=True)
def mark_messages_read(req):
    req.conn.execute(
        """UPDATE messages SET read_at = ? WHERE read_at IS NULL
           AND listing_id IN (SELECT id FROM listings WHERE user_id = ?)""", (db.now(), req.user["id"]))
    return {"ok": True}


# ---------------------------------------------------------------- HTTP
class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(STATIC), **kwargs)

    def do_GET(self):
        if self.path.startswith("/api/"):
            return self.handle_api("GET")
        return super().do_GET()

    def end_headers(self):
        # Static files: always revalidate, so edits to the site show up on the next reload.
        if not self.path.startswith("/api/"):
            self.send_header("Cache-Control", "no-cache")
        super().end_headers()

    def do_POST(self):
        self.handle_api("POST")

    def do_PUT(self):
        self.handle_api("PUT")

    def do_DELETE(self):
        self.handle_api("DELETE")

    def handle_api(self, method):
        url = urlsplit(self.path)
        cookies = []
        try:
            for m, pattern, fn, login_required in ROUTES:
                match = pattern.match(url.path)
                if match and m == method:
                    break
            else:
                raise ApiError(404, "Not found.")
            if method != "GET":
                self.check_origin()
            body = self.read_json() if method in ("POST", "PUT") else {}
            with db.transaction() as conn:
                token = self.session_token()
                user = db.session_user(conn, token) if token else None
                if login_required and not user:
                    raise ApiError(401, "Please sign in first.")
                req = SimpleNamespace(conn=conn, user=user, token=token, body=body, cookies=cookies,
                                      query={k: v[0] for k, v in parse_qs(url.query).items()})
                payload = fn(req, *match.groups())
            self.send_json(200, payload, cookies)
        except ApiError as exc:
            self.send_json(exc.status, {"error": exc.message, "fields": exc.fields}, cookies)
        except Exception:
            traceback.print_exc()
            self.send_json(500, {"error": "Something went wrong on our side. Please try again."})

    def check_origin(self):
        # Browsers send Origin on cross-site requests; refuse ones from other sites.
        origin = self.headers.get("Origin")
        if origin and urlsplit(origin).netloc != self.headers.get("Host"):
            raise ApiError(403, "Cross-site request blocked.")

    def read_json(self):
        if not self.headers.get("Content-Type", "").startswith("application/json"):
            raise ApiError(415, "Send the request as JSON.")
        try:
            length = int(self.headers.get("Content-Length") or 0)
        except ValueError:
            raise ApiError(400, "Invalid Content-Length.")
        if length > MAX_BODY:
            raise ApiError(413, "Request too large.")
        try:
            body = json.loads(self.rfile.read(length) or b"{}")
        except ValueError:
            raise ApiError(400, "Invalid JSON.")
        if not isinstance(body, dict):
            raise ApiError(400, "Invalid JSON.")
        return body

    def session_token(self):
        try:
            morsel = SimpleCookie(self.headers.get("Cookie", "")).get(COOKIE)
        except CookieError:
            return None
        return morsel.value if morsel and morsel.value else None

    def send_json(self, status, payload, cookies=()):
        data = json.dumps(payload).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "no-store")
        for cookie in cookies:
            self.send_header("Set-Cookie", cookie)
        self.end_headers()
        self.wfile.write(data)

    def log_message(self, fmt, *args):
        if self.path.startswith(("/api/predict", "/api/estimate")):
            return
        super().log_message(fmt, *args)


if __name__ == "__main__":
    db.init()
    print(f"Ownly is running at http://localhost:{PORT}  (Ames model: {SITE['model']['name']}, prices at {SITE['model']['target_period']}, database: {db.DB_PATH.name})")
    ThreadingHTTPServer(("127.0.0.1", PORT), Handler).serve_forever()
