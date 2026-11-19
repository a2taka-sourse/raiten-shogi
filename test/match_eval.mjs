// 2つの評価（表ファイル）で探索AI同士を対局させる。開始は乱数の数手のあと、先後を入れ替えてペアで指す。
// usage: node test/match_eval.mjs TABLE_A.json|classic TABLE_B.json|classic [pairs=20] [ms=200]
import {readFileSync} from 'node:fs';
import {Engine, Searcher} from '../ai.mjs';

const load = f => f === 'classic' ? null : JSON.parse(readFileSync(f, 'utf8'));
const [ta, tb] = [load(process.argv[2]), load(process.argv[3])];
const pairs = +(process.argv[4] || 20), ms = +(process.argv[5] || 200);
let seed = 777;
const rnd = n => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed % n; };

function game(opening, aIsWhite) {
  const eA = new Engine('A', ta), eB = new Engine('A', tb);
  const sA = new Searcher(eA), sB = new Searcher(eB);
  for (const m of opening) { eA.play(m); eB.play(m); }
  for (let ply = opening.length; ply < 300; ply++) {
    const white = eA.side === 0, aToMove = white === aIsWhite;
    if (!eA.legal().length) return aToMove ? 0 : 1;                 // 指せない側の負け
    let reps = 0;
    for (let i = 0; i < eA.history.length; i += 2) if (eA.history[i] === eA.k1 && eA.history[i + 1] === eA.k2) reps++;
    if (reps >= 3) return 0.5;
    const m = Engine.toStr((aToMove ? sA : sB).think(ms).move);
    eA.play(m); eB.play(m);
  }
  return 0.5;
}

let pts = 0, n = 0;
for (let p = 0; p < pairs; p++) {
  const e = new Engine('A', null), opening = [];
  for (let i = 0; i < 4; i++) { const l = e.legal(); const m = Engine.toStr(l[rnd(l.length)]); e.play(m); opening.push(m); }
  for (const aw of [true, false]) { const r = game(opening, aw); pts += r; n++; }
  console.log(`pair ${p + 1}: A has ${pts}/${n}`);
}
console.log(`A scored ${pts}/${n} = ${(pts / n).toFixed(3)} (${ms} ms/move)`);
