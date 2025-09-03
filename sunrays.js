const canvas = document.getElementById('sunRaysCanvas');
const ctx = canvas.getContext('2d');

// Resize canvas to full screen
function resizeCanvas() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
}

resizeCanvas();
window.addEventListener('resize', resizeCanvas);

// SCL Colors
const SCL_GREEN = '#95C11F';
const SCL_DARK_GREEN = '#5B7026';
const SCL_BACKGROUND = '#ffffff';

// Animation variables
let time = 0;
let sunX = canvas.width * 0.8; // Sun position (top right)
let sunY = canvas.height * 0.2;

// Building/obstacle positions (simplified building outlines)
let obstacles = [
  { x: canvas.width * 0.3, y: canvas.height * 0.6, width: 60, height: 80 },
  { x: canvas.width * 0.6, y: canvas.height * 0.5, width: 40, height: 100 },
  { x: canvas.width * 0.4, y: canvas.height * 0.8, width: 30, height: 50 },
];

// Tree positions (circles)
let trees = [
  { x: canvas.width * 0.25, y: canvas.height * 0.7, radius: 25 },
  { x: canvas.width * 0.55, y: canvas.height * 0.75, radius: 20 },
  { x: canvas.width * 0.7, y: canvas.height * 0.6, radius: 18 },
];

class SunRay {
  constructor(angle, length, opacity) {
    this.angle = angle;
    this.length = length;
    this.opacity = opacity;
    this.blocked = false;
  }

  update() {
    // Animate ray intensity
    this.opacity = 0.1 + Math.sin(time + this.angle) * 0.05;
  }

  draw() {
    if (this.blocked) return;

    const endX = sunX + Math.cos(this.angle) * this.length;
    const endY = sunY + Math.sin(this.angle) * this.length;

    // Create gradient for ray
    const gradient = ctx.createLinearGradient(sunX, sunY, endX, endY);
    gradient.addColorStop(0, `rgba(149, 193, 31, ${this.opacity})`);
    gradient.addColorStop(0.5, `rgba(149, 193, 31, ${this.opacity * 0.6})`);
    gradient.addColorStop(1, `rgba(149, 193, 31, 0)`);

    ctx.strokeStyle = gradient;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(sunX, sunY);
    ctx.lineTo(endX, endY);
    ctx.stroke();
  }

  checkObstacles() {
    this.blocked = false;
    const endX = sunX + Math.cos(this.angle) * this.length;
    const endY = sunY + Math.sin(this.angle) * this.length;

    // Check building collisions
    for (const building of obstacles) {
      if (this.intersectsRectangle(sunX, sunY, endX, endY, building)) {
        this.blocked = true;
        break;
      }
    }

    // Check tree collisions
    if (!this.blocked) {
      for (const tree of trees) {
        if (this.intersectsCircle(sunX, sunY, endX, endY, tree)) {
          this.blocked = true;
          break;
        }
      }
    }
  }

  intersectsRectangle(x1, y1, x2, y2, rect) {
    // Simple line-rectangle intersection check
    const lineMinX = Math.min(x1, x2);
    const lineMaxX = Math.max(x1, x2);
    const lineMinY = Math.min(y1, y2);
    const lineMaxY = Math.max(y1, y2);
    
    return !(lineMaxX < rect.x || lineMinX > rect.x + rect.width || 
             lineMaxY < rect.y || lineMinY > rect.y + rect.height);
  }

  intersectsCircle(x1, y1, x2, y2, circle) {
    // Distance from circle center to line segment
    const dx = x2 - x1;
    const dy = y2 - y1;
    const length = Math.sqrt(dx * dx + dy * dy);
    
    if (length === 0) return false;
    
    const dot = ((circle.x - x1) * dx + (circle.y - y1) * dy) / (length * length);
    const closestX = x1 + dot * dx;
    const closestY = y1 + dot * dy;
    
    const distance = Math.sqrt((circle.x - closestX) ** 2 + (circle.y - closestY) ** 2);
    return distance <= circle.radius;
  }
}

// Create sun rays
const rays = [];
const numRays = 60;
for (let i = 0; i < numRays; i++) {
  const angle = (i / numRays) * Math.PI * 2;
  const length = Math.min(canvas.width, canvas.height) * 0.8;
  rays.push(new SunRay(angle, length, 0.1));
}

function drawSun() {
  // Sun glow
  const glowGradient = ctx.createRadialGradient(sunX, sunY, 0, sunX, sunY, 50);
  glowGradient.addColorStop(0, 'rgba(255, 255, 100, 0.8)');
  glowGradient.addColorStop(0.3, SCL_GREEN + '80');
  glowGradient.addColorStop(1, 'rgba(149, 193, 31, 0)');
  
  ctx.fillStyle = glowGradient;
  ctx.beginPath();
  ctx.arc(sunX, sunY, 50, 0, Math.PI * 2);
  ctx.fill();

  // Sun core
  ctx.fillStyle = '#FFF700';
  ctx.beginPath();
  ctx.arc(sunX, sunY, 15, 0, Math.PI * 2);
  ctx.fill();
}

function drawObstacles() {
  // Draw buildings (dark rectangles)
  ctx.fillStyle = SCL_DARK_GREEN;
  for (const building of obstacles) {
    ctx.fillRect(building.x, building.y, building.width, building.height);
  }

  // Draw trees (green circles)
  ctx.fillStyle = SCL_GREEN;
  for (const tree of trees) {
    ctx.beginPath();
    ctx.arc(tree.x, tree.y, tree.radius, 0, Math.PI * 2);
    ctx.fill();
  }
}

function animate() {
  // Clear canvas
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  
  // Update and draw rays
  for (const ray of rays) {
    ray.checkObstacles();
    ray.update();
    ray.draw();
  }

  // Draw sun and obstacles on top
  drawSun();
  drawObstacles();

  time += 0.02;
  requestAnimationFrame(animate);
}

// Start animation
animate();

// Update obstacles and sun position on resize
window.addEventListener('resize', () => {
  resizeCanvas();
  
  // Recalculate positions based on new canvas size
  sunX = canvas.width * 0.8;
  sunY = canvas.height * 0.2;
  
  obstacles = [
    { x: canvas.width * 0.3, y: canvas.height * 0.6, width: 60, height: 80 },
    { x: canvas.width * 0.6, y: canvas.height * 0.5, width: 40, height: 100 },
    { x: canvas.width * 0.4, y: canvas.height * 0.8, width: 30, height: 50 },
  ];
  
  trees = [
    { x: canvas.width * 0.25, y: canvas.height * 0.7, radius: 25 },
    { x: canvas.width * 0.55, y: canvas.height * 0.75, radius: 20 },
    { x: canvas.width * 0.7, y: canvas.height * 0.6, radius: 18 },
  ];
  
  // Update ray lengths
  const maxLength = Math.min(canvas.width, canvas.height) * 0.8;
  for (const ray of rays) {
    ray.length = maxLength;
  }
});
