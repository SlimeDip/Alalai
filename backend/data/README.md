# Verified subsidy data

The application intentionally ships with no invented or mock subsidy records.

1. Copy `subsidies.template.json` to `subsidies.json`.
2. Research each program on its current official government website.
3. Replace every placeholder with verified data, including `source_url` and `last_verified_on`.
4. Keep the existing database fields and use arrays for `requirements`, `application_steps`,
   `disaster_categories`, and `damage_types`.
5. Restart the backend. The importer will load the file into SQLite when the subsidy table is empty.

`max_amount_php` may be `null` or `0` when the official source does not publish a
universal amount. The importer stores that as `0` for database sorting while
preserving the official wording in `amount_display`. Any manually calculated range
must be labeled as a planning estimate and must not be presented as a guaranteed
benefit.

Do not add estimates, unofficial claims, or programs without an authoritative source.
