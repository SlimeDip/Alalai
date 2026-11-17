export function migrateOwnershipV2(db) {
  return db.transaction(() => {
    if (db.prepare(`
      SELECT 1 FROM auth_ownership_migrations WHERE version = 2
    `).get()) {
      return { applied: false };
    }

    const repairedCases = db.prepare(`
      UPDATE recovery_cases
      SET user_id = NULL
      WHERE user_id IS NOT NULL
        AND NOT EXISTS (
          SELECT 1 FROM users WHERE users.user_id = recovery_cases.user_id
        )
    `).run().changes;
    const repairedApplications = db.prepare(`
      UPDATE applications
      SET user_id = NULL
      WHERE user_id IS NOT NULL
        AND NOT EXISTS (
          SELECT 1 FROM users WHERE users.user_id = applications.user_id
        )
    `).run().changes;
    const conflictingOwnership = db.prepare(`
      SELECT COUNT(*) AS count
      FROM applications
      JOIN recovery_cases ON recovery_cases.case_id = applications.case_id
      WHERE applications.user_id IS NOT NULL
        AND recovery_cases.user_id IS NOT NULL
        AND applications.user_id != recovery_cases.user_id
    `).get().count;
    const unresolvedOwnership = db.prepare(`
      SELECT COUNT(*) AS count
      FROM applications
      JOIN recovery_cases ON recovery_cases.case_id = applications.case_id
      WHERE (applications.user_id IS NULL) != (recovery_cases.user_id IS NULL)
    `).get().count;

    db.prepare(`
      INSERT INTO auth_ownership_migrations (version) VALUES (2)
    `).run();

    return {
      applied: true,
      repairedCases,
      repairedApplications,
      conflictingOwnership,
      unresolvedOwnership
    };
  })();
}
