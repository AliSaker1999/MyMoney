export const categoriesSql = {
  listCategories: `
    SELECT id, name, builtin_key, kind, parent_id, icon, color,
      sort_order, archived_at, created_at, updated_at
    FROM categories
    ORDER BY archived_at IS NOT NULL, kind, sort_order, COALESCE(name, builtin_key) COLLATE NOCASE
  `,
  getCategory: `
    SELECT id, name, builtin_key, kind, parent_id, sort_order, archived_at
    FROM categories WHERE id = $id
  `,
  findCategoryByName: `
    SELECT id FROM categories
    WHERE name = $name COLLATE NOCASE AND archived_at IS NULL
  `,
  insertCategory: `
    INSERT INTO categories (
      name, kind, parent_id, icon, color, sort_order, created_at, updated_at
    ) VALUES (
      $name, $kind, $parentId, $icon, $color, $sortOrder, $createdAt, $updatedAt
    )
  `,
  updateCategory: `
    UPDATE categories
    SET name = $name, parent_id = $parentId, icon = $icon, color = $color,
      sort_order = $sortOrder, updated_at = $updatedAt
    WHERE id = $id AND archived_at IS NULL
  `,
  archiveCategory: `
    UPDATE categories
    SET archived_at = $archivedAt, updated_at = $archivedAt
    WHERE id = $id AND archived_at IS NULL
  `,
  transactionReferenceCount: `
    SELECT count(*) AS count FROM entries WHERE category_id = $id
  `,
} as const;
