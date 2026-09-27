// 禮天将棋の試作ルール。座標と駒の動きは reiten_rules.py に合わせる。
export const FILES = 'abcdefghi';
export const START = 'tosdkdsot/l1b1r1b1l/pppqxjppp/9/9/9/PPPJXQPPP/L1B1R1B1L/TOSDKDSOT';
export const NAMES = {
  k:'理', h:'聖', d:'導', e:'司', s:'祭', y:'儀', o:'奉', g:'護',
  t:'典', m:'謨', r:'法', b:'府', l:'律', x:'帥', c:'中', a:'小',
  j:'将', q:'校', p:'卒', u:'士'
};
export const FULL_NAMES = {
  k:'天理', h:'天聖', d:'天導', e:'導司', s:'大祭', y:'儀祭', o:'奉典', g:'護奉',
  t:'典礼', m:'謨典', r:'天法', b:'導府', l:'律導', x:'軍帥', c:'中帥', a:'小帥',
  j:'軍将', q:'軍校', p:'民卒', u:'軍士'
};
export const PROMOTE = {k:'h',d:'e',s:'y',o:'g',t:'m',j:'c',q:'a',p:'u'};
export const DEMOTE = Object.fromEntries(Object.entries(PROMOTE).map(([a,b])=>[b,a]));
const ORTH = [[1,0],[-1,0],[0,1],[0,-1]];
const DIAG = [[1,1],[-1,1],[1,-1],[-1,-1]];
const K8 = [...ORTH,...DIAG];
const lameD = [[0,2,0,1],[0,-2,0,-1],[2,0,1,0],[-2,0,-1,0]];
const lameA = [[2,2,1,1],[-2,2,-1,1],[2,-2,1,-1],[-2,-2,-1,-1]];
const S = (...d)=>d.map(([x,y])=>['S',x,y,0,0]);
const J = (...d)=>d.map(([x,y])=>['J',x,y,0,0]);
const L = (...d)=>d.map(([x,y,bx,by])=>['L',x,y,bx,by]);
const R = (...d)=>d.map(([x,y])=>['R',x,y,0,0]);
const king = S(...K8);
const marshal = [...king,...L(...lameD)];
const guide = S([0,1],[-1,0],[1,0],[-1,-1],[1,-1]);
const rite = S([-1,1],[1,1],[0,-1]);
const knights = [[-1,2,0,1],[1,2,0,1],[-1,-2,0,-1],[1,-2,0,-1]];
const movesA = {
  k:king,
  h:[...king,...L(...lameD),...L(...lameA)],
  d:guide, e:king,
  s:[...J([0,2]),...rite], y:guide,
  o:J([-1,2],[1,2],[-1,-2],[1,-2]),
  g:[...L([0,2,0,1]),...rite],
  t:[...S([-1,1],[1,1]),...J([-2,2],[2,2],[-2,0],[2,0])],
  m:L(...knights),
  r:R(...ORTH), b:R(...DIAG), l:S([-1,0],[1,0],...DIAG),
  x:marshal, c:marshal, a:marshal,
  j:S(...ORTH), q:S(...DIAG),
  p:S([0,1],[0,-1]),
  u:[...S([0,1],[0,-1]),...L(...lameA)]
};
const movesB = {...movesA,
  y:[...king,...L([0,2,0,1])],
  g:[...L(...knights),...L([0,2,0,1]),...rite],
  m:[...S([-1,1],[1,1]),
     ...L([-2,2,-1,1],[2,2,1,1],[-2,0,-1,0],[2,0,1,0],...knights)]
};
const inside = (x,y)=>x>=0&&x<9&&y>=0&&y<9;
export const square = (x,y)=>FILES[x]+(y+1);
export const parseSquare = s=>[FILES.indexOf(s[0]),Number(s[1])-1];
export const isDrop = m=>m.includes('@');
export const destination = m=>parseSquare(isDrop(m)?m.slice(2,4):m.slice(2,4));

export class Position {
  constructor(reading='A') {
    this.reading = reading;
    this.moves = reading==='B' ? movesB : movesA;
    this.board = Array.from({length:9},()=>Array(9).fill(null));
    const rows = START.split('/');
    rows.forEach((row,i)=>{
      let x=0;
      for (const ch of row) {
        if (/\d/.test(ch)) x+=Number(ch);
        else this.board[8-i][x++]=ch;
      }
    });
    this.side='w';
    this.hands={w:{},b:{}};
    this.ply=0;
  }
  clone() {
    const p=Object.create(Position.prototype);
    p.reading=this.reading; p.moves=this.moves;
    p.board=this.board.map(row=>row.slice());
    p.side=this.side;
    p.hands={w:{...this.hands.w},b:{...this.hands.b}};
    p.ply=this.ply;
    return p;
  }
  own(ch,side) {return !!ch && (side==='w' ? ch===ch.toUpperCase() : ch===ch.toLowerCase());}
  targets(x,y) {
    const ch=this.board[y][x];
    if (!ch) return [];
    const side=ch===ch.toUpperCase()?'w':'b';
    const sign=side==='w'?1:-1;
    const result=[];
    const seen=new Set();
    const add=(tx,ty)=>{
      if (!inside(tx,ty)||this.own(this.board[ty][tx],side)) return;
      const id=tx+9*ty;
      if (!seen.has(id)) {seen.add(id);result.push([tx,ty]);}
    };
    for (const [kind,dx,dy,bx,by] of this.moves[ch.toLowerCase()]) {
      if (kind==='R') {
        let tx=x+dx,ty=y+dy*sign;
        while (inside(tx,ty)) {
          const target=this.board[ty][tx];
          add(tx,ty);
          if (target) break;
          tx+=dx;ty+=dy*sign;
        }
      } else {
        const tx=x+dx,ty=y+dy*sign;
        if (!inside(tx,ty)) continue;
        if (kind==='L' && this.board[y+by*sign][x+bx]) continue;
        add(tx,ty);
      }
    }
    return result;
  }
  attacked(x,y,bySide) {
    for(let yy=0;yy<9;yy++) for(let xx=0;xx<9;xx++) {
      if (this.own(this.board[yy][xx],bySide) &&
          this.targets(xx,yy).some(([tx,ty])=>tx===x&&ty===y)) return true;
    }
    return false;
  }
  royal(side) {
    for(let y=0;y<9;y++) for(let x=0;x<9;x++) {
      const ch=this.board[y][x];
      if (this.own(ch,side) && ['k','h'].includes(ch.toLowerCase())) return [x,y];
    }
    return null;
  }
  inZone(y,side) {return side==='w'?y>=6:y<=2;}
  pseudoMoves() {
    const result=[];
    for(let y=0;y<9;y++) for(let x=0;x<9;x++) {
      const ch=this.board[y][x];
      if (!this.own(ch,this.side)) continue;
      for (const [tx,ty] of this.targets(x,y)) {
        const base=square(x,y)+square(tx,ty);
        result.push(base);
        if (PROMOTE[ch.toLowerCase()] && (this.inZone(y,this.side)||this.inZone(ty,this.side))) result.push(base+'+');
      }
    }
    for (const [piece,count] of Object.entries(this.hands[this.side])) {
      if (!count) continue;
      for(let y=0;y<9;y++) for(let x=0;x<9;x++) {
        if (this.board[y][x]) continue;
        if (piece==='p' && this.board.some(row=>row[x]===(this.side==='w'?'P':'p'))) continue;
        result.push(piece.toUpperCase()+'@'+square(x,y));
      }
    }
    return result;
  }
  legalMoves() {
    const side=this.side, other=side==='w'?'b':'w';
    return this.pseudoMoves().filter(m=>{
      const p=this.clone();
      p.apply(m);
      const kingSq=p.royal(side);
      return kingSq && !p.attacked(...kingSq,other);
    });
  }
  apply(m) {
    const side=this.side;
    let capture=null,piece=null;
    if (isDrop(m)) {
      const type=m[0].toLowerCase();
      const [x,y]=parseSquare(m.slice(2,4));
      this.hands[side][type]--;
      piece=side==='w'?type.toUpperCase():type;
      this.board[y][x]=piece;
    } else {
      const [x,y]=parseSquare(m.slice(0,2));
      const [tx,ty]=parseSquare(m.slice(2,4));
      piece=this.board[y][x];
      capture=this.board[ty][tx];
      if (capture) {
        const base=DEMOTE[capture.toLowerCase()]||capture.toLowerCase();
        this.hands[side][base]=(this.hands[side][base]||0)+1;
      }
      if (m.endsWith('+')) {
        const next=PROMOTE[piece.toLowerCase()];
        piece=side==='w'?next.toUpperCase():next;
      }
      this.board[y][x]=null;
      this.board[ty][tx]=piece;
    }
    this.side=side==='w'?'b':'w';
    this.ply++;
    return {capture,piece};
  }
  inCheck(side=this.side) {
    const k=this.royal(side);
    return !!k && this.attacked(...k,side==='w'?'b':'w');
  }
  key() {
    return this.side+'|'+this.board.map(r=>r.map(x=>x||'.').join('')).join('/')+'|'+
      ['w','b'].map(s=>Object.entries(this.hands[s]).filter(([,n])=>n>0).sort(([a],[b])=>a.localeCompare(b)).map(([p,n])=>p+n).join('')).join('|');
  }
}
