/*
 * game.js — 사과게임(Fruit Box)
 *
 * 규칙
 *  - 1~9 가 적힌 사과가 18 x 9 = 162칸에 배치된다.
 *  - 마우스/손가락으로 직사각형 영역을 드래그해 선택한다.
 *  - 선택한 사과들의 합이 정확히 10이면 사과가 사라지고, 사과 1개당 1점.
 *  - 제한 시간 120초. 시간이 끝나면 최종 점수를 보여준다.
 */
(function () {
  'use strict';

  var B = window.FruitBoxBoard;
  var COLS = B.COLS;
  var ROWS = B.ROWS;
  var TOTAL = B.TOTAL;
  var TARGET = B.TARGET;

  var GAME_TIME = 120;          // 제한 시간(초)
  var APPLE_RATIO = 0.76;       // 칸 간격 대비 사과 지름(보이는 크기)
  var HIT_RATIO = 0.84;         // 판정 크기 — 보이는 사과보다 약간 넉넉하게 잡아
                                // 손가락으로도 사과 사이 틈에서 선택이 끊기지 않게 한다.
  var BEST_KEY = 'fruitbox.best';

  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------------------------------------------------------------- DOM */

  function $(id) { return document.getElementById(id); }

  var el = {
    root: document.documentElement,
    titleScreen: $('titleScreen'),
    gameScreen: $('gameScreen'),
    gameInner: $('gameInner'),
    ghostField: $('ghostField'),
    playBtn: $('playBtn'),
    titleBest: $('titleBest'),
    homeBtn: $('homeBtn'),
    timer: document.querySelector('.timer'),
    timeText: $('timeText'),
    timeFill: $('timeFill'),
    scoreText: $('scoreText'),
    boardWrap: $('boardWrap'),
    board: $('board'),
    selection: $('selection'),
    sumBadge: $('sumBadge'),
    toast: $('toast'),
    resultOverlay: $('resultOverlay'),
    resultTitle: $('resultTitle'),
    finalScore: $('finalScore'),
    bestScore: $('bestScore'),
    retryBtn: $('retryBtn'),
    toTitleBtn: $('toTitleBtn')
  };

  /* -------------------------------------------------------------- 상태 */

  var state = {
    values: null,        // Int8Array(162) — 0 이면 이미 제거된 칸
    apples: [],          // 인덱스별 사과 DOM
    alive: 0,
    score: 0,
    timeLeft: GAME_TIME,
    running: false,
    cell: 34,
    hitSize: 28,
    boardRect: null,
    drag: null,          // { id, x0, y0, x, y, raf }
    sel: null,           // { c1, r1, c2, r2, sum }
    rafId: 0,
    lastTs: 0,
    toastTimer: 0,
    rotated: false       // 세로 화면에서 게임 프레임을 90도 돌렸는지
  };

  function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }

  /* ------------------------------------------------------------ 레이아웃 */

  /**
   * 보드는 18:9(가로로 긴) 비율이라 세로 화면에서는 칸이 너무 작아진다.
   * 세로일 때는 게임 프레임 전체를 90도 돌려서 화면을 가로로 쓴다.
   */
  function applyRotation() {
    var vw = window.innerWidth;
    var vh = window.innerHeight;
    var rotate = vh > vw * 1.05;

    state.rotated = rotate;
    el.gameScreen.classList.toggle('is-rotated', rotate);

    if (rotate) {
      // 회전 후의 가로/세로가 바뀌므로 크기를 서로 맞바꿔 지정한다.
      el.gameInner.style.width = vh + 'px';
      el.gameInner.style.height = vw + 'px';
    } else {
      el.gameInner.style.width = '';
      el.gameInner.style.height = '';
    }
  }

  var lastW = -1, lastH = -1;

  function layout(force) {
    applyRotation();

    var wrap = el.boardWrap;
    // clientWidth/Height 는 transform 이전의 레이아웃 크기라 회전과 무관하게 그대로 쓸 수 있다.
    var availW = wrap.clientWidth - 8;
    var availH = wrap.clientHeight - 8;
    if (availW <= 0 || availH <= 0) return;

    // ResizeObserver 안에서 크기를 바꾸면 다시 호출되므로, 변화가 없으면 빠져나간다.
    if (force !== true && availW === lastW && availH === lastH) return;
    lastW = availW;
    lastH = availH;

    var cell = Math.min(availW / COLS, availH / ROWS);
    cell = Math.max(12, Math.floor(cell * 2) / 2);

    state.cell = cell;
    state.hitSize = cell * HIT_RATIO;
    el.root.style.setProperty('--cell', cell + 'px');
    state.boardRect = el.board.getBoundingClientRect();
  }

  /* -------------------------------------------------------------- 화면 */

  function showScreen(name) {
    el.titleScreen.classList.toggle('is-active', name === 'title');
    el.gameScreen.classList.toggle('is-active', name === 'game');
  }

  function showToast(message, duration) {
    el.toast.textContent = message;
    el.toast.hidden = false;
    clearTimeout(state.toastTimer);
    state.toastTimer = setTimeout(function () { el.toast.hidden = true; }, duration || 2000);
  }

  /* ---------------------------------------------------- 타이틀 배경 사과 */

  function buildGhostField() {
    var vw = window.innerWidth;
    var vh = window.innerHeight;
    var cell = Math.max(44, vw / 18);
    var cols = Math.ceil(vw / cell) + 1;
    var rows = Math.ceil(vh / cell) + 1;

    var offsetX = (vw - cols * cell) / 2;
    var offsetY = (vh - rows * cell) / 2;

    el.ghostField.style.setProperty('--cell', cell + 'px');
    el.ghostField.style.transform = 'translate(' + offsetX + 'px,' + offsetY + 'px)';

    var frag = document.createDocumentFragment();
    for (var r = 0; r < rows; r++) {
      for (var c = 0; c < cols; c++) {
        var a = document.createElement('div');
        a.className = 'apple';
        a.style.setProperty('--c', c);
        a.style.setProperty('--r', r);
        var n = document.createElement('span');
        n.className = 'apple__num';
        n.textContent = 1 + Math.floor(Math.random() * 9);
        a.appendChild(n);
        frag.appendChild(a);
      }
    }
    el.ghostField.textContent = '';
    el.ghostField.appendChild(frag);
  }

  /* ---------------------------------------------------------- 보드 생성 */

  function buildBoard() {
    var old = el.board.querySelectorAll('.apple');
    for (var k = 0; k < old.length; k++) old[k].remove();

    var frag = document.createDocumentFragment();
    state.apples = new Array(TOTAL);

    for (var r = 0; r < ROWS; r++) {
      for (var c = 0; c < COLS; c++) {
        var i = r * COLS + c;
        var a = document.createElement('div');
        a.className = 'apple';
        a.style.setProperty('--c', c);
        a.style.setProperty('--r', r);
        var n = document.createElement('span');
        n.className = 'apple__num';
        n.textContent = state.values[i];
        a.appendChild(n);
        state.apples[i] = a;
        frag.appendChild(a);
      }
    }
    el.board.appendChild(frag);
  }

  /* ------------------------------------------------------------ 게임 흐름 */

  function startGame() {
    cancelDrag();
    clearSelectionUI();

    state.values = B.createBoard();
    state.alive = TOTAL;
    state.score = 0;
    state.timeLeft = GAME_TIME;
    state.lastTs = 0;
    state.rotateHintShown = false;

    el.resultOverlay.hidden = true;
    el.toast.hidden = true;
    el.scoreText.textContent = '0';
    updateTimerUI();

    buildBoard();
    showScreen('game');
    layout(true);

    if (state.rotated) showToast('휴대폰을 가로로 돌려서 플레이하세요 📱', 2600);

    state.running = true;
    cancelAnimationFrame(state.rafId);
    state.rafId = requestAnimationFrame(tick);
  }

  function endGame(reason) {
    if (!state.running) return;
    state.running = false;
    cancelAnimationFrame(state.rafId);
    cancelDrag();
    clearSelectionUI();

    state.timeLeft = Math.max(0, state.timeLeft);
    updateTimerUI();

    var best = readBest();
    if (state.score > best) {
      best = state.score;
      writeBest(best);
    }

    el.resultTitle.textContent =
      reason === 'clear' ? '퍼펙트! 🎉' :
      reason === 'deadlock' ? '더 이상 만들 수 있는 조합이 없어요' :
      '타임 오버!';
    el.finalScore.textContent = state.score;
    el.bestScore.textContent = best;
    el.resultOverlay.hidden = false;
    updateTitleBest();
  }

  function goTitle() {
    state.running = false;
    cancelAnimationFrame(state.rafId);
    cancelDrag();
    clearSelectionUI();
    el.resultOverlay.hidden = true;
    el.toast.hidden = true;
    buildGhostField();
    updateTitleBest();
    showScreen('title');
  }

  /* -------------------------------------------------------------- 타이머 */

  function tick(ts) {
    if (!state.running) return;

    if (!state.lastTs) state.lastTs = ts;
    var dt = (ts - state.lastTs) / 1000;
    state.lastTs = ts;
    // 탭이 백그라운드로 갔다 돌아오면 간격이 크게 벌어진다 — 그 구간은 버린다.
    if (dt > 0.5) dt = 0;

    state.timeLeft -= dt;

    if (state.timeLeft <= 0) {
      state.timeLeft = 0;
      updateTimerUI();
      endGame('time');
      return;
    }

    updateTimerUI();
    state.rafId = requestAnimationFrame(tick);
  }

  var lastShownSecond = -1;

  function updateTimerUI() {
    var seconds = Math.ceil(state.timeLeft);
    if (seconds !== lastShownSecond) {
      lastShownSecond = seconds;
      el.timeText.textContent = seconds;
      el.timer.classList.toggle('is-low', seconds <= 30 && seconds > 10);
      el.timer.classList.toggle('is-critical', seconds <= 10);
    }
    el.timeFill.style.transform = 'scaleX(' + (state.timeLeft / GAME_TIME) + ')';
  }

  /* ------------------------------------------------------- 최고 점수 저장 */

  function readBest() {
    try {
      var v = parseInt(window.localStorage.getItem(BEST_KEY), 10);
      return isFinite(v) && v > 0 ? v : 0;
    } catch (err) { return 0; }
  }

  function writeBest(value) {
    try { window.localStorage.setItem(BEST_KEY, String(value)); } catch (err) { /* 무시 */ }
  }

  function updateTitleBest() {
    var best = readBest();
    el.titleBest.hidden = best <= 0;
    el.titleBest.querySelector('b').textContent = best;
  }

  /* -------------------------------------------------------------- 선택 */

  /** 드래그 사각형과 겹치는 열/행 범위를 구한다. 없으면 -1. */
  function rangeFor(lo, hi, count) {
    var cell = state.cell;
    var d = state.hitSize;
    var pad = (cell - d) / 2;
    var min = -1, max = -1;
    for (var i = 0; i < count; i++) {
      var a = i * cell + pad;
      var b = a + d;
      if (b > lo && a < hi) {
        if (min < 0) min = i;
        max = i;
      }
    }
    return [min, max];
  }

  function computeSelection(x0, y0, x1, y1) {
    var left = Math.min(x0, x1);
    var right = Math.max(x0, x1);
    var top = Math.min(y0, y1);
    var bottom = Math.max(y0, y1);

    var cols = rangeFor(left, right, COLS);
    var rows = rangeFor(top, bottom, ROWS);
    if (cols[0] < 0 || rows[0] < 0) return null;

    var sum = 0;
    for (var r = rows[0]; r <= rows[1]; r++) {
      for (var c = cols[0]; c <= cols[1]; c++) sum += state.values[r * COLS + c];
    }
    return { c1: cols[0], r1: rows[0], c2: cols[1], r2: rows[1], sum: sum };
  }

  function markRange(sel, on) {
    if (!sel) return;
    for (var r = sel.r1; r <= sel.r2; r++) {
      for (var c = sel.c1; c <= sel.c2; c++) {
        var i = r * COLS + c;
        if (state.values[i] === 0) continue;
        state.apples[i].classList.toggle('is-selected', on);
      }
    }
  }

  function sameSel(a, b) {
    return !!a && !!b && a.c1 === b.c1 && a.c2 === b.c2 && a.r1 === b.r1 && a.r2 === b.r2;
  }

  function applySelection(next) {
    if (sameSel(state.sel, next)) {
      state.sel = next;
      return;
    }
    markRange(state.sel, false);
    markRange(next, true);
    state.sel = next;
  }

  function clearSelectionUI() {
    markRange(state.sel, false);
    state.sel = null;
    el.selection.hidden = true;
    el.selection.classList.remove('is-valid');
    el.sumBadge.hidden = true;
    el.sumBadge.classList.remove('is-valid');
  }

  /* ------------------------------------------------------------ 입력 처리 */

  /**
   * 화면 좌표 → 보드 내부 좌표.
   * 회전 상태(rotate(90deg))에서는 보드의 로컬 +x 가 화면의 아래쪽,
   * 로컬 +y 가 화면의 왼쪽을 향하므로 축을 바꿔 계산한다.
   * (이때 boardRect 는 회전된 결과의 축 정렬 사각형이라 width/height 도 뒤바뀐다.)
   */
  function localPoint(e) {
    var r = state.boardRect;
    if (state.rotated) {
      return {
        x: clamp(e.clientY - r.top, 0, r.height),
        y: clamp(r.right - e.clientX, 0, r.width)
      };
    }
    return {
      x: clamp(e.clientX - r.left, 0, r.width),
      y: clamp(e.clientY - r.top, 0, r.height)
    };
  }

  function onPointerDown(e) {
    if (!state.running || state.drag) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;

    state.boardRect = el.board.getBoundingClientRect();
    var p = localPoint(e);
    state.drag = { id: e.pointerId, x0: p.x, y0: p.y, x: p.x, y: p.y, raf: 0 };

    try { el.board.setPointerCapture(e.pointerId); } catch (err) { /* 무시 */ }
    e.preventDefault();
    renderDrag();
  }

  function onPointerMove(e) {
    var d = state.drag;
    if (!d || e.pointerId !== d.id) return;
    e.preventDefault();
    var p = localPoint(e);
    d.x = p.x;
    d.y = p.y;
    if (!d.raf) d.raf = requestAnimationFrame(renderDrag);
  }

  function onPointerUp(e) {
    var d = state.drag;
    if (!d || e.pointerId !== d.id) return;
    e.preventDefault();

    if (d.raf) { cancelAnimationFrame(d.raf); d.raf = 0; }
    var p = localPoint(e);
    d.x = p.x;
    d.y = p.y;

    var sel = computeSelection(d.x0, d.y0, d.x, d.y);
    try { el.board.releasePointerCapture(e.pointerId); } catch (err) { /* 무시 */ }
    state.drag = null;

    if (sel && sel.sum === TARGET) {
      harvest(sel);
    } else {
      clearSelectionUI();
    }
  }

  function onPointerCancel(e) {
    if (!state.drag || e.pointerId !== state.drag.id) return;
    cancelDrag();
    clearSelectionUI();
  }

  function cancelDrag() {
    if (state.drag) {
      if (state.drag.raf) cancelAnimationFrame(state.drag.raf);
      try { el.board.releasePointerCapture(state.drag.id); } catch (err) { /* 무시 */ }
      state.drag = null;
    }
  }

  function renderDrag() {
    var d = state.drag;
    if (!d) return;
    d.raf = 0;

    var left = Math.min(d.x0, d.x);
    var top = Math.min(d.y0, d.y);
    var width = Math.abs(d.x - d.x0);
    var height = Math.abs(d.y - d.y0);

    var box = el.selection;
    box.hidden = false;
    box.style.transform = 'translate3d(' + left + 'px,' + top + 'px,0)';
    box.style.width = width + 'px';
    box.style.height = height + 'px';

    var sel = computeSelection(d.x0, d.y0, d.x, d.y);
    applySelection(sel);

    var valid = !!sel && sel.sum === TARGET;
    box.classList.toggle('is-valid', valid);

    var badge = el.sumBadge;
    if (sel && sel.sum > 0) {
      badge.hidden = false;
      badge.textContent = sel.sum;
      badge.classList.toggle('is-valid', valid);
      badge.style.left = d.x + 'px';
      badge.style.top = d.y + 'px';
    } else {
      badge.hidden = true;
    }
  }

  /* ------------------------------------------------------------ 사과 제거 */

  function harvest(sel) {
    var removed = [];
    for (var r = sel.r1; r <= sel.r2; r++) {
      for (var c = sel.c1; c <= sel.c2; c++) {
        var i = r * COLS + c;
        if (state.values[i] === 0) continue;
        state.values[i] = 0;
        var node = state.apples[i];
        node.classList.remove('is-selected');
        removed.push(node);
      }
    }

    state.sel = null;
    el.selection.hidden = true;
    el.selection.classList.remove('is-valid');
    el.sumBadge.hidden = true;
    el.sumBadge.classList.remove('is-valid');

    if (!removed.length) return;

    state.alive -= removed.length;
    state.score += removed.length;
    el.scoreText.textContent = state.score;

    for (var k = 0; k < removed.length; k++) dropApple(removed[k], k);

    popScore(removed.length, sel);

    if (state.alive === 0) {
      setTimeout(function () { endGame('clear'); }, 450);
    } else if (!B.hasMove(state.values)) {
      setTimeout(function () { endGame('deadlock'); }, 700);
    }
  }

  /** 사과가 화면 밖으로 떨어지는 연출. */
  function dropApple(node, order) {
    node.classList.add('is-falling');

    if (reduceMotion || typeof node.animate !== 'function') {
      node.style.display = 'none';
      return;
    }

    var drift = (Math.random() * 2 - 1) * state.cell * 2.6;
    var spin = (Math.random() * 2 - 1) * 620;
    // 회전 상태에서는 보드 기준 "아래쪽"이 화면의 가로 방향이다.
    var frameH = state.rotated ? window.innerWidth : window.innerHeight;
    var distance = frameH + state.cell * 4;
    var hop = state.cell * (0.5 + Math.random() * 0.35);

    var anim = node.animate([
      {
        transform: 'translate3d(0,0,0) rotate(0deg) scale(1.18)',
        easing: 'cubic-bezier(.22,.9,.4,1)',
        offset: 0
      },
      {
        transform: 'translate3d(' + (drift * 0.18) + 'px,' + (-hop) + 'px,0) rotate(' +
                   (spin * 0.1) + 'deg) scale(1)',
        easing: 'cubic-bezier(.5,0,.85,.5)',
        offset: 0.22
      },
      {
        transform: 'translate3d(' + drift + 'px,' + distance + 'px,0) rotate(' +
                   spin + 'deg) scale(0.92)',
        offset: 1
      }
    ], {
      duration: 950,
      delay: Math.min(order * 18, 140),
      fill: 'forwards'
    });

    anim.onfinish = function () {
      node.style.display = 'none';
      anim.cancel();
    };
  }

  function popScore(amount, sel) {
    var cell = state.cell;
    var cx = (sel.c1 + sel.c2 + 1) / 2 * cell;
    var cy = (sel.r1 + sel.r2 + 1) / 2 * cell;

    var pop = document.createElement('div');
    pop.className = 'score-pop';
    pop.textContent = '+' + amount;
    pop.style.left = cx + 'px';
    pop.style.top = cy + 'px';
    el.board.appendChild(pop);

    if (reduceMotion || typeof pop.animate !== 'function') {
      setTimeout(function () { pop.remove(); }, 500);
      return;
    }

    var anim = pop.animate([
      { transform: 'translate(-50%,-50%) scale(.6)', opacity: 0 },
      { transform: 'translate(-50%,-115%) scale(1.15)', opacity: 1, offset: 0.35 },
      { transform: 'translate(-50%,-210%) scale(1)', opacity: 0 }
    ], { duration: 780, easing: 'cubic-bezier(.2,.8,.3,1)' });

    anim.onfinish = function () { pop.remove(); };
  }

  /* ------------------------------------------------------------ 이벤트 등록 */

  function bind() {
    el.playBtn.addEventListener('click', startGame);
    el.retryBtn.addEventListener('click', startGame);
    el.toTitleBtn.addEventListener('click', goTitle);
    el.homeBtn.addEventListener('click', goTitle);

    el.board.addEventListener('pointerdown', onPointerDown);
    el.board.addEventListener('pointermove', onPointerMove, { passive: false });
    el.board.addEventListener('pointerup', onPointerUp);
    el.board.addEventListener('pointercancel', onPointerCancel);
    el.board.addEventListener('contextmenu', function (e) { e.preventDefault(); });
    el.board.addEventListener('dragstart', function (e) { e.preventDefault(); });

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && el.gameScreen.classList.contains('is-active')) goTitle();
      if (e.key === 'Enter' && el.titleScreen.classList.contains('is-active')) startGame();
    });

    var resizeTimer = 0;
    window.addEventListener('resize', function () {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(function () {
        layout();
        if (el.titleScreen.classList.contains('is-active')) buildGhostField();
      }, 80);
    });

    if (window.ResizeObserver) {
      new ResizeObserver(function () { layout(); }).observe(el.boardWrap);
    }

    window.addEventListener('orientationchange', function () {
      setTimeout(function () {
        layout(true);
        if (el.titleScreen.classList.contains('is-active')) buildGhostField();
      }, 250);
    });
  }

  /* ---------------------------------------------------------------- 시작 */

  function init() {
    el.root.style.setProperty('--apple-ratio', APPLE_RATIO);
    bind();
    buildGhostField();
    updateTitleBest();
    layout();
    showScreen('title');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
