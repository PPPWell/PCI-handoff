/** A menu's dishes, one per entry: the course description is written as "dish; dish; dish." in every language. */
export function menuItems(description: string): string[] {
  return description.split(/\s*[;；]\s*/).map((item) => item.trim().replace(/[.。]$/, "")).filter(Boolean);
}
