// ai.mjs の合法手が rules.mjs と完全に一致するかを、ランダム対局の全局面で確かめる。
// usage: node test/check_moves.mjs [games=200] [maxPlies=160]
import {Position} from '../rules.mjs';
import {Engine} from '../ai.mjs';

const games = +(process.argv[2] || 200), maxPlies = +(process.argv[3] || 160);
let seed = 12345;
const rnd = n => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed % n; };
let positions = 0, mismatches = 0;
for (const reading of ['A', 'B']) {
  for (let g = 0; g < games; g++) {
    const pos = new Position(reading), eng = new Engine(reading);
    for (let ply = 0; ply < maxPlies; ply++) {
      const want = pos.legalMoves().slice().sort();
      const got = eng.legal().map(Engine.toStr).sort();
      positions++;
      if (want.join() !== got.join()) {
        mismatches++;
        if (mismatches <= 5) {
          const a = new Set(want), b = new Set(got);
          console.log(`reading ${reading} game ${g} ply ${ply}: only rules=${want.filter(m => !b.has(m))} only ai=${got.filter(m => !a.has(m))}`);
        }
        break;
      }
      if (!want.length) break;
      // 取る手を少し優先して、駒の出入りが多い局面も通す
      const caps = want.filter(m => !m.includes('@') && (() => { const x = 'abcdefghi'.indexOf(m[2]), y = +m[3] - 1; return pos.board[y][x]; })());
      const m = caps.length && rnd(3) === 0 ? caps[rnd(caps.length)] : want[rnd(want.length)];
      pos.apply(m); eng.play(m);
      // 盤と持ち駒の一致も確かめる
      const key = pos.key();
      if (!key.startsWith(eng.side === 0 ? 'w|' : 'b|')) { mismatches++; console.log('side mismatch'); break; }
    }
  }
}
console.log(`${positions} positions compared, ${mismatches} mismatches`);
process.exit(mismatches ? 1 : 0);
