/**
 * gomoku.js —— 五子棋核心规则（与界面无关，可在浏览器和 Node 中运行）
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.Gomoku = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var SIZE = 15;
  var EMPTY = 0;
  var BLACK = 1;
  var WHITE = 2;
  /** 四个扫描方向：横、竖、主对角线、副对角线 */
  var DIRS = [[1, 0], [0, 1], [1, 1], [1, -1]];

  function opponent(player) {
    return player === BLACK ? WHITE : BLACK;
  }

  function createBoard(size) {
    var n = size || SIZE;
    return {
      size: n,
      cells: new Int8Array(n * n),
      moves: [],        // [{x, y, player}]
      turn: BLACK,
      winner: EMPTY,    // EMPTY 表示未结束
      winLine: null,    // 获胜的五个点
      draw: false
    };
  }

  function inBounds(board, x, y) {
    return x >= 0 && y >= 0 && x < board.size && y < board.size;
  }

  function get(board, x, y) {
    return board.cells[y * board.size + x];
  }

  function isEmpty(board, x, y) {
    return inBounds(board, x, y) && board.cells[y * board.size + x] === EMPTY;
  }

  function isFull(board) {
    return board.moves.length >= board.size * board.size;
  }

  function isOver(board) {
    return board.winner !== EMPTY || board.draw;
  }

  /**
   * 落子。成功返回该步信息，失败（越界/已有子/已结束）返回 null。
   */
  function place(board, x, y, player) {
    if (!isEmpty(board, x, y)) return null;
    if (board.winner !== EMPTY || board.draw) return null;

    var p = player || board.turn;
    board.cells[y * board.size + x] = p;
    var move = { x: x, y: y, player: p };
    board.moves.push(move);

    var line = findWinLine(board, x, y);
    if (line) {
      board.winner = p;
      board.winLine = line;
    } else if (isFull(board)) {
      board.draw = true;
    } else {
      board.turn = opponent(p);
    }
    return move;
  }

  /**
   * 撤销最后一步（可连续调用）。
   */
  function undo(board) {
    var move = board.moves.pop();
    if (!move) return null;
    board.cells[move.y * board.size + move.x] = EMPTY;
    board.winner = EMPTY;
    board.winLine = null;
    board.draw = false;
    board.turn = move.player;
    return move;
  }

  function reset(board) {
    board.cells.fill(EMPTY);
    board.moves.length = 0;
    board.turn = BLACK;
    board.winner = EMPTY;
    board.winLine = null;
    board.draw = false;
  }

  /**
   * 判断某点落子后是否连成五子，返回包含它的五个坐标数组（可能更长，取最长连）。
   */
  function findWinLine(board, x, y) {
    var player = get(board, x, y);
    if (player === EMPTY) return null;

    for (var d = 0; d < DIRS.length; d++) {
      var dx = DIRS[d][0];
      var dy = DIRS[d][1];
      var line = [{ x: x, y: y }];

      // 反方向延伸
      for (var i = 1; i < 5; i++) {
        var px = x - dx * i, py = y - dy * i;
        if (!inBounds(board, px, py) || get(board, px, py) !== player) break;
        line.unshift({ x: px, y: py });
      }
      // 正方向延伸
      for (var j = 1; j < 5; j++) {
        var nx = x + dx * j, ny = y + dy * j;
        if (!inBounds(board, nx, ny) || get(board, nx, ny) !== player) break;
        line.push({ x: nx, y: ny });
      }

      if (line.length >= 5) return line;
    }
    return null;
  }

  /**
   * 枚举所有空点，返回 [{x, y}]。
   */
  function emptyPoints(board) {
    var out = [];
    for (var y = 0; y < board.size; y++) {
      for (var x = 0; x < board.size; x++) {
        if (board.cells[y * board.size + x] === EMPTY) out.push({ x: x, y: y });
      }
    }
    return out;
  }

  function clone(board) {
    var b = createBoard(board.size);
    b.cells.set(board.cells);
    b.moves = board.moves.map(function (m) { return { x: m.x, y: m.y, player: m.player }; });
    b.turn = board.turn;
    b.winner = board.winner;
    b.winLine = board.winLine ? board.winLine.map(function (p) { return { x: p.x, y: p.y }; }) : null;
    b.draw = board.draw;
    return b;
  }

  function index(board, x, y) {
    return y * board.size + x;
  }

  return {
    SIZE: SIZE,
    EMPTY: EMPTY,
    BLACK: BLACK,
    WHITE: WHITE,
    DIRS: DIRS,
    opponent: opponent,
    createBoard: createBoard,
    inBounds: inBounds,
    get: get,
    isEmpty: isEmpty,
    isFull: isFull,
    isOver: isOver,
    place: place,
    undo: undo,
    reset: reset,
    findWinLine: findWinLine,
    emptyPoints: emptyPoints,
    clone: clone,
    index: index
  };
});
