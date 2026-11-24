export const goalsSql = {
  listGoals: `
    SELECT
      g.id, g.name, g.currency, CAST(g.target_minor AS TEXT) AS target_minor,
      g.target_date, g.account_id,
      COALESCE(CAST(SUM(gc.amount_minor) AS TEXT), '0') AS total_contributed,
      g.achieved_at, g.archived_at, g.created_at, g.updated_at
    FROM goals g
    LEFT JOIN goal_contributions gc ON gc.goal_id = g.id
    GROUP BY g.id
    ORDER BY g.achieved_at IS NOT NULL, g.archived_at IS NOT NULL, g.created_at DESC
  `,
  getGoal: `
    SELECT
      g.id, g.name, g.currency, CAST(g.target_minor AS TEXT) AS target_minor,
      g.target_date, g.account_id,
      COALESCE(CAST(SUM(gc.amount_minor) AS TEXT), '0') AS total_contributed,
      g.achieved_at, g.archived_at, g.created_at, g.updated_at
    FROM goals g
    LEFT JOIN goal_contributions gc ON gc.goal_id = g.id
    WHERE g.id = $id
    GROUP BY g.id
  `,
  getGoalContributions: `
    SELECT
      id, goal_id, date, CAST(amount_minor AS TEXT) AS amount_minor,
      note, created_at
    FROM goal_contributions
    WHERE goal_id = $goalId
    ORDER BY date DESC
  `,
  insertGoal: `
    INSERT INTO goals (
      name, currency, target_minor, target_date, account_id, created_at, updated_at
    ) VALUES (
      $name, $currency, $targetMinor, $targetDate, $accountId, $createdAt, $updatedAt
    )
  `,
  updateGoal: `
    UPDATE goals
    SET name = $name, target_minor = $targetMinor, target_date = $targetDate,
        account_id = $accountId, updated_at = $updatedAt
    WHERE id = $id
  `,
  deleteGoal: `
    DELETE FROM goals WHERE id = $id
  `,
  insertContribution: `
    INSERT INTO goal_contributions (
      goal_id, date, amount_minor, note, created_at
    ) VALUES (
      $goalId, $date, $amountMinor, $note, $createdAt
    )
  `,
  deleteContribution: `
    DELETE FROM goal_contributions WHERE id = $id
  `,
  markAchieved: `
    UPDATE goals
    SET achieved_at = $achievedAt, updated_at = $updatedAt
    WHERE id = $id
  `,
  markActive: `
    UPDATE goals
    SET achieved_at = NULL, updated_at = $updatedAt
    WHERE id = $id
  `,
  archiveGoal: `
    UPDATE goals
    SET archived_at = $archivedAt, updated_at = $updatedAt
    WHERE id = $id
  `,
} as const;
