"""Fill the Ownly database with demo accounts and listings, for trying the site out.

Run (from the project root):  .venv/bin/python portal/seed_demo.py
Safe to re-run: if the demo seller already exists, nothing is added.

Demo logins (local testing only):
  seller@ownly.test / ownly-demo-c9ac3c04   - owns the demo listings
  buyer@ownly.test  / ownly-demo-c9ac3c04   - use it to contact sellers
"""
import db

DEMO_PASSWORD = "ownly-demo-c9ac3c04"
SELLER = {"email": "seller@ownly.test", "name": "Dana (demo seller)"}
BUYER = {"email": "buyer@ownly.test", "name": "Sam (demo buyer)"}

# Ames neighbourhood codes (see ames/config.json). Quality: 1 Basic .. 5 Exceptional.
LISTINGS = [
    {"title": "Family home near the park", "property_type": "House", "area": "CollgCr",
     "address": "1204 Demo Drive", "price": 459_000, "sqft": 1850, "year_built": 2002,
     "bedrooms": 3, "bathrooms": 2.5, "garage": 2, "quality": 4,
     "description": "Demo listing. Bright two-storey home with an open kitchen, a fenced garden and a two-car garage. Walk to the park and the bus to campus."},
    {"title": "Spacious modern home with three-car garage", "property_type": "House", "area": "NridgHt",
     "address": "3310 Example Court", "price": 689_000, "sqft": 2600, "year_built": 2007,
     "bedrooms": 4, "bathrooms": 3.5, "garage": 3, "quality": 5,
     "description": "Demo listing. High-end finishes, a finished basement and a large deck overlooking a quiet cul-de-sac."},
    {"title": "Character house in Old Town", "property_type": "House", "area": "OldTown",
     "address": "512 Sample Street", "price": 239_000, "sqft": 1450, "year_built": 1915,
     "bedrooms": 3, "bathrooms": 1, "garage": 1, "quality": 3,
     "description": "Demo listing. Classic porch, original woodwork and a detached garage, close to Main Street shops."},
    {"title": "Low-maintenance townhouse", "property_type": "Townhouse", "area": "Somerst",
     "address": "2701 Placeholder Lane", "price": 365_000, "sqft": 1400, "year_built": 2006,
     "bedrooms": 2, "bathrooms": 2, "garage": 2, "quality": 4,
     "description": "Demo listing. End-unit townhouse with an attached garage, a patio and an HOA that handles snow removal."},
    {"title": "Student-friendly apartment by campus", "property_type": "Apartment", "area": "SWISU",
     "address": "118 Demo Avenue, Apt 3", "price": 189_000, "sqft": 780, "year_built": 1998,
     "bedrooms": 2, "bathrooms": 1, "garage": 0, "quality": 3,
     "description": "Demo listing. Second-floor two-bedroom a short walk from Iowa State University. (Ownly estimates don't cover apartments.)"},
]


def main():
    db.init()
    with db.transaction() as conn:
        if conn.execute("SELECT 1 FROM users WHERE email = ?", (SELLER["email"],)).fetchone():
            print("Demo data already present - nothing to do.")
            return
        ids = {}
        for person in (SELLER, BUYER):
            cur = conn.execute(
                "INSERT INTO users (email, name, password_hash, created_at) VALUES (?, ?, ?, ?)",
                (person["email"], person["name"], db.hash_password(DEMO_PASSWORD), db.now()))
            ids[person["email"]] = cur.lastrowid
        for listing in LISTINGS:
            row = {**listing, "user_id": ids[SELLER["email"]], "contact_name": "Dana",
                   "contact_email": SELLER["email"], "contact_phone": "555-0100",
                   "created_at": db.now(), "updated_at": db.now()}
            cols = ", ".join(row)
            conn.execute(f"INSERT INTO listings ({cols}) VALUES ({', '.join('?' * len(row))})",
                         list(row.values()))
    print(f"Added 2 demo accounts and {len(LISTINGS)} demo listings (logins are in seed_demo.py).")


if __name__ == "__main__":
    main()
