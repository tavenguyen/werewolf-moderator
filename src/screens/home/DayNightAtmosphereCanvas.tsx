import { useEffect, useRef } from 'react';

type Props = {
  dayNightFactor: number; // 0 = Full Day, 1 = Full Night
  cursorPos: { x: number; y: number; active: boolean };
};

type Particle = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  alpha: number;
  baseAlpha: number;
  hue: number;
};

export default function DayNightAtmosphereCanvas({ dayNightFactor, cursorPos }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const factorRef = useRef(dayNightFactor);
  const cursorRef = useRef(cursorPos);
  const smoothFactorRef = useRef(dayNightFactor);
  const smoothCursorRef = useRef({ x: window.innerWidth * 0.5, y: window.innerHeight * 0.5 });

  factorRef.current = dayNightFactor;
  cursorRef.current = cursorPos;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animId: number;
    let width = (canvas.width = window.innerWidth);
    let height = (canvas.height = window.innerHeight);

    const handleResize = () => {
      if (!canvas) return;
      width = canvas.width = window.innerWidth;
      height = canvas.height = window.innerHeight;
    };
    window.addEventListener('resize', handleResize);

    // Initialize Shaky-style physics particles
    const particleCount = Math.min(Math.floor((width * height) / 25000), 55);
    const particles: Particle[] = Array.from({ length: particleCount }, () => ({
      x: Math.random() * width,
      y: Math.random() * height,
      vx: (Math.random() - 0.5) * 0.45,
      vy: -0.2 - Math.random() * 0.5,
      size: Math.random() * 2.8 + 1,
      alpha: Math.random() * 0.6 + 0.2,
      baseAlpha: Math.random() * 0.5 + 0.3,
      hue: Math.random() > 0.5 ? 40 : 25, // amber/golden by default
    }));

    let frameCount = 0;

    const render = () => {
      frameCount++;

      // Lerp smooth factor towards target factor
      smoothFactorRef.current += (factorRef.current - smoothFactorRef.current) * 0.06;
      const factor = smoothFactorRef.current;

      // Lerp cursor position
      const targetCursor = cursorRef.current.active
        ? cursorRef.current
        : { x: width * (0.3 + (1 - factor) * 0.4), y: height * 0.45, active: false };

      smoothCursorRef.current.x += (targetCursor.x - smoothCursorRef.current.x) * 0.08;
      smoothCursorRef.current.y += (targetCursor.y - smoothCursorRef.current.y) * 0.08;
      const cx = smoothCursorRef.current.x;
      const cy = smoothCursorRef.current.y;

      ctx.clearRect(0, 0, width, height);

      // 1. SKY & ATMOSPHERE TINT OVERLAY (Blending with forest photo)
      const skyGrad = ctx.createLinearGradient(0, 0, width, height);
      
      // Interpolate colors:
      // Day top: #2d1e16 (amber dawn) | Night top: #0a0d14 (deep charcoal midnight)
      const topR = Math.round(45 * (1 - factor) + 10 * factor);
      const topG = Math.round(30 * (1 - factor) + 13 * factor);
      const topB = Math.round(22 * (1 - factor) + 20 * factor);

      // Day bottom: #14100c | Night bottom: #050609
      const botR = Math.round(20 * (1 - factor) + 5 * factor);
      const botG = Math.round(16 * (1 - factor) + 6 * factor);
      const botB = Math.round(12 * (1 - factor) + 9 * factor);

      const topAlpha = 0.42 + factor * 0.25;
      const botAlpha = 0.35 + factor * 0.35;

      skyGrad.addColorStop(0, `rgba(${topR}, ${topG}, ${topB}, ${topAlpha})`);
      skyGrad.addColorStop(1, `rgba(${botR}, ${botG}, ${botB}, ${botAlpha})`);
      ctx.fillStyle = skyGrad;
      ctx.fillRect(0, 0, width, height);

      // 2. CELESTIAL BODIES (MẶT TRỜI vs MẶT TRĂNG MÁU)
      // Day Sun on the Left: Visible when factor < 0.7
      if (factor < 0.75) {
        const sunAlpha = Math.max(0, (0.75 - factor) / 0.75);
        const sunX = width * 0.22;
        const sunY = height * 0.24 + (factor * 40);

        // Sun corona
        const sunGlow = ctx.createRadialGradient(sunX, sunY, 10, sunX, sunY, 180);
        sunGlow.addColorStop(0, `rgba(245, 175, 75, ${0.45 * sunAlpha})`);
        sunGlow.addColorStop(0.3, `rgba(201, 134, 56, ${0.2 * sunAlpha})`);
        sunGlow.addColorStop(1, 'rgba(201, 134, 56, 0)');
        ctx.fillStyle = sunGlow;
        ctx.beginPath();
        ctx.arc(sunX, sunY, 180, 0, Math.PI * 2);
        ctx.fill();

        // Sun Core
        ctx.fillStyle = `rgba(255, 235, 190, ${0.85 * sunAlpha})`;
        ctx.beginPath();
        ctx.arc(sunX, sunY, 32, 0, Math.PI * 2);
        ctx.fill();
      }

      // Night Moon on the Right: Visible when factor > 0.25
      if (factor > 0.25) {
        const moonAlpha = Math.max(0, (factor - 0.25) / 0.75);
        const moonX = width * 0.78;
        const moonY = height * 0.24 - ((1 - factor) * 40);

        // Blood Moon Glow
        const moonGlow = ctx.createRadialGradient(moonX, moonY, 15, moonX, moonY, 200);
        moonGlow.addColorStop(0, `rgba(185, 55, 61, ${0.42 * moonAlpha})`);
        moonGlow.addColorStop(0.4, `rgba(142, 30, 36, ${0.18 * moonAlpha})`);
        moonGlow.addColorStop(1, 'rgba(142, 30, 36, 0)');
        ctx.fillStyle = moonGlow;
        ctx.beginPath();
        ctx.arc(moonX, moonY, 200, 0, Math.PI * 2);
        ctx.fill();

        // Moon Disc (Blood Crescent / Full Moon)
        ctx.fillStyle = `rgba(220, 180, 180, ${0.85 * moonAlpha})`;
        ctx.beginPath();
        ctx.arc(moonX, moonY, 28, 0, Math.PI * 2);
        ctx.fill();

        // Moon dark crater shadow for mystic werewolf feel
        ctx.fillStyle = `rgba(18, 20, 28, ${0.75 * moonAlpha})`;
        ctx.beginPath();
        ctx.arc(moonX - 6, moonY - 4, 25, 0, Math.PI * 2);
        ctx.fill();
      }

      // 3. FLASHLIGHT / LANTERN TORCH EFFECT AT CURSOR (Lồng Đèn Soi Sáng)
      const lanternRadius = 240;
      const lanternGrad = ctx.createRadialGradient(cx, cy, 10, cx, cy, lanternRadius);
      
      // Daylight spotlight is warm golden dust; Night spotlight is warm amber fire torch
      const torchR = Math.round(230 * (1 - factor) + 215 * factor);
      const torchG = Math.round(180 * (1 - factor) + 120 * factor);
      const torchB = Math.round(90 * (1 - factor) + 40 * factor);
      const torchIntensity = 0.16 + Math.sin(frameCount * 0.08) * 0.02; // organic candle flicker

      lanternGrad.addColorStop(0, `rgba(${torchR}, ${torchG}, ${torchB}, ${torchIntensity})`);
      lanternGrad.addColorStop(0.5, `rgba(${torchR}, ${torchG}, ${torchB}, ${torchIntensity * 0.4})`);
      lanternGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');

      ctx.fillStyle = lanternGrad;
      ctx.beginPath();
      ctx.arc(cx, cy, lanternRadius, 0, Math.PI * 2);
      ctx.fill();

      // 4. DISTANT FOREST SILHOUETTE & WOLF EYES (Bottom Horizon)
      const horizonY = height - 90;
      ctx.fillStyle = `rgba(8, 10, 14, ${0.65 + factor * 0.3})`;
      ctx.beginPath();
      ctx.moveTo(0, height);
      ctx.lineTo(0, horizonY + 30);
      
      // Subtle mountain/forest pine undulations
      for (let x = 0; x <= width; x += 60) {
        const peak = Math.sin(x * 0.015) * 22 + Math.cos(x * 0.008) * 15;
        ctx.lineTo(x, horizonY + peak);
      }
      ctx.lineTo(width, height);
      ctx.closePath();
      ctx.fill();

      // Glowing wolf eyes in the forest when Night falls (factor > 0.5)
      if (factor > 0.45) {
        const eyeAlpha = Math.min(1, (factor - 0.45) * 2.2);
        const eyeFlicker = 0.7 + Math.sin(frameCount * 0.1) * 0.3;
        const totalEyeAlpha = eyeAlpha * eyeFlicker;

        // Pair 1 (Right deep woods)
        const eyeX1 = width * 0.86;
        const eyeY1 = horizonY + 12;
        ctx.fillStyle = `rgba(235, 60, 60, ${totalEyeAlpha})`;
        ctx.beginPath();
        ctx.arc(eyeX1, eyeY1, 2.2, 0, Math.PI * 2);
        ctx.arc(eyeX1 + 9, eyeY1, 2.2, 0, Math.PI * 2);
        ctx.fill();

        // Eye glow aura
        ctx.fillStyle = `rgba(235, 60, 60, ${totalEyeAlpha * 0.35})`;
        ctx.beginPath();
        ctx.arc(eyeX1 + 4.5, eyeY1, 8, 0, Math.PI * 2);
        ctx.fill();

        // Pair 2 (Left woods)
        const eyeX2 = width * 0.14;
        const eyeY2 = horizonY + 22;
        ctx.fillStyle = `rgba(215, 170, 50, ${totalEyeAlpha * 0.85})`;
        ctx.beginPath();
        ctx.arc(eyeX2, eyeY2, 2, 0, Math.PI * 2);
        ctx.arc(eyeX2 + 8, eyeY2, 2, 0, Math.PI * 2);
        ctx.fill();
      }

      // 5. SHAKY-STYLE INTERACTIVE PARTICLES (Dust Motes & Fireflies)
      for (let i = 0; i < particles.length; i++) {
        const p = particles[i];

        // Cursor repulsion physics (Shaky physics interaction)
        const dx = p.x - cx;
        const dy = p.y - cy;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const repelRadius = 140;

        if (dist < repelRadius && dist > 1) {
          const force = (1 - dist / repelRadius) * 2.5;
          p.x += (dx / dist) * force;
          p.y += (dy / dist) * force;
        }

        // Natural movement
        p.x += p.vx;
        p.y += p.vy;

        // Wrap edges smoothly
        if (p.y < -10) {
          p.y = height + 10;
          p.x = Math.random() * width;
        }
        if (p.x < -10) p.x = width + 10;
        if (p.x > width + 10) p.x = -10;

        // Dynamic particle coloring:
        // Day = Golden sun dust motes
        // Night = Phosphorescent fireflies (đom đóm rừng)
        const isDayParticle = factor < 0.5;
        const pR = Math.round(245 * (1 - factor) + 90 * factor);
        const pG = Math.round(180 * (1 - factor) + 220 * factor);
        const pB = Math.round(60 * (1 - factor) + 140 * factor);
        const particlePulse = p.baseAlpha * (0.6 + Math.sin(frameCount * 0.05 + i) * 0.4);

        ctx.fillStyle = `rgba(${pR}, ${pG}, ${pB}, ${particlePulse})`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();

        // Subtle glow around fireflies at night
        if (factor > 0.5 && p.size > 2) {
          ctx.fillStyle = `rgba(${pR}, ${pG}, ${pB}, ${particlePulse * 0.25})`;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size * 3, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      animId = requestAnimationFrame(render);
    };

    render();

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener('resize', handleResize);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="home-atmosphere-canvas"
      aria-hidden="true"
    />
  );
}