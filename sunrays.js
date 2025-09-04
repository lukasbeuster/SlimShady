const canvas = document.getElementById('sunRaysCanvas');
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
const BACKGROUND = '#1a1a1a';

// CONFIGURABLE CONSTANTS
const NUM_RAYS = 150; // More rays for denser coverage
const RIPPLE_INTERVAL = 2000; // Time between ripples in milliseconds
const MAX_CONCURRENT_RIPPLES = 3;

// Animation variables
let time = 0;
let sunX, sunY;
let obstacles = [];
let ripples = [];
let horizonY;

// Initialize positions for realistic horizon cityscape
function initializePositions() {
  sunX = canvas.width * 0.8; // Sun position (upper right)
  sunY = canvas.height * 0.2;
  horizonY = canvas.height * 0.75; // Horizon line at 75% down

  // Horizon-based cityscape silhouette
  obstacles = [
    // Tall building cluster (left side)
    { 
      type: 'building',
      x: canvas.width * 0.1, 
      y: horizonY - canvas.height * 0.4, 
      width: 60, 
      height: canvas.height * 0.4,
      windows: true
    },
    { 
      type: 'building',
      x: canvas.width * 0.18, 
      y: horizonY - canvas.height * 0.35, 
      width: 45, 
      height: canvas.height * 0.35,
      windows: true
    },
    { 
      type: 'building',
      x: canvas.width * 0.25, 
      y: horizonY - canvas.height * 0.45, 
      width: 50, 
      height: canvas.height * 0.45,
      windows: true
    },
    
    // Medium buildings (center)
    { 
      type: 'building',
      x: canvas.width * 0.4, 
      y: horizonY - canvas.height * 0.25, 
      width: 40, 
      height: canvas.height * 0.25,
      windows: true
    },
    { 
      type: 'building',
      x: canvas.width * 0.48, 
      y: horizonY - canvas.height * 0.3, 
      width: 35, 
      height: canvas.height * 0.3,
      windows: true
    },
    
    // Trees interspersed along horizon
    { 
      type: 'tree',
      x: canvas.width * 0.35, 
      y: horizonY - 15, 
      radius: 30
    },
    { 
      type: 'tree',
      x: canvas.width * 0.55, 
      y: horizonY - 10, 
      radius: 25
    },
    { 
      type: 'tree',
      x: canvas.width * 0.62, 
      y: horizonY - 20, 
      radius: 35
    },
    
    // More distant buildings (right side)
    { 
      type: 'building',
      x: canvas.width * 0.7, 
      y: horizonY - canvas.height * 0.2, 
      width: 30, 
      height: canvas.height * 0.2,
      windows: false
    },
    { 
      type: 'building',
      x: canvas.width * 0.75, 
      y: horizonY - canvas.height * 0.15, 
      width: 35, 
      height: canvas.height * 0.15,
      windows: false
    },
    { 
      type: 'building',
      x: canvas.width * 0.82, 
      y: horizonY - canvas.height * 0.18, 
      width: 25, 
      height: canvas.height * 0.18,
      windows: false
    }
  ];
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
      
      const alpha = this.opacity * 0.25;
      ctx.strokeStyle = `rgba(149, 193, 31, ${alpha})`;
      ctx.lineWidth = 1.5;
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
      gradient.addColorStop(0, `rgba(255, 255, 120, ${this.currentOpacity * 0.4})`);
      gradient.addColorStop(0.7, `rgba(149, 193, 31, ${this.currentOpacity * 0.2})`);
      gradient.addColorStop(1, `rgba(149, 193, 31, 0.05)`);
    } else {
      gradient.addColorStop(0, `rgba(255, 255, 100, ${this.currentOpacity * 0.5})`);
      gradient.addColorStop(0.3, `rgba(149, 193, 31, ${this.currentOpacity * 0.3})`);
      gradient.addColorStop(0.8, `rgba(149, 193, 31, ${this.currentOpacity * 0.1})`);
      gradient.addColorStop(1, `rgba(149, 193, 31, 0)`);
    }

    ctx.strokeStyle = gradient;
    ctx.lineWidth = this.blocked ? 1 : 1.2;
    
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
  const baseOpacity = 0.08 + Math.random() * 0.04; // More subtle
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
  const pulseIntensity = 0.8 + Math.sin(time * 0.8) * 0.1;
  
  // Outer glow
  const outerGlow = ctx.createRadialGradient(sunX, sunY, 0, sunX, sunY, 70 * pulseIntensity);
  outerGlow.addColorStop(0, `rgba(255, 255, 150, ${pulseIntensity * 0.6})`);
  outerGlow.addColorStop(0.5, `rgba(149, 193, 31, ${pulseIntensity * 0.3})`);
  outerGlow.addColorStop(1, 'rgba(149, 193, 31, 0)');
  
  ctx.fillStyle = outerGlow;
  ctx.beginPath();
  ctx.arc(sunX, sunY, 70 * pulseIntensity, 0, Math.PI * 2);
  ctx.fill();

  // Inner glow
  const innerGlow = ctx.createRadialGradient(sunX, sunY, 0, sunX, sunY, 25);
  innerGlow.addColorStop(0, '#FFFF80');
  innerGlow.addColorStop(0.7, '#FFE55C');
  innerGlow.addColorStop(1, SCL_GREEN);
  
  ctx.fillStyle = innerGlow;
  ctx.beginPath();
  ctx.arc(sunX, sunY, 25, 0, Math.PI * 2);
  ctx.fill();

  // Sun core - smaller and more refined
  const pulseSize = 12 + Math.sin(time * 1.5) * 2;
  ctx.fillStyle = '#FFFFFF';
  ctx.shadowBlur = 15;
  ctx.shadowColor = '#FFFF00';
  ctx.beginPath();
  ctx.arc(sunX, sunY, pulseSize, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur = 0;
}

function drawHorizonCityscape() {
  // Draw horizon line
  ctx.strokeStyle = 'rgba(149, 193, 31, 0.2)';
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
      buildingGradient.addColorStop(0, '#555555');
      buildingGradient.addColorStop(0.2, SCL_DARK_GREEN);
      buildingGradient.addColorStop(0.8, '#2a2a2a');
      buildingGradient.addColorStop(1, '#1a1a1a');
      
      ctx.fillStyle = buildingGradient;
      ctx.fillRect(obstacle.x, obstacle.y, obstacle.width, obstacle.height);
      
      // Minimal building details
      if (obstacle.windows) {
        ctx.fillStyle = 'rgba(149, 193, 31, 0.2)';
        const windowRows = Math.floor(obstacle.height / 20);
        const windowCols = Math.floor(obstacle.width / 15);
        
        for (let row = 1; row < windowRows; row++) {
          for (let col = 0; col < windowCols; col++) {
            if (Math.random() > 0.6) { // Sparse window lighting
              const winX = obstacle.x + 3 + col * 15;
              const winY = obstacle.y + 5 + row * 20;
              ctx.fillRect(winX, winY, 8, 12);
            }
          }
        }
      }
      
      // Subtle building outline
      ctx.strokeStyle = 'rgba(149, 193, 31, 0.3)';
      ctx.lineWidth = 0.5;
      ctx.strokeRect(obstacle.x, obstacle.y, obstacle.width, obstacle.height);
      
    } else if (obstacle.type === 'tree') {
      // Refined tree design
      const treeGradient = ctx.createRadialGradient(obstacle.x, obstacle.y, 0, obstacle.x, obstacle.y, obstacle.radius);
      treeGradient.addColorStop(0, SCL_GREEN);
      treeGradient.addColorStop(0.7, SCL_DARK_GREEN);
      treeGradient.addColorStop(1, '#1a2008');
      
      ctx.fillStyle = treeGradient;
      ctx.shadowBlur = 8;
      ctx.shadowColor = 'rgba(149, 193, 31, 0.3)';
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

function animate() {
  // Clear with dark background
  ctx.fillStyle = BACKGROUND;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  
  // Update and draw ripples (behind everything)
  updateRipples();
  drawRipples();
  
  // Update and draw rays
  for (const ray of rays) {
    ray.update();
    ray.draw();
  }

  // Draw sun and refined cityscape
  drawSun();
  drawHorizonCityscape();

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

// Start animation
animate();

// Create initial ripple
setTimeout(() => {
  createRipple();
}, 1500);
