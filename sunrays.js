// Wait for DOM to be fully loaded
document.addEventListener('DOMContentLoaded', function() {
  const canvas = document.getElementById('sunRaysCanvas');
  if (!canvas) {
    console.warn('sunRaysCanvas not found');
    return;
  }
  
  const ctx = canvas.getContext('2d');

// Resize canvas to full screen
function resizeCanvas() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
}

// Expose for layout scripts
window.resizeCanvas = resizeCanvas;

resizeCanvas();

// SCL Colors for dark mode
const SCL_GREEN = '#95C11F';
const SCL_DARK_GREEN = '#5B7026';
const DESAT_GREEN = '#8FAE3A';
const DESAT_DARK = '#4C5F1D';
const SCL_AMBER = '#D9A441'; // warm amber for sun accents
const BACKGROUND = '#1a1a1a';

// CONFIGURABLE CONSTANTS
const NUM_RAYS = 150; // More rays for denser coverage
const RIPPLE_INTERVAL = 2000; // Time between ripples in milliseconds (keep timing)
const MAX_CONCURRENT_RIPPLES = 5; // allow more simultaneous pulses

// Animation variables
let time = 0;
let sunX, sunY;
let obstacles = [];
let parallaxX = 0, parallaxY = 0, parallaxTargetX = 0, parallaxTargetY = 0;

// Foreground promenades and animated pedestrians
let promenades = [];
let pedestrians = [];
let furniture = []; // benches, lamps, etc.
let cyclePaths = [];
let cyclists = [];
let exposureNow = 0;      // fraction shaded [0..1]
let exposureDisplay = 0;  // eased display value
let ripples = [];
let horizonY;

// Initialize positions for realistic horizon cityscape
function initializePositions() {
  sunX = canvas.width * 0.8; // Sun position (upper right)
  sunY = canvas.height * 0.2;
  horizonY = canvas.height * 0.82; // Slightly lower horizon for better skyline

  // Horizon-based cityscape silhouette
  obstacles = [
    // Tall building cluster (left side)
    { 
      type: 'building',
      x: canvas.width * 0.1, 
      y: horizonY - canvas.height * 0.4, 
      width: 60, 
      height: canvas.height * 0.4,
      windows: true,
      twinkle: false,
      pf: 0.02
    },
    { 
      type: 'building',
      x: canvas.width * 0.18, 
      y: horizonY - canvas.height * 0.35, 
      width: 45, 
      height: canvas.height * 0.35,
      windows: true,
      twinkle: false,
      pf: 0.02
    },
    { 
      type: 'building',
      x: canvas.width * 0.25, 
      y: horizonY - canvas.height * 0.45, 
      width: 50, 
      height: canvas.height * 0.45,
      windows: true,
      twinkle: false,
      pf: 0.02
    },
    
    // Medium buildings (center)
    { 
      type: 'building',
      x: canvas.width * 0.4, 
      y: horizonY - canvas.height * 0.25, 
      width: 40, 
      height: canvas.height * 0.25,
      windows: true,
      twinkle: false,
      pf: 0.018
    },
    { 
      type: 'building',
      x: canvas.width * 0.48, 
      y: horizonY - canvas.height * 0.3, 
      width: 35, 
      height: canvas.height * 0.3,
      windows: true,
      twinkle: false,
      pf: 0.018
    },
    
    // Trees interspersed along horizon
    { type: 'tree', x: canvas.width * 0.34, y: horizonY - 18, radius: 38, pf: 0.03 },
    { type: 'tree', x: canvas.width * 0.50, y: horizonY - 14, radius: 32, pf: 0.03 },
    { type: 'tree', x: canvas.width * 0.61, y: horizonY - 22, radius: 44, pf: 0.03 },
    
    // More distant buildings (right side)
    { type: 'building', x: canvas.width * 0.7,  y: horizonY - canvas.height * 0.22, width: 34, height: canvas.height * 0.22, windows: true, twinkle: true, pf: 0.016 },
    { 
      type: 'building',
      x: canvas.width * 0.75, 
      y: horizonY - canvas.height * 0.15, 
      width: 35, 
      height: canvas.height * 0.15,
       windows: true,
       twinkle: true,
       pf: 0.016
    },
    { 
      type: 'building',
      x: canvas.width * 0.82, 
      y: horizonY - canvas.height * 0.18, 
      width: 25, 
      height: canvas.height * 0.18,
      windows: true,
      twinkle: true,
      pf: 0.016
    }
  ];

  // Save base positions for parallax
  for (const o of obstacles) { o.baseX = o.x; o.baseY = o.y; }
  // Precompute window patterns for buildings
  for (const o of obstacles) {
    if (o.type === 'building' && o.windows) {
      o.windowsPattern = buildWindowsPattern(o);
    }
  }

  // Define two promenades (sidewalks) across the foreground
  const yBase = Math.min(canvas.height - 80, horizonY + 40);
  promenades = [
    { x1: canvas.width * 0.08, y1: yBase, x2: canvas.width * 0.92, y2: yBase, width: 18 },
    { x1: canvas.width * 0.15, y1: yBase + 36, x2: canvas.width * 0.85, y2: yBase + 36, width: 14 }
  ];
  // Place simple benches and lamps along promenades
  furniture = [];
  for (const pr of promenades) {
    const dx = pr.x2 - pr.x1, dy = pr.y2 - pr.y1;
    const L = Math.hypot(dx, dy) || 1;
    const ux = dx / L, uy = dy / L; // along-path unit (store for furniture)
    const px = -uy, py = ux;        // perpendicular unit
    const count = 4;
    for (let i = 1; i <= count; i++) {
      const t = i / (count + 1);
      const bx = pr.x1 + ux * L * t + px * (pr.width * 1.2);
      const by = pr.y1 + uy * L * t + py * (pr.width * 1.2);
      furniture.push({ type: 'bench', x: bx, y: by, w: 24, h: 6, ax: ux, ay: uy, px, py });
    }
    const lamps = 3;
    for (let j = 1; j <= lamps; j++) {
      const t = j / (lamps + 1);
      const lx = pr.x1 + ux * L * t - px * (pr.width * 1.8);
      const ly = pr.y1 + uy * L * t - py * (pr.width * 1.8);
      furniture.push({ type: 'lamp', x: lx, y: ly, h: 26, px, py });
    }
  }
  // Seed pedestrians
  const seedCount = 10;
  pedestrians = [];
  for (let i = 0; i < seedCount; i++) {
    const p = promenades[i % promenades.length];
    pedestrians.push({
      path: p,
      t: Math.random(),
      speed: 0.02 + Math.random() * 0.03,
      radius: 4 + Math.random() * 2
    });
  }

  // Bike lane midway between promenades (or offset from first if single)
  cyclePaths = [];
  if (promenades.length >= 2) {
    const a = promenades[0], b = promenades[1];
    cyclePaths.push({
      x1: (a.x1 + b.x1) / 2,
      y1: (a.y1 + b.y1) / 2,
      x2: (a.x2 + b.x2) / 2,
      y2: (a.y2 + b.y2) / 2,
      width: 10
    });
  } else if (promenades.length === 1) {
    const p = promenades[0];
    const dx = p.x2 - p.x1, dy = p.y2 - p.y1; const L = Math.hypot(dx, dy) || 1; const px = -dy/L, py = dx/L;
    cyclePaths.push({ x1: p.x1 - px*20, y1: p.y1 - py*20, x2: p.x2 - px*20, y2: p.y2 - py*20, width: 10 });
  }

  // Seed cyclists
  cyclists = [];
  const cycleCount = 4;
  for (let i = 0; i < cycleCount && cyclePaths.length; i++) {
    const path = cyclePaths[0];
    cyclists.push({ path, t: Math.random(), speed: 0.05 + Math.random()*0.04, wheel: 3.2 });
  }
}

// Deterministic pseudo-random generator based on a seed
function seededRandom(seed) {
  let s = Math.sin(seed) * 10000;
  return function() { s = Math.sin(s) * 10000; return s - Math.floor(s); };
}

function buildWindowsPattern(ob) {
  const pattern = [];
  const rows = Math.max(1, Math.floor(ob.height / 20));
  const cols = Math.max(1, Math.floor(ob.width / 15));
  const rnd = seededRandom(ob.baseX + ob.baseY + ob.width);
  for (let r = 1; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if ((r + c) % 2 === 0 || rnd() > 0.6) { // semi-regular with slight variation
        const wx = ob.baseX + 3 + c * 15;
        const wy = ob.baseY + 5 + r * 20;
        pattern.push({ dx: wx - ob.baseX, dy: wy - ob.baseY, w: 8, h: 12, phase: rnd() * Math.PI * 2 });
      }
    }
  }
  return pattern;
}

initializePositions();

// Enhanced Ripple class with horizon-aware collision
class Ripple {
  constructor(x, y) {
    this.x = x;
    this.y = y;
    this.radius = 0;
    this.maxRadius = Math.min(canvas.width, canvas.height) * 0.8;
    this.opacity = 1;
    this.speed = 1.5;
    this.segments = [];
    this.calculateSegments();
  }

  calculateSegments() {
    const numSegments = 720; // Higher resolution for smoother blocking
    this.segments = [];
    
    for (let angle = 0; angle < 360; angle += 0.5) {
      const radians = (angle * Math.PI) / 180;
      const segment = {
        startAngle: radians - 0.005,
        endAngle: radians + 0.005,
        maxRadius: this.findObstacleDistance(radians)
      };
      
      this.segments.push(segment);
    }
  }

  findObstacleDistance(angle) {
    let minDistance = this.maxRadius;
    
    for (const obstacle of obstacles) {
      let distance;
      
      if (obstacle.type === 'building') {
        distance = this.distanceToRectangle(angle, obstacle);
      } else if (obstacle.type === 'tree') {
        distance = this.distanceToCircle(angle, obstacle);
      }
      
      if (distance && distance < minDistance) {
        minDistance = distance * 0.9;
      }
    }
    
    return minDistance;
  }

  distanceToRectangle(angle, rect) {
    const dx = Math.cos(angle);
    const dy = Math.sin(angle);
    
    const left = rect.x;
    const right = rect.x + rect.width;
    const top = rect.y;
    const bottom = rect.y + rect.height;
    
    let tMin = 0;
    let tMax = this.maxRadius;
    
    if (Math.abs(dx) > 0.001) {
      const tx1 = (left - this.x) / dx;
      const tx2 = (right - this.x) / dx;
      tMin = Math.max(tMin, Math.min(tx1, tx2));
      tMax = Math.min(tMax, Math.max(tx1, tx2));
    }
    
    if (Math.abs(dy) > 0.001) {
      const ty1 = (top - this.y) / dy;
      const ty2 = (bottom - this.y) / dy;
      tMin = Math.max(tMin, Math.min(ty1, ty2));
      tMax = Math.min(tMax, Math.max(ty1, ty2));
    }
    
    if (tMin <= tMax && tMin > 0) {
      return tMin;
    }
    return null;
  }

  distanceToCircle(angle, circle) {
    const dx = Math.cos(angle);
    const dy = Math.sin(angle);
    
    const cx = circle.x - this.x;
    const cy = circle.y - this.y;
    
    const a = dx * dx + dy * dy;
    const b = 2 * (dx * cx + dy * cy);
    const c = cx * cx + cy * cy - circle.radius * circle.radius;
    
    const discriminant = b * b - 4 * a * c;
    
    if (discriminant >= 0) {
      const t1 = (-b - Math.sqrt(discriminant)) / (2 * a);
      if (t1 > 0) return t1;
    }
    return null;
  }

  update() {
    this.radius += this.speed;
    this.opacity = Math.max(0, 1 - (this.radius / this.maxRadius));
    
    return this.radius < this.maxRadius && this.opacity > 0.01;
  }

  draw() {
    if (this.opacity <= 0.01) return;

    // Draw ripple segments, stopping at obstacles
    for (const segment of this.segments) {
      if (this.radius > segment.maxRadius) continue;
      
      const alpha = this.opacity * 0.32; // slightly more visible
      ctx.strokeStyle = `rgba(217, 164, 65, ${alpha})`; // amber-toned ripple
      ctx.lineWidth = 1.7;
      ctx.setLineDash([2, 4]);
      
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.radius, segment.startAngle, segment.endAngle);
      ctx.stroke();
    }
    
    ctx.setLineDash([]);
  }
}

class SunRay {
  constructor(angle, length, baseOpacity) {
    this.angle = angle;
    this.length = length;
    this.baseOpacity = baseOpacity;
    this.currentOpacity = baseOpacity;
    this.blocked = false;
    this.hitDistance = length;
  }

  update() {
    // More subtle animation for professional look
    this.currentOpacity = this.baseOpacity + Math.sin(time * 0.2 + this.angle * 3) * 0.015;
    this.currentOpacity = Math.max(0, Math.min(1, this.currentOpacity));
    this.checkObstacles();
  }

  draw() {
    const endX = sunX + Math.cos(this.angle) * this.hitDistance;
    const endY = sunY + Math.sin(this.angle) * this.hitDistance;

    // Create sophisticated gradient
    const gradient = ctx.createLinearGradient(sunX, sunY, endX, endY);
    
    if (this.blocked) {
      gradient.addColorStop(0, `rgba(255, 236, 170, ${this.currentOpacity * 0.48})`);
      gradient.addColorStop(0.7, `rgba(217, 164, 65, ${this.currentOpacity * 0.28})`);
      gradient.addColorStop(1, `rgba(217, 164, 65, 0.08)`);
    } else {
      gradient.addColorStop(0, `rgba(255, 236, 170, ${this.currentOpacity * 0.55})`);
      gradient.addColorStop(0.35, `rgba(217, 164, 65, ${this.currentOpacity * 0.34})`);
      gradient.addColorStop(0.8, `rgba(217, 164, 65, ${this.currentOpacity * 0.14})`);
      gradient.addColorStop(1, `rgba(217, 164, 65, 0)`);
    }

    ctx.strokeStyle = gradient;
    ctx.lineWidth = this.blocked ? 1.05 : 1.3; // slightly stronger
    
    ctx.beginPath();
    ctx.moveTo(sunX, sunY);
    ctx.lineTo(endX, endY);
    ctx.stroke();
  }

  checkObstacles() {
    this.blocked = false;
    this.hitDistance = this.length;
    
    for (const obstacle of obstacles) {
      let distance;
      
      if (obstacle.type === 'building') {
        distance = this.distanceToRectangle(obstacle);
      } else if (obstacle.type === 'tree') {
        distance = this.distanceToCircle(obstacle);
      }
      
      if (distance && distance < this.hitDistance) {
        this.hitDistance = distance;
        this.blocked = true;
      }
    }
  }

  distanceToRectangle(rect) {
    const dx = Math.cos(this.angle);
    const dy = Math.sin(this.angle);
    
    const left = rect.x;
    const right = rect.x + rect.width;
    const top = rect.y;
    const bottom = rect.y + rect.height;
    
    let tMin = 0;
    let tMax = this.length;
    
    if (Math.abs(dx) > 0.001) {
      const tx1 = (left - sunX) / dx;
      const tx2 = (right - sunX) / dx;
      tMin = Math.max(tMin, Math.min(tx1, tx2));
      tMax = Math.min(tMax, Math.max(tx1, tx2));
    }
    
    if (Math.abs(dy) > 0.001) {
      const ty1 = (top - sunY) / dy;
      const ty2 = (bottom - sunY) / dy;
      tMin = Math.max(tMin, Math.min(ty1, ty2));
      tMax = Math.min(tMax, Math.max(ty1, ty2));
    }
    
    if (tMin <= tMax && tMin > 0) {
      return tMin;
    }
    return null;
  }

  distanceToCircle(circle) {
    const dx = Math.cos(this.angle);
    const dy = Math.sin(this.angle);
    
    const cx = circle.x - sunX;
    const cy = circle.y - sunY;
    
    const a = dx * dx + dy * dy;
    const b = 2 * (dx * cx + dy * cy);
    const c = cx * cx + cy * cy - circle.radius * circle.radius;
    
    const discriminant = b * b - 4 * a * c;
    
    if (discriminant >= 0) {
      const t1 = (-b - Math.sqrt(discriminant)) / (2 * a);
      if (t1 > 0) return t1;
    }
    return null;
  }
}

// Create sun rays
const rays = [];
for (let i = 0; i < NUM_RAYS; i++) {
  const angle = (i / NUM_RAYS) * Math.PI * 2;
  const length = Math.min(canvas.width, canvas.height) * 1.1;
  const baseOpacity = 0.10 + Math.random() * 0.05; // Slightly more prominent
  rays.push(new SunRay(angle, length, baseOpacity));
}

function createRipple() {
  if (ripples.length < MAX_CONCURRENT_RIPPLES) {
    ripples.push(new Ripple(sunX, sunY));
  }
}

let lastRippleTime = 0;

function drawSun() {
  // More subtle sun with professional look
  const pulseIntensity = 0.85 + Math.sin(time * 0.8) * 0.12;
  
  // Outer glow
  const outerGlow = ctx.createRadialGradient(sunX, sunY, 0, sunX, sunY, 70 * pulseIntensity);
  outerGlow.addColorStop(0, `rgba(255, 236, 170, ${pulseIntensity * 0.65})`); // warm yellow center
  outerGlow.addColorStop(0.5, `rgba(217, 164, 65, ${pulseIntensity * 0.35})`); // amber mid
  outerGlow.addColorStop(1, 'rgba(217, 164, 65, 0)'); // fade out in amber
  
  ctx.fillStyle = outerGlow;
  ctx.beginPath();
  ctx.arc(sunX, sunY, 70 * pulseIntensity, 0, Math.PI * 2);
  ctx.fill();

  // Inner glow
  const innerGlow = ctx.createRadialGradient(sunX, sunY, 0, sunX, sunY, 25);
  innerGlow.addColorStop(0, '#FFF5B8');
  innerGlow.addColorStop(0.7, '#FFE08A');
  innerGlow.addColorStop(1, SCL_AMBER);
  
  ctx.fillStyle = innerGlow;
  ctx.beginPath();
  ctx.arc(sunX, sunY, 25, 0, Math.PI * 2);
  ctx.fill();

  // Sun core - smaller and more refined
  const pulseSize = 12 + Math.sin(time * 1.5) * 2;
  ctx.fillStyle = '#FFFFFF';
  ctx.shadowBlur = 15;
  ctx.shadowColor = '#FFD37A';
  ctx.beginPath();
  ctx.arc(sunX, sunY, pulseSize, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur = 0;
}

function drawHorizonCityscape() {
  // Draw horizon line
  ctx.strokeStyle = 'rgba(217, 164, 65, 0.25)';
  ctx.lineWidth = 1;
  ctx.setLineDash([5, 15]);
  ctx.beginPath();
  ctx.moveTo(0, horizonY);
  ctx.lineTo(canvas.width, horizonY);
  ctx.stroke();
  ctx.setLineDash([]);

  // Draw obstacles along horizon
  for (const obstacle of obstacles) {
    if (obstacle.type === 'building') {
      // Professional building gradient
      const buildingGradient = ctx.createLinearGradient(obstacle.x, obstacle.y, obstacle.x, obstacle.y + obstacle.height);
      buildingGradient.addColorStop(0, '#4f4f4f');
      buildingGradient.addColorStop(0.25, '#2f2f2f');
      buildingGradient.addColorStop(0.7, '#212121');
      buildingGradient.addColorStop(1, '#181818');
      
      ctx.fillStyle = buildingGradient;
      ctx.fillRect(obstacle.x, obstacle.y, obstacle.width, obstacle.height);
      
      // Daytime windows: static reflections on left, gentle glints on right
      if (obstacle.windows && obstacle.windowsPattern) {
        for (const w of obstacle.windowsPattern) {
          const a = obstacle.twinkle ? (0.08 + 0.10 * Math.max(0, Math.sin(time * 1.2 + w.phase))) : 0.12;
          ctx.fillStyle = `rgba(217, 164, 65, ${a})`;
          ctx.fillRect(obstacle.x + w.dx, obstacle.y + w.dy, w.w, w.h);
        }
      }
      
      // Subtle building outline
      ctx.strokeStyle = 'rgba(217, 164, 65, 0.28)';
      ctx.lineWidth = 0.5;
      ctx.strokeRect(obstacle.x, obstacle.y, obstacle.width, obstacle.height);
      
    } else if (obstacle.type === 'tree') {
      // Refined tree design
      const treeGradient = ctx.createRadialGradient(obstacle.x, obstacle.y, 0, obstacle.x, obstacle.y, obstacle.radius);
      treeGradient.addColorStop(0, DESAT_GREEN);
      treeGradient.addColorStop(0.6, DESAT_DARK);
      treeGradient.addColorStop(1, '#0f1607');
      
      ctx.fillStyle = treeGradient;
      ctx.shadowBlur = 10;
      ctx.shadowColor = 'rgba(217, 164, 65, 0.28)';
      ctx.beginPath();
      ctx.arc(obstacle.x, obstacle.y, obstacle.radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
      
      // Minimal tree trunk
      ctx.fillStyle = '#3a2f1f';
      const trunkWidth = obstacle.radius * 0.15;
      const trunkHeight = obstacle.radius * 0.6;
      ctx.fillRect(obstacle.x - trunkWidth/2, obstacle.y + obstacle.radius - trunkHeight/2, trunkWidth, trunkHeight);
    }
  }
}

// Ray/occlusion helpers for pedestrians
function isShaded(px, py) {
  // cast ray from sun to (px,py) and test intersections with obstacles
  const dx = px - sunX, dy = py - sunY;
  const L = Math.hypot(dx, dy) || 1;
  const ux = dx / L, uy = dy / L; // normalized direction

  // Liang–Barsky style slab test for axis-aligned rectangles
  function rayHitsRect(r) {
    const left = r.x, right = r.x + r.width, top = r.y, bottom = r.y + r.height;
    let tNear = 0, tFar = L; // limit within segment length

    // X slab
    if (Math.abs(ux) < 1e-6) {
      if (sunX < left || sunX > right) return false;
    } else {
      let t1 = (left - sunX) / ux;
      let t2 = (right - sunX) / ux;
      if (t1 > t2) [t1, t2] = [t2, t1];
      tNear = Math.max(tNear, t1);
      tFar = Math.min(tFar, t2);
      if (tNear > tFar) return false;
    }
    // Y slab
    if (Math.abs(uy) < 1e-6) {
      if (sunY < top || sunY > bottom) return false;
    } else {
      let t1 = (top - sunY) / uy;
      let t2 = (bottom - sunY) / uy;
      if (t1 > t2) [t1, t2] = [t2, t1];
      tNear = Math.max(tNear, t1);
      tFar = Math.min(tFar, t2);
      if (tNear > tFar) return false;
    }
    return tNear > 0 && tNear < L;
  }

  // Circle intersection: t = dot(dir, c) ± sqrt(disc)
  function rayHitsCircle(c) {
    const cx = c.x - sunX, cy = c.y - sunY;
    const dot = ux*cx + uy*cy;
    const disc = dot*dot - (cx*cx + cy*cy - c.radius*c.radius);
    if (disc < 0) return false;
    const t = dot - Math.sqrt(disc);
    return t > 0 && t < L;
  }
  for (const o of obstacles) {
    if (o.type === 'building' && rayHitsRect(o)) return true;
    if (o.type === 'tree' && rayHitsCircle(o)) return true;
  }
  return false;
}

function updatePedestrians() {
  let shadedCount = 0;
  for (const p of pedestrians) {
    p.t += p.speed * 0.006; // scale with frame delta
    if (p.t > 1) p.t -= 1;
    const x = p.path.x1 + (p.path.x2 - p.path.x1) * p.t;
    const y = p.path.y1 + (p.path.y2 - p.path.y1) * p.t;
    p.x = x; p.y = y;
    p.shaded = isShaded(x, y);
    if (p.shaded) shadedCount++;
  }
  const ratio = pedestrians.length ? shadedCount / pedestrians.length : 0;
  // ease display value
  exposureDisplay += (ratio - exposureDisplay) * 0.1;
  exposureNow = ratio;
}

function drawPromenades() {
  ctx.save();
  for (const s of promenades) {
    // subtle path
    ctx.strokeStyle = 'rgba(255,255,255,0.06)';
    ctx.lineWidth = s.width;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(s.x1, s.y1);
    ctx.lineTo(s.x2, s.y2);
    ctx.stroke();
    // dashed center line
    ctx.setLineDash([6, 10]);
    ctx.strokeStyle = 'rgba(217,164,65,0.12)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(s.x1, s.y1);
    ctx.lineTo(s.x2, s.y2);
    ctx.stroke();
    ctx.setLineDash([]);
  }
  ctx.restore();
}

function drawCycleLanes() {
  if (!cyclePaths.length) return;
  ctx.save();
  for (const s of cyclePaths) {
    // smooth lane
    ctx.strokeStyle = 'rgba(79,163,182,0.25)'; // teal tint
    ctx.lineWidth = s.width;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(s.x1, s.y1);
    ctx.lineTo(s.x2, s.y2);
    ctx.stroke();
    // dashed center line
    ctx.setLineDash([10, 8]);
    ctx.strokeStyle = 'rgba(255,255,255,0.10)';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(s.x1, s.y1);
    ctx.lineTo(s.x2, s.y2);
    ctx.stroke();
    ctx.setLineDash([]);
  }
  ctx.restore();
}

function drawPedestrians() {
  ctx.save();
  for (const p of pedestrians) {
    const x = p.x, y = p.y;
    const col = p.shaded ? SCL_GREEN : SCL_AMBER;

    // small shadow wedge away from sun
    const dx = x - sunX, dy = y - sunY; const L = Math.hypot(dx, dy) || 1; const ux = dx/L, uy = dy/L; const px = -uy, py = ux;
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath();
    ctx.moveTo(x + px*2, y + py*2);
    ctx.lineTo(x - px*2, y - py*2);
    ctx.lineTo(x - px*2 + ux*24, y - py*2 + uy*24);
    ctx.lineTo(x + px*2 + ux*24, y + py*2 + uy*24);
    ctx.closePath();
    ctx.fill();

    // minimal stick-figure pedestrian: head + torso + legs
    const s = Math.max(3.5, p.radius);
    // head
    ctx.fillStyle = col; // color head by shade state for readability
    ctx.beginPath();
    ctx.arc(x, y - s*1.2, s*0.5, 0, Math.PI*2);
    ctx.fill();
    // torso
    ctx.strokeStyle = col;
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(x, y - s*0.6);
    ctx.lineTo(x, y + s*0.6);
    ctx.stroke();
    // legs
    ctx.lineWidth = 1.1;
    ctx.beginPath();
    ctx.moveTo(x, y + s*0.6);
    ctx.lineTo(x - s*0.6, y + s*1.4);
    ctx.moveTo(x, y + s*0.6);
    ctx.lineTo(x + s*0.6, y + s*1.4);
    ctx.stroke();
  }
  ctx.restore();
}

function drawCyclists() {
  if (!cyclePaths.length) return;
  ctx.save();
  for (const c of cyclists) {
    c.t += c.speed * 0.006; if (c.t > 1) c.t -= 1;
    const p = c.path; const dx = p.x2 - p.x1, dy = p.y2 - p.y1; const L = Math.hypot(dx, dy) || 1; const ux = dx/L, uy = dy/L; const px = -uy, py = ux;
    const x = p.x1 + (p.x2 - p.x1) * c.t; const y = p.y1 + (p.y2 - p.y1) * c.t;
    const shaded = isShaded(x, y);
    const rider = shaded ? SCL_GREEN : SCL_AMBER;
    const wb = 14; const wR = c.wheel; // wheelbase and radius

    // shadow wedge
    const sdx = x - sunX, sdy = y - sunY; const sL = Math.hypot(sdx, sdy) || 1; const sux = sdx/sL, suy = sdy/sL;
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath();
    ctx.moveTo(x + px*3, y + py*3);
    ctx.lineTo(x - px*3, y - py*3);
    ctx.lineTo(x - px*3 + sux*28, y - py*3 + suy*28);
    ctx.lineTo(x + px*3 + sux*28, y + py*3 + suy*28);
    ctx.closePath();
    ctx.fill();

    // wheels spaced ALONG the path (ux,uy), not across
    const wx1 = x - ux*wb/2, wy1 = y - uy*wb/2;
    const wx2 = x + ux*wb/2, wy2 = y + uy*wb/2;
    ctx.strokeStyle = 'rgba(220,220,220,0.7)';
    ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.arc(wx1, wy1, wR, 0, Math.PI*2); ctx.stroke();
    ctx.beginPath(); ctx.arc(wx2, wy2, wR, 0, Math.PI*2); ctx.stroke();
    // frame line
    ctx.strokeStyle = 'rgba(79,163,182,0.8)';
    ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.moveTo(wx1, wy1); ctx.lineTo(wx2, wy2); ctx.stroke();
    // rider
    ctx.fillStyle = rider; ctx.beginPath(); ctx.arc(x, y - 6, 3, 0, Math.PI*2); ctx.fill();
  }
  ctx.restore();
}

function drawCrosswalks() {
  if (!cyclePaths.length) return;
  ctx.save();
  const s = cyclePaths[0];
  const dx = s.x2 - s.x1, dy = s.y2 - s.y1; const L = Math.hypot(dx, dy) || 1; const ux = dx/L, uy = dy/L; const px = -uy, py = ux;
  const centerT = 0.55; const cx = s.x1 + ux*L*centerT, cy = s.y1 + uy*L*centerT;
  // Make stripes horizontal along the lane (long along ux, short across px)
  const stripeLen = 26; // along lane length
  const stripeThick = s.width * 0.8; // across lane thickness
  ctx.fillStyle = 'rgba(255,255,255,0.8)';
  for (let k = -3; k <= 3; k++) {
    const tx = cx + px * (k * stripeThick * 0.6); // step across lane
    const ty = cy + py * (k * stripeThick * 0.6);
    // oriented rectangle centered at (tx,ty), long along path
    ctx.beginPath();
    ctx.moveTo(tx - ux*stripeLen/2 - px*stripeThick/2, ty - uy*stripeLen/2 - py*stripeThick/2);
    ctx.lineTo(tx + ux*stripeLen/2 - px*stripeThick/2, ty + uy*stripeLen/2 - py*stripeThick/2);
    ctx.lineTo(tx + ux*stripeLen/2 + px*stripeThick/2, ty + uy*stripeLen/2 + py*stripeThick/2);
    ctx.lineTo(tx - ux*stripeLen/2 + px*stripeThick/2, ty - uy*stripeLen/2 + py*stripeThick/2);
    ctx.closePath(); ctx.fill();
  }
  ctx.restore();
}

function drawFurniture() {
  ctx.save();
  for (const f of furniture) {
    // simple shadow wedge for furniture
    const dx = f.x - sunX, dy = f.y - sunY; const L = Math.hypot(dx, dy) || 1; const ux = dx/L, uy = dy/L; const px = -uy, py = ux;
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath();
    ctx.moveTo(f.x + px*4, f.y + py*2);
    ctx.lineTo(f.x - px*4, f.y - py*2);
    ctx.lineTo(f.x - px*4 + ux*30, f.y - py*2 + uy*30);
    ctx.lineTo(f.x + px*4 + ux*30, f.y + py*2 + uy*30);
    ctx.closePath();
    ctx.fill();

    if (f.type === 'bench') {
      // bench seat oriented along path axis (ax,ay), thin across (px,py)
      ctx.fillStyle = 'rgba(200,200,200,0.15)';
      ctx.strokeStyle = 'rgba(255,255,255,0.10)';
      ctx.lineWidth = 1;
      const w = f.w, h = f.h;
      const ax = f.ax || 1, ay = f.ay || 0; // fallback if missing
      const px = f.px, py = f.py;
      // corners: +/- ax*w/2 +/- px*h/2
      ctx.beginPath();
      ctx.moveTo(f.x - ax*w/2 - px*h/2, f.y - ay*w/2 - py*h/2);
      ctx.lineTo(f.x + ax*w/2 - px*h/2, f.y + ay*w/2 - py*h/2);
      ctx.lineTo(f.x + ax*w/2 + px*h/2, f.y + ay*w/2 + py*h/2);
      ctx.lineTo(f.x - ax*w/2 + px*h/2, f.y - ay*w/2 + py*h/2);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      // backrest hint along width near one side
      ctx.strokeStyle = 'rgba(255,255,255,0.08)';
      ctx.beginPath();
      ctx.moveTo(f.x - ax*w/2 + px*4, f.y - ay*w/2 + py*4);
      ctx.lineTo(f.x + ax*w/2 + px*4, f.y + ay*w/2 + py*4);
      ctx.stroke();
    } else if (f.type === 'lamp') {
      // pole
      ctx.strokeStyle = 'rgba(220,220,220,0.6)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(f.x, f.y);
      ctx.lineTo(f.x, f.y - f.h);
      ctx.stroke();
      // lamp head
      ctx.fillStyle = 'rgba(255,255,255,0.12)';
      ctx.beginPath();
      ctx.arc(f.x, f.y - f.h, 4, 0, Math.PI*2);
      ctx.fill();
    }
  }
  ctx.restore();
}

function drawExposureMeter() {
  // Responsive margins mirroring header paddings
  const side = (canvas.width <= 768) ? 24 : (canvas.width <= 1024 ? 40 : 60);
  const bottom = (canvas.width <= 768) ? 24 : (canvas.width <= 1024 ? 32 : 40);
  const w = 180, h = 52, r = 6;
  // bottom-right placement aligned to header right margin
  const x = canvas.width - w - side;
  const y = canvas.height - h - bottom;
  // panel
  ctx.save();
  ctx.fillStyle = 'rgba(0,0,0,0.34)';
  ctx.strokeStyle = 'rgba(255,255,255,0.08)';
  ctx.lineWidth = 1;
  // rounded rect
  ctx.beginPath();
  ctx.moveTo(x+r, y);
  ctx.arcTo(x+w, y, x+w, y+h, r);
  ctx.arcTo(x+w, y+h, x, y+h, r);
  ctx.arcTo(x, y+h, x, y, r);
  ctx.arcTo(x, y, x+w, y, r);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // title
  ctx.fillStyle = '#cfcfcf';
  ctx.font = '11px Roboto, sans-serif';
  ctx.fillText('Sun Exposure (now)', x + 10, y + 16);

  // bars
  const barX = x + 10, barY = y + 24, barW = w - 20, barH = 10;
  const shadedFracW = Math.max(0, Math.min(1, exposureDisplay)) * barW;
  // background
  ctx.fillStyle = 'rgba(255,255,255,0.05)';
  ctx.fillRect(barX, barY, barW, barH);
  // shaded (green) left
  ctx.fillStyle = SCL_GREEN;
  ctx.fillRect(barX, barY, shadedFracW, barH);
  // exposed (amber) right
  ctx.fillStyle = SCL_AMBER;
  ctx.fillRect(barX + shadedFracW, barY, barW - shadedFracW, barH);

  // legend
  ctx.fillStyle = '#8a8a8a';
  ctx.font = '10px Roboto, sans-serif';
  const pctShaded = Math.round(exposureDisplay * 100);
  const shadedStr = `Shaded ${pctShaded}%`;
  const expoStr = `Exposed ${100 - pctShaded}%`;
  const shadedLabelW = ctx.measureText(shadedStr).width;
  const expoLabelW = ctx.measureText(expoStr).width;
  const labelY = barY + barH + 14;
  // Left label (shaded)
  ctx.fillStyle = SCL_GREEN; ctx.fillRect(barX, barY + barH + 6, 8, 8);
  ctx.fillStyle = '#8a8a8a'; ctx.fillText(shadedStr, barX + 12, labelY);
  // Right label (exposed), aligned from the right edge
  const rightEdge = x + w - 10; // 10px padding inside panel
  const expoLabelX = rightEdge - expoLabelW;
  ctx.fillStyle = SCL_AMBER; ctx.fillRect(expoLabelX - 12, barY + barH + 6, 8, 8);
  ctx.fillStyle = '#8a8a8a'; ctx.fillText(expoStr, expoLabelX, labelY);
  ctx.restore();
}

function drawRipples() {
  for (const ripple of ripples) {
    ripple.draw();
  }
}

function updateRipples() {
  for (let i = ripples.length - 1; i >= 0; i--) {
    if (!ripples[i].update()) {
      ripples.splice(i, 1);
    }
  }
  
  const currentTime = Date.now();
  if (currentTime - lastRippleTime > RIPPLE_INTERVAL) {
    createRipple();
    lastRippleTime = currentTime;
  }
}

// Compute and draw simple soft shadows cast by obstacles away from the sun
function drawShadows() {
  ctx.save();
  ctx.globalCompositeOperation = 'multiply';
  for (const obstacle of obstacles) {
    let near1x, near1y, near2x, near2y, far1x, far1y, far2x, far2y, extent;
    if (obstacle.type === 'building') {
      const left = obstacle.x;
      const right = obstacle.x + obstacle.width;
      const top = obstacle.y;
      const bottom = obstacle.y + obstacle.height;
      // choose edge opposite the sun horizontally
      const edgeX = (sunX > (left + right) / 2) ? left : right;
      near1x = edgeX; near1y = top;
      near2x = edgeX; near2y = bottom;
      const midx = edgeX; const midy = (top + bottom) / 2;
      const dx = midx - sunX, dy = midy - sunY;
      const len = Math.hypot(dx, dy) || 1;
      const ux = dx / len, uy = dy / len;
      extent = Math.max(canvas.width, canvas.height) * 0.9;
      far1x = near1x + ux * extent; far1y = near1y + uy * extent;
      far2x = near2x + ux * extent; far2y = near2y + uy * extent;
    } else if (obstacle.type === 'tree') {
      const cx = obstacle.x, cy = obstacle.y;
      const base = obstacle.radius * 1.8;
      const extentTree = obstacle.radius * 14;
      const dx = cx - sunX, dy = cy - sunY;
      const len = Math.hypot(dx, dy) || 1;
      const ux = dx / len, uy = dy / len;
      const px = -uy, py = ux;
      near1x = cx + px * (base * 0.5); near1y = cy + py * (base * 0.5);
      near2x = cx - px * (base * 0.5); near2y = cy - py * (base * 0.5);
      far1x = near1x + ux * extentTree; far1y = near1y + uy * extentTree;
      far2x = near2x + ux * extentTree; far2y = near2y + uy * extentTree;
    } else { continue; }

    const grad = ctx.createLinearGradient(near1x, near1y, far1x, far1y);
    grad.addColorStop(0, 'rgba(0,0,0,0.28)');
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.moveTo(near1x, near1y);
    ctx.lineTo(near2x, near2y);
    ctx.lineTo(far2x, far2y);
    ctx.lineTo(far1x, far1y);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}

// Darken edges and subtly mask behind text area to improve legibility
function drawVignette() {
  // Global edge vignette
  const rad = Math.hypot(canvas.width, canvas.height) * 0.6;
  const vg = ctx.createRadialGradient(canvas.width*0.4, canvas.height*0.45, rad*0.2, canvas.width*0.5, canvas.height*0.5, rad);
  vg.addColorStop(0, 'rgba(0,0,0,0)');
  vg.addColorStop(1, 'rgba(0,0,0,0.45)');
  ctx.fillStyle = vg;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Left text panel vignette
  const panelWidth = Math.min(560, canvas.width * 0.55);
  const lg = ctx.createLinearGradient(0, 0, panelWidth, 0);
  lg.addColorStop(0, 'rgba(0,0,0,0.5)');
  lg.addColorStop(0.6, 'rgba(0,0,0,0.22)');
  lg.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = lg;
  ctx.fillRect(0, 0, panelWidth, canvas.height);
}

function animate() {
  // Clear with dark background
  ctx.fillStyle = BACKGROUND;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Ease parallax towards target
  parallaxX += (parallaxTargetX - parallaxX) * 0.06;
  parallaxY += (parallaxTargetY - parallaxY) * 0.06;
  // Apply parallax to obstacle positions
  for (const o of obstacles) {
    const kx = (o.pf || 0.02) * 40; // max px shift
    const ky = (o.pf || 0.02) * 24; // max py shift
    o.x = o.baseX + parallaxX * kx;
    o.y = o.baseY + parallaxY * ky;
  }
  
  // Update and draw ripples (behind everything)
  updateRipples();
  drawRipples();

  // Draw soft shadows from skyline before rays for better readability
  drawShadows();
  // Foreground promenades receive rays/shadows too
  drawPromenades();
  drawCycleLanes();
  drawCrosswalks();
  drawFurniture();
  
  // Update and draw rays
  for (const ray of rays) {
    ray.update();
    ray.draw();
  }

  // Draw sun and refined cityscape
  drawSun();
  drawHorizonCityscape();

  // Subtle vignette to improve text legibility
  drawVignette();

  // Pedestrians at the very end for crispness
  updatePedestrians();
  drawPedestrians();
  drawCyclists();
  drawExposureMeter();

  time += 0.02; // Slower, more professional animation
  requestAnimationFrame(animate);
}

// Handle window resize
window.addEventListener('resize', () => {
  resizeCanvas();
  initializePositions();
  
  const maxLength = Math.min(canvas.width, canvas.height) * 1.1;
  for (const ray of rays) {
    ray.length = maxLength;
  }
  
  ripples = [];
});

// Parallax input (mouse)
window.addEventListener('mousemove', (e) => {
  const nx = (e.clientX / window.innerWidth) - 0.5;
  const ny = (e.clientY / window.innerHeight) - 0.5;
  parallaxTargetX = Math.max(-1, Math.min(1, nx));
  parallaxTargetY = Math.max(-1, Math.min(1, ny));
});

// Start animation
animate();

// Create initial ripple
setTimeout(() => {
  createRipple();
  // Stagger a couple more initial pulses for a richer feel
  setTimeout(createRipple, 300);
  setTimeout(createRipple, 600);
}, 1500);
});
