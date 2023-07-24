const THREE = require('three')
const exportSTL = require('threejs-export-stl')

/**
 * 문자열을 THREE.ExtrudeGeometry로 변환하는 함수
 * @param {object} font - THREE.Font object
 * @param {string} text - 변환할 문자열
 * @param {number} size - 문자 크기
 * @param {boolean} hole - hole 여부 (Chosun 폰트 특이사항)
 * @returns {THREE.ExtrudeGeometry} - 변환된 geometry
 */
exports.stringToGeometry = (font, text, size, hole) => {
  const alignment = 'center';
  const kerning = 0;
  const geometries = [];

  // 각 줄을 배열로 변환
  const lines = text.split('\n').map(s => s.trimEnd());

  // 각 줄의 너비를 계산하여 eachWidth 배열에 저장
  const eachWidth = lines.map(line => getLineWidth(line, font, size, kerning));

  // 각 줄의 정렬 오프셋을 계산하여 linesAlignOffset 배열에 저장
  const linesAlignOffset = getLinesAlignOffset(eachWidth, alignment);

  let lineY = 0;
  for (const [lineIndex, lineText] of lines.entries()) {
    let dx = 0;
    font.forEachGlyph(lineText, 0, 0, size, undefined, (glyph, x, y) => {
      x += dx + linesAlignOffset[lineIndex];

      // ExtrudeGeometry를 생성하기 위한 도형 생성
      const shapes = this.glyphToShapes(glyph, hole);

      // ExtrudeGeometry 설정
      const extrudeSettings = { depth: 1, steps: 1, bevelSize: 0 };

      // ExtrudeGeometry 생성
      const geometry = new THREE.ExtrudeGeometry(shapes, extrudeSettings);

      // 스케일 및 위치 변환 적용
      geometry.applyMatrix(new THREE.Matrix4().makeScale(1 / font.unitsPerEm * size, 1 / font.unitsPerEm * size, 0.1));
      geometry.applyMatrix(new THREE.Matrix4().makeTranslation(x, y - lineY, 0));

      // 생성된 기하 객체를 geometries 배열에 추가
      geometries.push(geometry);
    });
    lineY += size;
  }

  // 첫 번째 기하 객체를 기준으로 나머지 기하 객체를 병합
  const geometry = geometries[0];
  for (const i of geometries.slice(1)) geometry.merge(i);

  return geometry;
}
// 각 줄의 너비를 계산하는 함수
const getLineWidth = (line, font, size, kerning) => {
  let dx = 0;
  let lineWidth = 0;

  font.forEachGlyph(line, 0, 0, size, undefined, (glyph, x) => {
    if (typeof kerning === 'number') {
      dx += kerning;
    } else if (Array.isArray(kerning) && kerning.length > 0) {
      dx += kerning.shift();
    }
    lineWidth = x + dx;
  });

  return lineWidth;
}

// 각 줄의 정렬 오프셋을 계산하는 함수
const getLinesAlignOffset = (eachWidth, alignment) => {
  if (alignment === 'left') {
    return eachWidth.map(() => 0);
  }

  const maxWidth = Math.max(...eachWidth);

  // 중앙 정렬 또는 오른쪽 정렬에 따라 오프셋 계산
  return eachWidth.map(lineWidth => alignment === 'center' ? (maxWidth - lineWidth) / 2 : maxWidth - lineWidth);
}


/**
 * glyphToShapes 함수는 주어진 글리프를 셰이프 및 홀로 변환합니다.
 * 이 함수는 폰트의 글리프 윤곽선을 분석하여 3D 모델링에 사용할 수 있는 셰이프와 홀로 구분합니다.
 *
 * @param {Object} glyph - 변환할 글리프 객체
 * @param {boolean} hole - 홀의 방향을 정의하는 불리언 값. true일 경우, 양의 방향을 홀로 간주하고, false일 경우 음의 방향을 홀로 간주합니다.
 * @return {Array} 변환된 셰이프들의 배열. 각 셰이프는 이후 3D 모델링에 사용됩니다.
 */
exports.glyphToShapes = (glyph, hole) => {
  glyph.getMetrics();
  const shapes = [];
  const holes = [];

  // 글리프의 윤곽선 순회
  for (const contour of glyph.getContours()) {
    const path = new THREE.Path();
    let prev = null;
    let curr = contour[contour.length - 1];
    let next = contour[0];

    // 시작점 설정
    if (curr.onCurve) {
      path.moveTo(curr.x, curr.y);
    } else if (next.onCurve) {
      path.moveTo(next.x, next.y);
    } else {
      const start = { x: (curr.x + next.x) * 0.5, y: (curr.y + next.y) * 0.5 };
      path.moveTo(start.x, start.y);
    }

    // 윤곽선의 각 점을 순회하며 곡선 및 선분 생성
    for (let i = 0; i < contour.length; ++i) {
      prev = curr;
      curr = next;
      next = contour[(i + 1) % contour.length];

      if (curr.onCurve) {
        path.lineTo(curr.x, curr.y);
      } else {
        let prev2 = prev.onCurve ? prev : { x: (curr.x + prev.x) * 0.5, y: (curr.y + prev.y) * 0.5 };
        let next2 = next.onCurve ? next : { x: (curr.x + next.x) * 0.5, y: (curr.y + next.y) * 0.5 };

        if (!prev.onCurve) {
          path.lineTo(prev2.x, prev2.y);
        }

        path.quadraticCurveTo(curr.x, curr.y, next2.x, next2.y);
      }
    }

    // 윤곽선 닫기
    path.closePath();

    // 윤곽선의 방향을 이용해 홀(holes)과 셰이프(shapes) 분류
    const sum = contour.reduce((acc, point, index) => {
      const lastPoint = contour[index === 0 ? contour.length - 1 : index - 1];
      return acc + (lastPoint.x - point.x) * (point.y + lastPoint.y);
    }, 0);

    if (hole == true) { // 일반폰트

      if(sum > 0) {
        // 영문폰트는 획이 1개 또는 2개 나온다음 hole이 온다는 사실을 가정으로 만듦
        shapes[0]?.holes.push(path)
      } else {
        const shape = new THREE.Shape();
        shape.add(path);
        shapes.push(shape);
      }
      
    } else { // Chosun 애들
      
      if (sum < 0) {
        // Chosun 폰트인 경우에만 해당, hole이 나왔을때 바로 직전의 채움에만 구멍을 넣어서 중복을 방지
        if(glyph.index == 7073) { // 7073 : 응
          shapes[shapes.length - 2]?.holes.push(path)
        } else if (glyph.index == 7090){ // 7090 : 응
          (shapes.length == 2) ? (shapes[shapes.length - 2]?.holes.push(path)) : (shapes[shapes.length - 1]?.holes.push(path))
        } else {
          shapes[shapes.length - 1]?.holes.push(path)
        }
      } else {
        const shape = new THREE.Shape();
        shape.add(path);
        shapes.push(shape);
      }
    }
  }

  // 셰이프에 홀 추가
  return shapes;
}


/**
 * geometryToSTL 함수는 주어진 3D 기하 객체(THREE.Geometry 또는 THREE.BufferGeometry)를 STL 파일 형식의 데이터로 변환합니다.
 *
 * @param {THREE.Geometry | THREE.BufferGeometry} geometry - STL 데이터로 변환할 3D 기하 객체입니다.
 * @return {string | ArrayBuffer} 변환된 STL 데이터입니다. STLExporter의 binary 옵션에 따라 문자열 또는 ArrayBuffer로 반환됩니다.
 */
exports.geometryToSTL = (geometry) => {
  const tmp = geometry.type;
  geometry.type = 'Geometry';
  const data = exportSTL.fromGeometry(geometry);
  geometry.type = tmp;
  return data;
}