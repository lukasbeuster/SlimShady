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
const NUM_RAYS = 120; // ← CHANGE THIS NUMBER TO ADJUST RAY COUNT
const RIPPLE_INTERVAL = 1200; // Time between ripples in milliseconds
const MAX_CONCURRENT_RIPPLES = 5;

// Animation variables
let time = 0;
let sunX, sunY;
let obstacles = [];
let ripples = [];

// Initialize positions for street canyon scene
function initializePositions() {
  sunX = canvas.width * 0.85; // Sun position (top right)
  sunY = canvas.height * 0.15;

  // Street canyon obstacles - building, tree, road, park
  obstacles = [
    // Main building on the left (tall office/apartment building)
    { 
      type: 'building',
      x: canvas.width * 0.15, 
      y: canvas.height * 0.2, 
      width: 120, 
      height: canvas.height * 0.6,
      windows: true
    },
    // Tree in front of building
    { 
      type: 'tree',
      x: canvas.width * 0.35, 
      y: canvas.height * 0.7, 
      radius: 45
    },
    // Small building/shop on the right side
    { 
      type: 'building',
      x: canvas.width * 0.7, 
      y: canvas.height * 0.6, 
      width: 90, 
      height: canvas.height * 0.25,
      windows: true
    },
    // Park trees (small cluster)
    { 
      type: 'tree',
      x: canvas.width * 0.8, 
      y: canvas.height * 0.85, 
      radius: 25
    },
    { 
      type: 'tree',
      x: canvas.width * 0.9, 
      y: canvas.height * 0.8, 
      radius: 20
    },
    { 
      type: 'tree',
      x: canvas.width * 0.75, 
      y: canvas.height * 0.9, 
      radius: 18
    }
  ];
}

initializePositions();

// Enhanced Ripple class that interacts with obstacles
class Ripple {
  constructor(x, y) {
    this.x = x;
    this.y = y;
    this.radius = 0;
    this.maxRadius = Math.min(canvas.width, canvas.height) * 0.9;
    this.opacity = 1;
    this.speed = 1.8;
    this.segments = []; // Store segments that aren't blocked
    this.calculateSegments();
  }

  calculateSegments() {
    // Divide circle into segments and check which ones hit obstacles
    const numSegments = 360;
    this.segments = [];
    
    for (let angle = 0; angle < 360; angle += 2) {
      const radians = (angle * Math.PI) / 180;
      const segment = {
        startAngle: radians - 0.02,
        endAngle: radians + 0.02,
        blocked: false,
        maxRadius: this.maxRadius
      };
      
      // Check if this segment hits any obstacle
      segment.maxRadius = this.findObstacleDistance(radians);
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
        minDistance = distance * 0.95; // Stop slightly before obstacle
      }
    }
    
    return minDistance;
  }

  distanceToRectangle(angle, rect) {
    const dx = Math.cos(angle);
    const dy = Math.sin(angle);
    
    // Ray-rectangle intersection
    const left = rect.x;
    const right = rect.x + rect.width;
    const top = rect.y;
    const bottom = rect.y + rect.height;
    
    let tMin = 0;
    let tMax = this.maxRadius;
    
    if (dx !== 0) {
      const tx1 = (left - this.x) / dx;
      const tx2 = (right - this.x) / dx;
      tMin = Math.max(tMin, Math.min(tx1, tx2));
      tMax = Math.min(tMax, Math.max(tx1, tx2));
    }
    
    if (dy !== 0) {
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
      const t2 = (-b + Math.sqrt(discriminant)) / (2 * a);
      
      const minT = Math.min(t1, t2);
      if (minT > 0) {
        return minT;
      }
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
      
      const alpha = this.opacity * 0.4;
      ctx.strokeStyle = `rgba(149, 193, 31, ${alpha})`;
      ctx.lineWidth = 2;
      ctx.setLineDash([3, 6]);
      
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.radius, segment.startAngle, segment.endAngle);
      ctx.stroke();
    }
    
    ctx.setLineDash([]); // Reset dash
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
    // Animate ray intensity - more constant stream effect
    this.currentOpacity = this.baseOpacity + Math.sin(time * 0.3 + this.angle * 5) * 0.02;
    this.currentOpacity = Math.max(0, Math.min(1, this.currentOpacity));
    this.checkObstacles();
  }

  draw() {
    const endX = sunX + Math.cos(this.angle) * this.hitDistance;
    const endY = sunY + Math.sin(this.angle) * this.hitDistance;

    if (this.blocked) {
      // Draw ray up to obstacle
      const gradient = ctx.createLinearGradient(sunX, sunY, endX, endY);
      gradient.addColorStop(0, `rgba(255, 255, 120, ${this.currentOpacity * 0.7})`);
      gradient.addColorStop(0.6, `rgba(149, 193, 31, ${this.currentOpacity * 0.4})`);
      gradient.addColorStop(1, `rgba(149, 193, 31, 0.1)`);

      ctx.strokeStyle = gradient;
      ctx.lineWidth = 1.5;
      
      ctx.beginPath();
      ctx.moveTo(sunX, sunY);
      ctx.lineTo(endX, endY);
      ctx.stroke();
    } else {
      // Draw full ray
      const gradient = ctx.createLinearGradient(sunX, sunY, endX, endY);
      gradient.addColorStop(0, `rgba(255, 255, 100, ${this.currentOpacity * 0.6})`);
      gradient.addColorStop(0.3, `rgba(149, 193, 31, ${this.currentOpacity * 0.4})`);
      gradient.addColorStop(0.8, `rgba(149, 193, 31, ${this.currentOpacity * 0.2})`);
      gradient.addColorStop(1, `rgba(149, 193, 31, 0)`);

      ctx.strokeStyle = gradient;
      ctx.lineWidth = 1.8;
      ctx.shadowBlur = 4;
      ctx.shadowColor = SCL_GREEN;
      
      ctx.beginPath();
      ctx.moveTo(sunX, sunY);
      ctx.lineTo(endX, endY);
      ctx.stroke();
      
      ctx.shadowBlur = 0;
    }
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

// Create sun rays - now easily configurable!
const rays = [];
for (let i = 0; i < NUM_RAYS; i++) {
  const angle = (i / NUM_RAYS) * Math.PI * 2;
  const length = Math.min(canvas.width, canvas.height) * 1.2;
  const baseOpacity = 0.12 + Math.random() * 0.06;
  rays.push(new SunRay(angle, length, baseOpacity));
}

// Ripple management
function createRipple() {
  if (ripples.length < MAX_CONCURRENT_RIPPLES) {
    ripples.push(new Ripple(sunX, sunY));
  }
}

let lastRippleTime = 0;

function drawSun() {
  // Outer glow with subtle pulse
  const pulseIntensity = 0.7 + Math.sin(time * 1.2) * 0.15;
  const outerGlow = ctx.createRadialGradient(sunX, sunY, 0, sunX, sunY, 90 * pulseIntensity);
  outerGlow.addColorStop(0, `rgba(255, 255, 150, ${pulseIntensity * 0.9})`);
  outerGlow.addColorStop(0.4, `rgba(149, 193, 31, ${pulseIntensity * 0.6})`);
  outerGlow.addColorStop(1, 'rgba(149, 193, 31, 0)');
  
  ctx.fillStyle = outerGlow;
  ctx.beginPath();
  ctx.arc(sunX, sunY, 90 * pulseIntensity, 0, Math.PI * 2);
  ctx.fill();

  // Inner glow
  const innerGlow = ctx.createRadialGradient(sunX, sunY, 0, sunX, sunY, 35);
  innerGlow.addColorStop(0, '#FFFF90');
  innerGlow.addColorStop(0.6, '#FFD700');
  innerGlow.addColorStop(1, SCL_GREEN);
  
  ctx.fillStyle = innerGlow;
  ctx.beginPath();
  ctx.arc(sunX, sunY, 35, 0, Math.PI * 2);
  ctx.fill();

  // Sun core
  const pulseSize = 20 + Math.sin(time * 2.2) * 4;
  ctx.fillStyle = '#FFFFFF';
  ctx.shadowBlur = 25;
  ctx.shadowColor = '#FFFF00';
  ctx.beginPath();
  ctx.arc(sunX, sunY, pulseSize, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur = 0;
}

function drawStreetCanyon() {
  // Draw road/street surface first
  const roadGradient = ctx.createLinearGradient(0, canvas.height * 0.85, 0, canvas.height);
  roadGradient.addColorStop(0, '#444444');
  roadGradient.addColorStop(1, '#222222');
  ctx.fillStyle = roadGradient;
  ctx.fillRect(0, canvas.height * 0.85, canvas.width, canvas.height * 0.15);

  // Draw obstacles with enhanced street canyon styling
  for (const obstacle of obstacles) {
    if (obstacle.type === 'building') {
      // Building gradient
      const buildingGradient = ctx.createLinearGradient(obstacle.x, obstacle.y, obstacle.x, obstacle.y + obstacle.height);
      buildingGradient.addColorStop(0, '#666666');
      buildingGradient.addColorStop(0.3, SCL_DARK_GREEN);
      buildingGradient.addColorStop(1, '#2a3013');
      
      ctx.fillStyle = buildingGradient;
      ctx.fillRect(obstacle.x, obstacle.y, obstacle.width, obstacle.height);
      
      // Building windows if specified
      if (obstacle.windows) {
        ctx.fillStyle = 'rgba(255, 255, 150, 0.3)';
        for (let row = 0; row < Math.floor(obstacle.height / 25); row++) {
          for (let col = 0; col < Math.floor(obstacle.width / 20); col++) {
            if (Math.random() > 0.3) { // Some windows are lit
              const winX = obstacle.x + 5 + col * 20;
              const winY = obstacle.y + 10 + row * 25;
              ctx.fillRect(winX, winY, 10, 15);
            }
          }
        }
      }
      
      // Building outline
      ctx.strokeStyle = 'rgba(149, 193, 31, 0.7)';
      ctx.lineWidth = 2;
      ctx.strokeRect(obstacle.x, obstacle.y, obstacle.width, obstacle.height);
      
    } else if (obstacle.type === 'tree') {
      // Tree with more natural look
      const treeGradient = ctx.createRadialGradient(obstacle.x, obstacle.y, 0, obstacle.x, obstacle.y, obstacle.radius);
      treeGradient.addColorStop(0, SCL_GREEN);
      treeGradient.addColorStop(0.6, SCL_DARK_GREEN);
      treeGradient.addColorStop(1, '#1a2008');
      
      ctx.fillStyle = treeGradient;
      ctx.shadowBlur = 12;
      ctx.shadowColor = SCL_GREEN;
      ctx.beginPath();
      ctx.arc(obstacle.x, obstacle.y, obstacle.radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
      
      // Tree trunk
      ctx.fillStyle = '#4a3728';
      const trunkWidth = obstacle.radius * 0.2;
      const trunkHeight = obstacle.radius * 0.8;
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
  // Update existing ripples and remove completed ones
  for (let i = ripples.length - 1; i >= 0; i--) {
    if (!ripples[i].update()) {
      ripples.splice(i, 1);
    }
  }
  
  // Create new ripples periodically
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

  // Draw sun and street canyon scene on top
  drawSun();
  drawStreetCanyon();

  time += 0.025;
  requestAnimationFrame(animate);
}

// Handle window resize
window.addEventListener('resize', () => {
  resizeCanvas();
  initializePositions();
  
  // Update ray lengths
  const maxLength = Math.min(canvas.width, canvas.height) * 1.2;
  for (const ray of rays) {
    ray.length = maxLength;
  }
  
  // Clear and recreate ripples for new dimensions
  ripples = [];
});

// Start animation
animate();

// Create initial ripple after a short delay
setTimeout(() => {
  createRipple();
}, 800);
