const canvas = document.getElementById('rippleCanvas');
const ctx = canvas.getContext('2d');

canvas.width = window.innerWidth;
canvas.height = window.innerHeight;

// Grid config
const spacing = 30;
const cols = Math.ceil(canvas.width / spacing);
const rows = Math.ceil(canvas.height / spacing);

let time = 0;

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  
  ctx.fillStyle = "#00ffff";
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const cx = x * spacing;
      const cy = y * spacing;

      const dx = cx - canvas.width / 2;
      const dy = cy - canvas.height / 2;
      const dist = Math.sqrt(dx * dx + dy * dy);

      const radius = Math.sin(dist * 0.05 - time) * 4 + 5;

      ctx.beginPath();
      ctx.arc(cx, cy, radius, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  time += 0.05;
  requestAnimationFrame(draw);
}

draw();