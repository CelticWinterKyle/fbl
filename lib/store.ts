import fs from 'fs';
import path from 'path';

const dataPath = path.join(process.cwd(), 'lib', 'data.json');

export function readData() {
  try { return JSON.parse(fs.readFileSync(dataPath, 'utf-8')); }
  catch { return { teams: [], schedule: [], trades: [], settings: {}, news: [] }; }
}
