// Old review keys are read only for preference migration. Truesight owns reviews.
export const groupingSettingKey = world => `groupingState-${encodeURIComponent(world?.id ?? 'unknown')}`;
export const preferenceSettingKey = (world, user) => `browseGrouping-${encodeURIComponent(world?.id ?? 'unknown')}-${encodeURIComponent(user?.id ?? user ?? 'unknown')}`;
