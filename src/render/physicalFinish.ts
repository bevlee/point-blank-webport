import * as THREE from "three";
import { HDRCubeTextureLoader } from "three/examples/jsm/loaders/HDRCubeTextureLoader.js";
import { FlakesTexture } from "three/examples/jsm/textures/FlakesTexture.js";

export type PhysicalFinish = "silver" | "gold" | "darkmatter";
export function physicalFinish(value: unknown): PhysicalFinish {
  return value === "gold" || value === "darkmatter" ? value : "silver";
}

interface FinishAssets {
  environment: THREE.WebGLRenderTarget;
  flakes: THREE.CanvasTexture;
  detailNormal: THREE.Texture;
  color: THREE.CanvasTexture;
  metal: THREE.CanvasTexture;
  roughness: THREE.CanvasTexture;
}
let assets: FinishAssets | null = null;

function surfaceMap(body: string, grip: string): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 512;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Physical camo requires a canvas context");
  ctx.fillStyle = body; ctx.fillRect(0, 0, 512, 512);
  ctx.fillStyle = grip; ctx.fillRect(200, 348, 158, 164);
  const texture = new THREE.CanvasTexture(canvas);
  texture.flipY = false;
  return texture;
}

export type PhysicalLighting = "studio" | "map" | "map-key";
export function physicalLighting(value: unknown): PhysicalLighting {
  return value === "map" || value === "map-key" ? value : "studio";
}

/** Opt-in lighting experiment. The map probe is static at the initial spawn. */
export function applyPhysicalMapLighting(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera, position: THREE.Vector3): void {
  const mode = physicalLighting(new URLSearchParams(location.search).get("m4light"));
  if (mode === "studio" || !assets) return;
  const cube = new THREE.WebGLCubeRenderTarget(256, { type: THREE.HalfFloatType });
  const probe = new THREE.CubeCamera(0.1, 500, cube);
  probe.position.copy(position).add(new THREE.Vector3(0, 1.6, 0));
  probe.update(renderer, scene);
  const pmrem = new THREE.PMREMGenerator(renderer);
  const environment = pmrem.fromCubemap(cube.texture);
  cube.dispose(); pmrem.dispose();
  assets.environment.dispose();
  assets.environment = environment;
  if (mode === "map-key") {
    const key = new THREE.DirectionalLight(0xe5efff, 2.2);
    key.position.set(-1.5, 2, 1.5);
    key.target.position.set(0, -0.15, -1);
    camera.add(key, key.target);
  }
}

/** Demo-style reflected studio lighting, scoped to the optional material study. */
export async function initPhysicalFinish(renderer: THREE.WebGLRenderer): Promise<() => void> {
  // Same Pisa HDR environment as three.js r169's physical-clearcoat example.
  const hdr = await new HDRCubeTextureLoader().setPath("/assets/dev/clearcoat/pisa/").loadAsync(["px.hdr", "nx.hdr", "py.hdr", "ny.hdr", "pz.hdr", "nz.hdr"]);
  const pmrem = new THREE.PMREMGenerator(renderer);
  const environment = pmrem.fromCubemap(hdr);
  hdr.dispose(); pmrem.dispose();
  const flakes = new THREE.CanvasTexture(new FlakesTexture(1024, 1024));
  flakes.wrapS = flakes.wrapT = THREE.RepeatWrapping;
  flakes.repeat.set(14, 10);
  flakes.anisotropy = Math.min(16, renderer.capabilities.getMaxAnisotropy());
  const detailNormal = await new THREE.TextureLoader().loadAsync("/assets/weapons/models/tex/m4a1/m4a1_normal.png");
  detailNormal.flipY = false;
  detailNormal.colorSpace = THREE.NoColorSpace;
  const own: FinishAssets = {
    environment, flakes, detailNormal,
    color: surfaceMap("#ffffff", "#202020"),
    metal: surfaceMap("#ffffff", "#000000"),
    roughness: surfaceMap("#b0b0b0", "#ffffff"),
  };
  own.color.colorSpace = THREE.SRGBColorSpace;
  assets = own;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;
  return () => {
    if (assets === own) assets = null;
    own.environment.dispose(); own.flakes.dispose(); own.detailNormal.dispose(); own.color.dispose(); own.metal.dispose(); own.roughness.dispose();
  };
}

export function createPhysicalFinish(source: THREE.MeshStandardMaterial, finish: PhysicalFinish): THREE.MeshPhysicalMaterial {
  if (!assets) throw new Error("Initialize the physical finish environment before loading the M4A1");
  const material = new THREE.MeshPhysicalMaterial({
    name: source.name,
    color: finish === "gold" ? 0xffd38a : finish === "darkmatter" ? 0xffffff : 0xe4eaf2,
    metalness: finish === "darkmatter" ? 0.82 : 1,
    roughness: finish === "darkmatter" ? 0.25 : 0.21,
    clearcoat: 1,
    clearcoatRoughness: 0.075,
    map: assets.color,
    metalnessMap: assets.metal,
    roughnessMap: assets.roughness,
    normalMap: assets.detailNormal,
    normalScale: new THREE.Vector2(0.85, -0.85),
    clearcoatNormalMap: assets.flakes,
    clearcoatNormalScale: new THREE.Vector2(0.025, 0.025),
    envMap: assets.environment.texture,
    envMapIntensity: 1.0,
    iridescence: finish === "darkmatter" ? 0.22 : 0,
    side: source.side,
  });
  material.userData.pbPhysicalFinish = true;
  if (finish === "darkmatter") {
    const time = { value: 0 };
    material.onBeforeRender = () => { time.value = performance.now() * 0.001; };
    material.onBeforeCompile = (shader) => {
      shader.uniforms.finishTime = time;
      shader.fragmentShader = shader.fragmentShader.replace("void main() {", `
        uniform float finishTime;
        float fnHash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
        float fnNoise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);return mix(mix(fnHash(i),fnHash(i+vec2(1,0)),f.x),mix(fnHash(i+vec2(0,1)),fnHash(i+vec2(1,1)),f.x),f.y);}
        float fnFbm(vec2 p){float v=0.0,a=0.5;for(int i=0;i<4;i++){v+=a*fnNoise(p);p=mat2(1.6,1.2,-1.2,1.6)*p;a*=0.5;}return v;}
        void main() {
      `).replace("#include <color_fragment>", `
        #include <color_fragment>
        vec2 p=vMapUv*6.0;
        float t=finishTime*0.11;
        vec2 warp=vec2(fnFbm(p+vec2(t,-t*.7)),fnFbm(p+vec2(4.2-t*.6,1.7+t)));
        float cloud=fnFbm(p*1.8+warp*3.5);
        float hue=clamp((fnFbm(p+warp*2.0+vec2(-t*.3,t*.25))-.30)*3.0,0.0,1.0);
        vec3 nebula=mix(vec3(.012,.025,.18),vec3(.36,.012,.65),smoothstep(.1,.65,hue));
        nebula=mix(nebula,vec3(.85,.045,.45),smoothstep(.55,.85,hue));
        vec3 finishNebula=mix(vec3(.005,.002,.018),nebula,smoothstep(.25,.7,cloud));
        diffuseColor.rgb*=finishNebula;
      `).replace("#include <emissivemap_fragment>", `
        #include <emissivemap_fragment>
        totalEmissiveRadiance+=finishNebula*.18;
      `);
    };
    material.customProgramCacheKey = () => "pb-physical-darkmatter-v1";
  }
  return material;
}
