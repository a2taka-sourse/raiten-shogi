import {Position,FILES,NAMES,FULL_NAMES,PROMOTE,DEMOTE,parseSquare,square,destination,isDrop} from './rules.mjs';

const $=id=>document.getElementById(id);
const boardEl=$('board'), playerHandEl=$('player-hand'), aiHandEl=$('ai-hand');
const statusEl=$('game-status'), guidanceEl=$('guidance'), selectedEl=$('selected-piece');
const historyEl=$('history'), promoDialog=$('promotion-dialog');
const value={k:1000,h:1000,r:11,b:9,x:8,l:5,d:4,e:5,s:3.6,y:4.5,
  o:3.4,g:3.2,t:3.9,m:2.4,j:2.5,c:6,q:2.5,a:6,p:1,u:2.5};
const handOrder=['r','b','x','l','d','s','o','t','j','q','p'];
let game,pendingPromotion=null,generation=0;

function newGame(){
  generation++;
  const reading=$('reading-select').value;
  const human=$('side-select').value;
  const pos=new Position(reading);
  game={pos,human,reading,legal:pos.legalMoves(),selected:null,last:null,
    records:[],checks:[],keys:[pos.key()],over:null,busy:false};
  pendingPromotion=null;
  if(promoDialog.open)promoDialog.close();
  render();
  if(human==='b')queueAI();
}
function sideName(side){return side==='w'?'先手':'後手';}
function humanTurn(){return !game.over&&!game.busy&&game.pos.side===game.human;}
function chosenMoves(){
  if(!game.selected)return [];
  if(game.selected.kind==='hand')return game.legal.filter(m=>m.startsWith(game.selected.piece.toUpperCase()+'@'));
  return game.legal.filter(m=>!isDrop(m)&&m.startsWith(game.selected.from));
}
function render(){
  $('rule-badge').textContent=`試作ルール・読み方${game.reading}`;
  if(game.over)statusEl.textContent=game.over;
  else if(game.busy)statusEl.textContent='AIが考えています…';
  else statusEl.textContent=game.pos.side===game.human?'あなたの手番です':'AIの手番です';
  renderBoard();renderHands();renderGuidance();renderHistory();
}
function renderBoard(){
  const legalDest=new Set(chosenMoves().map(m=>square(...destination(m))));
  const checkSq=game.pos.inCheck()?game.pos.royal(game.pos.side):null;
  const nodes=[];
  for(let row=0;row<9;row++)for(let col=0;col<9;col++){
    const x=game.human==='w'?col:8-col;
    const y=game.human==='w'?8-row:row;
    const sq=square(x,y),ch=game.pos.board[y][x];
    const cell=document.createElement('button');
    cell.type='button';cell.className='square';
    cell.dataset.square=sq;
    cell.setAttribute('role','gridcell');
    cell.setAttribute('aria-label',`${sq} ${ch?`${game.pos.own(ch,game.human)?'あなた':'AI'}の${FULL_NAMES[ch.toLowerCase()]}`:'空き'}`);
    if(ch)cell.classList.add('occupied');
    if(game.selected?.kind==='board'&&game.selected.from===sq)cell.classList.add('selected');
    if(legalDest.has(sq))cell.classList.add('legal');
    if(game.last?.from===sq)cell.classList.add('last-from');
    if(game.last?.to===sq)cell.classList.add('last-to');
    if(checkSq&&checkSq[0]===x&&checkSq[1]===y)cell.classList.add('checked');
    if(ch){
      const piece=document.createElement('span');
      piece.className='piece '+(game.pos.own(ch,game.human)?'player':'ai')+(DEMOTE[ch.toLowerCase()]?' promoted':'');
      const shape=document.createElement('span');shape.className='piece-shape';
      const glyph=document.createElement('span');glyph.className='piece-glyph';glyph.textContent=NAMES[ch.toLowerCase()];
      piece.append(shape,glyph);cell.append(piece);
    }
    cell.addEventListener('click',()=>onSquare(x,y));
    nodes.push(cell);
  }
  boardEl.replaceChildren(...nodes);
}
function renderHands(){
  for(const [side,el] of [[game.human,playerHandEl],[game.human==='w'?'b':'w',aiHandEl]]){
    const entries=handOrder.filter(p=>(game.pos.hands[side][p]||0)>0);
    if(!entries.length){const empty=document.createElement('span');empty.className='hand-empty';empty.textContent='まだありません';el.replaceChildren(empty);continue;}
    const nodes=entries.map(p=>{
      const b=document.createElement('button');b.type='button';b.className='hand-piece';
      b.setAttribute('aria-label',`${FULL_NAMES[p]} ${game.pos.hands[side][p]}枚`);
      b.textContent=NAMES[p];
      const count=document.createElement('span');count.textContent=game.pos.hands[side][p];b.append(count);
      if(side===game.human&&humanTurn()){
        b.classList.add('selectable');
        if(game.selected?.kind==='hand'&&game.selected.piece===p)b.classList.add('selected');
        b.addEventListener('click',()=>{game.selected={kind:'hand',piece:p};render();});
      }else b.disabled=true;
      return b;
    });
    el.replaceChildren(...nodes);
  }
}
function renderGuidance(){
  if(game.over)guidanceEl.textContent='新しい対局を始めると、もう一度遊べます。';
  else if(game.busy)guidanceEl.textContent='AIの一手を待っています。';
  else if(game.pos.side!==game.human)guidanceEl.textContent='AIの一手を待っています。';
  else if(game.selected?.kind==='board')guidanceEl.textContent='青いマスを押して移動します。別の駒を押すと選び直せます。';
  else if(game.selected?.kind==='hand')guidanceEl.textContent='青い空きマスを押して持ち駒を打ちます。';
  else guidanceEl.textContent='自分の駒を選ぶと、動ける場所が青く表示されます。';
  selectedEl.textContent=game.selected?.kind==='board'
    ?`${FULL_NAMES[game.pos.board[parseSquare(game.selected.from)[1]][parseSquare(game.selected.from)[0]].toLowerCase()]}を選択中`
    :game.selected?.kind==='hand'?`${FULL_NAMES[game.selected.piece]}を打つ場所を選択中`:'';
}
function renderHistory(){
  const recent=game.records.slice(-12);
  const nodes=recent.map((r,i)=>{
    const li=document.createElement('li');
    li.value=game.records.length-recent.length+i+1;
    li.textContent=`${sideName(r.side)} ${NAMES[r.before.toLowerCase()]} ${r.drop?'打 '+r.to:r.from+' → '+r.to}${r.promote?' 成':''}`;
    return li;
  });
  historyEl.replaceChildren(...nodes);
  historyEl.scrollTop=historyEl.scrollHeight;
}
function onSquare(x,y){
  if(!humanTurn())return;
  const to=square(x,y),ch=game.pos.board[y][x];
  if(game.selected){
    const candidates=chosenMoves().filter(m=>square(...destination(m))===to);
    if(candidates.length){
      if(candidates.length===2){showPromotion(candidates);return;}
      play(candidates[0]);return;
    }
  }
  if(ch&&game.pos.own(ch,game.human)){game.selected={kind:'board',from:to};render();}
  else if(game.selected){game.selected=null;render();}
}
function showPromotion(moves){
  pendingPromotion=moves;
  const [x,y]=parseSquare(moves[0].slice(0,2));
  const original=game.pos.board[y][x].toLowerCase();
  $('promotion-description').textContent=`${FULL_NAMES[original]} → ${FULL_NAMES[PROMOTE[original]]}`;
  promoDialog.showModal();
}
function commitPromotion(wantsPromotion){
  if(!pendingPromotion)return;
  const move=pendingPromotion.find(m=>m.endsWith('+')===wantsPromotion);
  pendingPromotion=null;promoDialog.close();play(move);
}
function repetitionOutcome(){
  const key=game.pos.key();
  game.keys.push(key);
  const occurrences=[];
  game.keys.forEach((k,i)=>{if(k===key)occurrences.push(i);});
  if(occurrences.length<4)return null;
  const start=occurrences[occurrences.length-4],end=game.keys.length-1;
  for(const side of ['w','b']){
    const moves=game.checks.slice(start,end).filter(c=>c.side===side);
    if(moves.length&&moves.every(c=>c.check))return `${side===game.human?'あなた':'AI'}の連続王手による負けです`;
  }
  return '千日手で引き分けです';
}
function play(m){
  const side=game.pos.side,drop=isDrop(m);
  const from=drop?null:m.slice(0,2),to=m.slice(2,4);
  const before=drop?m[0]:game.pos.board[parseSquare(from)[1]][parseSquare(from)[0]];
  game.pos.apply(m);
  game.records.push({side,before,drop,from,to,promote:m.endsWith('+')});
  game.checks.push({side,check:game.pos.inCheck()});
  game.last={from,to};game.selected=null;
  game.over=repetitionOutcome();
  if(!game.over){
    game.legal=game.pos.legalMoves();
    if(!game.legal.length)game.over=side===game.human?'あなたの勝ちです':'AIの勝ちです';
  }
  game.busy=false;
  render();
  if(!game.over&&game.pos.side!==game.human)queueAI();
}
function aiScore(move){
  const pos=game.pos,drop=isDrop(move);
  const [tx,ty]=destination(move);
  const moving=drop?move[0].toLowerCase():pos.board[parseSquare(move.slice(0,2))[1]][parseSquare(move.slice(0,2))[0]].toLowerCase();
  const target=pos.board[ty][tx];
  const next=pos.clone();next.apply(move);
  const arrived=next.board[ty][tx].toLowerCase();
  let score=(target?value[target.toLowerCase()]*6:0)+(value[arrived]-value[moving])*2.4;
  if(next.inCheck(next.side))score+=1.8;
  if(next.attacked(tx,ty,next.side))score-=value[arrived]*0.68;
  score+=1.2-Math.hypot(tx-4,ty-4)*0.16;
  if(drop)score-=0.2;
  score+=(Math.random()-.5)*2.3;
  return score;
}
function chooseAI(){
  const ranked=game.legal.map(m=>({m,score:aiScore(m)})).sort((a,b)=>b.score-a.score);
  const spread=Math.random()<.22?Math.min(12,ranked.length):Math.min(4,ranked.length);
  const index=Math.floor(Math.pow(Math.random(),2.2)*spread);
  return ranked[index].m;
}
function queueAI(){
  if(game.over)return;
  game.busy=true;render();
  const expected=generation;
  setTimeout(()=>{
    if(generation!==expected||game.over||game.pos.side===game.human)return;
    play(chooseAI());
  },260);
}

$('new-game').addEventListener('click',newGame);
$('rules-button').addEventListener('click',()=>$('rules-dialog').showModal());
$('close-rules').addEventListener('click',()=>$('rules-dialog').close());
$('do-promote').addEventListener('click',()=>commitPromotion(true));
$('do-not-promote').addEventListener('click',()=>commitPromotion(false));
promoDialog.addEventListener('close',()=>{pendingPromotion=null;});
newGame();
