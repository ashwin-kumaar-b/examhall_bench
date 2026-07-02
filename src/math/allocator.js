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
 * Filter to handle front-row pockets and podium top benches based on priority requests.
 * maxSides: limits the number of side benches generated (used for prioritizing main floor).
 */
export function applyPodiumRule(benches, shape, roomDims, benchL, benchW, margin, gapX, podiumCount = 2, maxSides = null) {
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

  let sideBenches = [];

  if (maxSides !== 0) {
    // 1. Pack Left Side of Podium
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

    // 2. Pack Right Side of Podium
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
  }

  // Slice sides if limits requested
  if (maxSides !== null && maxSides >= 0) {
    sideBenches = sideBenches.slice(0, maxSides);
  }

  // 3. Inject benches centered on top of the platform
  const podiumBenches = [];
  if (podiumCount === 2) {
    podiumBenches.push({ x: px - benchL / 2 - 0.8, z: pz, rotation: 0, isOnPodium: true });
    podiumBenches.push({ x: px + benchL / 2 + 0.8, z: pz, rotation: 0, isOnPodium: true });
  } else if (podiumCount === 1) {
    podiumBenches.push({ x: px, z: pz, rotation: 0, isOnPodium: true });
  }

  return [...podiumBenches, ...sideBenches, ...backRowBenches];
}

export function packAdaptiveRoom(shape, roomDims, benchL, benchW, baseGapX, baseGapZ, margin, targetCount = null) {
  function pack(gx, gz, podiumCount = 2, maxSides = null) {
    let rawBenches = [];
    if (shape === 'quadrilateral') {
      rawBenches = packQuadrilateralRoom(roomDims.vertices, benchL, benchW, gx, gz, margin);
    } else if (shape === 'circular') {
      rawBenches = packCircularRoom(roomDims.radius, benchL, benchW, gx, gz, margin);
    } else {
      rawBenches = packTriangularRoom(roomDims.base, roomDims.height, benchL, benchW, gx, gz, margin);
    }
    return applyPodiumRule(rawBenches, shape, roomDims, benchL, benchW, margin, gx, podiumCount, maxSides);
  }

  // If no target count limit, pack maximum capacity
  if (targetCount === null || targetCount <= 0) {
    return pack(baseGapX, baseGapZ, 2, null);
  }

  // Refined priority checks:
  // 1. Pack main floor ONLY (no sides, no podium)
  const maxFloorBenches = pack(baseGapX, baseGapZ, 0, 0);

  if (maxFloorBenches.length >= targetCount) {
    // Fits completely on the main floor. Spread them out across the main floor, keeping podium and sides empty.
    let bestBenches = maxFloorBenches;
    for (let s = 1.0; s <= 6.0; s += 0.05) {
      const currentBenches = pack(baseGapX * s, baseGapZ * s, 0, 0);
      if (currentBenches.length >= targetCount) {
        bestBenches = currentBenches;
      } else {
        break;
      }
    }
    return bestBenches.slice(0, targetCount);
  }

  // 2. Main floor is not enough. We must utilize the podium sides (but not the podium top).
  const maxFloorAndSidesBenches = pack(baseGapX, baseGapZ, 0, null);

  if (maxFloorAndSidesBenches.length >= targetCount) {
    // Fits using main floor + some sides.
    const neededSides = targetCount - maxFloorBenches.length;
    // Pack using exactly the required side count, and 0 podium benches.
    return pack(baseGapX, baseGapZ, 0, neededSides).slice(0, targetCount);
  }

  // 3. Both floor and sides are full. We must use the podium top.
  const neededOnPodium = Math.min(2, targetCount - maxFloorAndSidesBenches.length);
  return pack(baseGapX, baseGapZ, neededOnPodium, null).slice(0, targetCount);
}
