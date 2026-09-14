/**
 * ai.js —— 五子棋 AI（棋型评分 + Alpha-Beta 搜索 + 迭代加深 + 时间上限）
 * 无禁手（free-style）规则。可在浏览器和 Node 中运行。
 */
(function (root, factory) {
  var Gomoku = (typeof module === 'object' && module.exports)
    ? require('./gomoku.js')
    : root.Gomoku;
  var api = factory(Gomoku);
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.GomokuAI = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (Gomoku) {
  'use strict';

  var EMPTY = Gomoku.EMPTY;
  var BLACK = Gomoku.BLACK;
  var WHITE = Gomoku.WHITE;

  var WIN_SCORE = 1e9;      // 终局（成五）分值
  var WIN_THRESHOLD = 1e8;  // 判定为必胜的分值线

  /**
   * 棋型分值表：'1' = 己方，'2' = 对方，'0' = 空点。
   * 按从强到弱顺序匹配，命中的棋子会被消费，避免同一棋型被重复计分。
   */
  var PATTERNS = [
    ['11111', 5000000],   // 连五
    ['011110', 400000],   // 活四
    ['011112', 50000],    // 冲四
    ['211110', 50000],
    ['11011', 50000],     // 跳四
    ['10111', 50000],
    ['11101', 50000],
    ['011100', 9000],     // 活三
    ['001110', 9000],
    ['011010', 9000],
    ['010110', 9000],
    ['001112', 1000],     // 眠三
    ['211100', 1000],
    ['010112', 1000],
    ['211010', 1000],
    ['011012', 1000],
    ['210110', 1000],
    ['10011', 1000],
    ['11001', 1000],
    ['10101', 1000],
    ['001100', 500],      // 活二
    ['011000', 500],
    ['000110', 500],
    ['010100', 500],
    ['001010', 500],
    ['010010', 400],
    ['000112', 100],      // 眠二
    ['211000', 100],
    ['001012', 100],
    ['210100', 100],
    ['010012', 100],
    ['210010', 100],
    ['10001', 100],
    ['00100', 60],        // 单子
    ['000100', 10]
  ];

  /**
   * 精简棋型表：仅用于候选点排序（不需要完整精度，但要快）。
   */
  var ORDER_PATTERNS = [
    ['11111', 100000],
    ['011110', 20000],
    ['011112', 4000], ['211110', 4000], ['11011', 4000], ['10111', 4000], ['11101', 4000],
    ['011100', 2500], ['001110', 2500], ['011010', 2500], ['010110', 2500],
    ['001112', 300], ['211100', 300], ['11001', 300], ['10011', 300], ['10101', 300],
    ['001100', 150], ['011000', 150], ['000110', 150], ['010100', 150], ['001010', 150],
    ['00100', 30]
  ];

  var FILL = {};
  for (var fi = 3; fi <= 8; fi++) {
    FILL[fi] = new Array(fi + 1).join('x');
  }

  /** 对一条线的字符串打分 */
  function scorePatterns(s, table) {
    var list = table || PATTERNS;
    var total = 0;
    for (var i = 0; i < list.length; i++) {
      var pat = list[i][0];
      var val = list[i][1];
      var at = s.indexOf(pat);
      while (at !== -1) {
        total += val;
        s = s.substring(0, at) + FILL[pat.length] + s.substring(at + pat.length);
        at = s.indexOf(pat, at + pat.length);
      }
    }
    return total;
  }

  /**
   * 建立棋盘所有直线（4 个方向）的索引，并维护每条线双方的分值。
   */
  function createScorer(board) {
    var n = board.size;
    var dirs = Gomoku.DIRS;
    var lineOf = [];              // lineOf[d][cellIndex] = lineId
    var posOf = [];               // posOf[d][cellIndex] = 该点在所在直线上的下标
    for (var d = 0; d < dirs.length; d++) {
      lineOf.push(new Int16Array(n * n).fill(-1));
      posOf.push(new Int16Array(n * n).fill(-1));
    }

    var lines = [];               // lines[lid] = [cellIndex, ...]
    for (var di = 0; di < dirs.length; di++) {
      var dx = dirs[di][0], dy = dirs[di][1];
      for (var y = 0; y < n; y++) {
        for (var x = 0; x < n; x++) {
          // 只从该方向的起点开始收集
          if (Gomoku.inBounds(board, x - dx, y - dy)) continue;
          var cells = [];
          var cx = x, cy = y;
          while (Gomoku.inBounds(board, cx, cy)) {
            cells.push(cy * n + cx);
            cx += dx;
            cy += dy;
          }
          // 长度不足 5 的线不可能成五，直接跳过（这些点不参与棋型评分）
          if (cells.length < 5) continue;
          var newId = lines.length;
          for (var ci = 0; ci < cells.length; ci++) {
            lineOf[di][cells[ci]] = newId;
            posOf[di][cells[ci]] = ci;
          }
          lines.push(cells);
        }
      }
    }

    var scoreBlack = new Float64Array(lines.length);
    var scoreWhite = new Float64Array(lines.length);
    var totalBlack = 0;
    var totalWhite = 0;

    // 直线字符串缓存：棋盘不变时可复用，update() 后失效
    var generation = 0;
    var strCache = new Array(lines.length);
    var ordCache = new Array(lines.length);   // 用于候选排序的精简分值缓存

    /** 生成某条线的两种视角字符串：[black视角, white视角]（己方='1'，对方='2'） */
    function lineStrings(lid) {
      var cached = strCache[lid];
      if (cached && cached.gen === generation) return cached.str;
      var cells = lines[lid];
      var sb = new Array(cells.length);
      var sw = new Array(cells.length);
      for (var i = 0; i < cells.length; i++) {
        var v = board.cells[cells[i]];
        if (v === 0) { sb[i] = '0'; sw[i] = '0'; }
        else if (v === BLACK) { sb[i] = '1'; sw[i] = '2'; }
        else { sb[i] = '2'; sw[i] = '1'; }
      }
      var str = [null, sb.join(''), sw.join('')];
      strCache[lid] = { gen: generation, str: str };
      return str;
    }

    /** 计算某条线上某一方的棋型分 */
    function scoreOnLine(lid, player) {
      return scorePatterns(lineStrings(lid)[player]);
    }

    function recalcLine(lid) {
      var b = scoreOnLine(lid, BLACK);
      var w = scoreOnLine(lid, WHITE);
      totalBlack += b - scoreBlack[lid];
      totalWhite += w - scoreWhite[lid];
      scoreBlack[lid] = b;
      scoreWhite[lid] = w;
    }

    function update(index) {
      generation++;
      for (var d = 0; d < dirs.length; d++) {
        var lid = lineOf[d][index];
        if (lid !== -1) recalcLine(lid);
      }
    }

    // 初始化
    for (var lid = 0; lid < lines.length; lid++) recalcLine(lid);

    /** 精简棋型分（用于候选排序），与 lineStrings 同样按 generation 缓存 */
    function lineOrderScore(lid, player) {
      var c = ordCache[lid];
      if (!c || c.gen !== generation) {
        var str = lineStrings(lid);
        c = {
          gen: generation,
          b: scorePatterns(str[BLACK], ORDER_PATTERNS),
          w: scorePatterns(str[WHITE], ORDER_PATTERNS)
        };
        ordCache[lid] = c;
      }
      return player === BLACK ? c.b : c.w;
    }

    return {
      lineOf: function (d, index) { return lineOf[d][index]; },
      posOf: function (d, index) { return posOf[d][index]; },
      lineStrings: lineStrings,
      lineOrderScore: lineOrderScore,
      scoreOnLine: scoreOnLine,
      lineScore: function (lid, player) {
        return player === BLACK ? scoreBlack[lid] : scoreWhite[lid];
      },
      update: update,
      totals: function () { return { black: totalBlack, white: totalWhite }; }
    };
  }

  /* ---------------- 搜索状态（单线程复用） ---------------- */
  var scratch = null;
  var scorer = null;
  var aiPlayer = BLACK;
  var oppPlayer = WHITE;
  var deadline = 0;
  var aborted = false;
  var nodeCount = 0;

  function now() {
    return (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
  }

  function timeUp() {
    if (aborted) return true;
    if ((nodeCount & 255) === 0 && now() > deadline) aborted = true;
    return aborted;
  }

  /** 邻域计数：nb2 为 2 格内是否有子，nb1 为紧邻 1 格内是否有子，用于快速生成候选点 */
  var nb1 = null;
  var nb2 = null;

  function bumpNeighbors(x, y, delta) {
    var n = scratch.size;
    for (var dy = -2; dy <= 2; dy++) {
      var ny = y + dy;
      if (ny < 0 || ny >= n) continue;
      for (var dx = -2; dx <= 2; dx++) {
        if (dx === 0 && dy === 0) continue;
        var nx = x + dx;
        if (nx < 0 || nx >= n) continue;
        var i = ny * n + nx;
        nb2[i] += delta;
        if (dx >= -1 && dx <= 1 && dy >= -1 && dy <= 1) nb1[i] += delta;
      }
    }
  }

  function buildNeighbors() {
    var n = scratch.size;
    nb1 = new Int16Array(n * n);
    nb2 = new Int16Array(n * n);
    for (var i = 0; i < scratch.cells.length; i++) {
      if (scratch.cells[i] !== EMPTY) bumpNeighbors(i % n, (i / n) | 0, 1);
    }
  }

  function doMove(x, y, player) {
    var idx = y * scratch.size + x;
    scratch.cells[idx] = player;
    scratch.moves.push({ x: x, y: y, player: player });
    scorer.update(idx);
    bumpNeighbors(x, y, 1);
  }

  function undoMove() {
    var move = scratch.moves.pop();
    var x = move.x, y = move.y;
    var idx = y * scratch.size + x;
    scratch.cells[idx] = EMPTY;
    scorer.update(idx);
    bumpNeighbors(x, y, -1);
  }

  /** 局面评估：站在 AI 一方的角度 */
  function evaluate() {
    var t = scorer.totals();
    var mine = aiPlayer === BLACK ? t.black : t.white;
    var theirs = aiPlayer === BLACK ? t.white : t.black;
    return mine - theirs * 1.15;
  }

  /**
   * 该点的进攻/防守价值：分别假设在该点落己方子、对方子，计算棋型分增量。
   * 复用直线缓存与已维护的分值，避免重复扫描整条线。
   */
  function pointDeltas(x, y, player) {
    var idx = y * scratch.size + x;
    var opp = Gomoku.opponent(player);
    var atk = 0, def = 0;
    for (var d = 0; d < 4; d++) {
      var lid = scorer.lineOf(d, idx);
      if (lid === -1) continue;
      var pos = scorer.posOf(d, idx);
      var str = scorer.lineStrings(lid);
      var mine = str[player];
      var theirs = str[opp];
      var mineNext = mine.substring(0, pos) + '1' + mine.substring(pos + 1);
      var theirsNext = theirs.substring(0, pos) + '1' + theirs.substring(pos + 1);
      atk += scorePatterns(mineNext, ORDER_PATTERNS) - scorer.lineOrderScore(lid, player);
      def += scorePatterns(theirsNext, ORDER_PATTERNS) - scorer.lineOrderScore(lid, opp);
    }
    return { atk: atk, def: def };
  }

  function hasNeighbor(x, y, radius) {
    var idx = y * scratch.size + x;
    return (radius >= 2 ? nb2[idx] : nb1[idx]) > 0;
  }

  /** 候选点：已有棋子附近的空点，按攻防价值排序 */
  function candidates(player, limit, radius) {
    var n = scratch.size;
    var r = radius || 2;
    var list = [];
    for (var y = 0; y < n; y++) {
      for (var x = 0; x < n; x++) {
        if (scratch.cells[y * n + x] !== EMPTY) continue;
        if (!hasNeighbor(x, y, r)) continue;
        var dd = pointDeltas(x, y, player);
        list.push({ x: x, y: y, score: dd.atk + dd.def * 0.85 + Math.random() * 0.001 });
      }
    }
    list.sort(function (a, b) { return b.score - a.score; });
    if (limit && list.length > limit) list.length = limit;
    return list;
  }

  /** 找到能立刻成五的点 */
  function findImmediate(player) {
    var list = candidates(player, 24);
    for (var i = 0; i < list.length; i++) {
      var idx = list[i].y * scratch.size + list[i].x;
      scratch.cells[idx] = player;
      var win = Gomoku.findWinLine(scratch, list[i].x, list[i].y);
      scratch.cells[idx] = EMPTY;
      if (win) return { x: list[i].x, y: list[i].y };
    }
    return null;
  }

  /**
   * Alpha-Beta 搜索。isMax 表示轮到 AI 走。
   */
  function search(depth, alpha, beta, isMax, rootDepth) {
    nodeCount++;
    if (timeUp()) return evaluate();
    if (depth === 0) return evaluate();

    var player = isMax ? aiPlayer : oppPlayer;
    // 深层收窄：候选更少、只看紧邻空点，让迭代加深能搜得更深
    var lim = depth >= 4 ? width : Math.max(6, width - 4);
    var radius = depth >= 4 ? 2 : 1;
    var moves = candidates(player, lim, radius);
    if (!moves.length) return evaluate();

    var best = isMax ? -Infinity : Infinity;
    for (var i = 0; i < moves.length; i++) {
      var m = moves[i];
      doMove(m.x, m.y, player);

      var win = Gomoku.findWinLine(scratch, m.x, m.y);
      var value;
      if (win) {
        // 越早取胜越好，越晚被对手取胜越好
        value = isMax ? WIN_SCORE - (rootDepth - depth) : -(WIN_SCORE - (rootDepth - depth));
      } else {
        value = search(depth - 1, alpha, beta, !isMax, rootDepth);
      }

      undoMove();

      if (isMax) {
        if (value > best) best = value;
        if (best > alpha) alpha = best;
      } else {
        if (value < best) best = value;
        if (best < beta) beta = best;
      }
      if (alpha >= beta) break;   // 剪枝
      if (timeUp()) break;
    }
    return best;
  }

  var width = 10;   // 每层候选宽度，由难度决定

  /** 根节点搜索，返回 {x, y, score} */
  function searchRoot(depth, prevBest) {
    var moves = candidates(aiPlayer, width);
    if (prevBest) {
      for (var k = 0; k < moves.length; k++) {
        if (moves[k].x === prevBest.x && moves[k].y === prevBest.y) {
          moves.unshift(moves.splice(k, 1)[0]);
          break;
        }
      }
    }
    var alpha = -Infinity, beta = Infinity;
    var best = null;
    for (var i = 0; i < moves.length; i++) {
      var m = moves[i];
      doMove(m.x, m.y, aiPlayer);
      var win = Gomoku.findWinLine(scratch, m.x, m.y);
      var value = win ? WIN_SCORE : search(depth - 1, alpha, beta, false, depth);
      undoMove();

      m.value = value;
      if (!best || value > best.value) best = { x: m.x, y: m.y, value: value };
      if (value > alpha) alpha = value;
      if (aborted) break;
    }
    return best;
  }

  var LEVELS = {
    easy:   { maxDepth: 2, width: 6,  time: 150,  randomTop: 3, randomRate: 0.45 },
    medium: { maxDepth: 4, width: 10, time: 700,  randomTop: 2, randomRate: 0.08 },
    hard:   { maxDepth: 6, width: 12, time: 1600, randomTop: 1, randomRate: 0 }
  };

  /**
   * 计算落子。
   * @param {object} board  Gomoku 棋盘（不会被修改）
   * @param {number} player AI 执子方
   * @param {string} level  easy | medium | hard
   * @returns {{x:number, y:number}}
   */
  function think(board, player, level) {
    var cfg = LEVELS[level] || LEVELS.medium;
    width = cfg.width;

    scratch = Gomoku.clone(board);
    scorer = createScorer(scratch);
    buildNeighbors();
    aiPlayer = player;
    oppPlayer = Gomoku.opponent(player);
    aborted = false;
    nodeCount = 0;
    deadline = now() + cfg.time;

    // 空盘：走天元
    if (scratch.moves.length === 0) {
      var c = (scratch.size - 1) >> 1;
      return { x: c, y: c };
    }

    // 一步成五，直接赢
    var winMove = findImmediate(aiPlayer);
    if (winMove) return winMove;

    // 对手一步成五，必须堵
    var blockMove = findImmediate(oppPlayer);
    if (blockMove) return blockMove;

    var best = null;
    var reached = 0;
    for (var depth = 2; depth <= cfg.maxDepth; depth += 2) {
      var res = searchRoot(depth, best);
      if (res && !aborted) {
        best = res;
        reached = depth;
      }
      if (aborted) break;
      if (best && Math.abs(best.value) >= WIN_THRESHOLD) break;  // 已算到必胜/必败
    }

    if (!best) {
      var fallback = candidates(aiPlayer, 1);
      return fallback.length ? { x: fallback[0].x, y: fallback[0].y }
                             : { x: (scratch.size - 1) >> 1, y: (scratch.size - 1) >> 1 };
    }

    // 低难度加一点随机性，避免每局一模一样
    if (cfg.randomRate > 0 && Math.random() < cfg.randomRate && cfg.randomTop > 1) {
      var top = candidates(aiPlayer, cfg.randomTop);
      var pick = top[Math.floor(Math.random() * top.length)];
      if (pick) return { x: pick.x, y: pick.y };
    }

    return {
      x: best.x,
      y: best.y,
      score: best.value,
      depth: reached,
      nodes: nodeCount,
      elapsed: Math.round(now() - (deadline - cfg.time))
    };
  }

  return {
    think: think,
    createScorer: createScorer,
    scorePatterns: scorePatterns,
    LEVELS: LEVELS
  };
});
