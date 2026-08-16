/*
 * 보드 로직 테스트:  node tests/board.test.js
 */
'use strict';

var B = require('../js/board.js');

var passed = 0;
var failed = 0;

function check(name, condition) {
  if (condition) {
    passed++;
  } else {
    failed++;
    console.error('  ✗ ' + name);
  }
}

/** hasMove 의 정답(완전 탐색 버전). */
function bruteHasMove(values) {
  for (var r1 = 0; r1 < B.ROWS; r1++) {
    for (var r2 = r1; r2 < B.ROWS; r2++) {
      for (var c1 = 0; c1 < B.COLS; c1++) {
        for (var c2 = c1; c2 < B.COLS; c2++) {
          if (B.rectSum(values, c1, r1, c2, r2) === B.TARGET) return true;
        }
      }
    }
  }
  return false;
}

/* ---- 상수 ---- */
check('보드는 18 x 9 = 162칸', B.COLS === 18 && B.ROWS === 9 && B.TOTAL === 162);
check('목표 합은 10', B.TARGET === 10);

/* ---- 생성 ---- */
var board = B.createBoard();
check('생성된 보드 길이는 162', board.length === 162);

var inRange = true;
for (var i = 0; i < board.length; i++) {
  if (board[i] < 1 || board[i] > 9) inRange = false;
}
check('모든 칸의 값은 1~9', inRange);
check('시작 보드에는 최소 한 개의 조합이 존재', B.hasMove(board));
check('시작 보드의 남은 사과는 162개', B.countAlive(board) === 162);

/* ---- rectSum ---- */
var flat = new Int8Array(162);
flat.fill(1);
check('1로 채운 보드의 2x5 합은 10', B.rectSum(flat, 0, 0, 4, 1) === 10);
check('1로 채운 보드의 1x1 합은 1', B.rectSum(flat, 3, 4, 3, 4) === 1);

/* ---- hasMove: 완전 탐색과 1000개 랜덤 보드 대조 ---- */
var mismatch = 0;
for (var t = 0; t < 1000; t++) {
  var v = new Int8Array(162);
  for (var j = 0; j < v.length; j++) {
    // 0(제거된 칸)도 섞어 게임 진행 중 상태를 흉내낸다.
    v[j] = Math.random() < 0.6 ? 0 : 1 + Math.floor(Math.random() * 9);
  }
  if (B.hasMove(v) !== bruteHasMove(v)) mismatch++;
}
check('hasMove 가 완전 탐색과 1000회 모두 일치', mismatch === 0);

/* ---- hasMove: 조합이 전혀 없는 보드 ---- */
var noMove = new Int8Array(162);   // 전부 0
check('빈 보드에는 조합이 없다', B.hasMove(noMove) === false);

noMove[0] = 9;                     // 9 하나만 남은 보드
check('9 한 개만 남으면 조합이 없다', B.hasMove(noMove) === false);

noMove[1] = 1;                     // 9 옆에 1 → 가로 2칸 합 10
check('9 옆에 1이 있으면 조합이 있다', B.hasMove(noMove) === true);

/* ---- hasMove: 세로 조합도 찾는지 ---- */
var vertical = new Int8Array(162);
vertical[0] = 4;
vertical[B.COLS] = 6;
check('세로 조합도 찾는다', B.hasMove(vertical) === true);

/* ---- hasMove: 떨어져 있는 두 칸은 사이의 0을 포함해 직사각형이 된다 ---- */
var spaced = new Int8Array(162);
spaced[0] = 7;
spaced[5] = 3;
check('사이가 비어 있어도 직사각형 합이 10이면 조합', B.hasMove(spaced) === true);

console.log(failed === 0
  ? '통과 ' + passed + '개 — 모든 테스트 성공'
  : '통과 ' + passed + '개 / 실패 ' + failed + '개');

process.exit(failed === 0 ? 0 : 1);
