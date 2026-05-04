import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'; //GLTFLoader is a utility provided by Three.js to load 3D models in the GLTF/GLB format.
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js'; //Meshoptimizer is a library for compressing 3D geometry data, which helps reduce file sizes and improve loading times for complex models. By using the MeshoptDecoder, we can efficiently decode compressed geometry data in .glb files, allowing for faster loading and smoother performance when rendering the swimmer model.
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'; //Allows the user to rotate, zoom, and pan the camera around the scene using mouse or touch input, providing an interactive way to explore the 3D model.
import { Timer } from 'three/addons/misc/Timer.js'; //Utility for tracking time and calculating deltas between frames, which is essential for smooth animations that are independent of frame rate.
import { ViewportGizmo } from "three-viewport-gizmo"; //Cube at the bottom left to set certain views
import Stats from 'stats';//Displays the current fps of the animation

// Post-Processing Imports
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js'; //EffectComposer is a utility that allows us to apply post-processing effects (like bloom/glow) to the rendered scene.
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js'; //RenderPass is a specific type of pass that renders the scene as-is, which can then be used as the base for further post-processing effects.
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js'; //UnrealBloomPass is a specific post-processing effect that creates a bloom/glow around bright areas of the scene, which we will use to make the water look like it's glowing.

// 1. Stats Setup
const stats = new Stats();
document.body.appendChild(stats.dom);

// 2. Scene Setup
const scene = new THREE.Scene(); // This is the container that holds all the 3D objects, lights, and cameras. Think of it as the "stage" where everything happens.

// 3. Camera Setup
// PerspectiveCamera mimics the way the human eye sees the world, with objects appearing smaller as they are farther away.
const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 100); // FOV, Aspect Ratio, Near Clipping, Far Clipping
camera.position.set(0, 2, 5); // Start with a default position. We'll adjust this later once we know the model's dimensions to get a perfect isometric view.

// 4. Renderer Setup
// WebGLRenderer is the most common renderer that uses the GPU for fast rendering of 3D graphics. It creates a canvas element in the HTML where the 3D scene will be drawn.
const renderer = new THREE.WebGLRenderer();
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(window.devicePixelRatio);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap; // Softer shadow edges

// Crucial for .glb models so colors don't look washed out:
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping; // More realistic lighting
document.body.appendChild(renderer.domElement);

// 4b. Post-Processing setup (Bloom / Glow)

// 1. Get the size and pixel ratio
const size = renderer.getSize(new THREE.Vector2());
const pixelRatio = renderer.getPixelRatio();

// 2. Create a Render Target with multisampling (MSAA)
// We create a custom render target that supports multisampling (antialiasing) for smoother edges,
// which is especially beneficial when applying bloom effects.
// 'samples: 4' is usually the sweet spot for quality vs performance
const renderTarget = new THREE.WebGLRenderTarget(
  size.width * pixelRatio, //Width of the render target in pixels, adjusted for device pixel ratio for crisp rendering on high-DPI screens
  size.height * pixelRatio, //Height of the render target in pixels, adjusted for device pixel ratio
  {
    type: THREE.HalfFloatType, // Good for Bloom/HDR
    samples: 4                 // This enables the multisampling (MSAA)
  }
);

const renderScene = new RenderPass(scene, camera); // This pass renders the original scene into a texture that can then be used for post-processing effects. It essentially captures the current view of the 3D scene as a base layer for further effects to be applied on top of it.
const composer = new EffectComposer(renderer, renderTarget); // Post-processing composer

composer.addPass(renderScene);// First render the scene normally

// Bloom pass to make the water glow. These settings are tuned to only make the water glow, not the rest of the scene.
const bloomPass = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 1.5, 0.4, 0.85);
bloomPass.threshold = 0.2; // Adjusted so only emissive/very bright things glow
bloomPass.strength = 1.0; // How intense the bloom/glow effect is
bloomPass.radius = 0.5; // How far the bloom/glow spreads out

composer.addPass(bloomPass); // Then apply bloom/glow on top of it

// 5. Lighting
// Hemisphere light for base visibility
const hemiLight = new THREE.HemisphereLight(0xffffff, 0x444444, 0.4);
hemiLight.position.set(0, 20, 0);
scene.add(hemiLight);

// Bottom directional light to simulate light coming from below the water surface, giving a sense of depth and volume to the swimmer
const dirLightBottom = new THREE.DirectionalLight(0xffffff, 1.0);
dirLightBottom.position.set(-5, -10, 0);
scene.add(dirLightBottom);

// For development: Visualize the directional light's direction and position
// const helperDirLightBottom = new THREE.DirectionalLightHelper(dirLightBottom);
// scene.add( helperDirLightBottom );

// Top directional light to simulate light coming from above the water surface
const dirLightTop = new THREE.DirectionalLight(0xffffff, 0.5);
dirLightTop.position.set(-5, 5, 0);
scene.add(dirLightTop);

// For development: Visualize the directional light's direction and position
// const helperDirLightTop = new THREE.DirectionalLightHelper(dirLightTop);
// scene.add( helperDirLightTop );

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

// Basic Controls
const playPauseBtn = document.getElementById('play-pause-btn');
const stepForwardBtn = document.getElementById('step-forward-btn');
const stepBackwardBtn = document.getElementById('step-backward-btn');
const settingsBtn = document.getElementById('settings-btn');

// Settings Menu Elements
const settingsMenu = document.getElementById('settings-menu');
const traceHandsToggle = document.getElementById('trace-hands-toggle');
const waterToggle = document.getElementById('waterToggle');
const currentSpeedDisplay = document.getElementById('current-speed-display');
const speedSlider = document.getElementById('speed-slider');
const speedMinusBtn = document.getElementById('speed-minus-btn');
const speedPlusBtn = document.getElementById('speed-plus-btn');
const speedPresets = document.querySelectorAll('.speed-preset');
const progressSlider = document.querySelector('.progress-slider');

// 8. Load Model
const loader = new GLTFLoader();

// Set the meshopt decoder so it can read compressed data
loader.setMeshoptDecoder(MeshoptDecoder);

loader.load(
  './3D_Assets/swimmer.glb',
  (gltf) => {
    const model = gltf.scene;
    // console.log('Model loaded:', model);

    model.traverse((object) => {
      if (object.isMesh) {
        // ONLY override the water material. This way we can have a custom glowing material for the water, while keeping the original materials for the swimmer and other parts of the scene intact.
        if (object.name === 'Water') {
          object.material = new THREE.MeshPhysicalMaterial({
            color: 0xffffff,          // Base white color
            emissive: 0x0033aa,       // Glow color! This is what the bloom picks up
            emissiveIntensity: 1.5,   // How intensely it glows
            transparent: true,
            opacity: 0.05,            // Semi-transparent
            roughness: 0.1,           // Glossy
            metalness: 0.2,
            side: THREE.DoubleSide,   // Visible from underneath
            depthWrite: false
          });
        }
      }
    });

    traceHandsMesh = model.getObjectByName('Trace_Hands');
    // 'Trace Hands' toggle is UNCHECKED by default, thus mesh is HIDDEN on load
    if (traceHandsMesh) traceHandsMesh.visible = traceHandsToggle.checked;

    waterMesh = model.getObjectByName('Water');
    // 'Water' toggle is CHECKED by default, thus mesh is VISIBLE on load
    if (waterMesh) waterMesh.visible = waterToggle.checked;

    setIsoView(); // Set the camera to a nice isometric view of the swimmer on load

    // Important to call this after changing camera position and target so that the viewport gizmo updates to match the new camera orientation
    controls.update();

    // Add the model to the scene so it becomes visible
    scene.add(model);

    //Load the first animation of model and play it
    if (gltf.animations && gltf.animations.length > 0) {
      mixer = new THREE.AnimationMixer(model);
      animationAction = mixer.clipAction(gltf.animations[0]);
      animationAction.timeScale = currentPlaybackSpeed; // Apply speed on load
      animationAction.play();

      // Initialize the slider max duration based on the loaded animation clip length
      // console.log('Animation length:', animationAction.getClip().duration);
      progressSlider.max = animationAction.getClip().duration;
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

// Set the camera to a nice isometric view of the swimmer on load, so it's framed well from the start.
// This function calculates the optimal camera position based on the model's dimensions and the screen aspect ratio to ensure the entire
// swimmer fits perfectly in view without being cut off, regardless of the device or screen size.
function setIsoView() {
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
}

// 9. Playback Controls & Settings Integration

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

// Progress Slider Update
progressSlider.addEventListener('input', (e) => {
  if (!animationAction || !mixer) return;

  const newTime = parseFloat(e.target.value);
  animationAction.time = newTime;

  // Force animation mixer to evaluate the new current time instantly so the screen updates
  mixer.update(0);
});

// --- Play / Pause Logic ---
function togglePlayPause() {
  if (!animationAction) return; // Prevent errors if clicked before model loads

  // Toggle paused state
  animationAction.paused = !animationAction.paused; //Set 'animationAction.paused' to the opposite of what it was before this line of code.

  // Set value of progress slider to current animation time
  // console.log('Animation paused at:', animationAction.time);
  progressSlider.value = animationAction.time;

  // Update UI classes (Step forward/backward buttons are automatically shown/hidden via CSS classes here)
  if (animationAction.paused) {
    playPauseBtn.classList.replace('pause', 'play'); // Replace 'pause' class with 'play' to show play icon
    playPauseBtn.setAttribute('title', 'Play animation <Spacebar>'); // Update tooltip to indicate the new action when hovering over the button
    stepForwardBtn.classList.add('visible'); // Show step forward button when paused
    stepBackwardBtn.classList.add('visible'); // Show step backward button when paused
    progressSlider.classList.add('visible'); // Show progress slider when paused
  } else {
    playPauseBtn.classList.replace('play', 'pause');
    playPauseBtn.setAttribute('title', 'Pause animation <Spacebar>');
    stepForwardBtn.classList.remove('visible');
    stepBackwardBtn.classList.remove('visible');
    progressSlider.classList.remove('visible');
  }
}

// Trigger toggle on button click
playPauseBtn.addEventListener('click', togglePlayPause);

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

  //Update the animation time to the new stepped time
  animationAction.time = newTime;

  // Update progress slider to reflect new time
  progressSlider.value = newTime;

  // Force animation mixer to evaluate the new current time instantly so the screen updates
  mixer.update(0);
}

stepForwardBtn.addEventListener('click', () => stepAnimation(0.01));
stepBackwardBtn.addEventListener('click', () => stepAnimation(-0.01));

// Shortcut keys
document.addEventListener('keydown', (e) => {
  // Spacebar to toggle play/pause
  if (e.code === 'Space') {
    e.preventDefault(); // Prevent default spacebar scrolling behavior
    togglePlayPause();
  }
  // 'w' key to toggle water visibility
  else if (e.key.toLowerCase() === 'w') {
    waterToggle.checked = !waterToggle.checked;
    waterToggle.dispatchEvent(new Event('change')); // Trigger the change event to toggle visibility
  }
  // 't' key to toggle trace hands visibility
  else if (e.key.toLowerCase() === 't') {
    traceHandsToggle.checked = !traceHandsToggle.checked;
    traceHandsToggle.dispatchEvent(new Event('change'));
  }
  // Number keys for specific views: front (2), back (8), left (4), right (6), top (5), iso (0)
  else if (e.key >= '0' && e.key <= '9') {
    const newCameraPos = setCameraPositionToFitScreen(e.key);
    // console.log('New camera position for front view:', newCameraPos[0], newCameraPos[1], newCameraPos[2]);
    if (newCameraPos) camera.position.set(newCameraPos[0], newCameraPos[1], newCameraPos[2]);
    controls.update(); // Update controls to reflect changes
  }

  //Left arrow and right arrow keys to step backward and forward in the animation when paused
  else if (e.code === 'ArrowRight' && animationAction && animationAction.paused) {
    stepAnimation(0.01);
  }
  else if (e.code === 'ArrowLeft' && animationAction && animationAction.paused) {
    stepAnimation(-0.01);
  }
});

// Set the camera to a perfect position to fit the entire swimmer in view based on the selected viewing direction, the model's dimensions, and the screen aspect ratio.
// Viewing direction can be "front" (2, z), "left" (4, -x), "top" (5, y), "right" (6, x), "back" (8, -z), or "iso" (0)
function setCameraPositionToFitScreen(viewingDirection) {
  // Dimensions below are the maximum extents during freestyle stroke in all 3 coordinate directions.
  const swimmerLen = 2.3; // Estimated width/length of the swimmer with stretched out arms in meters (from fingertips to toes). Dimension along the X axis.
  const swimmerHeight = 0.7; // Estimated height/thickness of the swimmer (head to fingertips). Dimension along the Y axis.
  const swimmerWidth = 0.9; // Estimated max span of the swimmer (from elbow of one arm to the other). Dimension along the Z axis.
  const targetX = swimmerLen / 2; // Focus on the center of the swimmer's body (1.15m), not the origin (between the feet)

  // Set the focus point to the center of the swimmer. This is the same for all views.
  controls.target.set(targetX, 0, 0);

  const fovInRadians = (camera.fov * Math.PI) / 180; // The vertical field of view of the camera in radians
  const aspect = camera.aspect; // Canvas width divided by height

  // Helper to calculate trig distance
  // We need to fit two dimensions: the horizontal (h) and vertical (v) extents of the swimmer.
  // Depending on the aspect ratio and the viewing direction, either the horizontal or vertical dimension may be the limiting factor
  // that determines how far back we need to position the camera to fit everything in view.
  // See image in readme.md for a visual explanation of this.
  const getFitDist = (dimHoriz, dimVert) => {
    const distV = (dimVert / 2) / Math.tan(fovInRadians / 2);
    const distH = (dimHoriz / 2) / Math.tan(fovInRadians / 2) / aspect;// We divide by aspect for the horizontal distance because the horizontal field of view can be wider (desktop) or narrower (mobile) than the vertical field of view.
    return Math.max(distV, distH) * 1.2; // Return the value that is the furthest away, with a small padding multiplier so the swimmer isn't touching the edges of the screen
  };

  let totalDistance = 0;

  if (viewingDirection === '2' || viewingDirection === '8') {
    // FRONT/BACK VIEW: Looking at X (Length) and Y (Height)
    // We must stand back at least half the Width (Z) to be outside the body
    const depthOffset = swimmerWidth / 2;
    totalDistance = depthOffset + getFitDist(swimmerLen, swimmerHeight);

    return [targetX, 0, viewingDirection === '2' ? totalDistance : -totalDistance];
  }

  else if (viewingDirection === '6' || viewingDirection === '4') {
    // SIDE VIEWS (Head/Feet): Looking at Z (Width) and Y (Height)
    // We must stand back at least half the Length (X) to be outside the fingers/toes
    const depthOffset = swimmerLen / 2;
    totalDistance = depthOffset + getFitDist(swimmerWidth, swimmerHeight);

    return [viewingDirection === '6' ? targetX + totalDistance : targetX - totalDistance, 0, 0];
  }

  else if (viewingDirection === '5') {
    // TOP VIEW: Looking at X (Length) and Z (Width)
    // We must stand back at least half the Height (Y)
    const depthOffset = swimmerHeight / 2;
    totalDistance = depthOffset + getFitDist(swimmerLen, swimmerWidth);

    return [targetX, totalDistance, 0];
  }

  else if (viewingDirection === '0') {
    // ISOMETRIC VIEW: Looking at X, Y, and Z equally (diagonal)
    setIsoView(); // We already have a function that perfectly sets the isometric view based on the model's dimensions and screen aspect ratio, so we can just call that here instead of recalculating everything.
    return null; // Return null since the camera position is already set within the setIsoView function
  }

  else {
    console.log('Invalid viewing direction. Use "0" (iso), "2" (front), "8" (back), "4" (left), "6" (right) or "5" (top).');
    return null;
  }
}

// Window Resize Handling
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight); // Adjust the renderer size to match the new window dimensions
  composer.setSize(window.innerWidth, window.innerHeight); // Important for post-processing to also adjust to new size
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

  // 4. Render the scene with post-processing effects (bloom/glow)
  composer.render();

  // 5. Render the viewport gizmo
  gizmo.render();
}

// Start the loop
requestAnimationFrame(animate);