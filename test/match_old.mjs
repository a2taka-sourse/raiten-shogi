// 新しい探索AI と従来の一手読みAI（app.mjs の aiScore/chooseAI と同じ）を対局させる。
// usage: node test/match_old.mjs [gamesPerSide=10] [ms=300] [reading=A]
import {Position, parseSquare, destination, isDrop} from '../rules.mjs';
import {bestMove} from '../ai.mjs';

const games = +(process.argv[2] || 10), ms = +(process.argv[3] || 300), reading = process.argv[4] || 'A';
const value = {k:1000,h:1000,r:11,b:9,x:8,l:5,d:4,e:5,s:3.6,y:4.5,o:3.4,g:3.2,t:3.9,m:2.4,j:2.5,c:6,q:2.5,a:6,p:1,u:2.5};
function oldMove(pos, legal) {
  const score = move => {
    const drop = isDrop(move), [tx, ty] = destination(move);
    const moving = drop ? move[0].toLowerCase() : pos.board[parseSquare(move.slice(0, 2))[1]][parseSquare(move.slice(0, 2))[0]].toLowerCase();
    const target = pos.board[ty][tx], next = pos.clone(); next.apply(move);
    const arrived = next.board[ty][tx].toLowerCase();
    let s = (target ? value[target.toLowerCase()] * 6 : 0) + (value[arrived] - value[moving]) * 2.4;
    if (next.inCheck(next.side)) s += 1.8;
    if (next.attacked(tx, ty, next.side)) s -= value[arrived] * 0.68;
    s += 1.2 - Math.hypot(tx - 4, ty - 4) * 0.16;
    if (drop) s -= 0.2;
    return s + (Math.random() - .5) * 2.3;
  };
  const ranked = legal.map(m => ({m, s: score(m)})).sort((a, b) => b.s - a.s);
  const spread = Math.random() < .22 ? Math.min(12, ranked.length) : Math.min(4, ranked.length);
  return ranked[Math.floor(Math.pow(Math.random(), 2.2) * spread)].m;
}
function play(newSide) {
  const pos = new Position(reading), moves = [], keys = [pos.key()];
  for (let ply = 0; ply < 300; ply++) {
    const legal = pos.legalMoves();
    if (!legal.length) return pos.side === newSide ? 0 : 1;          // 指せない側の負け
    const m = pos.side === newSide ? bestMove(reading, moves, ms).move : oldMove(pos, legal);
    pos.apply(m); moves.push(m); keys.push(pos.key());
    if (keys.filter(k => k === keys.at(-1)).length >= 4) return 0.5;
  }
  return 0.5;
}
let pts = 0, n = 0;
for (let g = 0; g < games; g++) for (const side of ['w', 'b']) {
  const r = play(side); pts += r; n++;
  console.log(`game ${n}: new AI as ${side} -> ${r}`);
}
console.log(`new AI scored ${pts}/${n} (${ms} ms/move, reading ${reading})`);
