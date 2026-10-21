import * as THREE from './vendor/three/three.module.js';

const pts5 = [[-6.0, 1.00, 2.7], [-3.4, 2.20, 2.4], [-0.5, 1.40, 2.05], [2.8, 2.55, 1.65], [6.0, 1.35, 1.3]];
const curve = new THREE.CatmullRomCurve3(pts5.map(p => new THREE.Vector3(...p)), false, 'catmullrom', 0.5);
const segs = 340;
const frames = curve.computeFrenetFrames(segs, false);
const pts = curve.getSpacedPoints(segs);
const ref = new THREE.Vector3(0, 0.52, 1).normalize();

const angles = pts.map((P, i) => {
  const T = frames.tangents[i];
  const D = ref.clone().addScaledVector(T, -ref.dot(T));
  if (D.lengthSq() < 1e-6) D.copy(frames.normals[i]);
  D.normalize();
  return Math.atan2(D.dot(frames.binormals[i]), D.dot(frames.normals[i]));
});

const fmt = v => `(${v.x.toFixed(2)}, ${v.y.toFixed(2)}, ${v.z.toFixed(2)})`;
for (const i of [1, 85, 170, 255, 339]) {
  const a = angles[i];
  const N = frames.normals[i], B = frames.binormals[i], T = frames.tangents[i];
  const center = new THREE.Vector3().addScaledVector(N, Math.cos(a)).addScaledVector(B, Math.sin(a));
  const windowSpan = [a - 1.3, a + 1.3].map(x =>
    new THREE.Vector3().addScaledVector(N, Math.cos(x)).addScaledVector(B, Math.sin(x)));
  console.log(`i=${i} P=${fmt(pts[i])} T=${fmt(T)}`);
  console.log(`   N=${fmt(N)} B=${fmt(B)} angle=${(a * 180 / Math.PI).toFixed(1)}deg`);
  console.log(`   window-center dir=${fmt(center)}   lower lip=${fmt(windowSpan[0])} upper lip=${fmt(windowSpan[1])}`);
}

// camera direction as used by the close-up shot
const target = new THREE.Vector3(-0.9, 1.75, 2.0);
const r = 5.0, phi = 1.20, theta = 0.15;
const cam = new THREE.Vector3(
  target.x + r * Math.sin(phi) * Math.sin(theta),
  target.y + r * Math.cos(phi),
  target.z + r * Math.sin(phi) * Math.cos(theta)
);
const at = pts[170];
const viewDir = cam.clone().sub(at).normalize();
console.log(`\ncloseup camera=${fmt(cam)}  point@170=${fmt(at)}  dirToCamera=${fmt(viewDir)}`);
const a170 = angles[170];
const c170 = new THREE.Vector3()
  .addScaledVector(frames.normals[170], Math.cos(a170))
  .addScaledVector(frames.binormals[170], Math.sin(a170));
console.log(`window normal@170=${fmt(c170)}  dot(cameraDir)=${c170.dot(viewDir).toFixed(3)}`);
