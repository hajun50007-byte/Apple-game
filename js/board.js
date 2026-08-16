/*
 * board.js — 사과게임(Fruit Box) 보드 모델
 *
 * 순수 로직만 담당한다(DOM 의존 없음).
 *  - 18 x 9 = 162칸 보드 생성
 *  - 직사각형 영역 합계 계산
 *  - "합이 10인 직사각형"이 남아있는지 판정(교착 상태 감지)
 *
 * 브라우저에서는 window.FruitBoxBoard, node에서는 module.exports 로 노출된다.
 */
(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  } else {
    root.FruitBoxBoard = api;
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var COLS = 18;
  var ROWS = 9;
  var TARGET = 10;
  var MIN_VALUE = 1;
  var MAX_VALUE = 9;

  function index(col, row) {
    return row * COLS + col;
  }

  /** 1~9 랜덤 값으로 채운 보드를 만든다. */
  function fill(rng) {
    var values = new Int8Array(COLS * ROWS);
    for (var i = 0; i < values.length; i++) {
      values[i] = MIN_VALUE + Math.floor(rng() * (MAX_VALUE - MIN_VALUE + 1));
    }
    return values;
  }

  /**
   * 시작 보드를 만든다. 만들 수 있는 조합이 하나도 없는 보드는 버리고 다시 만든다.
   * (랜덤 18x9 보드는 거의 항상 조합이 존재하므로 재시도는 사실상 일어나지 않는다.)
   */
  function createBoard(rng) {
    var random = rng || Math.random;
    for (var attempt = 0; attempt < 50; attempt++) {
      var values = fill(random);
      if (hasMove(values)) return values;
    }
    return fill(random);
  }

  /** (cols+1) x (rows+1) 크기의 2차원 누적합 테이블. */
  function prefixSums(values) {
    var w = COLS + 1;
    var p = new Int32Array(w * (ROWS + 1));
    for (var r = 0; r < ROWS; r++) {
      for (var c = 0; c < COLS; c++) {
        p[(r + 1) * w + (c + 1)] =
          values[r * COLS + c] +
          p[r * w + (c + 1)] +
          p[(r + 1) * w + c] -
          p[r * w + c];
      }
    }
    return p;
  }

  /** [c1..c2] x [r1..r2] 직사각형(양끝 포함)의 합. */
  function rectSum(values, c1, r1, c2, r2) {
    var sum = 0;
    for (var r = r1; r <= r2; r++) {
      for (var c = c1; c <= c2; c++) sum += values[r * COLS + c];
    }
    return sum;
  }

  /**
   * 합이 정확히 TARGET 인 직사각형이 하나라도 남아 있는지 검사한다.
   * 값이 모두 0 이상이므로, 오른쪽으로 넓히다 합이 TARGET 을 넘으면 즉시 중단할 수 있다.
   */
  function hasMove(values) {
    var w = COLS + 1;
    var p = prefixSums(values);
    for (var r1 = 0; r1 < ROWS; r1++) {
      for (var r2 = r1; r2 < ROWS; r2++) {
        var top = r1 * w;
        var bottom = (r2 + 1) * w;
        for (var c1 = 0; c1 < COLS; c1++) {
          for (var c2 = c1; c2 < COLS; c2++) {
            var sum =
              p[bottom + (c2 + 1)] - p[top + (c2 + 1)] - p[bottom + c1] + p[top + c1];
            if (sum === TARGET) return true;
            if (sum > TARGET) break;
          }
        }
      }
    }
    return false;
  }

  /** 남아 있는(값이 0이 아닌) 사과 개수. */
  function countAlive(values) {
    var n = 0;
    for (var i = 0; i < values.length; i++) if (values[i] !== 0) n++;
    return n;
  }

  return {
    COLS: COLS,
    ROWS: ROWS,
    TARGET: TARGET,
    TOTAL: COLS * ROWS,
    index: index,
    createBoard: createBoard,
    rectSum: rectSum,
    hasMove: hasMove,
    countAlive: countAlive
  };
});
