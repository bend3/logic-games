// Benchmarks the Queens generator per difficulty: node tools/bench-queens.mjs [runs]
import { generateForDifficulty, DIFFICULTY } from '../js/queens/logic.js';

const runs = Number(process.argv[2] ?? 10);
for (const difficulty of Object.keys(DIFFICULTY)) {
  for (const n of [6, 8, 10]) {
    const levels = {};
    let ms = 0, tiny = 0, min = 0, max = 0;
    for (let r = 0; r < runs; r++) {
      const t = performance.now();
      const p = generateForDifficulty(n, difficulty);
      ms += performance.now() - t;
      levels[p.level] = (levels[p.level] ?? 0) + 1;
      const sizes = new Array(n).fill(0);
      p.regions.forEach((id) => sizes[id]++);
      tiny += sizes.filter((s) => s <= 2).length;
      min += Math.min(...sizes);
      max += Math.max(...sizes);
    }
    const avg = (v) => (v / runs).toFixed(1);
    console.log(`${difficulty.padEnd(6)} ${n}x${n}  ${avg(ms).padStart(7)} ms  tiny regions ${avg(tiny)}  smallest ${avg(min)}  largest ${avg(max)}  levels ${JSON.stringify(levels)}`);
  }
}
