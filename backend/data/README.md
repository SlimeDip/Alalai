# Verified subsidy data

The application intentionally ships with no invented or mock subsidy records.

1. Copy `subsidies.template.json` to `subsidies.json` in this directory.
2. Research each program on its current official government website.
3. Replace every placeholder with verified data, including `source_url` and `last_verified_on`.
4. Keep the existing database fields and use arrays for `requirements`, `application_steps`,
   `disaster_categories`, and `damage_types`.
5. Restart the backend. The JSON file is authoritative for seed-managed records.
   Valid entries are inserted or updated by stable ID. Custom database records
   are preserved, and removed seed entries are archived rather than deleted.
   A missing, unreadable, or invalid JSON file leaves the existing catalog data
   unchanged.

`amount_display` must contain only a numeric amount in PHP. Use `0` when there is
no individual amount. Put planning estimates, ranges, conditions, and verification
notes in `details` or `short_description`; they must not be presented as guaranteed
benefits.

Do not add estimates, unofficial claims, or programs without an authoritative source.
