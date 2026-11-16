// The minimap: a small 2D canvas drawn from the same world data the bots walk.
// Walls are hairline blocks, sites are amber squares, attackers are amber dots,
// defenders are pale dots, the bomb is a blinking diamond, the player is a wedge
// showing facing. Redrawn only when the HUD asks, a few times a second.
export function createMinimap(canvas) {
  const ctx2d = canvas.getContext('2d');
  const W = 36;
  const D = 28;
  const scaleX = canvas.width / W;
  const scaleZ = canvas.height / D;
  const toX = (x) => (x + W / 2) * scaleX;
  const toY = (z) => (z + D / 2) * scaleZ;

  const walls = [
    [-3.4, -1, 4.2, 2.2], [3.4, -1, 4.2, 2.2], [0, -5.6, 1.4, 1.4],
    [-9, 3, 1.6, 1.6], [-12, -1, 1.6, 1.6], [-14, -6.4, 0.8, 3.4],
    [-15.6, -11.6, 1.8, 1.8], [-7.4, -8.6, 2.6, 1.2],
    [9, 3, 1.6, 1.6], [12, -1, 1.6, 1.6], [14, -6.4, 0.8, 3.4],
    [15.6, -11.6, 1.8, 1.8], [7.4, -8.6, 2.6, 1.2],
    [-4.5, 8.6, 1.2, 2.6], [4.5, 8.6, 1.2, 2.6],
  ];

  function draw(state) {
    ctx2d.clearRect(0, 0, canvas.width, canvas.height);
    ctx2d.fillStyle = 'rgba(20,22,26,0.85)';
    ctx2d.fillRect(0, 0, canvas.width, canvas.height);
    ctx2d.strokeStyle = '#2c323a';
    ctx2d.strokeRect(0.5, 0.5, canvas.width - 1, canvas.height - 1);
    // Sites.
    ctx2d.fillStyle = '#f0a830';
    ctx2d.globalAlpha = 0.35;
    ctx2d.fillRect(toX(-16.7), toY(-12.1), 6.4 * scaleX, 5.2 * scaleZ);
    ctx2d.fillRect(toX(10.3), toY(-12.1), 6.4 * scaleX, 5.2 * scaleZ);
    ctx2d.globalAlpha = 1;
    ctx2d.fillStyle = '#f0a830';
    ctx2d.font = 'bold 11px system-ui, sans-serif';
    ctx2d.fillText('A', toX(-14.2), toY(-9.2));
    ctx2d.fillText('B', toX(12.8), toY(-9.2));
    // Cover blocks.
    ctx2d.fillStyle = '#98a0a8';
    for (const [x, z, w, d] of walls) {
      ctx2d.fillRect(toX(x - w / 2), toY(z - d / 2), w * scaleX, d * scaleZ);
    }
    // Bots.
    for (const bot of state.bots) {
      if (!bot.alive) continue;
      ctx2d.fillStyle = bot.team === 'attackers' ? '#f0a830' : '#e9e6df';
      ctx2d.beginPath();
      ctx2d.arc(toX(bot.position.x), toY(bot.position.z), 3.5, 0, Math.PI * 2);
      ctx2d.fill();
    }
    // Bomb.
    if (state.bombVisible) {
      ctx2d.fillStyle = '#f0a830';
      const bx = toX(state.bomb.x);
      const by = toY(state.bomb.z);
      ctx2d.beginPath();
      ctx2d.moveTo(bx, by - 5);
      ctx2d.lineTo(bx + 5, by);
      ctx2d.lineTo(bx, by + 5);
      ctx2d.lineTo(bx - 5, by);
      ctx2d.closePath();
      ctx2d.fill();
    }
    // Player wedge, rotated to face the same way as the camera.
    const px = toX(state.player.x);
    const py = toY(state.player.z);
    ctx2d.save();
    ctx2d.translate(px, py);
    ctx2d.rotate(Math.atan2(-Math.sin(state.player.yaw), -Math.cos(state.player.yaw)) + Math.PI / 2);
    ctx2d.fillStyle = '#ffffff';
    ctx2d.beginPath();
    ctx2d.moveTo(0, -6);
    ctx2d.lineTo(4.5, 5);
    ctx2d.lineTo(-4.5, 5);
    ctx2d.closePath();
    ctx2d.fill();
    ctx2d.restore();
  }

  return { draw };
}
