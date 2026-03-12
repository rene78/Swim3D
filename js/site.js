import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { Timer } from 'three/addons/misc/Timer.js';
import { ViewportGizmo } from "three-viewport-gizmo"; //Cube at the bottom left to set certain views
import Stats from 'stats';//Displays the current fps of the animation

// 1. Stats Setup
const stats = new Stats();
document.body.appendChild(stats.dom);

// 2. Scene Setup
const scene = new THREE.Scene();
scene.background = new THREE.Color(0xe0e0e0);
scene.fog = new THREE.Fog(0xe0e0e0, 10, 50);

// 3. Camera Setup
const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 100);
camera.position.set(0, 2, 5);

// 4. Renderer Setup
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(window.devicePixelRatio);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap; // Softer shadow edges

// Crucial for .glb models so colors don't look washed out:
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping; // More realistic lighting
document.body.appendChild(renderer.domElement);

// 5. Lighting
const hemiLight = new THREE.HemisphereLight(0xffffff, 0x444444, 1.5);
hemiLight.position.set(0, 20, 0);
scene.add(hemiLight);

const dirLight = new THREE.DirectionalLight(0xffffff, 1.5);
dirLight.position.set(3, 10, 10);
dirLight.castShadow = true;

// Increase shadow resolution and area
dirLight.shadow.mapSize.width = 1024;
dirLight.shadow.mapSize.height = 1024;
dirLight.shadow.camera.top = 5;
dirLight.shadow.camera.bottom = -5;
dirLight.shadow.camera.left = -5;
dirLight.shadow.camera.right = 5;
scene.add(dirLight);

// Floor
const mesh = new THREE.Mesh(
  new THREE.PlaneGeometry(100, 100),
  new THREE.MeshPhongMaterial({ color: 0xcbcbcb, depthWrite: false })
);
mesh.rotation.x = -Math.PI / 2;
mesh.receiveShadow = true;
scene.add(mesh);

// 6. Controls
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.target.set(0, 1, 0);

//Initialize viewport gizmo
const gizmo = new ViewportGizmo(camera, renderer, {
  type: "cube",
  placement: "bottom-left"
});
gizmo.attachControls(controls);

// 7. Animation Global Variables
let mixer;
let animationAction;
const timer = new Timer();

// 8. Load Model
const loader = new GLTFLoader();

loader.load(
  'swimmer.glb',
  (gltf) => {
    const model = gltf.scene;

    model.traverse((object) => {
      if (object.isMesh) {
        object.castShadow = true;
        object.receiveShadow = true;
      }
    });

    scene.add(model);

    if (gltf.animations && gltf.animations.length > 0) {
      mixer = new THREE.AnimationMixer(model);
      animationAction = mixer.clipAction(gltf.animations[0]);
      animationAction.play();
    }

    document.getElementById('loading').style.display = 'none';
  },
  (xhr) => {
    console.log(`${(xhr.loaded / xhr.total * 100).toFixed(2)}% loaded`); // Cleaner logging
  },
  (error) => {
    console.error('An error happened', error);
    document.getElementById('loading').innerText = 'Error loading model.';
  }
);

// 9. Playback Controls
const playPauseBtn = document.getElementById('playPauseBtn');
const stepForwardBtn = document.getElementById('stepForwardBtn');
const stepBackwardBtn = document.getElementById('stepBackwardBtn');

playPauseBtn.addEventListener('click', () => {
  if (!animationAction) return; // Prevent errors if clicked before model loads

  // Toggle paused state
  animationAction.paused = !animationAction.paused; //Set .paused to the opposite of what it was before this line of code.

  // Update UI classes
  if (animationAction.paused) {
    playPauseBtn.classList.replace('pause', 'play');
    playPauseBtn.setAttribute('title', 'Play animation');
    stepForwardBtn.classList.add('visible');
    stepBackwardBtn.classList.add('visible');
  } else {
    playPauseBtn.classList.replace('play', 'pause');
    playPauseBtn.setAttribute('title', 'Pause animation');
    stepForwardBtn.classList.remove('visible');
    stepBackwardBtn.classList.remove('visible');
  }
});

function stepAnimation(stepAmount) {
  if (!animationAction || !mixer) return;

  const duration = animationAction.getClip().duration;
  console.log(animationAction.time);
  let newTime = animationAction.time + stepAmount;

  // Loop back around gracefully when stepping past start or end bounds
  newTime = ((newTime % duration) + duration) % duration;
  /* Examples for the code line above. Assumption: Clip length is 3s, stepAmount is 0.1s
  1. Animation is currently at 2.8s
    newTime = animationAction.time + stepAmount = 2.8s + 0.1s = 2.9s
    newTime = ((newTime % duration) + duration) % duration = ((2.9s % 3s) + 3s) % 3s = (2.9s + 3s) % 3s = 5.9s % 3s
    newTime = 2.9s
  2. Animation is currently at 2.95s
    newTime = animationAction.time + stepAmount = 2.95s + 0.1s = 3.05s
    newTime = ((newTime % duration) + duration) % duration = ((3.05s % 3s) + 3s) % 3s = (0.05s + 3s) % 3s = 3.05s % 3s
    newTime = 0.05s
  */

  animationAction.time = newTime;

  // Force animation mixer to evaluate the new current time instantly so the screen updates
  mixer.update(0);
}

stepForwardBtn.addEventListener('click', () => stepAnimation(0.01));
stepBackwardBtn.addEventListener('click', () => stepAnimation(-0.01));


// Window Resize Handling
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  gizmo.update();
});

// 10. Animation Loop
function animate(timestamp) {
  // 1. Tell the browser to run THIS function again on the next frame
  // "requestAnimationFrame" is built into the web browser. Its only job is to say to the browser:
  // "Hey, right before you draw the next picture on the screen, please run this specific block of code, i.e. the 'animate' function"

  requestAnimationFrame(animate);

  //Update the fps stats
  stats.update();

  // Update the timer with the native timestamp
  timer.update(timestamp);

  // Get the safe delta
  const delta = timer.getDelta();

  // 2. Move the swimmer model forward a tiny bit
  if (mixer) mixer.update(delta);

  controls.update();

  // 3. Take the picture (render the current position of the 3D model to the screen)
  renderer.render(scene, camera);

  // 4. Render the viewport gizmo
  gizmo.render();
}

// Start the loop
requestAnimationFrame(animate);