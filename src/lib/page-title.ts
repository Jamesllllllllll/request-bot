export function pageTitle(section?: string) {
  return section ? `${section} | RockList.Live` : "RockList.Live";
}

export function formatSlugTitle(slug: string) {
  return slug
    .split(/[-_]+/g)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}
