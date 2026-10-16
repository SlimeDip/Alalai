# Verified subsidy data

The application intentionally ships with no invented or mock subsidy records.

1. Copy `subsidies.template.json` to `subsidies.json`.
2. Research each program on its current official government website.
3. Replace every placeholder with verified data, including `source_url` and `last_verified_on`.
4. Keep the existing database fields and use arrays for `requirements`, `application_steps`,
   `disaster_categories`, and `damage_types`.
5. Restart the backend. The importer will load the file into SQLite when the subsidy table is empty.

Do not add estimates, unofficial claims, or programs without an authoritative source.
