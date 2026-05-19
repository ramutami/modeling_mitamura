import * as THREE from "three";
import { DragControls } from "three/addons/controls/DragControls.js";

//HTMLのboxを持ってくる
const padding=10;
const drawbox = document.getElementById("drawareacentripetal");

//boxのサイズを取得
const width = drawbox.clientWidth-2*padding;
const height = drawbox.clientHeight-2*padding;

//scene,cameraの設定
const scene = new THREE.Scene();
scene.background = new THREE.Color(0xffffff);
const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 1000);
camera.position.set(0, 0, 15);

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
//catmulRom:pk-1,pk,pk+1,pk+2;tk-1,tk+1,tk+2;tから、パラメトリック曲線の座標x(t)を返す関数。
//tk=0と考える。
//パラメタはcentripetal。
function catmullRomcentripetal(pkm1, pk, pkp1, pkp2, tkm1,tkp1,tkp2,t) {

    let lkm1x = 0
    let lkm1y = 0
    let lkm1z = 0

    if (tkm1==0){
        lkm1x = pkm1.x;
        lkm1y = pkm1.y;
        lkm1z = pkm1.z;
    } else {
        lkm1x = (1-(t-tkm1)/(-tkm1))*pkm1.x + ((t-tkm1)/(-tkm1))*pk.x;
        lkm1y = (1-(t-tkm1)/(-tkm1))*pkm1.y + ((t-tkm1)/(-tkm1))*pk.y;
        lkm1z = (1-(t-tkm1)/(-tkm1))*pkm1.z + ((t-tkm1)/(-tkm1))*pk.z;
    }

    const lkx = (1-t/tkp1)*pk.x + (t/tkp1)*pkp1.x;
    const lky = (1-t/tkp1)*pk.y + (t/tkp1)*pkp1.y;
    const lkz = (1-t/tkp1)*pk.z + (t/tkp1)*pkp1.z;

    let lkp1x = 0
    let lkp1y = 0
    let lkp1z = 0
    
    if (tkp2==tkp1){
        lkp1x = pkp2.x;
        lkp1y = pkp2.y;
        lkp1z = pkp2.z;
    } else {
        lkp1x = (1-(t-tkp1)/(tkp2-tkp1))*pkp1.x + ((t-tkp1)/(tkp2-tkp1))*pkp2.x;
        lkp1y = (1-(t-tkp1)/(tkp2-tkp1))*pkp1.y + ((t-tkp1)/(tkp2-tkp1))*pkp2.y;
        lkp1z = (1-(t-tkp1)/(tkp2-tkp1))*pkp1.z + ((t-tkp1)/(tkp2-tkp1))*pkp2.z;
    }

    const qkx = (1-(t-tkm1)/(tkp1-tkm1))*lkm1x+ ((t-tkm1)/(tkp1-tkm1))*lkx;
    const qky = (1-(t-tkm1)/(tkp1-tkm1))*lkm1y+ ((t-tkm1)/(tkp1-tkm1))*lky;
    const qkz = (1-(t-tkm1)/(tkp1-tkm1))*lkm1z+ ((t-tkm1)/(tkp1-tkm1))*lkz;

    const qkp1x = (1-t/tkp2)*lkx+ (t/tkp2)*lkp1x;
    const qkp1y = (1-t/tkp2)*lky+ (t/tkp2)*lkp1y;
    const qkp1z = (1-t/tkp2)*lkz+ (t/tkp2)*lkp1z;

    const x = (1-t/tkp1)*qkx + (t/tkp1)*qkp1x;
    const y = (1-t/tkp1)*qky + (t/tkp1)*qkp1y;
    const z = (1-t/tkp1)*qkz + (t/tkp1)*qkp1z;

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
  const deltat=0.1

  //描画の本体
  //pk~pk+1の間をsamplespersegmentに分割して描画する。
  //pk=p0の時は、pk-1=pk=p0、pk+1=p1,pk+2=p2として処理することにする。
  //この時二次曲線qk(t)はlk(t)になる。また三次曲線はqk=lkとqk+1の補完になる。
  //つまり、p0の点は気持ち直線に収束していく様な感じになる。
  //pk=pN-1の時は、pk+1=pK+2=pNとして処理する。この時p0と同様に考える。
  //パラメタ区分はcentripetalに考える。よって、pkとpk+1の間の距離によってsamplespersegmentを変えればいい。
  //具体的には、samplespersegment=sqrt(|pk+1-pk|)/delta(t)となる。
  for (let i = 0; i < points.length - 1; i++) {
    const pkm1 = points[Math.max(i - 1, 0)];
    const pk = points[i];
    const pkp1 = points[i + 1];
    const pkp2 = points[Math.min(i + 2, points.length - 1)];

    const tkm1 = -Math.sqrt(Math.sqrt((pkm1.x-pk.x)**2 + (pkm1.y-pk.y)**2 + (pkm1.z-pk.z)**2 ))
    const tkp1 = Math.sqrt(Math.sqrt((pkp1.x-pk.x)**2 + (pkp1.y-pk.y)**2 + (pkp1.z-pk.z)**2 ))
    const tkp2 = tkp1 + Math.sqrt(Math.sqrt((pkp1.x-pkp2.x)**2 + (pkp1.y-pkp2.y)**2 + (pkp1.z-pkp2.z)**2 ))

    //端っこの点について、catmullromは0-tkm1,tkp2-tkp1で割る処理が入ってしまうので、これを回避する必要がある。

    const samplesPerSegment = tkp1/deltat
    for (let j = 0; j < samplesPerSegment; j++) {
      const t = j*deltat;
      curvePoints.push(catmullRomcentripetal(pkm1, pk, pkp1, pkp2, tkm1,tkp1,tkp2,t));
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
let reset_button = document.getElementById("resetbtncentripetal");
reset_button.addEventListener("click",reset_mesh);

// スライダー操作による制御点の個数の変更
const slider = document.getElementById("numpointsslidercentripetal");
slider.addEventListener("input", () => {
  const num_points = Number(slider.value);
  createControlPoints(num_points);
  updateCurve();
});
//初期生成
createControlPoints(Number(slider.value));
updateCurve();
animate();
