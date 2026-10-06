// Loads the dataset. In the browser it fetches data/*.json; in Node (tests,
// agent) it reads the files from disk. Same data either way.
export const TABLES = ['config', 'teams', 'chipsets', 'models', 'submissions', 'tickets', 'parts', 'bom',
  'warehouses', 'stock', 'suppliers', 'deliveries', 'substitutes'];

export async function loadData(base = './data/') {
  const entries = await Promise.all(TABLES.map(async (t) => {
    if (typeof window === 'undefined') {
      const { readFile } = await import('node:fs/promises');
      return [t, JSON.parse(await readFile(new URL(`../data/${t}.json`, import.meta.url), 'utf8'))];
    }
    const res = await fetch(`${base}${t}.json`);
    if (!res.ok) throw new Error(`could not load ${t}.json`);
    return [t, await res.json()];
  }));
  return Object.fromEntries(entries);
}
