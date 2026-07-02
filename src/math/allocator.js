/**
 * Bench Allocation Engine
 */

export function isPointInPolygon(p, vs) {
  let inside = false;
  for (let i = 0, j = vs.length - 1; i < vs.length; j = i++) {
    const xi = vs[i].x, zi = vs[i].z;
    const xj = vs[j].x, zj = vs[j].z;
    
    const intersect = ((zi > p.z) !== (zj > p.z))
        && (p.x < (xj - xi) * (p.z - zi) / (zj - zi) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}

export function packQuadrilateralRoom(vertices, benchL, benchW, gapX, gapZ, margin) {
  const benches = [];
  
  let minX = Infinity, maxX = -Infinity;
  let minZ = Infinity, maxZ = -Infinity;
  vertices.forEach(v => {
    if (v.x < minX) minX = v.x;
    if (v.x > maxX) maxX = v.x;
    if (v.z < minZ) minZ = v.z;
    if (v.z > maxZ) maxZ = v.z;
  });

  const stepX = benchL + gapX;
  const stepZ = benchW + gapZ;

  const availableWidth = (maxX - minX) - 2 * margin;
  const cols = Math.floor((availableWidth + gapX) / stepX);
  const gridWidth = cols > 0 ? (cols * benchL + (cols - 1) * gapX) : 0;
  const extraPaddingX = cols > 0 ? (availableWidth - gridWidth) / 2 : 0;
  const startX = minX + margin + extraPaddingX + benchL / 2;

  const availableLength = (maxZ - minZ) - 2 * margin;
  const rows = Math.floor((availableLength + gapZ) / stepZ);
  const gridLength = rows > 0 ? (rows * benchW + (rows - 1) * gapZ) : 0;
  const extraPaddingZ = rows > 0 ? (availableLength - gridLength) / 2 : 0;
  const startZ = minZ + margin + extraPaddingZ + benchW / 2;

  const halfL = benchL / 2 + margin;
  const halfW = benchW / 2 + margin;

  for (let r = 0; r < rows; r++) {
    const z = startZ + r * stepZ;
    for (let c = 0; c < cols; c++) {
      const x = startX + c * stepX;

      const corners = [
        { x: x - halfL, z: z - halfW },
        { x: x + halfL, z: z - halfW },
        { x: x - halfL, z: z + halfW },
        { x: x + halfL, z: z + halfW }
      ];

      const allInside = corners.every(pt => isPointInPolygon(pt, vertices));
      if (allInside) {
        benches.push({ x, z, rotation: 0 });
      }
    }
  }

  return benches;
}

export function packCircularRoom(radius, benchL, benchW, gapX, gapZ, margin) {
  const benches = [];
  const stepX = benchL + gapX;
  const stepZ = benchW + gapZ;
  
  const limit = radius - margin;
  if (limit <= 0) return benches;

  for (let z = -radius; z <= radius; z += stepZ) {
    for (let x = -radius; x <= radius; x += stepX) {
      const halfL = benchL / 2 + margin;
      const halfW = benchW / 2 + margin;
      
      const corners = [
        { x: x - halfL, z: z - halfW },
        { x: x + halfL, z: z - halfW },
        { x: x - halfL, z: z + halfW },
        { x: x + halfL, z: z + halfW }
      ];
      
      const allInside = corners.every(c => (c.x * c.x + c.z * c.z) <= radius * radius);
      if (allInside) {
        benches.push({ x, z, rotation: 0 });
      }
    }
  }

  if (benches.length > 0) {
    let minX = Infinity, maxX = -Infinity;
    let minZ = Infinity, maxZ = -Infinity;
    benches.forEach(b => {
      if (b.x < minX) minX = b.x;
      if (b.x > maxX) maxX = b.x;
      if (b.z < minZ) minZ = b.z;
      if (b.z > maxZ) maxZ = b.z;
    });
    const centerX = (minX + maxX) / 2;
    const centerZ = (minZ + maxZ) / 2;
    benches.forEach(b => {
      b.x -= centerX;
      b.z -= centerZ;
    });
  }

  return benches;
}

export function packTriangularRoom(base, height, benchL, benchW, gapX, gapZ, margin) {
  const benches = [];
  const stepX = benchL + gapX;
  const stepZ = benchW + gapZ;
  const halfL = benchL / 2 + margin;
  const halfW = benchW / 2 + margin;
  
  function isPointInside(px, pz) {
    if (pz < 0 || pz > height) return false;
    const xLimit = (height - pz) * base / (2 * height);
    return px >= -xLimit && px <= xLimit;
  }
  
  for (let z = halfW; z + halfW <= height; z += stepZ) {
    const xLimitAtZ = (height - z) * base / (2 * height);
    for (let x = -xLimitAtZ; x <= xLimitAtZ; x += stepX) {
      const corners = [
        { x: x - halfL, z: z - halfW },
        { x: x + halfL, z: z - halfW },
        { x: x - halfL, z: z + halfW },
        { x: x + halfL, z: z + halfW }
      ];
      
      const allInside = corners.every(c => isPointInside(c.x, c.z));
      if (allInside) {
        benches.push({ x, z, rotation: 0 });
      }
    }
  }

  const rows = {};
  benches.forEach(b => {
    if (!rows[b.z]) rows[b.z] = [];
    rows[b.z].push(b);
  });

  const centeredBenches = [];
  Object.keys(rows).forEach(zStr => {
    const rowBenches = rows[zStr];
    let minX = Infinity, maxX = -Infinity;
    rowBenches.forEach(b => {
      if (b.x < minX) minX = b.x;
      if (b.x > maxX) maxX = b.x;
    });
    const rowCenterX = (minX + maxX) / 2;
    rowBenches.forEach(b => {
      centeredBenches.push({
        x: b.x - rowCenterX,
        z: b.z,
        rotation: 0
      });
    });
  });
  
  return centeredBenches;
}

/**
 * Filter to handle the front row separately for ALL shapes:
 * 1. Clears standard benches in the front row Z-range.
 * 2. Packs benches on the left and right side pockets of the podium platform dynamically.
 * 3. Places zero benches on top of the podium (kept empty).
 */
export function applyPodiumRule(benches, shape, roomDims, benchL, benchW, margin, gapX) {
  if (benches.length === 0) return benches;

  let px = 0;
  let pz = 1.5;
  let minX = -15;
  let maxX = 15;
  const podiumWidth = 6.5;
  const halfPodium = podiumWidth / 2;

  // Determine podium center and width boundaries based on shape
  if (shape === 'quadrilateral' && roomDims.vertices) {
    const v0 = roomDims.vertices[0];
    const v1 = roomDims.vertices[1];
    const v2 = roomDims.vertices[2];
    const v3 = roomDims.vertices[3];
    px = (v0.x + v1.x) / 2;
    pz = (v0.z + v1.z) / 2 + 1.5;
    
    // Mathematically intersect horizontal line z = pz with left wall (V0->V3) and right wall (V1->V2)
    let leftWallX = v0.x;
    if (Math.abs(v3.z - v0.z) > 0.001) {
      leftWallX = v0.x + (pz - v0.z) * (v3.x - v0.x) / (v3.z - v0.z);
    }
    let rightWallX = v1.x;
    if (Math.abs(v2.z - v1.z) > 0.001) {
      rightWallX = v1.x + (pz - v1.z) * (v2.x - v1.x) / (v2.z - v1.z);
    }
    minX = leftWallX;
    maxX = rightWallX;
  } else if (shape === 'circular') {
    const radius = roomDims.radius;
    px = 0;
    pz = -radius + 2.5;

    const circleWidthLimit = Math.sqrt(Math.max(0, radius * radius - pz * pz));
    minX = -circleWidthLimit;
    maxX = circleWidthLimit;
  } else if (shape === 'triangular') {
    px = 0;
    pz = 1.5;
    const baseAtZ = ((roomDims.height - pz) * roomDims.base) / roomDims.height;
    minX = -baseAtZ / 2;
    maxX = baseAtZ / 2;
  }

  // Filter out standard benches in the front row Z-range
  const frontRowZThreshold = pz + benchW / 2 + margin;
  const backRowBenches = benches.filter(b => b.z > frontRowZThreshold);

  const sideBenches = [];

  // 1. Pack Left Side of Podium: [minX + margin, px - halfPodium - 0.3]
  const leftStart = minX + margin;
  const leftEnd = px - halfPodium - 0.3;
  if (leftEnd - leftStart >= benchL) {
    const stepX = benchL + gapX;
    const cols = Math.floor((leftEnd - leftStart + gapX) / stepX);
    const gridWidth = cols * benchL + (cols - 1) * gapX;
    const extraPadding = (leftEnd - leftStart - gridWidth) / 2;
    const startX = leftStart + extraPadding + benchL / 2;

    for (let c = 0; c < cols; c++) {
      const bx = startX + c * stepX;
      // Boundary checks
      if (shape === 'quadrilateral') {
        if (isPointInPolygon({ x: bx, z: pz }, roomDims.vertices)) {
          sideBenches.push({ x: bx, z: pz, rotation: 0 });
        }
      } else if (shape === 'circular') {
        const radius = roomDims.radius;
        const xOffset = Math.abs(bx) + benchL / 2 + margin;
        if (xOffset * xOffset + pz * pz <= radius * radius) {
          sideBenches.push({ x: bx, z: pz, rotation: 0 });
        }
      } else if (shape === 'triangular') {
        const baseAtZ = ((roomDims.height - pz) * roomDims.base) / roomDims.height;
        if (Math.abs(bx) + benchL / 2 + margin <= baseAtZ / 2) {
          sideBenches.push({ x: bx, z: pz, rotation: 0 });
        }
      }
    }
  }

  // 2. Pack Right Side of Podium: [px + halfPodium + 0.3, maxX - margin]
  const rightStart = px + halfPodium + 0.3;
  const rightEnd = maxX - margin;
  if (rightEnd - rightStart >= benchL) {
    const stepX = benchL + gapX;
    const cols = Math.floor((rightEnd - rightStart + gapX) / stepX);
    const gridWidth = cols * benchL + (cols - 1) * gapX;
    const extraPadding = (rightEnd - rightStart - gridWidth) / 2;
    const startX = rightStart + extraPadding + benchL / 2;

    for (let c = 0; c < cols; c++) {
      const bx = startX + c * stepX;
      if (shape === 'quadrilateral') {
        if (isPointInPolygon({ x: bx, z: pz }, roomDims.vertices)) {
          sideBenches.push({ x: bx, z: pz, rotation: 0 });
        }
      } else if (shape === 'circular') {
        const radius = roomDims.radius;
        const xOffset = Math.abs(bx) + benchL / 2 + margin;
        if (xOffset * xOffset + pz * pz <= radius * radius) {
          sideBenches.push({ x: bx, z: pz, rotation: 0 });
        }
      } else if (shape === 'triangular') {
        const baseAtZ = ((roomDims.height - pz) * roomDims.base) / roomDims.height;
        if (Math.abs(bx) + benchL / 2 + margin <= baseAtZ / 2) {
          sideBenches.push({ x: bx, z: pz, rotation: 0 });
        }
      }
    }
  }

  // 3. Inject the 2 benches centered on top of the platform (spaced apart)
  const pBench1 = { x: px - benchL / 2 - 0.8, z: pz, rotation: 0, isOnPodium: true };
  const pBench2 = { x: px + benchL / 2 + 0.8, z: pz, rotation: 0, isOnPodium: true };

  return [pBench1, pBench2, ...sideBenches, ...backRowBenches];
}

export function packAdaptiveRoom(shape, roomDims, benchL, benchW, baseGapX, baseGapZ, margin, targetCount = null) {
  function pack(gx, gz) {
    let rawBenches = [];
    if (shape === 'quadrilateral') {
      rawBenches = packQuadrilateralRoom(roomDims.vertices, benchL, benchW, gx, gz, margin);
    } else if (shape === 'circular') {
      rawBenches = packCircularRoom(roomDims.radius, benchL, benchW, gx, gz, margin);
    } else {
      rawBenches = packTriangularRoom(roomDims.base, roomDims.height, benchL, benchW, gx, gz, margin);
    }
    return applyPodiumRule(rawBenches, shape, roomDims, benchL, benchW, margin, gx);
  }

  const baseBenches = pack(baseGapX, baseGapZ);
  if (targetCount === null || targetCount <= 0 || targetCount >= baseBenches.length) {
    return baseBenches;
  }

  let bestBenches = baseBenches;
  for (let s = 1.0; s <= 6.0; s += 0.05) {
    const currentBenches = pack(baseGapX * s, baseGapZ * s);
    if (currentBenches.length >= targetCount) {
      bestBenches = currentBenches;
    } else {
      break;
    }
  }

  return bestBenches.slice(0, targetCount);
}
