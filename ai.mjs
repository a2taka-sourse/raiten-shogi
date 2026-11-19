// 禮天将棋の探索AI。盤は 81 マスの整数配列、駒は種類番号×手番の符号。
// rules.mjs と同じ動き・成り・打ちの規則を、前計算した利きの表で高速に扱う。
import {START, PROMOTE, FILES} from './rules.mjs';

const TYPES = ' khdesyogtmrblxcajqpu';          // 1..20
const tid = ch => TYPES.indexOf(ch.toLowerCase());
const PROM = new Int8Array(21), DEM = new Int8Array(21);
for (let t = 1; t <= 20; t++) DEM[t] = t;
for (const [a, b] of Object.entries(PROMOTE)) { PROM[tid(a)] = tid(b); DEM[tid(b)] = tid(a); }
const ROYAL = t => t === 1 || t === 2;
const HAND_TYPES = [...'rbxldsotjqp'].map(tid);

// 駒の価値（センチ単位）。盤上と持ち駒で少し変える。
export const VALUE = new Int32Array(21);
{
  const v = {k:0,h:0,r:1100,b:900,x:800,l:500,d:400,e:500,s:360,y:450,
    o:340,g:320,t:390,m:240,j:250,c:600,q:250,a:600,p:100,u:250};
  for (const [k, x] of Object.entries(v)) VALUE[tid(k)] = x;
}
const HAND_VALUE = VALUE.map(v => Math.round(v * 1.1));

// ---- 動きの定義（rules.mjs の movesA / movesB と同じ） ----
const ORTH = [[1,0],[-1,0],[0,1],[0,-1]], DIAG = [[1,1],[-1,1],[1,-1],[-1,-1]], K8 = [...ORTH, ...DIAG];
const S = (...d) => d.map(([x, y]) => ['S', x, y, 0, 0]);
const L = (...d) => d.map(([x, y, bx, by]) => ['L', x, y, bx, by]);
const R = (...d) => d.map(([x, y]) => ['R', x, y, 0, 0]);
const lameD = [[0,2,0,1],[0,-2,0,-1],[2,0,1,0],[-2,0,-1,0]];
const lameA = [[2,2,1,1],[-2,2,-1,1],[2,-2,1,-1],[-2,-2,-1,-1]];
const king = S(...K8), marshal = [...king, ...L(...lameD)];
const guide = S([0,1],[-1,0],[1,0],[-1,-1],[1,-1]), rite = S([-1,1],[1,1],[0,-1]);
const knights = [[-1,2,0,1],[1,2,0,1],[-1,-2,0,-1],[1,-2,0,-1]];
const MA = {
  k: king, h: [...king, ...L(...lameD), ...L(...lameA)], d: guide, e: king,
  s: [...S([0,2]), ...rite], y: guide, o: S([-1,2],[1,2],[-1,-2],[1,-2]),
  g: [...L([0,2,0,1]), ...rite], t: [...S([-1,1],[1,1]), ...S([-2,2],[2,2],[-2,0],[2,0])],
  m: L(...knights), r: R(...ORTH), b: R(...DIAG), l: S([-1,0],[1,0],...DIAG),
  x: marshal, c: marshal, a: marshal, j: S(...ORTH), q: S(...DIAG),
  p: S([0,1],[0,-1]), u: [...S([0,1],[0,-1]), ...L(...lameA)],
};
const MB = {...MA,
  y: [...king, ...L([0,2,0,1])],
  g: [...L(...knights), ...L([0,2,0,1]), ...rite],
  m: [...S([-1,1],[1,1]), ...L([-2,2,-1,1],[2,2,1,1],[-2,0,-1,0],[2,0,1,0], ...knights)],
};

// 表: GEN[r][s][t][from] = [[to, block(-1)], ...] と rays、ATK[r][s][t][from*81+to] = 攻撃の種類
const DIRS = [...ORTH, ...DIAG];
function buildTables(moves) {
  const gen = [[], []], atk = [[], []];
  for (let si = 0; si < 2; si++) {
    const sign = si === 0 ? 1 : -1;
    for (let t = 0; t <= 20; t++) {
      gen[si][t] = []; atk[si][t] = new Int16Array(81 * 81);
      if (!t) continue;
      for (let f = 0; f < 81; f++) {
        const x = f % 9, y = (f / 9) | 0, steps = [], rays = [];
        for (const [kind, dx, dy, bx, by] of moves[TYPES[t]]) {
          if (kind === 'R') {
            const d = DIRS.findIndex(([a, b]) => a === dx && b === dy * sign);
            const sq = [];
            for (let tx = x + dx, ty = y + dy * sign; tx >= 0 && tx < 9 && ty >= 0 && ty < 9; tx += dx, ty += dy * sign) sq.push(tx + 9 * ty);
            rays.push(sq);
            for (const s of sq) if (!atk[si][t][f * 81 + s]) atk[si][t][f * 81 + s] = 100 + d;
          } else {
            const tx = x + dx, ty = y + dy * sign;
            if (tx < 0 || tx > 8 || ty < 0 || ty > 8) continue;
            const to = tx + 9 * ty, blk = kind === 'L' ? x + bx + 9 * (y + by * sign) : -1;
            steps.push([to, blk]);
            const cur = atk[si][t][f * 81 + to];
            if (blk < 0) atk[si][t][f * 81 + to] = 1;           // 遮られない利きを優先
            else if (!cur || cur >= 100) atk[si][t][f * 81 + to] = 2 + blk;
          }
        }
        gen[si][t][f] = {steps, rays};
      }
    }
  }
  return {gen, atk};
}
const TABLES = {A: buildTables(MA), B: buildTables(MB)};

// ---- Zobrist（2本の32ビット） ----
let seed = 0x9e3779b9;
const rnd = () => { seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; return seed | 0; };
const ZP1 = new Int32Array(41 * 81), ZP2 = new Int32Array(41 * 81);
const ZH1 = new Int32Array(2 * 21 * 20), ZH2 = new Int32Array(2 * 21 * 20);
for (let i = 0; i < ZP1.length; i++) { ZP1[i] = rnd(); ZP2[i] = rnd(); }
for (let i = 0; i < ZH1.length; i++) { ZH1[i] = rnd(); ZH2[i] = rnd(); }
const ZS1 = rnd(), ZS2 = rnd();
const pz = (p, sq) => (p + 20) * 81 + sq;
const hz = (si, t, n) => (si * 21 + t) * 20 + Math.min(n, 19);

export class Engine {
  constructor(reading = 'A') {
    this.reading = reading;
    const T = TABLES[reading]; this.gen = T.gen; this.atk = T.atk;
    this.b = new Int8Array(81);
    this.hand = [new Int8Array(21), new Int8Array(21)];
    this.side = 0;            // 0 = 先手(w, 大文字), 1 = 後手(b)
    this.kingSq = [-1, -1];
    START.split('/').forEach((row, i) => {
      let x = 0;
      for (const ch of row) {
        if (/\d/.test(ch)) { x += +ch; continue; }
        const y = 8 - i, t = tid(ch), p = ch === ch.toUpperCase() ? t : -t;
        this.b[x + 9 * y] = p;
        if (ROYAL(t)) this.kingSq[p > 0 ? 0 : 1] = x + 9 * y;
        x++;
      }
    });
    this.k1 = 0; this.k2 = 0;
    for (let s = 0; s < 81; s++) if (this.b[s]) { this.k1 ^= ZP1[pz(this.b[s], s)]; this.k2 ^= ZP2[pz(this.b[s], s)]; }
    this.undo = [];
    this.history = [];        // 対局と探索の経路の局面キー
  }

  // マス s が手番 si の駒に攻められているか
  attacked(s, si) {
    const b = this.b, atk = this.atk[si];
    for (let f = 0; f < 81; f++) {
      const p = b[f];
      if (!p || (p > 0) !== (si === 0)) continue;
      const c = atk[p > 0 ? p : -p][f * 81 + s];
      if (!c) continue;
      if (c === 1) return true;
      if (c < 100) { if (!b[c - 2]) return true; continue; }
      const [dx, dy] = DIRS[c - 100];
      let x = f % 9 + dx, y = ((f / 9) | 0) + dy, q = x + 9 * y;
      while (q !== s) { if (b[q]) break; x += dx; y += dy; q = x + 9 * y; }
      if (q === s) return true;
    }
    return false;
  }
  inCheck(si = this.side) { return this.kingSq[si] >= 0 && this.attacked(this.kingSq[si], 1 - si); }

  // 指し手は整数：from(0-80, 打ちは 81+種類) | to<<7 | 成り<<14
  pseudo(capturesOnly = false) {
    const out = [], b = this.b, si = this.side, own = si === 0 ? 1 : -1, gen = this.gen[si];
    const zone = y => si === 0 ? y >= 6 : y <= 2;
    for (let f = 0; f < 81; f++) {
      const p = b[f];
      if (!p || (p > 0 ? 1 : -1) !== own) continue;
      const t = p > 0 ? p : -p, g = gen[t][f], canP = PROM[t] && true, fz = zone((f / 9) | 0);
      const push = to => {
        const q = b[to];
        if (q && (q > 0 ? 1 : -1) === own) return;
        if (capturesOnly && !q) return;
        out.push(f | to << 7);
        if (canP && (fz || zone((to / 9) | 0))) out.push(f | to << 7 | 1 << 14);
      };
      for (const [to, blk] of g.steps) if (blk < 0 || !b[blk]) push(to);
      for (const ray of g.rays) for (const to of ray) { push(to); if (b[to]) break; }
    }
    if (capturesOnly) return out;
    const h = this.hand[si];
    for (const t of HAND_TYPES) {
      if (!h[t]) continue;
      for (let s = 0; s < 81; s++) {
        if (b[s]) continue;
        if (t === 19) { // 卒：同じ筋に自分の（成っていない）卒があれば打てない
          let bad = false;
          for (let y = 0; y < 9; y++) if (b[s % 9 + 9 * y] === 19 * own) { bad = true; break; }
          if (bad) continue;
        }
        out.push((81 + t) | s << 7);
      }
    }
    return out;
  }

  make(m) {
    const si = this.side, own = si === 0 ? 1 : -1, from = m & 127, to = (m >> 7) & 127, b = this.b;
    let cap = 0, moved;
    if (from >= 81) {
      const t = from - 81, p = t * own;
      this.k1 ^= ZH1[hz(si, t, this.hand[si][t])]; this.k2 ^= ZH2[hz(si, t, this.hand[si][t])];
      this.hand[si][t]--;
      this.k1 ^= ZH1[hz(si, t, this.hand[si][t])]; this.k2 ^= ZH2[hz(si, t, this.hand[si][t])];
      b[to] = p; this.k1 ^= ZP1[pz(p, to)]; this.k2 ^= ZP2[pz(p, to)];
      moved = p;
    } else {
      const p = b[from]; cap = b[to];
      if (cap) {
        const ct = DEM[cap > 0 ? cap : -cap];
        this.k1 ^= ZP1[pz(cap, to)]; this.k2 ^= ZP2[pz(cap, to)];
        this.k1 ^= ZH1[hz(si, ct, this.hand[si][ct])]; this.k2 ^= ZH2[hz(si, ct, this.hand[si][ct])];
        this.hand[si][ct]++;
        this.k1 ^= ZH1[hz(si, ct, this.hand[si][ct])]; this.k2 ^= ZH2[hz(si, ct, this.hand[si][ct])];
      }
      moved = m >> 14 ? PROM[p > 0 ? p : -p] * own : p;
      this.k1 ^= ZP1[pz(p, from)] ^ ZP1[pz(moved, to)]; this.k2 ^= ZP2[pz(p, from)] ^ ZP2[pz(moved, to)];
      b[from] = 0; b[to] = moved;
      if (ROYAL(moved > 0 ? moved : -moved)) this.kingSq[si] = to;
    }
    this.undo.push(m, cap);
    this.history.push(this.k1, this.k2);
    this.side ^= 1; this.k1 ^= ZS1; this.k2 ^= ZS2;
  }

  unmake() {
    this.side ^= 1; this.k1 ^= ZS1; this.k2 ^= ZS2;
    this.history.length -= 2;
    const cap = this.undo.pop(), m = this.undo.pop();
    const si = this.side, own = si === 0 ? 1 : -1, from = m & 127, to = (m >> 7) & 127, b = this.b;
    if (from >= 81) {
      const t = from - 81, p = b[to];
      this.k1 ^= ZP1[pz(p, to)]; this.k2 ^= ZP2[pz(p, to)];
      this.k1 ^= ZH1[hz(si, t, this.hand[si][t])]; this.k2 ^= ZH2[hz(si, t, this.hand[si][t])];
      this.hand[si][t]++;
      this.k1 ^= ZH1[hz(si, t, this.hand[si][t])]; this.k2 ^= ZH2[hz(si, t, this.hand[si][t])];
      b[to] = 0;
    } else {
      const moved = b[to], p = m >> 14 ? DEM[moved > 0 ? moved : -moved] * own : moved;
      this.k1 ^= ZP1[pz(p, from)] ^ ZP1[pz(moved, to)]; this.k2 ^= ZP2[pz(p, from)] ^ ZP2[pz(moved, to)];
      b[from] = p; b[to] = cap;
      if (cap) {
        const ct = DEM[cap > 0 ? cap : -cap];
        this.k1 ^= ZH1[hz(si, ct, this.hand[si][ct])]; this.k2 ^= ZH2[hz(si, ct, this.hand[si][ct])];
        this.hand[si][ct]--;
        this.k1 ^= ZH1[hz(si, ct, this.hand[si][ct])]; this.k2 ^= ZH2[hz(si, ct, this.hand[si][ct])];
        this.k1 ^= ZP1[pz(cap, to)]; this.k2 ^= ZP2[pz(cap, to)];
      }
      if (ROYAL(p > 0 ? p : -p)) this.kingSq[si] = from;
    }
  }

  legal() {
    const out = [];
    for (const m of this.pseudo()) {
      this.make(m);
      if (!this.attacked(this.kingSq[1 - this.side], this.side)) out.push(m);
      this.unmake();
    }
    return out;
  }

  // rules.mjs の表記との相互変換
  static toStr(m) {
    const from = m & 127, to = (m >> 7) & 127, sq = s => FILES[s % 9] + ((s / 9 | 0) + 1);
    if (from >= 81) return TYPES[from - 81].toUpperCase() + '@' + sq(to);
    return sq(from) + sq(to) + (m >> 14 ? '+' : '');
  }
  fromStr(str) {
    const m = this.legal().find(x => Engine.toStr(x) === str);
    if (m === undefined) throw new Error('illegal move ' + str);
    return m;
  }
  play(str) { this.make(this.fromStr(str)); }

  // 手番側から見た評価値
  evaluate() {
    const b = this.b; let v = 0;
    for (let s = 0; s < 81; s++) {
      const p = b[s];
      if (!p) continue;
      const t = p > 0 ? p : -p, x = s % 9, y = (s / 9) | 0;
      const adv = p > 0 ? y : 8 - y;
      let pv = VALUE[t] + (t === 19 ? adv * 6 : 0) + (ROYAL(t) ? 0 : 8 - 2 * Math.abs(x - 4));
      v += p > 0 ? pv : -pv;
    }
    for (const t of HAND_TYPES) v += (this.hand[0][t] - this.hand[1][t]) * HAND_VALUE[t];
    return this.side === 0 ? v : -v;
  }
}

// ---- 探索 ----
const MATE = 30000, TT_BITS = 20, TT_SIZE = 1 << TT_BITS;
export class Searcher {
  constructor(engine) {
    this.e = engine;
    this.ttKey = new Int32Array(TT_SIZE); this.ttMove = new Int32Array(TT_SIZE);
    this.ttScore = new Int32Array(TT_SIZE); this.ttDepth = new Int8Array(TT_SIZE); this.ttFlag = new Int8Array(TT_SIZE);
    this.killers = new Int32Array(128 * 2).fill(-1);
    this.hist = new Int32Array(2 * 102 * 81);
  }
  repetition() {
    const h = this.e.history, k1 = this.e.k1, k2 = this.e.k2;
    for (let i = h.length - 4; i >= 0; i -= 4) if (h[i] === k1 && h[i + 1] === k2) return true;
    return false;
  }
  order(moves, ply, ttm) {
    const b = this.e.b, si = this.e.side;
    const sc = moves.map(m => {
      if (m === ttm) return 1e9;
      const from = m & 127, to = (m >> 7) & 127, cap = b[to];
      if (cap) return 1e8 + VALUE[cap > 0 ? cap : -cap] * 16 - (from < 81 ? VALUE[Math.abs(b[from])] : 0);
      if (m >> 14) return 9e7;
      if (m === this.killers[ply * 2] || m === this.killers[ply * 2 + 1]) return 8e7;
      return this.hist[(si * 102 + (from < 81 ? Math.abs(b[from]) : from)) * 81 + to];
    });
    const idx = moves.map((_, i) => i).sort((a, c) => sc[c] - sc[a]);
    return idx.map(i => moves[i]);
  }
  timeUp() {
    if ((++this.nodes & 1023) === 0 && performance.now() > this.deadline) this.stop = true;
    return this.stop;
  }
  qsearch(alpha, beta, ply) {
    if (this.timeUp()) return 0;
    const e = this.e;
    const stand = e.evaluate();
    if (stand >= beta) return stand;
    if (stand > alpha) alpha = stand;
    if (ply > 40) return stand;
    for (const m of this.order(e.pseudo(true), ply, -1)) {
      e.make(m);
      if (e.attacked(e.kingSq[1 - e.side], e.side)) { e.unmake(); continue; }
      const v = -this.qsearch(-beta, -alpha, ply + 1);
      e.unmake();
      if (this.stop) return 0;
      if (v >= beta) return v;
      if (v > alpha) alpha = v;
    }
    return alpha;
  }
  search(depth, alpha, beta, ply) {
    const e = this.e;
    if (ply && this.repetition()) return 0;
    const check = e.inCheck();
    if (check) depth++;
    if (depth <= 0) return this.qsearch(alpha, beta, ply);
    if (this.timeUp()) return 0;
    const i = e.k1 & (TT_SIZE - 1);
    let ttm = -1;
    if (this.ttKey[i] === e.k2) {
      ttm = this.ttMove[i];
      if (ply && this.ttDepth[i] >= depth) {
        const s = this.ttScore[i], f = this.ttFlag[i];
        if (f === 0 || (f === 1 && s >= beta) || (f === 2 && s <= alpha)) return s;
      }
    }
    const a0 = alpha;
    let best = -MATE, bestMove = -1, n = 0;
    for (const m of this.order(e.pseudo(), ply, ttm)) {
      e.make(m);
      if (e.attacked(e.kingSq[1 - e.side], e.side)) { e.unmake(); continue; }
      n++;
      let v;
      const quiet = !e.undo[e.undo.length - 1] && !(m >> 14);
      if (n > 4 && depth >= 3 && quiet && !check) {
        v = -this.search(depth - 2, -alpha - 1, -alpha, ply + 1);
        if (v > alpha) v = -this.search(depth - 1, -beta, -alpha, ply + 1);
      } else v = -this.search(depth - 1, -beta, -alpha, ply + 1);
      e.unmake();
      if (this.stop) return 0;
      if (v > best) { best = v; bestMove = m; }
      if (v > alpha) alpha = v;
      if (alpha >= beta) {
        if (quiet) {
          if (this.killers[ply * 2] !== m) { this.killers[ply * 2 + 1] = this.killers[ply * 2]; this.killers[ply * 2] = m; }
          const from = m & 127;
          this.hist[(e.side * 102 + (from < 81 ? Math.abs(e.b[from]) : from)) * 81 + ((m >> 7) & 127)] += depth * depth;
        }
        break;
      }
    }
    if (!n) return -MATE + ply;                 // 指す手がなければ負け（詰み・手詰まりとも）
    this.ttKey[i] = e.k2; this.ttMove[i] = bestMove; this.ttScore[i] = best; this.ttDepth[i] = depth;
    this.ttFlag[i] = best >= beta ? 1 : best <= a0 ? 2 : 0;
    return best;
  }
  // 時間（ミリ秒）まで反復深化し、最善手（整数）と情報を返す
  think(ms, maxDepth = 64, onInfo = null) {
    this.deadline = performance.now() + ms; this.stop = false; this.nodes = 0;
    const e = this.e, root = e.legal();
    if (!root.length) return {move: -1};
    let best = root[0], bestScore = 0, depthDone = 0;
    for (let d = 1; d <= maxDepth; d++) {
      let alpha = -MATE - 1, iterBest = -1;
      for (const m of this.order(root, 0, best)) {
        e.make(m);
        const v = -this.search(d - 1, -MATE - 1, -alpha, 1);
        e.unmake();
        if (this.stop) break;
        if (v > alpha) { alpha = v; iterBest = m; }
      }
      if (this.stop) { if (iterBest >= 0 && alpha > bestScore) best = iterBest; break; }
      best = iterBest; bestScore = alpha; depthDone = d;
      if (onInfo) onInfo({depth: d, score: alpha, nodes: this.nodes, move: Engine.toStr(best)});
      if (Math.abs(alpha) > MATE - 200) break;
    }
    return {move: best, score: bestScore, depth: depthDone, nodes: this.nodes};
  }
}

// 対局の手順（rules.mjs の表記）から局面を作り、ms ミリ秒考えて手を返す
export function bestMove(reading, moves, ms) {
  const e = new Engine(reading);
  for (const m of moves) e.play(m);
  const r = new Searcher(e).think(ms);
  return {...r, move: r.move < 0 ? null : Engine.toStr(r.move)};
}
