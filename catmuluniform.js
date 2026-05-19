import * as THREE from "three";
import { DragControls } from "three/addons/controls/DragControls.js";

//HTMLのboxを持ってくる
const padding=10;
const drawbox = document.getElementById("drawarea");

//boxのサイズを取得
const width = drawbox.clientWidth-2*padding;
const height = drawbox.clientHeight-2*padding;

//scene,cameraの設定
const scene = new THREE.Scene();
scene.background = new THREE.Color(0xffffff);
const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 1000);
camera.position.set(0, 0, 25);

//Threeのrendererを持ってくる
const renderer = new THREE.WebGLRenderer();
renderer.setSize(width, height);

//boxにrendererの描画物をこう、入れる感じ
drawbox.appendChild(renderer.domElement);
// renderer.setClearColor(0x000000, 0);

//制御点の実装(createControlPointsを呼ぶたびに、スライダで指定した制御点の数に応じて初期配置の制御点を描画する。)
const initialCoords=[];
const controlPoints=[];
const pointMeshes = [];
//形状
const pointGeometry = new THREE.SphereGeometry(0.12, 32, 32);
const pointMaterial = new THREE.MeshBasicMaterial({ color: 0xff3333 });
function createControlPoints(num_points){
  for (const mesh of pointMeshes) {
    scene.remove(mesh);
  }
  controlPoints.length = 0;
  initialCoords.length = 0;
  pointMeshes.length = 0;
  for (let i = -8; i < -8+num_points; i++){
  controlPoints.push(new THREE.Vector3(i,0,0));
  initialCoords.push(new THREE.Vector3(i,0,0));
  }
  for (const p of controlPoints){
  const mesh = new THREE.Mesh(pointGeometry, pointMaterial);
  mesh.position.copy(p);
  //制御点をsceneに加える。
  scene.add(mesh);
  //制御点をpointMeshesに格納
  pointMeshes.push(mesh);
  }
}

//制御点の座標からパラメトリック曲線を計算する関数
//catmulRom:pk-1,pk,pk+1,pk+2;tから、パラメトリック曲線の座標x(t)を返す関数。
//パラメタはユニフォーム。
function catmullRomuniform(pkm1, pk, pkp1, pkp2, t) {
  const t2 = t * t;
  const t3 = t2 * t;

  const x = 0.5*(
    t3*(-1*pkm1.x+3*pk.x-3*pkp1.x+pkp2.x)+
    t2*(2*pkm1.x-5*pk.x+4*pkp1.x-pkp2.x)+
    t*(-pkm1.x+pkp1.x)+
    2*pk.x
  );

  const y = 0.5*(
    t3*(-1*pkm1.y+3*pk.y-3*pkp1.y+pkp2.y)+
    t2*(2*pkm1.y-5*pk.y+4*pkp1.y-pkp2.y)+
    t*(-pkm1.y+pkp1.y)+
    2*pk.y
  );

  const z = 0.5*(
    t3*(-1*pkm1.z+3*pk.z-3*pkp1.z+pkp2.z)+
    t2*(2*pkm1.z-5*pk.z+4*pkp1.z-pkp2.z)+
    t*(-pkm1.z+pkp1.z)+
    2*pk.z
  );

  return new THREE.Vector3(x, y, z);
}

// 制御点の座標からパラメトリック曲線を計算する関数
let curveLine = null; //曲線。geometryとmatrialを定める必要がある。
function updateCurve() {
  const points = pointMeshes.map(mesh => mesh.position.clone());

  //まず、curveLineを消す。
  if (curveLine !== null) {
    scene.remove(curveLine);
    curveLine.geometry.dispose();
    curveLine.material.dispose();
    curveLine = null;
  }

  const curvePoints = [];
  const samplesPerSegment = 30;

  //描画の本体
  //pk~pk+1の間をsamplespersegmentに分割して描画する。
  //pk=p0の時は、pk-1=pk=p0、pk+1=p1,pk+2=p2として処理することにする。
  //この時二次曲線qk(t)はlk(t)になる。また三次曲線はqk=lkとqk+1の補完になる。
  //つまり、p0の点は気持ち直線に収束していく様な感じになる。
  //pk=pN-1の時は、pk+1=pK+2=pNとして処理する。この時p0と同様に考える。
  //パラメタ区分はユニフォームに考える。
  for (let i = 0; i < points.length - 1; i++) {
    const pk_1 = points[Math.max(i - 1, 0)];
    const pk = points[i];
    const pkp1 = points[i + 1];
    const pkp2 = points[Math.min(i + 2, points.length - 1)];

    for (let j = 0; j < samplesPerSegment; j++) {
      const t = j / samplesPerSegment;
      curvePoints.push(catmullRomuniform(pk_1, pk, pkp1, pkp2, t));
    }
  }
  //一番最後の点
  curvePoints.push(points[points.length - 1].clone());

  const curveGeometry = new THREE.BufferGeometry().setFromPoints(curvePoints);
  const curveMaterial = new THREE.LineBasicMaterial({
    color: 0x0066ff,
    linewidth: 3
  });
  curveLine = new THREE.Line(curveGeometry, curveMaterial);
  scene.add(curveLine);
}

//ドラッグ操作で制御点を動かせるようにする。
const dragControls = new DragControls(pointMeshes, camera, renderer.domElement);

//ドラッグするたびにパラメトリック曲線をアップデート
dragControls.addEventListener("drag", () => {
    updateCurve();
});

//描画関数
function animate(){
  requestAnimationFrame(animate);
  renderer.render(scene,camera);
}

//点の位置をリセットする関数
function reset_mesh(){
  for (let i = 0;i<pointMeshes.length;i++){
    pointMeshes[i].position.copy(initialCoords[i]);
  }
  updateCurve();
}
let reset_button = document.getElementById("resetbtn");
reset_button.addEventListener("click",reset_mesh);

// スライダー操作による制御点の個数の変更
const slider = document.getElementById("numpointsslider");
slider.addEventListener("input", () => {
  const num_points = Number(slider.value);
  createControlPoints(num_points);
  updateCurve();
});
//初期生成
createControlPoints(Number(slider.value));
updateCurve();
animate();
