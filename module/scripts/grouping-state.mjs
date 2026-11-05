// Truesight owns reviews; Slow Insert stores current browsing preferences.
export const preferenceSettingKey = (world, user) => `browseGrouping-${encodeURIComponent(world?.id ?? 'unknown')}-${encodeURIComponent(user?.id ?? user ?? 'unknown')}`;
