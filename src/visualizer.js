import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

export class ClassroomVisualizer {
  constructor(canvasElement) {
    this.canvas = canvasElement;
    this.scene = new THREE.Scene();
    
    // Cyberpunk/dark space background
    this.scene.background = new THREE.Color(0x05020a);
    this.scene.fog = new THREE.FogExp2(0x05020a, 0.012);

    // Setup camera
    this.camera = new THREE.PerspectiveCamera(
      60,
      this.canvas.clientWidth / this.canvas.clientHeight,
      0.1,
      1000
    );
    this.camera.position.set(0, 18, 22);

    // Setup renderer
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true });
    this.renderer.setSize(this.canvas.clientWidth, this.canvas.clientHeight, false);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;

    // Setup controls
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.05;
    this.controls.maxPolarAngle = Math.PI / 2 - 0.02; // Don't go below floor
    this.controls.minDistance = 2;
    this.controls.maxDistance = 120;

    // Lights
    this.setupLighting();

    // Groups for room walls and benches
    this.roomGroup = new THREE.Group();
    this.scene.add(this.roomGroup);

    this.benchesGroup = new THREE.Group();
    this.scene.add(this.benchesGroup);

    // Animation state
    this.isCinematic = true;
    this.cinematicTime = 0;
    this.controls.autoRotate = true;
    this.controls.autoRotateSpeed = 0.6;

    // Start render loop
    this.animationFrameId = null;
    this.animate();
  }

  setupLighting() {
    const ambientLight = new THREE.AmbientLight(0x1d1135, 1.8);
    this.scene.add(ambientLight);

    const topLight = new THREE.DirectionalLight(0x00f0ff, 2.0);
    topLight.position.set(10, 40, 15);
    topLight.castShadow = true;
    topLight.shadow.mapSize.width = 2048;
    topLight.shadow.mapSize.height = 2048;
    topLight.shadow.camera.near = 0.5;
    topLight.shadow.camera.far = 150;
    const d = 40;
    topLight.shadow.camera.left = -d;
    topLight.shadow.camera.right = d;
    topLight.shadow.camera.top = d;
    topLight.shadow.camera.bottom = -d;
    this.scene.add(topLight);

    const pinkAccent = new THREE.PointLight(0xff00aa, 3, 60);
    pinkAccent.position.set(0, 12, -5);
    this.scene.add(pinkAccent);

    const greenAccent = new THREE.PointLight(0x00ff88, 1.5, 40);
    greenAccent.position.set(15, 8, 15);
    this.scene.add(greenAccent);
  }

  resize() {
    const width = this.canvas.clientWidth;
    const height = this.canvas.clientHeight;
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height, false);
  }

  setCinematic(active) {
    this.isCinematic = active;
    this.controls.autoRotate = active;
  }

  buildRoom(type, dimensions) {
    while(this.roomGroup.children.length > 0) { 
      this.roomGroup.remove(this.roomGroup.children[0]); 
    }

    const neonMaterial = new THREE.MeshBasicMaterial({
      color: 0x00f0ff,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.8
    });

    const floorMaterial = new THREE.MeshStandardMaterial({
      color: 0x0a0515,
      roughness: 0.9,
      metalness: 0.1
    });

    const gridHelperColor = 0x3d0c66;
    let floorGeo, floorMesh;

    if (type === 'quadrilateral') {
      const { vertices } = dimensions;
      
      const shape = new THREE.Shape();
      shape.moveTo(vertices[0].x, -vertices[0].z);
      shape.lineTo(vertices[1].x, -vertices[1].z);
      shape.lineTo(vertices[2].x, -vertices[2].z);
      shape.lineTo(vertices[3].x, -vertices[3].z);
      shape.lineTo(vertices[0].x, -vertices[0].z);

      floorGeo = new THREE.ShapeGeometry(shape);
      floorMesh = new THREE.Mesh(floorGeo, floorMaterial);
      floorMesh.rotation.x = -Math.PI / 2;
      floorMesh.position.set(0, -0.01, 0);
      floorMesh.receiveShadow = true;
      this.roomGroup.add(floorMesh);

      let minX = Infinity, maxX = -Infinity;
      let minZ = Infinity, maxZ = -Infinity;
      vertices.forEach(v => {
        if (v.x < minX) minX = v.x;
        if (v.x > maxX) maxX = v.x;
        if (v.z < minZ) minZ = v.z;
        if (v.z > maxZ) maxZ = v.z;
      });

      const width = maxX - minX;
      const length = maxZ - minZ;
      const grid = new THREE.GridHelper(Math.max(width, length) * 2, 40, gridHelperColor, 0x1f0633);
      grid.position.set((minX + maxX) / 2, 0, (minZ + maxZ) / 2);
      this.roomGroup.add(grid);

      const points = [
        new THREE.Vector3(vertices[0].x, 0, vertices[0].z),
        new THREE.Vector3(vertices[1].x, 0, vertices[1].z),
        new THREE.Vector3(vertices[2].x, 0, vertices[2].z),
        new THREE.Vector3(vertices[3].x, 0, vertices[3].z),
        new THREE.Vector3(vertices[0].x, 0, vertices[0].z)
      ];
      
      const borderGeo = new THREE.BufferGeometry().setFromPoints(points);
      const borderLine = new THREE.Line(borderGeo, new THREE.LineBasicMaterial({ color: 0x00f0ff, linewidth: 2 }));
      this.roomGroup.add(borderLine);

      const poleNames = ["Pole A-D (Front-Left)", "Pole A-B (Front-Right)", "Pole B-C (Back-Right)", "Pole C-D (Back-Left)"];
      vertices.forEach((v, index) => {
        this.addWallPillar(v.x, v.z, 4, poleNames[index]);
      });

      const podiumX = (vertices[0].x + vertices[1].x) / 2;
      const podiumZ = (vertices[0].z + vertices[1].z) / 2 + 1.5;
      this.addPodium(podiumX, podiumZ, 0x00f0ff, 6.5);

      this.controls.target.set((minX + maxX) / 2, 0, (minZ + maxZ) / 2);

    } else if (type === 'circular') {
      const { radius } = dimensions;
      
      // Floor
      floorGeo = new THREE.CircleGeometry(radius, 64);
      floorMesh = new THREE.Mesh(floorGeo, floorMaterial);
      floorMesh.rotation.x = -Math.PI / 2;
      floorMesh.position.set(0, -0.01, 0);
      floorMesh.receiveShadow = true;
      this.roomGroup.add(floorMesh);

      // Floor grid
      const grid = new THREE.GridHelper(radius * 3, 30, gridHelperColor, 0x1f0633);
      grid.position.set(0, 0, 0);
      this.roomGroup.add(grid);

      // Border neon
      const ringGeo = new THREE.RingGeometry(radius - 0.05, radius + 0.05, 64);
      const ring = new THREE.Mesh(ringGeo, neonMaterial);
      ring.rotation.x = -Math.PI / 2;
      ring.position.set(0, 0.01, 0);
      this.roomGroup.add(ring);

      // Cylindrical pillars
      for(let i = 0; i < 8; i++) {
        const angle = (i / 8) * Math.PI * 2;
        this.addWallPillar(Math.cos(angle) * radius, Math.sin(angle) * radius, 4);
      }

      this.addPodium(0, -radius + 2.5, 0xff00ff, 6.5);
      this.controls.target.set(0, 0, 0);

    } else if (type === 'triangular') {
      const { base, height } = dimensions;
      
      const shape = new THREE.Shape();
      shape.moveTo(-base/2, 0);
      shape.lineTo(base/2, 0);
      shape.lineTo(0, -height);
      shape.lineTo(-base/2, 0);

      floorGeo = new THREE.ShapeGeometry(shape);
      floorMesh = new THREE.Mesh(floorGeo, floorMaterial);
      floorMesh.rotation.x = -Math.PI / 2;
      floorMesh.position.set(0, -0.01, 0);
      floorMesh.receiveShadow = true;
      this.roomGroup.add(floorMesh);

      // Grid
      const grid = new THREE.GridHelper(Math.max(base, height) * 2, 30, gridHelperColor, 0x1f0633);
      grid.position.set(0, 0, height / 2);
      this.roomGroup.add(grid);

      // Border
      const points = [
        new THREE.Vector3(-base/2, 0, 0),
        new THREE.Vector3(base/2, 0, 0),
        new THREE.Vector3(0, 0, height),
        new THREE.Vector3(-base/2, 0, 0)
      ];
      const borderGeo = new THREE.BufferGeometry().setFromPoints(points);
      const borderLine = new THREE.Line(borderGeo, new THREE.LineBasicMaterial({ color: 0xff00bb, linewidth: 2 }));
      this.roomGroup.add(borderLine);

      // Pillars at triangle vertices
      this.addWallPillar(-base/2, 0, 4);
      this.addWallPillar(base/2, 0, 4);
      this.addWallPillar(0, height, 4);

      this.addPodium(0, 1.5, 0xff00bb, 6.5);
      this.controls.target.set(0, 0, height / 2);
    }
  }

  makeTextSprite(message, color = '#00f0ff') {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 64;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, 256, 64);
    
    ctx.font = 'bold 24px Outfit, sans-serif';
    ctx.fillStyle = color;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = color;
    ctx.shadowBlur = 10;
    ctx.fillText(message, 128, 32);

    const texture = new THREE.CanvasTexture(canvas);
    const spriteMaterial = new THREE.SpriteMaterial({ map: texture, transparent: true });
    const sprite = new THREE.Sprite(spriteMaterial);
    sprite.scale.set(3, 0.75, 1);
    return sprite;
  }

  addWallPillar(x, z, h, labelText = null) {
    const geo = new THREE.CylinderGeometry(0.12, 0.12, h, 8);
    const mat = new THREE.MeshBasicMaterial({ color: 0x7a22ff, wireframe: true });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(x, h/2, z);
    this.roomGroup.add(mesh);

    if (labelText) {
      const sprite = this.makeTextSprite(labelText, '#00f0ff');
      sprite.position.set(x, h + 0.4, z);
      this.roomGroup.add(sprite);
    }
  }

  addPodium(x, z, colorVal, width = 4.0) {
    const podiumGroup = new THREE.Group();
    podiumGroup.position.set(x, 0, z);

    // Platform
    const platformGeo = new THREE.BoxGeometry(width, 0.3, 2);
    const platformMat = new THREE.MeshStandardMaterial({ color: 0x150b28, roughness: 0.6 });
    const platform = new THREE.Mesh(platformGeo, platformMat);
    platform.position.y = 0.15;
    platform.receiveShadow = true;
    platform.castShadow = true;
    podiumGroup.add(platform);

    // Glowing whiteboard
    const screenGeo = new THREE.PlaneGeometry(width + 1.0, 2.5);
    const screenMat = new THREE.MeshBasicMaterial({
      color: colorVal,
      wireframe: true,
      transparent: true,
      opacity: 0.2
    });
    const screen = new THREE.Mesh(screenGeo, screenMat);
    screen.position.set(0, 2.2, -0.9);
    podiumGroup.add(screen);

    // Emissive screen frame
    const frameGeo = new THREE.BoxGeometry(width + 1.2, 2.7, 0.05);
    const frameMat = new THREE.MeshStandardMaterial({
      color: 0x100520,
      emissive: colorVal,
      emissiveIntensity: 0.8
    });
    const frame = new THREE.Mesh(frameGeo, frameMat);
    frame.position.set(0, 2.2, -0.95);
    podiumGroup.add(frame);

    this.roomGroup.add(podiumGroup);
  }

  drawBenches(benches, benchL, benchW) {
    while(this.benchesGroup.children.length > 0) {
      this.benchesGroup.remove(this.benchesGroup.children[0]);
    }

    const deskMaterial = new THREE.MeshStandardMaterial({
      color: 0x090514,
      roughness: 0.2,
      metalness: 0.9
    });

    const frameMaterial = new THREE.MeshStandardMaterial({
      color: 0x180f2d,
      roughness: 0.6,
      metalness: 0.9
    });

    const glowMaterial = new THREE.MeshStandardMaterial({
      color: 0x020108,
      emissive: 0x00f0ff,
      emissiveIntensity: 1.2
    });

    benches.forEach(b => {
      const group = new THREE.Group();
      const posY = b.isOnPodium ? 0.3 : 0;
      group.position.set(b.x, posY, b.z);
      group.rotation.y = b.rotation;

      const deskDepth = benchW * 0.55;
      const seatDepth = benchW * 0.35;
      const seatHeight = 0.45;
      const deskHeight = 0.75;
      const thickness = 0.04;

      // 1. Desktop board
      const deskGeo = new THREE.BoxGeometry(benchL, thickness, deskDepth);
      const deskMesh = new THREE.Mesh(deskGeo, deskMaterial);
      deskMesh.position.set(0, deskHeight - thickness/2, -benchW/2 + deskDepth/2);
      deskMesh.castShadow = true;
      group.add(deskMesh);

      // Glowing desktop border
      const glowGeo = new THREE.BoxGeometry(benchL + 0.02, thickness + 0.01, deskDepth + 0.02);
      const glowMesh = new THREE.Mesh(glowGeo, glowMaterial);
      glowMesh.position.copy(deskMesh.position);
      group.add(glowMesh);

      // 2. Seat board
      const seatGeo = new THREE.BoxGeometry(benchL * 0.96, thickness, seatDepth);
      const seatMesh = new THREE.Mesh(seatGeo, deskMaterial);
      seatMesh.position.set(0, seatHeight - thickness/2, benchW/2 - seatDepth/2);
      seatMesh.castShadow = true;
      group.add(seatMesh);

      // Legs / support structural frames
      const legW = 0.04;
      const leftLegGeo = new THREE.BoxGeometry(legW, deskHeight, deskDepth);
      const leftLeg = new THREE.Mesh(leftLegGeo, frameMaterial);
      leftLeg.position.set(-benchL/2 + legW/2, deskHeight/2, -benchW/2 + deskDepth/2);
      leftLeg.castShadow = true;
      group.add(leftLeg);

      const rightLeg = leftLeg.clone();
      rightLeg.position.x = benchL/2 - legW/2;
      group.add(rightLeg);

      // Seat supports
      const seatLegGeo = new THREE.BoxGeometry(legW, seatHeight, seatDepth);
      const leftSeatLeg = new THREE.Mesh(seatLegGeo, frameMaterial);
      leftSeatLeg.position.set(-benchL/2 + legW/2 + 0.04, seatHeight/2, benchW/2 - seatDepth/2);
      leftSeatLeg.castShadow = true;
      group.add(leftSeatLeg);

      const rightSeatLeg = leftSeatLeg.clone();
      rightSeatLeg.position.x = benchL/2 - legW/2 - 0.04;
      group.add(rightSeatLeg);

      // Longitudinal connecting steel braces at ground
      const braceGeo = new THREE.BoxGeometry(0.03, 0.03, benchW);
      const leftBrace = new THREE.Mesh(braceGeo, frameMaterial);
      leftBrace.position.set(-benchL/2 + 0.08, 0.015, 0);
      leftBrace.castShadow = true;
      group.add(leftBrace);

      const rightBrace = leftBrace.clone();
      rightBrace.position.x = benchL/2 - 0.08;
      group.add(rightBrace);

      this.benchesGroup.add(group);
    });
  }

  animate() {
    this.animationFrameId = requestAnimationFrame(this.animate.bind(this));
    this.controls.update();

    if (this.isCinematic && this.controls.autoRotate) {
      this.cinematicTime += 0.004;
      this.camera.position.y += Math.sin(this.cinematicTime) * 0.012;
    }

    this.renderer.render(this.scene, this.camera);
  }

  destroy() {
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
    }
    // Clean up WebGL context
    this.renderer.dispose();
  }
}
