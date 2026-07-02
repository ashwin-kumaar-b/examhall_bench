import { useState, useEffect, useRef } from 'react';
import { ClassroomVisualizer } from './visualizer.js';
import * as allocator from './math/allocator.js';

const M_TO_FT = 3.28084;

function App() {
  const [step, setStep] = useState(1);
  const [shape, setShape] = useState('quadrilateral');
  const [quadMode, setQuadMode] = useState('rectangle'); // 'square', 'rectangle', 'freeform'
  const [unit, setUnit] = useState('m');

  const toMeters = (val) => (unit === 'ft' ? val / M_TO_FT : val);
  const fromMeters = (val) => (unit === 'ft' ? val * M_TO_FT : val);
  const unitLabel = unit === 'm' ? 'm' : 'ft';

  // Room geometry state (meters)
  const [roomRadius, setRoomRadius] = useState(10);
  const [roomBase, setRoomBase] = useState(16);
  const [roomHeight, setRoomHeight] = useState(15);

  // Quadrilateral 4 side lengths (meters)
  const [sideA, setSideA] = useState(15); // Front wall / Rectangle Length / Square Side
  const [sideB, setSideB] = useState(20); // Right wall / Rectangle Breadth / Square Side
  const [sideC, setSideC] = useState(15); // Back wall / Rectangle Length / Square Side
  const [sideD, setSideD] = useState(20); // Left wall / Rectangle Breadth / Square Side

  // Bench configurations
  const [benchLength, setBenchLength] = useState(1.2);
  const [benchWidth, setBenchWidth] = useState(0.8);
  const [gapX, setGapX] = useState(2.4);
  const [gapZ, setGapZ] = useState(1.6);
  const [wallMargin, setWallMargin] = useState(0.2);
  const [targetCount, setTargetCount] = useState('');

  const [isCinematic, setIsCinematic] = useState(true);

  const canvasRef = useRef(null);
  const visualizerRef = useRef(null);

  // Synchronize side lengths when quadMode changes to maintain shape constraints
  useEffect(() => {
    if (shape === 'quadrilateral') {
      if (quadMode === 'square') {
        const side = sideA;
        setSideB(side);
        setSideC(side);
        setSideD(side);
      } else if (quadMode === 'rectangle') {
        setSideC(sideA);
        setSideD(sideB);
      }
    }
  }, [quadMode, shape]);

  // Adjust dependent sides in real time when sliders are dragged
  const handleSideAChange = (val) => {
    setSideA(val);
    if (quadMode === 'square') {
      setSideB(val);
      setSideC(val);
      setSideD(val);
    } else if (quadMode === 'rectangle') {
      setSideC(val);
    }
  };

  const handleSideBChange = (val) => {
    setSideB(val);
    if (quadMode === 'square') {
      setSideA(val);
      setSideC(val);
      setSideD(val);
    } else if (quadMode === 'rectangle') {
      setSideD(val);
    }
  };

  const getVerticesFromSides = (a, b, c, d) => {
    const V0 = { x: 0, z: 0 };
    const V1 = { x: a, z: 0 };
    const V3 = { x: 0, z: d };

    const diag = Math.sqrt(a * a + d * d);

    let activeB = b;
    let activeC = c;
    if (activeB + activeC < diag) {
      const sum = activeB + activeC;
      activeB = (activeB / sum) * diag * 1.01;
      activeC = (activeC / sum) * diag * 1.01;
    } else if (Math.abs(activeB - activeC) > diag) {
      if (activeB > activeC) {
        activeB = activeC + diag * 0.99;
      } else {
        activeC = activeB + diag * 0.99;
      }
    }

    const cosTheta = (activeB * activeB + diag * diag - activeC * activeC) / (2 * activeB * diag);
    const theta = Math.acos(Math.max(-1, Math.min(1, cosTheta)));
    const sinTheta = Math.sin(theta);

    const dx = -a;
    const dz = d;

    const rx = dx * cosTheta + dz * sinTheta;
    const rz = dz * cosTheta - dx * sinTheta;

    const V2 = {
      x: V1.x + (rx * activeB) / diag,
      z: V1.z + (rz * activeB) / diag
    };

    return [V0, V1, V2, V3];
  };

  const quadVertices = getVerticesFromSides(sideA, sideB, sideC, sideD);

  let roomDims = {};
  if (shape === 'quadrilateral') {
    roomDims = { vertices: quadVertices };
  } else if (shape === 'circular') {
    roomDims = { radius: roomRadius };
  } else if (shape === 'triangular') {
    roomDims = { base: roomBase, height: roomHeight };
  }

  const benches = allocator.packAdaptiveRoom(
    shape,
    roomDims,
    benchLength,
    benchWidth,
    gapX,
    gapZ,
    wallMargin,
    targetCount !== '' ? parseInt(targetCount, 10) : null
  );

  const studentsCount = benches.length * (benchLength >= 1.5 ? 2 : 1);

  const isCopySecure = gapX >= 1.0 && gapZ >= 1.2;
  const safetyStatus = isCopySecure ? 'SECURE' : 'RISKY';
  const safetyColor = isCopySecure ? 'var(--neon-green)' : 'var(--neon-pink)';

  const downloadBlueprint = () => {
    let minX = -15, maxX = 15;
    let minZ = -15, maxZ = 15;

    if (shape === 'quadrilateral') {
      let xs = quadVertices.map(v => v.x);
      let zs = quadVertices.map(v => v.z);
      minX = Math.min(...xs);
      maxX = Math.max(...xs);
      minZ = Math.min(...zs);
      maxZ = Math.max(...zs);
    } else if (shape === 'circular') {
      minX = -roomRadius;
      maxX = roomRadius;
      minZ = -roomRadius;
      maxZ = roomRadius;
    } else if (shape === 'triangular') {
      minX = -roomBase / 2;
      maxX = roomBase / 2;
      minZ = 0;
      maxZ = roomHeight;
    }

    const widthMeters = maxX - minX;
    const heightMeters = maxZ - minZ;

    const canvas = document.createElement('canvas');
    canvas.width = 1600;
    canvas.height = 1200;
    const ctx = canvas.getContext('2d');

    const pad = 100;
    const drawW = canvas.width - 2 * pad;
    const drawH = canvas.height - 2 * pad;

    const scale = Math.min(drawW / widthMeters, drawH / heightMeters);
    const cx = pad + drawW / 2;
    const cy = pad + drawH / 2;

    const rx = (minX + maxX) / 2;
    const rz = (minZ + maxZ) / 2;

    const mapX = (x) => cx + (x - rx) * scale;
    const mapY = (z) => cy + (z - rz) * scale;

    // Draw background
    ctx.fillStyle = '#060211';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Draw grid
    ctx.strokeStyle = 'rgba(157, 0, 255, 0.12)';
    ctx.lineWidth = 1;
    const gridSpacing = scale * (unit === 'ft' ? 1.0 / M_TO_FT : 1.0);
    for (let x = 0; x < canvas.width; x += gridSpacing) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, canvas.height);
      ctx.stroke();
    }
    for (let y = 0; y < canvas.height; y += gridSpacing) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(canvas.width, y);
      ctx.stroke();
    }

    // Draw crossed centerlines (horizontal & vertical side centers)
    ctx.strokeStyle = 'rgba(255, 0, 170, 0.55)';
    ctx.lineWidth = 3;
    ctx.setLineDash([12, 10]);
    ctx.shadowColor = '#ff00aa';
    ctx.shadowBlur = 8;

    if (shape === 'quadrilateral') {
      const mFront = { x: (quadVertices[0].x + quadVertices[1].x) / 2, z: (quadVertices[0].z + quadVertices[1].z) / 2 };
      const mBack = { x: (quadVertices[3].x + quadVertices[2].x) / 2, z: (quadVertices[3].z + quadVertices[2].z) / 2 };
      const mLeft = { x: (quadVertices[0].x + quadVertices[3].x) / 2, z: (quadVertices[0].z + quadVertices[3].z) / 2 };
      const mRight = { x: (quadVertices[1].x + quadVertices[2].x) / 2, z: (quadVertices[1].z + quadVertices[2].z) / 2 };

      ctx.beginPath();
      ctx.moveTo(mapX(mFront.x), mapY(mFront.z));
      ctx.lineTo(mapX(mBack.x), mapY(mBack.z));
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(mapX(mLeft.x), mapY(mLeft.z));
      ctx.lineTo(mapX(mRight.x), mapY(mRight.z));
      ctx.stroke();
    } else if (shape === 'circular') {
      ctx.beginPath();
      ctx.moveTo(mapX(-roomRadius), mapY(0));
      ctx.lineTo(mapX(roomRadius), mapY(0));
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(mapX(0), mapY(-roomRadius));
      ctx.lineTo(mapX(0), mapY(roomRadius));
      ctx.stroke();
    } else if (shape === 'triangular') {
      ctx.beginPath();
      ctx.moveTo(mapX(0), mapY(0));
      ctx.lineTo(mapX(0), mapY(roomHeight));
      ctx.stroke();

      const mLeft = { x: -roomBase / 4, z: roomHeight / 2 };
      const mRight = { x: roomBase / 4, z: roomHeight / 2 };
      ctx.beginPath();
      ctx.moveTo(mapX(mLeft.x), mapY(mLeft.z));
      ctx.lineTo(mapX(mRight.x), mapY(mRight.z));
      ctx.stroke();
    }

    ctx.setLineDash([]);
    ctx.shadowBlur = 0;

    // Draw Room boundary
    ctx.strokeStyle = '#00f0ff';
    ctx.lineWidth = 5;
    ctx.shadowColor = '#00f0ff';
    ctx.shadowBlur = 12;

    if (shape === 'quadrilateral') {
      ctx.beginPath();
      ctx.moveTo(mapX(quadVertices[0].x), mapY(quadVertices[0].z));
      ctx.lineTo(mapX(quadVertices[1].x), mapY(quadVertices[1].z));
      ctx.lineTo(mapX(quadVertices[2].x), mapY(quadVertices[2].z));
      ctx.lineTo(mapX(quadVertices[3].x), mapY(quadVertices[3].z));
      ctx.closePath();
      ctx.stroke();
    } else if (shape === 'circular') {
      ctx.beginPath();
      ctx.arc(mapX(0), mapY(0), roomRadius * scale, 0, Math.PI * 2);
      ctx.stroke();
    } else if (shape === 'triangular') {
      ctx.beginPath();
      ctx.moveTo(mapX(-roomBase / 2), mapY(0));
      ctx.lineTo(mapX(roomBase / 2), mapY(0));
      ctx.lineTo(mapX(0), mapY(roomHeight));
      ctx.closePath();
      ctx.stroke();
    }

    ctx.shadowBlur = 0;

    // Draw podium
    let px = 0, pz = 1.5;
    if (shape === 'quadrilateral') {
      px = (quadVertices[0].x + quadVertices[1].x) / 2;
      pz = (quadVertices[0].z + quadVertices[1].z) / 2 + 1.5;
    } else if (shape === 'circular') {
      pz = -roomRadius + 2.5;
    }
    const podiumW = 6.5 * scale;
    const podiumH = 2.0 * scale;
    ctx.fillStyle = '#150b28';
    ctx.strokeStyle = '#9d00ff';
    ctx.lineWidth = 3;
    ctx.fillRect(mapX(px) - podiumW / 2, mapY(pz) - podiumH / 2, podiumW, podiumH);
    ctx.strokeRect(mapX(px) - podiumW / 2, mapY(pz) - podiumH / 2, podiumW, podiumH);

    ctx.font = 'bold 16px Outfit, sans-serif';
    ctx.fillStyle = '#00f0ff';
    ctx.textAlign = 'center';
    ctx.fillText('TEACHER PLATFORM', mapX(px), mapY(pz) + 6);

    // Draw benches
    benches.forEach(b => {
      ctx.save();
      ctx.translate(mapX(b.x), mapY(b.z));
      ctx.rotate(b.rotation);

      const w = benchLength * scale;
      const d = benchWidth * scale;

      ctx.fillStyle = b.isOnPodium ? 'rgba(0, 240, 255, 0.18)' : '#0d071c';
      ctx.strokeStyle = b.isOnPodium ? '#00f0ff' : '#00ff88';
      ctx.lineWidth = 2;
      ctx.fillRect(-w / 2, -d / 2, w, d);
      ctx.strokeRect(-w / 2, -d / 2, w, d);

      // Desk divider
      ctx.fillStyle = 'rgba(157, 0, 255, 0.15)';
      ctx.fillRect(-w / 2, -d / 2, w, d * 0.55);
      ctx.strokeRect(-w / 2, -d / 2, w, d * 0.55);

      // Seat divider
      ctx.fillStyle = 'rgba(0, 240, 255, 0.15)';
      ctx.fillRect(-w / 2 + w * 0.03, d / 2 - d * 0.35, w * 0.94, d * 0.35);
      ctx.strokeRect(-w / 2 + w * 0.03, d / 2 - d * 0.35, w * 0.94, d * 0.35);

      ctx.restore();
    });

    // Draw label texts for pillars in Quadrilateral
    if (shape === 'quadrilateral') {
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 14px Orbitron, sans-serif';
      const labels = ["Pole A-D (FL)", "Pole A-B (FR)", "Pole B-C (BR)", "Pole C-D (BL)"];
      quadVertices.forEach((v, idx) => {
        ctx.textAlign = idx === 0 || idx === 3 ? 'right' : 'left';
        ctx.fillText(labels[idx], mapX(v.x) + (idx === 0 || idx === 3 ? -18 : 18), mapY(v.z));
      });
    }

    // Legend Title Block
    ctx.fillStyle = 'rgba(12, 6, 26, 0.9)';
    ctx.strokeStyle = '#b400ff';
    ctx.lineWidth = 2;
    ctx.fillRect(50, 50, 420, 200);
    ctx.strokeRect(50, 50, 420, 200);

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 22px Orbitron, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('EXAM ROOM BLUEPRINT', 70, 90);

    ctx.font = '15px Outfit, sans-serif';
    ctx.fillStyle = '#a39bb4';
    ctx.fillText(`Geometry Shape: ${shape.toUpperCase()}`, 70, 125);
    ctx.fillText(`Total Desks Placed: ${benches.length}`, 70, 150);
    ctx.fillText(`Maximum Students: ${studentsCount}`, 70, 175);
    ctx.fillText(`Copy Prevention: ${isCopySecure ? 'SECURE' : 'RISKY'} (X=${fromMeters(gapX).toFixed(1)}${unitLabel}, Z=${fromMeters(gapZ).toFixed(1)}${unitLabel})`, 70, 200);
    ctx.fillText(`Wall Margin: ${fromMeters(wallMargin).toFixed(1)}${unitLabel}`, 70, 225);

    const link = document.createElement('a');
    link.download = `ExamHall_Blueprint_${shape}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
  };

  // Initialize visualizer
  useEffect(() => {
    if (canvasRef.current) {
      const visualizer = new ClassroomVisualizer(canvasRef.current);
      visualizerRef.current = visualizer;
      visualizer.resize();

      return () => {
        visualizer.destroy();
      };
    }
  }, []);

  // Update cinematic
  useEffect(() => {
    if (visualizerRef.current) {
      visualizerRef.current.setCinematic(isCinematic);
    }
  }, [isCinematic]);

  // Update visualizer when layout shifts
  useEffect(() => {
    if (visualizerRef.current) {
      visualizerRef.current.buildRoom(shape, roomDims);
      visualizerRef.current.drawBenches(benches, benchLength, benchWidth);
      visualizerRef.current.resize();
    }
  }, [
    shape,
    roomRadius,
    roomBase,
    roomHeight,
    sideA,
    sideB,
    sideC,
    sideD,
    benchLength,
    benchWidth,
    gapX,
    gapZ,
    wallMargin,
    targetCount,
    benches.length
  ]);

  return (
    <div className="app-container">
      {/* Sidebar Controls */}
      <aside className="sidebar">
        <header>
          <h1 className="title-glow">ALLOCATE<span>3D</span></h1>
          <p className="subtitle">Exam Hall Desk Planner</p>
        </header>

        {/* Wizard Steps */}
        <div className="wizard-steps">
          <div 
            className={`step-indicator ${step === 1 ? 'active' : 'completed'}`}
            onClick={() => setStep(1)}
          >
            1
          </div>
          <div 
            className={`step-indicator ${step === 2 ? 'active' : ''}`}
            onClick={() => setStep(2)}
          >
            2
          </div>
        </div>

        {/* Form Inputs */}
        <form onSubmit={(e) => e.preventDefault()} style={{ flex: 1 }}>
          {step === 1 ? (
            <div className="step-content">
              <div className="panel">
                <h2 className="panel-title">1. Room Geometry</h2>
                <div className="shape-selector" style={{ marginBottom: '16px' }}>
                  <button 
                    type="button" 
                    className={`btn-shape ${shape === 'quadrilateral' ? 'active' : ''}`}
                    onClick={() => setShape('quadrilateral')}
                  >
                    <svg viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="2" stroke="currentColor" fill="none" strokeWidth="2"/></svg>
                    Quad
                  </button>
                  <button 
                    type="button" 
                    className={`btn-shape ${shape === 'circular' ? 'active' : ''}`}
                    onClick={() => setShape('circular')}
                  >
                    <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" stroke="currentColor" fill="none" strokeWidth="2"/></svg>
                    Circle
                  </button>
                  <button 
                    type="button" 
                    className={`btn-shape ${shape === 'triangular' ? 'active' : ''}`}
                    onClick={() => setShape('triangular')}
                  >
                    <svg viewBox="0 0 24 24"><polygon points="12,3 2,21 22,21" stroke="currentColor" fill="none" strokeWidth="2"/></svg>
                    Triangle
                  </button>
                </div>

                {/* Sub-modes for Quadrilateral */}
                {shape === 'quadrilateral' && (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px', marginBottom: '20px', borderBottom: '1px solid rgba(255,255,255,0.08)', paddingBottom: '14px' }}>
                    <button
                      type="button"
                      className={`hud-control-btn ${quadMode === 'square' ? 'active' : ''}`}
                      onClick={() => setQuadMode('square')}
                      style={{ padding: '6px 0', justifyContent: 'center', width: '100%' }}
                    >
                      Square
                    </button>
                    <button
                      type="button"
                      className={`hud-control-btn ${quadMode === 'rectangle' ? 'active' : ''}`}
                      onClick={() => setQuadMode('rectangle')}
                      style={{ padding: '6px 0', justifyContent: 'center', width: '100%' }}
                    >
                      Rectangle
                    </button>
                    <button
                      type="button"
                      className={`hud-control-btn ${quadMode === 'freeform' ? 'active' : ''}`}
                      onClick={() => setQuadMode('freeform')}
                      style={{ padding: '6px 0', justifyContent: 'center', width: '100%' }}
                    >
                      Freeform
                    </button>
                  </div>
                )}

                {/* Quadrilateral Geometry Sliders */}
                {shape === 'quadrilateral' && (
                  <div className="dim-inputs">
                    {quadMode === 'square' && (
                      <div className="form-group">
                        <label htmlFor="side-square">Side Length <span className="val-display">{fromMeters(sideA).toFixed(1)}{unitLabel}</span></label>
                        <input 
                          type="range" 
                          id="side-square" 
                          min={unit === 'ft' ? 15 : 5} 
                          max={unit === 'ft' ? 100 : 30} 
                          value={fromMeters(sideA)} 
                          step="0.5"
                          onChange={(e) => handleSideAChange(toMeters(parseFloat(e.target.value)))}
                        />
                      </div>
                    )}

                    {quadMode === 'rectangle' && (
                      <>
                        <div className="form-group">
                          <label htmlFor="rect-length">Length (Front/Back) <span className="val-display">{fromMeters(sideA).toFixed(1)}{unitLabel}</span></label>
                          <input 
                            type="range" 
                            id="rect-length" 
                            min={unit === 'ft' ? 15 : 5} 
                            max={unit === 'ft' ? 100 : 30} 
                            value={fromMeters(sideA)} 
                            step="0.5"
                            onChange={(e) => handleSideAChange(toMeters(parseFloat(e.target.value)))}
                          />
                        </div>
                        <div className="form-group">
                          <label htmlFor="rect-breadth">Breadth (Sides) <span className="val-display">{fromMeters(sideB).toFixed(1)}{unitLabel}</span></label>
                          <input 
                            type="range" 
                            id="rect-breadth" 
                            min={unit === 'ft' ? 15 : 5} 
                            max={unit === 'ft' ? 100 : 30} 
                            value={fromMeters(sideB)} 
                            step="0.5"
                            onChange={(e) => handleSideBChange(toMeters(parseFloat(e.target.value)))}
                          />
                        </div>
                      </>
                    )}

                    {quadMode === 'freeform' && (
                      <>
                        <div className="form-group">
                          <label htmlFor="side-a">Front Wall (A) <span className="val-display">{fromMeters(sideA).toFixed(1)}{unitLabel}</span></label>
                          <input 
                            type="range" 
                            id="side-a" 
                            min={unit === 'ft' ? 15 : 5} 
                            max={unit === 'ft' ? 100 : 30} 
                            value={fromMeters(sideA)} 
                            step="0.5"
                            onChange={(e) => handleSideAChange(toMeters(parseFloat(e.target.value)))}
                          />
                        </div>
                        <div className="form-group">
                          <label htmlFor="side-b">Right Wall (B) <span className="val-display">{fromMeters(sideB).toFixed(1)}{unitLabel}</span></label>
                          <input 
                            type="range" 
                            id="side-b" 
                            min={unit === 'ft' ? 15 : 5} 
                            max={unit === 'ft' ? 100 : 30} 
                            value={fromMeters(sideB)} 
                            step="0.5"
                            onChange={(e) => handleSideBChange(toMeters(parseFloat(e.target.value)))}
                          />
                        </div>
                        <div className="form-group">
                          <label htmlFor="side-c">Back Wall (C) <span className="val-display">{fromMeters(sideC).toFixed(1)}{unitLabel}</span></label>
                          <input 
                            type="range" 
                            id="side-c" 
                            min={unit === 'ft' ? 15 : 5} 
                            max={unit === 'ft' ? 100 : 30} 
                            value={fromMeters(sideC)} 
                            step="0.5"
                            onChange={(e) => setSideC(toMeters(parseFloat(e.target.value)))}
                          />
                        </div>
                        <div className="form-group">
                          <label htmlFor="side-d">Left Wall (D) <span className="val-display">{fromMeters(sideD).toFixed(1)}{unitLabel}</span></label>
                          <input 
                            type="range" 
                            id="side-d" 
                            min={unit === 'ft' ? 15 : 5} 
                            max={unit === 'ft' ? 100 : 30} 
                            value={fromMeters(sideD)} 
                            step="0.5"
                            onChange={(e) => setSideD(toMeters(parseFloat(e.target.value)))}
                          />
                        </div>
                      </>
                    )}
                  </div>
                )}

                {/* Circular */}
                {shape === 'circular' && (
                  <div className="dim-inputs">
                    <div className="form-group">
                      <label htmlFor="circ-radius">Room Radius <span className="val-display">{fromMeters(roomRadius).toFixed(1)}{unitLabel}</span></label>
                      <input 
                        type="range" 
                        id="circ-radius" 
                        min={unit === 'ft' ? 12 : 4} 
                        max={unit === 'ft' ? 65 : 20} 
                        value={fromMeters(roomRadius)} 
                        step="0.5"
                        onChange={(e) => setRoomRadius(toMeters(parseFloat(e.target.value)))}
                      />
                    </div>
                  </div>
                )}

                {/* Triangular */}
                {shape === 'triangular' && (
                  <div className="dim-inputs">
                    <div className="form-group">
                      <label htmlFor="tri-base">Triangle Base <span className="val-display">{fromMeters(roomBase).toFixed(1)}{unitLabel}</span></label>
                      <input 
                        type="range" 
                        id="tri-base" 
                        min={unit === 'ft' ? 18 : 6} 
                        max={unit === 'ft' ? 100 : 30} 
                        value={fromMeters(roomBase)} 
                        step="0.5"
                        onChange={(e) => setRoomBase(toMeters(parseFloat(e.target.value)))}
                      />
                    </div>
                    <div className="form-group">
                      <label htmlFor="tri-height">Triangle Height <span className="val-display">{fromMeters(roomHeight).toFixed(1)}{unitLabel}</span></label>
                      <input 
                        type="range" 
                        id="tri-height" 
                        min={unit === 'ft' ? 18 : 6} 
                        max={unit === 'ft' ? 100 : 30} 
                        value={fromMeters(roomHeight)} 
                        step="0.5"
                        onChange={(e) => setRoomHeight(toMeters(parseFloat(e.target.value)))}
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="step-content">
              <div className="panel">
                <h2 className="panel-title">2. Bench Dimensions</h2>
                <div className="form-group">
                  <label htmlFor="bench-length">Bench Length (X) <span className="val-display">{fromMeters(benchLength).toFixed(1)}{unitLabel}</span></label>
                  <input 
                    type="range" 
                    id="bench-length" 
                    min={unit === 'ft' ? 2.5 : 0.8} 
                    max={unit === 'ft' ? 8.2 : 2.5} 
                    value={fromMeters(benchLength)} 
                    step="0.1"
                    onChange={(e) => setBenchLength(toMeters(parseFloat(e.target.value)))}
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="bench-width">Bench Depth (Z) <span className="val-display">{fromMeters(benchWidth).toFixed(1)}{unitLabel}</span></label>
                  <input 
                    type="range" 
                    id="bench-width" 
                    min={unit === 'ft' ? 2.0 : 0.6} 
                    max={unit === 'ft' ? 5.0 : 1.5} 
                    value={fromMeters(benchWidth)} 
                    step="0.1"
                    onChange={(e) => setBenchWidth(toMeters(parseFloat(e.target.value)))}
                  />
                </div>
              </div>

              <div className="panel">
                <h2 className="panel-title">3. Safety Gaps</h2>
                <div className="form-group">
                  <label htmlFor="gap-x">Horizontal Gap <span className="val-display">{fromMeters(gapX).toFixed(1)}{unitLabel}</span></label>
                  <input 
                    type="range" 
                    id="gap-x" 
                    min={unit === 'ft' ? 1.6 : 0.5} 
                    max={unit === 'ft' ? 10.0 : 3.0} 
                    value={fromMeters(gapX)} 
                    step="0.1"
                    onChange={(e) => setGapX(toMeters(parseFloat(e.target.value)))}
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="gap-z">Row-to-Row Gap <span className="val-display">{fromMeters(gapZ).toFixed(1)}{unitLabel}</span></label>
                  <input 
                    type="range" 
                    id="gap-z" 
                    min={unit === 'ft' ? 1.6 : 0.5} 
                    max={unit === 'ft' ? 10.0 : 3.0} 
                    value={fromMeters(gapZ)} 
                    step="0.1"
                    onChange={(e) => setGapZ(toMeters(parseFloat(e.target.value)))}
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="wall-margin">Wall Margin <span className="val-display">{fromMeters(wallMargin).toFixed(1)}{unitLabel}</span></label>
                  <input 
                    type="range" 
                    id="side-d" 
                    min={unit === 'ft' ? 0.6 : 0.2} 
                    max={unit === 'ft' ? 6.6 : 2.0} 
                    value={fromMeters(wallMargin)} 
                    step="0.1"
                    onChange={(e) => setWallMargin(toMeters(parseFloat(e.target.value)))}
                  />
                </div>
              </div>

              <div className="panel">
                <h2 className="panel-title">4. Capacity Target</h2>
                <div className="form-group">
                  <label htmlFor="max-benches">Target count <span style={{fontSize: '0.75rem', opacity: 0.6}}>(Empty = Spreads Max)</span></label>
                  <input 
                    type="number" 
                    id="max-benches" 
                    placeholder="Fill maximum benches"
                    value={targetCount}
                    onChange={(e) => setTargetCount(e.target.value)}
                    min="1"
                  />
                </div>
              </div>
            </div>
          )}
        </form>

        {/* Unit toggle */}
        <div style={{ marginTop: '20px', padding: '10px 0', borderTop: '1px solid rgba(255,255,255,0.08)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', fontFamily: 'var(--font-display)' }}>Unit System:</span>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button 
              type="button" 
              className={`hud-control-btn ${unit === 'm' ? 'active' : ''}`} 
              onClick={() => setUnit('m')}
              style={{ padding: '4px 12px' }}
            >
              Metric (m)
            </button>
            <button 
              type="button" 
              className={`hud-control-btn ${unit === 'ft' ? 'active' : ''}`} 
              onClick={() => setUnit('ft')}
              style={{ padding: '4px 12px' }}
            >
              Imperial (ft)
            </button>
          </div>
        </div>

        {/* Controls */}
        <div className="wizard-controls">
          <button 
            className="btn-nav" 
            id="btn-back" 
            disabled={step === 1}
            onClick={() => setStep(1)}
          >
            Back
          </button>
          <button 
            className="btn-nav btn-primary" 
            id="btn-next"
            onClick={() => {
              if (step === 1) {
                setStep(2);
              } else {
                setIsCinematic(true);
              }
            }}
          >
            {step === 1 ? 'Bench Page' : 'Cinematic View'}
          </button>
        </div>
      </aside>

      {/* Viewport */}
      <main className="viewport-container">
        <canvas ref={canvasRef} id="canvas-container" className="viewport-canvas"></canvas>

        {/* HUD */}
        <div className="hud-overlay">
          <button 
            className={`hud-control-btn ${isCinematic ? 'active' : ''}`}
            onClick={() => setIsCinematic(!isCinematic)}
          >
            <svg style={{width:'16px', height:'16px', fill:'currentColor'}} viewBox="0 0 24 24"><path d="M12,2A10,10,0,1,0,22,12,10,10,0,0,0,12,2Zm1,14.5H11v-2h2Zm0-4H11V7h2Z"/></svg>
            <span>{isCinematic ? 'Stop Rotation' : 'Cinematic Orbit'}</span>
          </button>

          <div className="hud-card">
            <div className="panel-title" style={{marginBottom: '8px', color: 'var(--neon-cyan)', letterSpacing: '1px'}}>Classroom Report</div>
            <div className="hud-stat">
              <span className="hud-stat-label">Benches Placed</span>
              <span className="hud-stat-val" style={{color: 'var(--neon-cyan)'}}>{benches.length}</span>
            </div>
             <div className="hud-stat">
              <span className="hud-stat-label">Copy safety status</span>
              <span className="hud-stat-val" style={{color: safetyColor}}>{safetyStatus}</span>
            </div>
             <div className="hud-stat">
              <span className="hud-stat-label">Est. Students</span>
              <span className="hud-stat-val" style={{color: 'var(--neon-pink)'}}>{studentsCount}</span>
            </div>
            <button 
              className="btn-nav btn-primary" 
              onClick={downloadBlueprint}
              style={{ width: '100%', marginTop: '16px', padding: '10px', fontSize: '0.8rem', height: 'auto', border: '1px solid var(--neon-cyan)', color: 'var(--neon-cyan)' }}
            >
              Download Blueprint
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}

export default App;
