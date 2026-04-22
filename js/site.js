import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { Timer } from 'three/addons/misc/Timer.js';
import { ViewportGizmo } from "three-viewport-gizmo"; //Cube at the bottom left to set certain views
import Stats from 'stats';//Displays the current fps of the animation

// 1. Stats Setup
const stats = new Stats();
document.body.appendChild(stats.dom);

// 2. Scene Setup
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x87CEEB);//Color of 'sky'. Currently blue
scene.fog = new THREE.Fog(0xe0e0e0, 10, 50);//Color of fog. Currently gray

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

// Floor
const mesh = new THREE.Mesh(
  new THREE.PlaneGeometry(100, 100),
  new THREE.MeshPhongMaterial({ color: 0x00ffff, depthWrite: false }) //color of floor. Currently 'aqua'
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

// 7. Animation & State Global Variables
let mixer;
let animationAction;
let currentPlaybackSpeed = 1.0; // Keep track of speed state
const timer = new Timer();

let traceHandsMesh = null; // Will hold reference to the "Trace_Hands" mesh
let waterMesh = null; // Will hold reference to the "Water" mesh

// 8. Load Model
const loader = new GLTFLoader();

// Set the meshopt decoder so it can read compressed data
loader.setMeshoptDecoder(MeshoptDecoder);

loader.load(
  './3D_Assets/swimmer.glb',
  (gltf) => {
    const model = gltf.scene;
    console.log('Model loaded:', model);

    // Grab elements used for initial visibility
    const traceHandsToggle = document.getElementById('traceHandsToggle');
    const waterToggle = document.getElementById('waterToggle');

    // Setup Mesh references and align visibility with toggles defaults
    traceHandsMesh = model.getObjectByName('Trace_Hands');
    // Trace_Hands toggle is UNCHECKED by default, thus mesh is HIDDEN on load
    if (traceHandsMesh) traceHandsMesh.visible = traceHandsToggle.checked;
    
    waterMesh = model.getObjectByName('Water');
    // Water toggle is CHECKED by default, thus mesh is VISIBLE on load
    if (waterMesh) waterMesh.visible = waterToggle.checked;

    // Position the camera for a nice isometric view of the swimmer on page load
    // 1. Determine a safe viewing distance.
    let baseDistance = 3.0;

    // 2. Adjust for mobile (portrait screens) so the swimmer isn't cut off horizontally
    if (camera.aspect < 1.0) {
      baseDistance /= camera.aspect;
      baseDistance *= 0.85; // Slight tweak so it doesn't zoom out too aggressively
    }

    // 3. Define the center of the swimmer (1.3 meter along the X axis). This will be the location where the camera aims at.
    // This step is needed because the swimmer's origin is right between his feet. We need to move along the x-axis to the center of the body (i.e. about 1.3m)
    const targetPos = new THREE.Vector3(1.3, 0, 0);

    // 4. Calculate the specific angle direction (+45 deg X, +45 deg Y equivalent)
    // The vector (1, 1, 1) perfectly gives us an isometric view on Top, Front, and Right.
    const dir = new THREE.Vector3(1, 1, 1).normalize();

    // 5. Apply position to camera: 
    // We start at the targetPos (1.3, 0, 0) and push the camera backwards along our perfect diagonal direction
    camera.position.copy(targetPos).addScaledVector(dir, baseDistance);

    // Tell the orbit controls to pivot perfectly around the swimmer's center
    controls.target.copy(targetPos);

    // Orient camera to look exactly at the swimmer's center, not (0,0,0)
    camera.lookAt(targetPos);
    controls.update();

    // Enable shadow casting and receiving
    model.traverse((object) => {
      if (object.isMesh) {
        object.castShadow = true;
        object.receiveShadow = true;
      }
    });

    scene.add(model);

    //Load the first animation of model and play it
    if (gltf.animations && gltf.animations.length > 0) {
      mixer = new THREE.AnimationMixer(model);
      animationAction = mixer.clipAction(gltf.animations[0]);
      animationAction.timeScale = currentPlaybackSpeed; // Apply speed on load
      animationAction.play();
    }

    document.getElementById('loading').style.display = 'none';
  },
  (xhr) => {
    console.log(`${(xhr.loaded / xhr.total * 100).toFixed(2)}% loaded`);
  },
  (error) => {
    console.error('An error happened', error);
    document.getElementById('loading').innerText = 'Error loading model.';
  }
);

// 9. Playback Controls & Settings Integration

// Basic Controls
const playPauseBtn = document.getElementById('playPauseBtn');
const stepForwardBtn = document.getElementById('stepForwardBtn');
const stepBackwardBtn = document.getElementById('stepBackwardBtn');
const settingsBtn = document.getElementById('settingsBtn');

// Settings Menu Elements
const settingsMenu = document.getElementById('settingsMenu');
const traceHandsToggle = document.getElementById('traceHandsToggle');
const waterToggle = document.getElementById('waterToggle');
const currentSpeedDisplay = document.getElementById('currentSpeedDisplay');
const speedSlider = document.getElementById('speedSlider');
const speedMinusBtn = document.getElementById('speedMinusBtn');
const speedPlusBtn = document.getElementById('speedPlusBtn');
const speedPresets = document.querySelectorAll('.speed-preset');

// --- Toggling Settings Popup ---
settingsBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  settingsMenu.classList.toggle('visible');
});

// Close Settings Menu when clicking outside of it
document.addEventListener('click', (e) => {
  // Only close if the click is outside both the menu and the button that opens it
  if (settingsMenu.classList.contains('visible') && !settingsMenu.contains(e.target) && !settingsBtn.contains(e.target)) {
    settingsMenu.classList.remove('visible');
  }
});

// Prevent menu close when interacting with sliders/toggles inside it
settingsMenu.addEventListener('click', (e) => {
  e.stopPropagation();
});


// --- Settings Adjustments ---

// Mesh Toggles
traceHandsToggle.addEventListener('change', (e) => {
  if (traceHandsMesh) traceHandsMesh.visible = e.target.checked;
});

waterToggle.addEventListener('change', (e) => {
  if (waterMesh) waterMesh.visible = e.target.checked;
});

// Speed Configuration
function updateSpeed(newSpeed) {
  // Clamp values strictly between limits 0.1 and 1
  newSpeed = Math.max(0.1, Math.min(1, newSpeed));

  currentPlaybackSpeed = newSpeed;
  speedSlider.value = newSpeed;
  currentSpeedDisplay.innerText = newSpeed.toFixed(2) + 'x';

  // Apply directly to the animation
  if (animationAction) {
    animationAction.timeScale = currentPlaybackSpeed;
  }

  // Highlight the respective preset pill button, if one perfectly matches
  speedPresets.forEach(btn => {
    if (parseFloat(btn.getAttribute('data-speed')) === newSpeed) {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }
  });
}

// Slider Drag Update
speedSlider.addEventListener('input', (e) => {
  updateSpeed(parseFloat(e.target.value));
});

// Step Increment Update Buttons (+ / -)
speedMinusBtn.addEventListener('click', () => {
  updateSpeed(parseFloat(speedSlider.value) - 0.05);
});

speedPlusBtn.addEventListener('click', () => {
  updateSpeed(parseFloat(speedSlider.value) + 0.05);
});

// Specific Preset Pill Buttons
speedPresets.forEach(btn => {
  btn.addEventListener('click', () => {
    updateSpeed(parseFloat(btn.getAttribute('data-speed')));
  });
});

// --- Play / Pause Logic ---
playPauseBtn.addEventListener('click', () => {
  if (!animationAction) return; // Prevent errors if clicked before model loads

  // Toggle paused state
  animationAction.paused = !animationAction.paused; //Set 'animationAction.paused' to the opposite of what it was before this line of code.

  // Update UI classes (Step forward/backward buttons are automatically shown/hidden via CSS classes here)
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
  // console.log(animationAction.time);
  let newTime = animationAction.time + stepAmount;

  // Loop back around gracefully when stepping past start or end bounds
  newTime = ((newTime % duration) + duration) % duration;
  /* Examples for the code line above. Assumption: Clip length is 3s, stepAmount is 0.1s
  Example 1: Animation is currently at 2.8s
    newTime = animationAction.time + stepAmount = 2.8s + 0.1s = 2.9s
    newTime = ((newTime % duration) + duration) % duration = ((2.9s % 3s) + 3s) % 3s = (2.9s + 3s) % 3s = 5.9s % 3s
    newTime = 2.9s
  Example 2: Animation is currently at 2.95s
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
// The code below tells the browser to take a picture of the 3D scene 60 times a second (or whatever the refresh rate of the monitor is)
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

  // 3. Update the orbit controls (needed to update the viewport gizmo)
  controls.update();

  // 4. Take the picture (render the current position of the 3D model to the screen)
  renderer.render(scene, camera);

  // 5. Render the viewport gizmo
  gizmo.render();
}

// Start the loop
requestAnimationFrame(animate);