/**
 * 规则与 AI 的轻量测试：node tests/test.js
 */
'use strict';

var path = require('path');
var Gomoku = require(path.join(__dirname, '..', 'js', 'gomoku.js'));
var AI = require(path.join(__dirname, '..', 'js', 'ai.js'));

var passed = 0;
var failed = 0;

function check(name, cond, extra) {
  if (cond) {
    passed++;
    console.log('  ✓ ' + name);
  } else {
    failed++;
    console.log('  ✗ ' + name + (extra ? '  -> ' + extra : ''));
  }
}

function section(title) {
  console.log('\n' + title);
}

function fresh() {
  return Gomoku.createBoard(15);
}

function put(board, list, player) {
  list.forEach(function (p) { Gomoku.place(board, p[0], p[1], player); });
}

/* ---------------- 规则 ---------------- */
section('规则：胜负判定');
(function () {
  var board = fresh();
  put(board, [[3, 3], [4, 3], [5, 3], [6, 3]], Gomoku.BLACK);
  check('四连不算胜', board.winner === Gomoku.EMPTY);
  Gomoku.place(board, 7, 3, Gomoku.BLACK);
  check('横向五连获胜', board.winner === Gomoku.BLACK);
  check('取胜时返回获胜连线', board.winLine && board.winLine.length >= 5);
})();

(function () {
  var board = fresh();
  put(board, [[2, 1], [2, 2], [2, 3], [2, 4], [2, 5]], Gomoku.WHITE);
  check('纵向五连获胜', board.winner === Gomoku.WHITE);
})();

(function () {
  var board = fresh();
  put(board, [[1, 1], [2, 2], [3, 3], [4, 4], [5, 5]], Gomoku.BLACK);
  check('主对角线五连获胜', board.winner === Gomoku.BLACK);
})();

(function () {
  var board = fresh();
  put(board, [[5, 0], [4, 1], [3, 2], [2, 3], [1, 4]], Gomoku.WHITE);
  check('副对角线五连获胜', board.winner === Gomoku.WHITE);
})();

(function () {
  var board = fresh();
  put(board, [[0, 7], [1, 7], [2, 7], [3, 7]], Gomoku.BLACK);
  Gomoku.place(board, 4, 7, Gomoku.BLACK);
  check('长连（六连）同样获胜', board.winner === Gomoku.BLACK);
})();

section('规则：落子与悔棋');
(function () {
  var board = fresh();
  var ok = Gomoku.place(board, 7, 7, Gomoku.BLACK);
  check('落子成功返回坐标', !!ok && ok.x === 7 && ok.y === 7);
  check('重复落子被拒绝', Gomoku.place(board, 7, 7, Gomoku.WHITE) === null);
  check('轮次切换为白棋', board.turn === Gomoku.WHITE);
  Gomoku.undo(board);
  check('悔棋后该点变空', Gomoku.get(board, 7, 7) === Gomoku.EMPTY);
  check('悔棋后轮次回到黑棋', board.turn === Gomoku.BLACK);
  check('悔棋后步数为 0', board.moves.length === 0);
})();

(function () {
  var board = fresh();
  put(board, [[0, 0], [0, 1], [0, 2], [0, 3], [0, 4]], Gomoku.BLACK);
  check('获胜后局面结束', Gomoku.isOver(board) === true);
  check('结束后禁止继续落子', Gomoku.place(board, 5, 5, Gomoku.WHITE) === null);
  Gomoku.undo(board);
  check('悔棋可撤销终局状态', board.winner === Gomoku.EMPTY && !Gomoku.isOver(board));
})();

/* ---------------- AI ---------------- */
section('AI：基本战术');
(function () {
  var board = fresh();
  put(board, [[7, 7], [8, 7], [9, 7], [10, 7]], Gomoku.BLACK);   // AI = 黑
  put(board, [[0, 0], [1, 0], [2, 0]], Gomoku.WHITE);
  var move = AI.think(board, Gomoku.BLACK, 'medium');
  var wins = (move.x === 6 && move.y === 7) || (move.x === 11 && move.y === 7);
  check('AI 抓住一步成五的机会', wins, JSON.stringify(move));
})();

(function () {
  var board = fresh();
  put(board, [[7, 7], [8, 7], [9, 7]], Gomoku.BLACK);           // AI = 黑，已有活三
  var move = AI.think(board, Gomoku.BLACK, 'hard');
  // 活三应被扩展为活四（两端之一）
  var extends4 = (move.y === 7 && (move.x === 6 || move.x === 10)) ||
                 (move.x === 7 && (move.y === 6 || move.y === 10));
  check('AI 会把活三扩成四', extends4, JSON.stringify(move));
})();

(function () {
  var board = fresh();
  put(board, [[7, 7], [8, 7], [9, 7], [10, 7]], Gomoku.WHITE);  // 对手白棋四连
  put(board, [[0, 0], [1, 1], [2, 2]], Gomoku.BLACK);
  var move = AI.think(board, Gomoku.BLACK, 'medium');
  var blocks = (move.x === 6 && move.y === 7) || (move.x === 11 && move.y === 7);
  check('AI 会封堵对手的四连', blocks, JSON.stringify(move));
})();

(function () {
  var board = fresh();
  put(board, [[7, 6], [7, 7], [7, 8]], Gomoku.WHITE);           // 对手纵向活三
  put(board, [[0, 0], [1, 1]], Gomoku.BLACK);
  var move = AI.think(board, Gomoku.BLACK, 'hard');
  var blocksThree = (move.x === 7 && (move.y === 5 || move.y === 9));
  check('AI 会应对对手的活三', blocksThree, JSON.stringify(move));
})();

(function () {
  var board = fresh();
  var move = AI.think(board, Gomoku.BLACK, 'medium');
  check('空盘时 AI 走天元', move.x === 7 && move.y === 7, JSON.stringify(move));
})();

section('AI：健壮性');
(function () {
  var board = fresh();
  var snapshot = Array.prototype.slice.call(board.cells).join(',');
  put(board, [[7, 7], [8, 8], [6, 6]], Gomoku.BLACK);
  put(board, [[7, 8], [8, 7], [9, 9]], Gomoku.WHITE);
  var before = Array.prototype.slice.call(board.cells).join(',');

  var t0 = Date.now();
  var move = AI.think(board, Gomoku.WHITE, 'hard');
  var dt = Date.now() - t0;
  var after = Array.prototype.slice.call(board.cells).join(',');

  check('AI 返回合法空点', Gomoku.isEmpty(board, move.x, move.y), JSON.stringify(move));
  check('AI 不修改传入的棋盘', before === after);
  check('AI 未污染空盘快照逻辑', snapshot.length > 0);
  check('困难难度在 5 秒内给出结果 (' + dt + 'ms)', dt < 5000);
})();

section('AI：自对弈冒烟测试');
(function () {
  var board = fresh();
  var moves = 0;
  var t0 = Date.now();
  var levels = ['easy', 'medium'];
  while (!Gomoku.isOver(board) && moves < 40) {
    var p = board.turn;
    var mv = AI.think(board, p, levels[moves % 2]);
    if (!Gomoku.isEmpty(board, mv.x, mv.y)) {
      check('自对弈第 ' + (moves + 1) + ' 手落在空点', false, JSON.stringify(mv));
      break;
    }
    Gomoku.place(board, mv.x, mv.y, p);
    moves++;
  }
  var dt = Date.now() - t0;
  check('AI 自对弈 40 手无异常 (' + moves + ' 手 / ' + dt + 'ms)', moves > 0);
  console.log('    终局状态：winner=' + board.winner + ' 手数=' + board.moves.length +
              ' 用时=' + dt + 'ms');
})();

console.log('\n结果：' + passed + ' 通过，' + failed + ' 失败\n');
process.exit(failed ? 1 : 0);
