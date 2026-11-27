// @ts-check

// Truesight owns reviews; Slow Insert stores current browsing preferences.
/**
 * @param {{ id?: string } | null | undefined} world
 * @param {{ id?: string } | string | null | undefined} user
 * @returns {string}
 */
export const preferenceSettingKey = (world, user) => {
  const userId = typeof user === 'string' ? user : user?.id;
  return `browseGrouping-${encodeURIComponent(world?.id ?? 'unknown')}-${encodeURIComponent(userId ?? 'unknown')}`;
};
