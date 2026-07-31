/**
 * Single source of truth for "what counts as a plat vs a soda vs an extra".
 * The phone analytics ("Plats vendus" / "Sodas vendus") and the printed
 * sales report both classify items through here so their numbers agree.
 */

/** Category `main` groups that are real food (a "plat"). */
export const FOOD_MAINS = ['breakfast', 'lunch', 'steaks', 'sweets']
/** Food-ish categories that are add-ons, not standalone plats. */
export const EXTRA_CATS_FR = ['Extras', 'Extras Breakfast']
/** Sodas are counted on their own (high volume). */
export const SODA_CAT_FR = 'Sodas'

export type DishKind = 'plat' | 'soda' | 'other'

/** Resolve one order item to plat / soda / other, exactly like the analytics.
 * Prefers the live category via menu_item_id, falling back to the stored
 * category name for custom / legacy rows. */
export function classifyItem(
  item: { menu_item_id?: string | null; category?: string | null },
  menuById: Map<string, { category_id: string }>,
  catById: Map<string, { name_fr: string; main: string }>,
  catByFr: Map<string, { name_fr: string; main: string }>,
): DishKind {
  const mi = item.menu_item_id ? menuById.get(item.menu_item_id) : undefined
  const cat = mi ? catById.get(mi.category_id) : catByFr.get(item.category ?? '')
  const catFr = cat?.name_fr ?? item.category ?? ''
  const main = cat?.main ?? ''
  if (catFr === SODA_CAT_FR) return 'soda'
  if (FOOD_MAINS.includes(main) && !EXTRA_CATS_FR.includes(catFr)) return 'plat'
  return 'other'
}
