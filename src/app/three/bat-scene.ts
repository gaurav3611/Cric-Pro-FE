import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';
import { PALETTE } from '../shared/palette';

/**
 * The 3D cricket bat and its swing trace, ported from Cricket/frontend/js/three-bat.js.
 *
 * The scene is built with three.js r128, the release the original page loaded, so that
 * lights and materials render the same. Sizes, colours and positions are the original ones.
 *
 * update() and reset() work before init(), as they did in the original: the bat's rotation
 * is tracked from the first reading even if the scene is drawn later.
 *
 * Unlike the original, the bat turns about the hands, and the swing is traced as a band: the
 * path of the whole blade, from its shoulder to its toe, coloured by bat speed. The rotation
 * itself, which tools/parity.mjs compares, is worked out exactly as before. Only the way it is
 * shown differs: the swing axis gy, which the dashboard's speed comes from, sweeps the face
 * forward through an arc; gx turns the bat about its length; gz tilts it to the off or leg side.
 * The original turned the model about its length with gy, so a swing looked like a twist.
 */

/** Frames of path kept; a shot lasts a few seconds, so this is close to a minute. */
const TRAIL_MAX = 3000;
/** Where the hands hold the bat, as a distance above the middle of the bat model. */
const HANDS = 0.85;
/** The blade's shoulder and toe, in the turning group's own units. */
const BLADE_TOP = 0.12 - HANDS;
const BLADE_TOE = -1.1 - HANDS;
/** From the side, like square leg: the swing's arc faces the camera. */
const CAMERA_HOME = new THREE.Vector3(2.4, 0.6, 1.15);
const LOOK_AT = new THREE.Vector3(0, 0.2, 0);
const FLOOR = -0.75;

const SLOW = new THREE.Color(PALETTE.green);
const MEDIUM = new THREE.Color(PALETTE.ochre);
const FAST = new THREE.Color(PALETTE.red);

/** Bat speed to colour: green when slow, ochre at 60 km/h, red from 120 km/h. */
export function speedColour(kmh: number, out = new THREE.Color()): THREE.Color {
  const t = Math.min(1, Math.max(0, kmh / 120));
  return t < 0.5 ? out.copy(SLOW).lerp(MEDIUM, t * 2) : out.copy(MEDIUM).lerp(FAST, (t - 0.5) * 2);
}

interface Rotation {
  x: number;
  y: number;
  z: number;
}

const zero = (): Rotation => ({ x: 0, y: 0, z: 0 });

export class BatScene {
  private scene: THREE.Scene | null = null;
  private camera: THREE.PerspectiveCamera | null = null;
  private renderer: THREE.WebGLRenderer | null = null;
  private container: HTMLElement | null = null;
  private group: THREE.Group | null = null;
  private sweetSpot: THREE.Mesh<THREE.SphereGeometry, THREE.MeshPhongMaterial> | null = null;
  private toeMarker: THREE.Mesh | null = null;

  private targetRot = zero();
  private currentRot = zero();
  private integratedRot = zero();
  private glowIntensity = 0;
  private lastTrailPoint: THREE.Vector3 | null = null;
  private frame = 0;
  private controls: OrbitControls | null = null;
  /** The speed of the latest reading, km/h, worked out as the dashboard does. */
  private speedKmh = 0;
  private trailCount = 0;
  private band: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial> | null = null;
  private toeLine: THREE.Line<THREE.BufferGeometry, THREE.LineBasicMaterial> | null = null;
  private readonly colour = new THREE.Color();

  private readonly onResize = (): void => {
    if (!this.container || !this.renderer || !this.camera) return;
    this.camera.aspect = this.container.offsetWidth / (this.container.offsetHeight || 420);
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(this.container.offsetWidth, this.container.offsetHeight || 420);
  };

  get initialised(): boolean {
    return this.renderer !== null;
  }

  /** Builds the scene inside the container and starts drawing. */
  init(container: HTMLElement): void {
    if (this.renderer) return;
    this.container = container;

    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0xf0f3ec, 0.03);
    this.scene = scene;

    const height = container.offsetHeight || 420;
    const camera = new THREE.PerspectiveCamera(40, container.offsetWidth / height, 0.1, 100);
    camera.position.copy(CAMERA_HOME);
    camera.lookAt(LOOK_AT);
    this.camera = camera;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(container.offsetWidth, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor(0xf0f3ec, 1); // the sage of the page
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.1;
    container.appendChild(renderer.domElement);
    this.renderer = renderer;

    this.setupLighting(scene);
    this.buildEnvironment(scene);

    // The bat: grip at the top, toe at the bottom. The group turns about the hands.
    const group = new THREE.Group();
    const bat = this.buildCricketBat();
    bat.position.y = -HANDS;
    group.add(bat);
    group.scale.setScalar(0.45);
    group.position.y = 0.35;
    scene.add(group);
    this.group = group;

    this.buildTrail(scene);

    // Drag on the 3D view to turn it. No wheel zoom, so the page still scrolls over it.
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.copy(LOOK_AT);
    controls.enableZoom = false;
    controls.enablePan = false;
    controls.maxPolarAngle = Math.PI * 0.49; // never below the floor
    controls.update();
    this.controls = controls;

    window.addEventListener('resize', this.onResize);
    this.animate();
  }

  /** Feeds one reading: rotation speeds in degrees per second and the total acceleration in g. */
  update(gy: number, gx: number, gz: number, impact: number): void {
    // The same speed as the live readout: angular speed times a 0.85 m bat, under 5 deg/s is still.
    const dps = Math.sqrt(gx * gx + gy * gy + gz * gz);
    this.speedKmh = dps < 5 ? 0 : Math.min(180, ((dps * Math.PI) / 180) * 0.85 * 3.6);

    const dt = 0.022;
    this.integratedRot.x += ((gx * Math.PI) / 180) * dt;
    this.integratedRot.y += ((gy * Math.PI) / 180) * dt;
    this.integratedRot.z += ((gz * Math.PI) / 180) * dt;

    // The rotation slowly falls back to rest, so drift does not build up.
    this.integratedRot.x *= 0.93;
    this.integratedRot.y *= 0.93;
    this.integratedRot.z *= 0.93;

    const maxRot = Math.PI / 1.2;
    this.targetRot.x = Math.min(maxRot, Math.max(-maxRot, this.integratedRot.x));
    this.targetRot.y = Math.min(maxRot, Math.max(-maxRot, this.integratedRot.y));
    this.targetRot.z = Math.min(maxRot, Math.max(-maxRot, this.integratedRot.z));

    if (impact > 2.0) {
      this.glowIntensity = Math.min(3.5, impact / 3.5);
    }
  }

  /** Puts the bat back to rest and clears the swing trace. */
  reset(): void {
    this.targetRot = zero();
    this.integratedRot = zero();
    this.lastTrailPoint = null;
    this.trailCount = 0;
    this.band?.geometry.setDrawRange(0, 0);
    this.toeLine?.geometry.setDrawRange(0, 0);
  }

  /** Moves the camera towards the bat (factor below 1) or away from it. */
  zoom(factor: number): void {
    if (!this.camera || !this.controls) return;
    const offset = this.camera.position.clone().sub(this.controls.target);
    const length = Math.min(9, Math.max(1.6, offset.length() * factor));
    this.camera.position.copy(this.controls.target).add(offset.setLength(length));
    this.controls.update();
  }

  /** The camera back where it started. */
  resetView(): void {
    if (!this.camera || !this.controls) return;
    this.controls.target.copy(LOOK_AT);
    this.camera.position.copy(CAMERA_HOME);
    this.controls.update();
  }

  /** The rotation the bat is heading for. Used by tools/parity.mjs. */
  state(): { x: number; y: number; z: number; tx: number; ty: number; tz: number } {
    return {
      x: this.integratedRot.x,
      y: this.integratedRot.y,
      z: this.integratedRot.z,
      tx: this.targetRot.x,
      ty: this.targetRot.y,
      tz: this.targetRot.z,
    };
  }

  dispose(): void {
    cancelAnimationFrame(this.frame);
    window.removeEventListener('resize', this.onResize);
    this.controls?.dispose();
    this.controls = null;
    for (const thing of [this.band, this.toeLine]) {
      thing?.geometry.dispose();
      thing?.material.dispose();
    }
    this.band = null;
    this.toeLine = null;
    if (this.renderer) {
      this.renderer.dispose();
      this.renderer.domElement.remove();
    }
    this.renderer = null;
    this.scene = null;
    this.group = null;
  }

  private setupLighting(scene: THREE.Scene): void {
    scene.add(new THREE.AmbientLight(0xffffff, 2.2));

    // Key light: warm white from the front right.
    const key = new THREE.DirectionalLight(0xfff8ee, 2.4);
    key.position.set(3, 5, 6);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    scene.add(key);

    // Fill: warm, from the left.
    const fill = new THREE.PointLight(0xffe2b8, 0.8, 12);
    fill.position.set(-4, 2, 3);
    scene.add(fill);

    // Rim: soft green from behind, the colour of the ground.
    const rim = new THREE.PointLight(0x9fc4a8, 1.0, 10);
    rim.position.set(0, 0, -5);
    scene.add(rim);

    // From below, so the underside of the bat is not dark.
    const under = new THREE.PointLight(0xdfe6d8, 0.5, 6);
    under.position.set(0, -3, 1);
    scene.add(under);
  }

  /**
   * The swing trace: a band through the blade's shoulder and toe at every frame, and a line
   * along the toe. Both are filled in place up to TRAIL_MAX frames, so nothing new is created
   * while the bat moves.
   */
  private buildTrail(scene: THREE.Scene): void {
    const band = new THREE.BufferGeometry();
    band.setAttribute(
      'position',
      new THREE.BufferAttribute(new Float32Array(TRAIL_MAX * 2 * 3), 3),
    );
    band.setAttribute('color', new THREE.BufferAttribute(new Float32Array(TRAIL_MAX * 2 * 3), 3));
    const index: number[] = [];
    for (let i = 0; i < TRAIL_MAX - 1; i++) {
      const a = i * 2;
      index.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
    band.setIndex(index);
    band.setDrawRange(0, 0);
    this.band = new THREE.Mesh(
      band,
      new THREE.MeshBasicMaterial({
        vertexColors: true,
        transparent: true,
        opacity: 0.4,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
    );
    this.band.frustumCulled = false;
    scene.add(this.band);

    const line = new THREE.BufferGeometry();
    line.setAttribute('position', new THREE.BufferAttribute(new Float32Array(TRAIL_MAX * 3), 3));
    line.setAttribute('color', new THREE.BufferAttribute(new Float32Array(TRAIL_MAX * 3), 3));
    line.setDrawRange(0, 0);
    this.toeLine = new THREE.Line(line, new THREE.LineBasicMaterial({ vertexColors: true }));
    this.toeLine.frustumCulled = false;
    scene.add(this.toeLine);
  }

  /** Adds the blade's place in this frame to the band and the toe line. */
  private extendTrail(top: THREE.Vector3, toe: THREE.Vector3): void {
    if (!this.band || !this.toeLine || this.trailCount >= TRAIL_MAX) return;
    const i = this.trailCount++;
    const colour = speedColour(this.speedKmh, this.colour);

    const bandPos = this.band.geometry.getAttribute('position') as THREE.BufferAttribute;
    const bandCol = this.band.geometry.getAttribute('color') as THREE.BufferAttribute;
    bandPos.setXYZ(i * 2, top.x, top.y, top.z);
    bandPos.setXYZ(i * 2 + 1, toe.x, toe.y, toe.z);
    bandCol.setXYZ(i * 2, colour.r, colour.g, colour.b);
    bandCol.setXYZ(i * 2 + 1, colour.r, colour.g, colour.b);
    bandPos.needsUpdate = true;
    bandCol.needsUpdate = true;
    this.band.geometry.setDrawRange(0, Math.max(0, i) * 6);

    const linePos = this.toeLine.geometry.getAttribute('position') as THREE.BufferAttribute;
    const lineCol = this.toeLine.geometry.getAttribute('color') as THREE.BufferAttribute;
    linePos.setXYZ(i, toe.x, toe.y, toe.z);
    lineCol.setXYZ(i, colour.r, colour.g, colour.b);
    linePos.needsUpdate = true;
    lineCol.needsUpdate = true;
    this.toeLine.geometry.setDrawRange(0, i + 1);
  }

  private buildEnvironment(scene: THREE.Scene): void {
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(16, 16),
      new THREE.MeshPhongMaterial({
        color: 0xe4ecdf,
        transparent: true,
        opacity: 0.9,
        side: THREE.DoubleSide,
        shininess: 100,
        specular: 0x222222,
      }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = FLOOR;
    ground.receiveShadow = true;
    scene.add(ground);

    const grid = new THREE.GridHelper(12, 48, 0x1e5b3a, 0xb9c7b3);
    grid.position.y = FLOOR + 0.01;
    const gridMaterial = grid.material as THREE.Material;
    gridMaterial.transparent = true;
    gridMaterial.opacity = 0.35;
    scene.add(grid);
  }

  /**
   * A cricket bat in real proportions. Total length about 86 cm is 2.15 units:
   * blade 1.2 high, 0.27 wide; handle and grip above it; toe guard at the bottom.
   */
  private buildCricketBat(): THREE.Group {
    const bat = new THREE.Group();

    const willowMat = new THREE.MeshPhongMaterial({
      color: 0xf0dfc0,
      shininess: 40,
      specular: 0x332211,
    });
    const willowEdgeMat = new THREE.MeshPhongMaterial({ color: 0xe5d0a8, shininess: 35 });
    const spineMat = new THREE.MeshPhongMaterial({ color: 0xd8c49a, shininess: 30 });
    const caneMat = new THREE.MeshPhongMaterial({ color: 0xc4a87a, shininess: 50 });
    const gripMat = new THREE.MeshPhongMaterial({ color: 0x1e5b3a, shininess: 30 });
    const gripChevMat = new THREE.MeshBasicMaterial({
      color: 0x8fb39a,
      transparent: true,
      opacity: 0.5,
    });
    const stickerBgMat = new THREE.MeshBasicMaterial({
      color: 0x1e5b3a,
      transparent: true,
      opacity: 0.85,
      side: THREE.DoubleSide,
    });
    const stickerGoldMat = new THREE.MeshBasicMaterial({
      color: 0xc8a84e,
      transparent: true,
      opacity: 0.9,
      side: THREE.DoubleSide,
    });
    const toeGuardMat = new THREE.MeshPhongMaterial({ color: 0xf5f5f0, shininess: 60 });

    // Grip, at the top of the bat.
    const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.048, 0.045, 0.38, 20), gripMat);
    grip.position.y = 0.89;
    grip.castShadow = true;
    bat.add(grip);

    const gripCap = new THREE.Mesh(new THREE.SphereGeometry(0.05, 12, 12), gripMat);
    gripCap.scale.y = 0.6;
    gripCap.position.y = 1.08;
    bat.add(gripCap);

    for (let i = 0; i < 12; i++) {
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(0.048, 0.004, 6, 20),
        i % 2 === 0 ? gripChevMat : gripMat,
      );
      ring.position.y = 0.72 + i * 0.03;
      ring.rotation.x = Math.PI / 2;
      bat.add(ring);
    }

    // Handle.
    const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.038, 0.38, 16), caneMat);
    handle.position.y = 0.51;
    handle.castShadow = true;
    bat.add(handle);

    // Shoulder: widens from the handle to the blade.
    const shoulder = new THREE.Mesh(
      new THREE.CylinderGeometry(0.038, 0.12, 0.2, 16),
      willowEdgeMat,
    );
    shoulder.position.y = 0.22;
    shoulder.castShadow = true;
    bat.add(shoulder);

    // Blade.
    const bladeH = 1.2;
    const bladeW = 0.27;
    const bladeD = 0.08;

    const bladeFace = new THREE.Mesh(
      new THREE.BoxGeometry(bladeW, bladeH, bladeD * 0.5),
      willowMat,
    );
    bladeFace.position.set(0, -0.48, 0.015);
    bladeFace.castShadow = true;
    bat.add(bladeFace);

    const edgeW = 0.025;
    const edgeL = new THREE.Mesh(new THREE.BoxGeometry(edgeW, bladeH, bladeD), willowEdgeMat);
    edgeL.position.set(-bladeW / 2 - edgeW / 2 + 0.005, -0.48, 0);
    edgeL.castShadow = true;
    bat.add(edgeL);

    const edgeR = new THREE.Mesh(new THREE.BoxGeometry(edgeW, bladeH, bladeD), willowEdgeMat);
    edgeR.position.set(bladeW / 2 + edgeW / 2 - 0.005, -0.48, 0);
    edgeR.castShadow = true;
    bat.add(edgeR);

    // Spine: the raised ridge on the back of the blade.
    const spine = new THREE.Mesh(
      new THREE.CylinderGeometry(0.045, 0.035, bladeH * 0.9, 8),
      spineMat,
    );
    spine.position.set(0, -0.48, -bladeD * 0.35);
    spine.castShadow = true;
    bat.add(spine);

    // Sticker on the front of the blade: navy with gold lines.
    const stickerW = 0.18;
    const stickerH = 0.35;
    const stickerBg = new THREE.Mesh(new THREE.PlaneGeometry(stickerW, stickerH), stickerBgMat);
    stickerBg.position.set(0, -0.15, bladeD * 0.26);
    bat.add(stickerBg);

    const sTop = new THREE.Mesh(new THREE.PlaneGeometry(stickerW, 0.005), stickerGoldMat);
    sTop.position.set(0, -0.15 + stickerH / 2, bladeD * 0.261);
    bat.add(sTop);
    const sBot = new THREE.Mesh(new THREE.PlaneGeometry(stickerW, 0.005), stickerGoldMat);
    sBot.position.set(0, -0.15 - stickerH / 2, bladeD * 0.261);
    bat.add(sBot);
    const sLeft = new THREE.Mesh(new THREE.PlaneGeometry(0.005, stickerH), stickerGoldMat);
    sLeft.position.set(-stickerW / 2, -0.15, bladeD * 0.261);
    bat.add(sLeft);
    const sRight = new THREE.Mesh(new THREE.PlaneGeometry(0.005, stickerH), stickerGoldMat);
    sRight.position.set(stickerW / 2, -0.15, bladeD * 0.261);
    bat.add(sRight);

    const diag1 = new THREE.Mesh(new THREE.PlaneGeometry(stickerW * 0.9, 0.004), stickerGoldMat);
    diag1.position.set(0, -0.08, bladeD * 0.262);
    diag1.rotation.z = -0.15;
    bat.add(diag1);
    const diag2 = new THREE.Mesh(new THREE.PlaneGeometry(stickerW * 0.9, 0.004), stickerGoldMat);
    diag2.position.set(0, -0.22, bladeD * 0.262);
    diag2.rotation.z = 0.15;
    bat.add(diag2);

    for (let s = -1; s <= 1; s++) {
      const star = new THREE.Mesh(new THREE.CircleGeometry(0.008, 8), stickerGoldMat);
      star.position.set(s * 0.03, -0.05, bladeD * 0.263);
      bat.add(star);
    }

    // Sweet spot: glows when the bat is hit.
    this.sweetSpot = new THREE.Mesh(
      new THREE.SphereGeometry(0.04, 14, 14),
      new THREE.MeshPhongMaterial({
        color: 0xa8620f,
        emissive: 0x5a3000,
        emissiveIntensity: 0.3,
        transparent: true,
        opacity: 0.4,
      }),
    );
    this.sweetSpot.position.set(0, -0.55, bladeD * 0.26);
    bat.add(this.sweetSpot);

    // Toe, at the bottom of the blade, with a white rubber guard.
    const toeFlat = new THREE.Mesh(
      new THREE.BoxGeometry(bladeW + 0.04, 0.02, bladeD),
      willowEdgeMat,
    );
    toeFlat.position.set(0, -1.09, 0);
    bat.add(toeFlat);
    const toeGuard = new THREE.Mesh(
      new THREE.BoxGeometry(bladeW + 0.05, 0.025, bladeD + 0.01),
      toeGuardMat,
    );
    toeGuard.position.set(0, -1.1, 0);
    bat.add(toeGuard);

    return bat;
  }

  private animate = (): void => {
    this.frame = requestAnimationFrame(this.animate);
    const { group, renderer, scene, camera } = this;
    if (!group || !renderer || !scene || !camera) return;

    // The bat eases towards its target rotation.
    const lerp = 0.12;
    this.currentRot.x += (this.targetRot.x - this.currentRot.x) * lerp;
    this.currentRot.y += (this.targetRot.y - this.currentRot.y) * lerp;
    this.currentRot.z += (this.targetRot.z - this.currentRot.z) * lerp;
    group.rotation.x = -this.currentRot.y;
    group.rotation.y = this.currentRot.x;
    group.rotation.z = this.currentRot.z;

    if (this.sweetSpot) {
      const material = this.sweetSpot.material;
      if (this.glowIntensity > 0.01) {
        material.emissiveIntensity = this.glowIntensity * 3;
        material.opacity = 0.3 + this.glowIntensity * 0.6;
        this.sweetSpot.scale.setScalar(1 + this.glowIntensity * 0.8);
        this.glowIntensity *= 0.9;
      } else {
        material.emissiveIntensity = 0.3;
        material.opacity = 0.4;
        this.sweetSpot.scale.setScalar(1);
      }
    }

    // Swing trace: the blade from its shoulder to its toe.
    group.updateMatrixWorld();
    const toeWorld = group.localToWorld(new THREE.Vector3(0, BLADE_TOE, 0));
    const topWorld = group.localToWorld(new THREE.Vector3(0, BLADE_TOP, 0));

    if (!this.toeMarker) {
      this.toeMarker = new THREE.Mesh(
        new THREE.SphereGeometry(0.03, 10, 10),
        new THREE.MeshBasicMaterial({ color: 0xb42318 }),
      );
      scene.add(this.toeMarker);
    }
    this.toeMarker.position.copy(toeWorld);

    // Extend the trace wherever the toe has moved to. It stays until reset().
    const distance = this.lastTrailPoint ? toeWorld.distanceTo(this.lastTrailPoint) : 999;
    if (distance > 0.003) {
      this.lastTrailPoint = toeWorld.clone();
      this.extendTrail(topWorld, toeWorld);
    }

    renderer.render(scene, camera);
  };
}
