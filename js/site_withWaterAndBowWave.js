import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { Timer } from 'three/addons/misc/Timer.js';
import { ViewportGizmo } from "three-viewport-gizmo"; 
import { GPUComputationRenderer } from 'three/addons/misc/GPUComputationRenderer.js';
import Stats from 'stats';

// 1. Stats Setup
const stats = new Stats();
document.body.appendChild(stats.dom);

// 2. Scene Setup
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x87CEEB);
scene.fog = new THREE.Fog(0x87CEEB, 10, 50);

// 3. Camera Setup
const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 100);
camera.position.set(0, 2, 5);

// 4. Renderer Setup
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(window.devicePixelRatio);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
document.body.appendChild(renderer.domElement);

// 5. Lighting
const hemiLight = new THREE.HemisphereLight(0xffffff, 0x444444, 1.5);
hemiLight.position.set(0, 20, 0);
scene.add(hemiLight);

// Floor
const floorMesh = new THREE.Mesh(
  new THREE.PlaneGeometry(100, 100),
  new THREE.MeshPhongMaterial({ color: 0x0099aa, depthWrite: false }) 
);
floorMesh.rotation.x = -Math.PI / 2;
floorMesh.position.y = -1.5; 
floorMesh.receiveShadow = true;
scene.add(floorMesh);

// 6. Interactive GPGPU Water Setup
const BOUNDS = 25; 
const WIDTH = 256; 
let gpuCompute;
let heightmapVariable;
let waterUniforms;

const heightmapFragmentShader = `
  uniform vec2 flowSpeed;
  uniform float damping;
  uniform vec3 splashes[10];
  uniform int numSplashes;
  uniform vec3 bowWave; // x, y = UV coords, z = wave strength

  void main() {
    vec2 cellSize = 1.0 / resolution.xy;
    vec2 uv = gl_FragCoord.xy * cellSize;

    vec2 uvShift = uv + flowSpeed;

    if(uvShift.x > 0.99 || uvShift.x < 0.01 || uvShift.y > 0.99 || uvShift.y < 0.01) {
      gl_FragColor = vec4(0.0);
      return;
    }

    vec4 heightmapVal = texture2D( heightmap, uvShift );

    vec4 north = texture2D( heightmap, uvShift + vec2( 0.0, cellSize.y ) );
    vec4 south = texture2D( heightmap, uvShift + vec2( 0.0, -cellSize.y ) );
    vec4 east  = texture2D( heightmap, uvShift + vec2( cellSize.x, 0.0 ) );
    vec4 west  = texture2D( heightmap, uvShift + vec2( -cellSize.x, 0.0 ) );

    float newHeight = ( ( north.x + south.x + east.x + west.x ) * 0.5 - heightmapVal.y );
    newHeight *= damping;

    // Apply rapid discrete splashes (hands/feet hitting water)
    for(int i = 0; i < 10; i++) {
      if(i >= numSplashes) break;
      vec2 dropPos = splashes[i].xy;
      float dropIntensity = splashes[i].z;

      float dist = distance(uv, dropPos);
      float splashRadius = 0.004; 
      
      if(dist < splashRadius) {
        newHeight -= dropIntensity * (splashRadius - dist) * 15.0; 
      }
    }

    // Apply Continuous Bow Wave (Head pushing water)
    float distBow = distance(uv, bowWave.xy);
    float bowRadius = 0.018; // Size of the water bulge around the head
    if (distBow < bowRadius && bowWave.z > 0.0) {
      // Create a smooth bell-curve pressure point
      float push = (1.0 - smoothstep(0.0, bowRadius, distBow)) * bowWave.z;
      // Gently lift the water up. The backward flow turns this into a V-wake!
      newHeight += push * 0.0015; 
    }

    gl_FragColor = vec4( newHeight, heightmapVal.x, 0.0, 0.0 );
  }
`;

function initWater() {
  const geometry = new THREE.PlaneGeometry(BOUNDS, BOUNDS, WIDTH - 1, WIDTH - 1);
  
  const material = new THREE.MeshStandardMaterial({
    color: 0x00AADD,
    transparent: true,
    opacity: 0.85,
    roughness: 0.1,
    metalness: 0.3,
    side: THREE.DoubleSide
  });

  material.onBeforeCompile = function (shader) {
    shader.uniforms.heightmap = { value: null };
    waterUniforms = shader.uniforms;

    shader.vertexShader = `uniform sampler2D heightmap;\n` + shader.vertexShader;
    
    shader.vertexShader = shader.vertexShader.replace(
      '#include <beginnormal_vertex>',
      `
      #include <beginnormal_vertex>
      float offset = 1.0 / ${WIDTH.toFixed(1)};
      float hL = texture2D( heightmap, uv + vec2( -offset, 0.0 ) ).x;
      float hR = texture2D( heightmap, uv + vec2( offset, 0.0 ) ).x;
      float hD = texture2D( heightmap, uv + vec2( 0.0, -offset ) ).x;
      float hU = texture2D( heightmap, uv + vec2( 0.0, offset ) ).x;

      objectNormal = normalize( vec3( (hL - hR) * 30.0, (hD - hU) * 30.0, 2.0 ) );
      `
    );

    shader.vertexShader = shader.vertexShader.replace(
      '#include <begin_vertex>',
      `
      #include <begin_vertex>
      float heightValue = texture2D( heightmap, uv ).x;
      transformed.z += heightValue * 2.5; 
      `
    );
  };

  const waterMesh = new THREE.Mesh(geometry, material);
  waterMesh.rotation.x = -Math.PI / 2;
  waterMesh.receiveShadow = true;
  waterMesh.castShadow = true;
  scene.add(waterMesh);

  gpuCompute = new GPUComputationRenderer(WIDTH, WIDTH, renderer);
  
  if (renderer.capabilities.isWebGL2 === false) {
    gpuCompute.setDataType(THREE.HalfFloatType);
  }

  const heightmap0 = gpuCompute.createTexture();
  heightmapVariable = gpuCompute.addVariable("heightmap", heightmapFragmentShader, heightmap0);
  gpuCompute.setVariableDependencies(heightmapVariable, [heightmapVariable]);

  const splashArr = Array.from({length: 10}, () => new THREE.Vector3());
  heightmapVariable.material.uniforms["flowSpeed"] = { value: new THREE.Vector2(0.002, 0.0) };
  heightmapVariable.material.uniforms["damping"] = { value: 0.985 };
  heightmapVariable.material.uniforms["splashes"] = { value: splashArr };
  heightmapVariable.material.uniforms["numSplashes"] = { value: 0 };
  heightmapVariable.material.uniforms["bowWave"] = { value: new THREE.Vector3(0, 0, 0) };

  const error = gpuCompute.init();
  if (error !== null) console.error(error);
}

initWater(); 

// 7. Controls
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.target.set(0, 1, 0);

const gizmo = new ViewportGizmo(camera, renderer, {
  type: "cube",
  placement: "bottom-left"
});
gizmo.attachControls(controls);

// 8. Animation Global Variables
let mixer;
let animationAction;
let currentPlaybackSpeed = 1.0;
let swimmerModel = null;
const timer = new Timer();

// 9. Load Model
const loader = new GLTFLoader();
loader.setMeshoptDecoder(MeshoptDecoder);

loader.load(
  './3D_Assets/swimmer.glb',
  (gltf) => {
    swimmerModel = gltf.scene;
    console.log(swimmerModel);

    let baseDistance = 3.0;
    if (camera.aspect < 1.0) {
      baseDistance /= camera.aspect;
      baseDistance *= 0.85; 
    }

    const targetPos = new THREE.Vector3(1.3, 0, 0);
    const dir = new THREE.Vector3(1, 1, 1).normalize();
    camera.position.copy(targetPos).addScaledVector(dir, baseDistance);

    controls.target.copy(targetPos);
    camera.lookAt(targetPos);
    controls.update();

    swimmerModel.traverse((object) => {
      if (object.isMesh) {
        object.castShadow = true;
        object.receiveShadow = true;
      }
    });

    scene.add(swimmerModel);

    if (gltf.animations && gltf.animations.length > 0) {
      mixer = new THREE.AnimationMixer(swimmerModel);
      animationAction = mixer.clipAction(gltf.animations[0]);
      animationAction.timeScale = currentPlaybackSpeed; 
      animationAction.play();
    }

    document.getElementById('loading').style.display = 'none';
  },
  (xhr) => { console.log(`${(xhr.loaded / xhr.total * 100).toFixed(2)}% loaded`); },
  (error) => {
    console.error('An error happened', error);
    document.getElementById('loading').innerText = 'Error loading model.';
  }
);

// 10. Playback Controls
const playPauseBtn = document.getElementById('playPauseBtn');
const stepForwardBtn = document.getElementById('stepForwardBtn');
const stepBackwardBtn = document.getElementById('stepBackwardBtn');
const speedToggleBtn = document.getElementById('speedToggleBtn');
const speedMenu = document.getElementById('speedMenu');
const speedOptions = document.querySelectorAll('.speed-option');

speedToggleBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  speedMenu.classList.toggle('visible');
});

speedOptions.forEach(option => {
  option.addEventListener('click', (e) => {
    e.stopPropagation();
    currentPlaybackSpeed = parseFloat(option.getAttribute('data-speed'));
    if (animationAction) animationAction.timeScale = currentPlaybackSpeed;
    speedOptions.forEach(opt => opt.classList.remove('active'));
    option.classList.add('active');
    speedMenu.classList.remove('visible');
  });
});

document.addEventListener('click', (e) => {
  if (speedMenu.classList.contains('visible') && !speedMenu.contains(e.target)) {
    speedMenu.classList.remove('visible');
  }
});

playPauseBtn.addEventListener('click', () => {
  if (!animationAction) return; 

  animationAction.paused = !animationAction.paused;

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
  let newTime = animationAction.time + stepAmount;
  newTime = ((newTime % duration) + duration) % duration;
  animationAction.time = newTime;
  mixer.update(0);
}

stepForwardBtn.addEventListener('click', () => stepAnimation(0.01));
stepBackwardBtn.addEventListener('click', () => stepAnimation(-0.01));

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  gizmo.update();
});

// 11. Animation Loop
function animate(timestamp) {
  requestAnimationFrame(animate);

  stats.update();
  timer.update(timestamp);
  const delta = timer.getDelta();

  if (mixer) mixer.update(delta);

  // -------- DYNAMIC WATER INTERACTION LOGIC --------
  if (swimmerModel && heightmapVariable) {
    let splashes = [];
    
    // 1. Traverse bones for discrete impact splashes (Hands/Feet)
    swimmerModel.traverse((child) => {
      if (child.isBone) {
        let pos = new THREE.Vector3();
        child.getWorldPosition(pos);
        
        if (!child.userData.prevPos) child.userData.prevPos = pos.clone();
        
        let prevPos = child.userData.prevPos;
        let velocity = pos.distanceTo(prevPos);
        velocity = Math.min(velocity, 0.1); 
        
        if (velocity > 0.015 && pos.y < 0.2 && pos.y > -0.2) {
          let intensity = velocity * 0.5; 
          splashes.push({ x: pos.x, z: pos.z, intensity: intensity });
        }
        child.userData.prevPos.copy(pos);
      }
    });
    
    splashes.sort((a, b) => b.intensity - a.intensity);
    let numSplashes = Math.min(splashes.length, 10);
    
    const splashUniforms = heightmapVariable.material.uniforms.splashes.value;
    for(let i = 0; i < 10; i++) {
      if (i < numSplashes) {
        let uvX = (splashes[i].x + BOUNDS / 2) / BOUNDS;
        let uvY = 1.0 - (splashes[i].z + BOUNDS / 2) / BOUNDS;
        splashUniforms[i].set(uvX, uvY, splashes[i].intensity);
      } else {
        splashUniforms[i].set(0, 0, 0); 
      }
    }

    // 2. Track the head to position the continuous Bow Wave
    if (!swimmerModel.userData.headBone) {
      // Find the head bone securely upon first frame
      let foundHead = false;
      swimmerModel.traverse(child => {
        if (child.isBone && child.name.toLowerCase().includes('head') && !foundHead) {
          swimmerModel.userData.headBone = child;
          foundHead = true;
        }
      });
      // Fallback if model has no recognizable head bone
      if (!foundHead) swimmerModel.userData.headBone = "fallback";
    }

    let bowX, bowZ;
    if (swimmerModel.userData.headBone === "fallback") {
      console.warn("Head bone not found, using fallback position for bow wave.");
      bowX = 1.8; 
      bowZ = 0.0;
    } else {
      let headPos = new THREE.Vector3();
      swimmerModel.userData.headBone.getWorldPosition(headPos);
      
      // Place the pressure zone roughly 30cm IN FRONT of the head (+X direction).
      // We dampen the Z movement slightly so the wake doesn't wobble crazily when breathing.
      console.log(`Head Position: x=${headPos.x.toFixed(2)}, y=${headPos.y.toFixed(2)}, z=${headPos.z.toFixed(2)}`);
      bowX = headPos.x + 0.3;
      bowZ = headPos.z * 0.4; 
    }

    let bowUvX = (bowX + BOUNDS / 2) / BOUNDS;
    let bowUvY = 1.0 - (bowZ + BOUNDS / 2) / BOUNDS;

    // The wave only exists when unpaused, linked to animation speed
    let bowStrength = (animationAction && !animationAction.paused) ? 1.0 * currentPlaybackSpeed : 0.0;
    
    heightmapVariable.material.uniforms.bowWave.value.set(bowUvX, bowUvY, bowStrength);

    // 3. Match water flow to playback speed
    let targetSpeed = 0.002;
    if (animationAction && animationAction.paused) targetSpeed = 0;

    heightmapVariable.material.uniforms.numSplashes.value = numSplashes;
    heightmapVariable.material.uniforms.flowSpeed.value.set(targetSpeed, 0.0);
  }

  // Calculate the GPU physics frames
  if (gpuCompute) {
    gpuCompute.compute();
    if (waterUniforms) {
      waterUniforms.heightmap.value = gpuCompute.getCurrentRenderTarget(heightmapVariable).texture;
    }
  }

  controls.update();
  renderer.render(scene, camera);
  gizmo.render();
}

requestAnimationFrame(animate);