import type { Match } from "./types";
export const searchText = (text: string) =>
  text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("es")
    .trim()
    .replace(/\s+/g, " ");
export const matchesSearch = (name: string, query: string) =>
  searchText(name).includes(searchText(query));
export const newestFirst = (a: Match, b: Match) =>
  new Date(b.played_at).getTime() - new Date(a.played_at).getTime() ||
  new Date(b.created_at).getTime() - new Date(a.created_at).getTime() ||
  b.id.localeCompare(a.id);
export const calendarDate = (day: Date) =>
  `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, "0")}-${String(day.getDate()).padStart(2, "0")}`;
