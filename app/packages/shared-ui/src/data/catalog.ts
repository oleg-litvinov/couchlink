// Bundled copy of content/catalog.json (run content/scripts/build_catalog.py --sync to refresh).
// Bundling keeps the home screen instant and the demo independent of network hiccups.
import catalogJson from './catalog.json';

export interface Title {
  id: string;
  title: string;
  year: number;
  genres: string[];
  moods: string[];
  tagline: string;
  license: string;
  credit: string;
  hero: boolean;
  videoUrl: string;
  posterUrl: string;
  durationSec: number;
  source: string;
}

export const titles: Title[] = (catalogJson as { items: Title[] }).items;

export function getTitle(id: string | null | undefined): Title | undefined {
  return titles.find((t) => t.id === id);
}

export const rows: { title: string; items: Title[] }[] = [
  { title: 'Blender Open Movies', items: titles.filter((t) => t.license.startsWith('CC')) },
  { title: 'Timeless Classics', items: titles.filter((t) => t.license === 'Public domain') },
];

export function minutes(t: Title): string {
  const m = Math.round(t.durationSec / 60);
  return m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m} min`;
}
