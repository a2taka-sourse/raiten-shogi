// 探索AIを画面と別のスレッドで動かす。受け取る: {id, reading, moves, ms}
import {bestMove} from './ai.mjs';

onmessage = ({data}) => {
  const r = bestMove(data.reading, data.moves, data.ms);
  postMessage({id: data.id, ...r});
};
