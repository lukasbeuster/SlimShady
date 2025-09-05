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
