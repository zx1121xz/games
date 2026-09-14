/**
 * ui.js —— 界面渲染与交互
 */
(function () {
  'use strict';

  var SIZE = Gomoku.SIZE;
  var EMPTY = Gomoku.EMPTY;
  var BLACK = Gomoku.BLACK;
  var WHITE = Gomoku.WHITE;
  var STARS = [[3, 3], [11, 3], [3, 11], [11, 11], [7, 7]];

  var canvas = document.getElementById('board');
  var ctx = canvas.getContext('2d');
  var boardBox = document.getElementById('boardBox');
  var banner = document.getElementById('banner');
  var thinkingEl = document.getElementById('thinking');
  var statusText = document.getElementById('statusText');
  var hintText = document.getElementById('hintText');
  var turnDot = document.getElementById('turnDot');
  var undoBtn = document.getElementById('undoBtn');
  var restartBtn = document.getElementById('restartBtn');
  var soundBtn = document.getElementById('soundBtn');
  var blackWinsEl = document.getElementById('blackWins');
  var whiteWinsEl = document.getElementById('whiteWins');
  var drawCountEl = document.getElementById('drawCount');

  var board = Gomoku.createBoard(SIZE);
  var mode = 'pve';            // pve | pvp
  var humanSide = BLACK;       // 人机模式下玩家执子
  var level = 'medium';
  var aiThinking = false;
  var soundOn = true;
  var hover = null;            // {x, y}
  var stats = { black: 0, white: 0, draw: 0 };
  var statsLocked = false;     // 防止同一局重复计分
  var bannerTimer = null;

  /* ---------------- 尺寸与绘制 ---------------- */
  var cssSize = 0;
  var margin = 0;
  var cell = 0;

  function layout() {
    var rect = boardBox.getBoundingClientRect();
    cssSize = Math.max(240, Math.round(rect.width));
    margin = cssSize * 0.052;
    cell = (cssSize - margin * 2) / (SIZE - 1);

    var dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(cssSize * dpr);
    canvas.height = Math.round(cssSize * dpr);
    canvas.style.width = cssSize + 'px';
    canvas.style.height = cssSize + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function px(i) { return margin + i * cell; }

  function draw() {
    ctx.clearRect(0, 0, cssSize, cssSize);

    // 网格
    var w = Math.max(1, cssSize * 0.0016);
    ctx.strokeStyle = 'rgba(90, 62, 26, 0.85)';
    ctx.lineWidth = w;
    ctx.beginPath();
    for (var i = 0; i < SIZE; i++) {
      var p = Math.round(px(i)) + 0.5;
      ctx.moveTo(Math.round(px(0)) + 0.5, p);
      ctx.lineTo(Math.round(px(SIZE - 1)) + 0.5, p);
      ctx.moveTo(p, Math.round(px(0)) + 0.5);
      ctx.lineTo(p, Math.round(px(SIZE - 1)) + 0.5);
    }
    ctx.stroke();

    // 外框
    ctx.lineWidth = w * 2;
    ctx.strokeRect(
      Math.round(px(0)) + 0.5,
      Math.round(px(0)) + 0.5,
      Math.round(px(SIZE - 1) - px(0)),
      Math.round(px(SIZE - 1) - px(0))
    );

    // 星位
    ctx.fillStyle = 'rgba(70, 46, 16, 0.9)';
    for (var s = 0; s < STARS.length; s++) {
      ctx.beginPath();
      ctx.arc(px(STARS[s][0]), px(STARS[s][1]), Math.max(1.6, cell * 0.07), 0, Math.PI * 2);
      ctx.fill();
    }

    // 悬停预览
    if (hover && canPlay() && board.cells[hover.y * SIZE + hover.x] === EMPTY) {
      drawStone(hover.x, hover.y, board.turn, 0.32);
    }

    // 棋子
    for (var m = 0; m < board.moves.length; m++) {
      var mv = board.moves[m];
      drawStone(mv.x, mv.y, mv.player, 1);
    }

    // 最后一手标记
    var last = board.moves[board.moves.length - 1];
    if (last && !board.winner) {
      ctx.beginPath();
      ctx.arc(px(last.x), px(last.y), Math.max(2.5, cell * 0.11), 0, Math.PI * 2);
      ctx.fillStyle = '#e0533a';
      ctx.fill();
    }

    // 获胜连线
    if (board.winLine && board.winLine.length) {
      var a = board.winLine[0];
      var b = board.winLine[board.winLine.length - 1];
      ctx.save();
      ctx.strokeStyle = 'rgba(224, 83, 58, 0.9)';
      ctx.lineWidth = Math.max(3, cell * 0.16);
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(px(a.x), px(a.y));
      ctx.lineTo(px(b.x), px(b.y));
      ctx.stroke();
      ctx.restore();
      for (var k = 0; k < board.winLine.length; k++) {
        ctx.beginPath();
        ctx.arc(px(board.winLine[k].x), px(board.winLine[k].y), cell * 0.46, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(255, 226, 150, 0.95)';
        ctx.lineWidth = Math.max(2, cell * 0.08);
        ctx.stroke();
      }
    }
  }

  function drawStone(gx, gy, player, alpha) {
    var cx = px(gx);
    var cy = px(gy);
    var r = cell * 0.44;
    ctx.save();
    ctx.globalAlpha = alpha;

    ctx.beginPath();
    ctx.arc(cx + r * 0.12, cy + r * 0.18, r, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(60, 38, 10, 0.28)';
    ctx.fill();

    var grad = ctx.createRadialGradient(cx - r * 0.35, cy - r * 0.4, r * 0.15, cx, cy, r);
    if (player === BLACK) {
      grad.addColorStop(0, '#6a6a6a');
      grad.addColorStop(0.45, '#2b2b2b');
      grad.addColorStop(1, '#000000');
    } else {
      grad.addColorStop(0, '#ffffff');
      grad.addColorStop(0.6, '#f2efe8');
      grad.addColorStop(1, '#c9c3b8');
    }
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fillStyle = grad;
    ctx.fill();

    ctx.lineWidth = Math.max(0.6, r * 0.06);
    ctx.strokeStyle = player === BLACK ? 'rgba(255,255,255,0.12)' : 'rgba(120,110,95,0.55)';
    ctx.stroke();
    ctx.restore();
  }

  /* ---------------- 音效 ---------------- */
  var audioCtx = null;
  function playClack() {
    if (!soundOn) return;
    try {
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      if (!audioCtx) audioCtx = new AC();
      if (audioCtx.state === 'suspended') audioCtx.resume();
      var t = audioCtx.currentTime;
      var osc = audioCtx.createOscillator();
      var gain = audioCtx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(880, t);
      osc.frequency.exponentialRampToValueAtTime(160, t + 0.09);
      gain.gain.setValueAtTime(0.16, t);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start(t);
      osc.stop(t + 0.14);
    } catch (e) { /* 忽略音频错误 */ }
  }

  /* ---------------- 状态与界面 ---------------- */
  function canPlay() {
    return !aiThinking && !Gomoku.isOver(board) &&
      (mode === 'pvp' || board.turn === humanSide);
  }

  function updatePanel() {
    var isBlack = board.turn === BLACK;
    turnDot.className = 'stone-dot' + (isBlack ? '' : ' white');

    if (board.winner) {
      statusText.textContent = (board.winner === BLACK ? '黑棋' : '白棋') + '获胜';
    } else if (board.draw) {
      statusText.textContent = '和棋';
    } else {
      var who = isBlack ? '黑棋' : '白棋';
      if (mode === 'pve') {
        statusText.textContent = who + '行棋' + (board.turn === humanSide ? '（你）' : '（AI）');
      } else {
        statusText.textContent = who + '行棋';
      }
    }

    if (mode === 'pve') {
      hintText.textContent = aiThinking
        ? 'AI 正在计算，请稍候…'
        : '你执' + (humanSide === BLACK ? '黑' : '白') + '棋，在棋盘交叉点落子，先连成五子者胜。';
    } else {
      hintText.textContent = '双人对战：轮流落子，先连成五子者胜。';
    }

    canvas.classList.toggle('locked', !canPlay());
    undoBtn.disabled = aiThinking || board.moves.length === 0;
    thinkingEl.classList.toggle('show', aiThinking);

    blackWinsEl.textContent = stats.black;
    whiteWinsEl.textContent = stats.white;
    drawCountEl.textContent = stats.draw;
  }

  function redraw() {
    draw();
    updatePanel();
  }

  function showBanner(text) {
    banner.textContent = text;
    banner.classList.add('show');
    if (bannerTimer) clearTimeout(bannerTimer);
    bannerTimer = setTimeout(function () {
      banner.classList.remove('show');
    }, 3200);
  }

  function finishIfOver() {
    if (!Gomoku.isOver(board)) return false;
    if (!statsLocked) {
      statsLocked = true;
      if (board.winner === BLACK) stats.black++;
      else if (board.winner === WHITE) stats.white++;
      else stats.draw++;
    }
    if (board.winner) {
      var name = board.winner === BLACK ? '黑棋' : '白棋';
      var suffix = '';
      if (mode === 'pve') suffix = board.winner === humanSide ? ' · 你赢了！' : ' · 再接再厉';
      showBanner(name + '获胜' + suffix);
    } else {
      showBanner('棋盘已满，和棋');
    }
    updatePanel();   // 刷新比分与锁定状态
    return true;
  }

  /* ---------------- 落子与 AI ---------------- */
  function tryPlace(x, y) {
    if (!canPlay() || !Gomoku.isEmpty(board, x, y)) return;
    Gomoku.place(board, x, y, board.turn);
    playClack();
    redraw();
    if (finishIfOver()) return;
    scheduleAI();
  }

  function scheduleAI() {
    if (mode !== 'pve' || Gomoku.isOver(board)) return;
    if (board.turn === humanSide) return;

    aiThinking = true;
    hover = null;
    redraw();

    // 先让“思考中”渲染出来，再开始同步计算
    requestAnimationFrame(function () {
      setTimeout(function () {
        var move = GomokuAI.think(board, board.turn, level);
        aiThinking = false;
        if (move && Gomoku.isEmpty(board, move.x, move.y)) {
          Gomoku.place(board, move.x, move.y, board.turn);
          playClack();
        }
        redraw();
        finishIfOver();
        redraw();
      }, 20);
    });
  }

  function newGame() {
    Gomoku.reset(board);
    statsLocked = false;
    aiThinking = false;
    hover = null;
    banner.classList.remove('show');
    redraw();
    if (mode === 'pve' && humanSide === WHITE) scheduleAI();
  }

  function undo() {
    if (aiThinking || board.moves.length === 0) return;
    banner.classList.remove('show');
    statsLocked = false;

    if (mode === 'pvp') {
      Gomoku.undo(board);
    } else {
      // 人机：退回到玩家可以落子的状态
      do {
        Gomoku.undo(board);
      } while (board.moves.length > 0 && board.turn !== humanSide);
      if (board.moves.length === 0 && board.turn !== humanSide) Gomoku.undo(board);
    }
    redraw();
    // 若退回到 AI 行棋（例如玩家执白且被吃掉一手），让 AI 继续
    if (mode === 'pve' && !Gomoku.isOver(board) && board.turn !== humanSide) scheduleAI();
  }

  /* ---------------- 事件绑定 ---------------- */
  function pointFromEvent(ev) {
    var rect = canvas.getBoundingClientRect();
    var clientX = ev.clientX, clientY = ev.clientY;
    if (clientX === undefined && ev.touches && ev.touches[0]) {
      clientX = ev.touches[0].clientX;
      clientY = ev.touches[0].clientY;
    }
    // 正常情况 rect 尺寸等于 cssSize，这里做个保护避免除零
    var scaleX = rect.width ? cssSize / rect.width : 1;
    var scaleY = rect.height ? cssSize / rect.height : 1;
    var sx = (clientX - rect.left) * scaleX;
    var sy = (clientY - rect.top) * scaleY;
    var gx = Math.round((sx - margin) / cell);
    var gy = Math.round((sy - margin) / cell);
    if (gx < 0 || gy < 0 || gx >= SIZE || gy >= SIZE) return null;
    // 距离交叉点太远则忽略
    if (Math.abs(px(gx) - sx) > cell * 0.55 || Math.abs(px(gy) - sy) > cell * 0.55) return null;
    return { x: gx, y: gy };
  }

  canvas.addEventListener('click', function (ev) {
    var p = pointFromEvent(ev);
    if (p) tryPlace(p.x, p.y);
  });

  canvas.addEventListener('mousemove', function (ev) {
    if (!canPlay()) return;
    var p = pointFromEvent(ev);
    var changed = (!!p !== !!hover) || (p && hover && (p.x !== hover.x || p.y !== hover.y));
    if (changed) {
      hover = p;
      draw();
    }
  });

  canvas.addEventListener('mouseleave', function () {
    if (hover) {
      hover = null;
      draw();
    }
  });

  document.getElementById('modeGroup').addEventListener('click', function (ev) {
    var btn = ev.target.closest('[data-mode]');
    if (!btn) return;
    mode = btn.dataset.mode;
    setActive('modeGroup', btn);
    document.getElementById('sideField').style.display = mode === 'pve' ? '' : 'none';
    document.getElementById('levelField').style.display = mode === 'pve' ? '' : 'none';
    newGame();
  });

  document.getElementById('sideGroup').addEventListener('click', function (ev) {
    var btn = ev.target.closest('[data-side]');
    if (!btn) return;
    humanSide = Number(btn.dataset.side);
    setActive('sideGroup', btn);
    newGame();
  });

  document.getElementById('levelGroup').addEventListener('click', function (ev) {
    var btn = ev.target.closest('[data-level]');
    if (!btn) return;
    level = btn.dataset.level;
    setActive('levelGroup', btn);
    newGame();
  });

  function setActive(groupId, btn) {
    var group = document.getElementById(groupId);
    var items = group.querySelectorAll('.seg');
    for (var i = 0; i < items.length; i++) items[i].classList.remove('is-active');
    btn.classList.add('is-active');
  }

  undoBtn.addEventListener('click', undo);
  restartBtn.addEventListener('click', newGame);

  soundBtn.addEventListener('click', function () {
    soundOn = !soundOn;
    soundBtn.textContent = soundOn ? '🔊 落子音效：开' : '🔇 落子音效：关';
    soundBtn.setAttribute('aria-pressed', String(soundOn));
    if (soundOn) playClack();
  });

  document.addEventListener('keydown', function (ev) {
    var key = ev.key ? ev.key.toLowerCase() : '';
    if ((ev.ctrlKey || ev.metaKey) && key === 'z') {
      ev.preventDefault();
      undo();
    } else if (key === 'r' && !ev.ctrlKey && !ev.metaKey && !ev.altKey) {
      newGame();
    }
  });

  if (window.ResizeObserver) {
    new ResizeObserver(function () {
      layout();
      draw();
    }).observe(boardBox);
  } else {
    window.addEventListener('resize', function () {
      layout();
      draw();
    });
  }

  /* ---------------- 启动 ---------------- */
  layout();
  redraw();
})();
