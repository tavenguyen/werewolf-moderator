import { useEffect, useRef } from 'react';

type Props = {
  dayNightFactor: number; // 0 = Full Day, 1 = Full Night
  cursorPos: { x: number; y: number; active: boolean };
  parallaxOffset?: { x: number; y: number }; // Normalized -1 to 1 from mouse / gyroscope
};

type Particle = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  alpha: number;
  baseAlpha: number;
  depth: number; // 0.3 (far) to 1.0 (foreground)
  seed: number;
};

export default function DayNightAtmosphereCanvas({
  dayNightFactor,
  cursorPos,
  parallaxOffset = { x: 0, y: 0 },
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const factorRef = useRef(dayNightFactor);
  const cursorRef = useRef(cursorPos);
  const parallaxRef = useRef(parallaxOffset);
  const smoothFactorRef = useRef(dayNightFactor);
  const smoothCursorRef = useRef({ x: window.innerWidth * 0.5, y: window.innerHeight * 0.45 });
  const smoothParallaxRef = useRef({ x: 0, y: 0 });

  factorRef.current = dayNightFactor;
  cursorRef.current = cursorPos;
  parallaxRef.current = parallaxOffset;

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

    // Initialize 3D Depth Particles (Far dust motes to near fireflies)
    const particleCount = Math.min(Math.floor((width * height) / 22000), 52);
    const particles: Particle[] = Array.from({ length: particleCount }, () => {
      const depthTier = Math.random();
      let depth = 0.4;
      let size = 1.4;
      let baseAlpha = 0.35;

      if (depthTier > 0.75) {
        // Foreground close firefly
        depth = 1.0;
        size = Math.random() * 1.5 + 2.8;
        baseAlpha = Math.random() * 0.3 + 0.65;
      } else if (depthTier > 0.4) {
        // Mid-depth ambient particle
        depth = 0.68;
        size = Math.random() * 1.0 + 1.8;
        baseAlpha = Math.random() * 0.25 + 0.45;
      } else {
        // Far faint dust mote
        depth = 0.35;
        size = Math.random() * 0.6 + 1.0;
        baseAlpha = Math.random() * 0.2 + 0.25;
      }

      return {
        x: Math.random() * width,
        y: Math.random() * height,
        vx: (Math.random() - 0.5) * 0.35 * depth,
        vy: -0.15 - Math.random() * 0.35 * depth,
        size,
        alpha: baseAlpha,
        baseAlpha,
        depth,
        seed: Math.random() * 100,
      };
    });

    let frameCount = 0;

    const render = (time: number) => {
      frameCount++;

      // Smooth cinematic interpolation for Day/Night factor
      smoothFactorRef.current += (factorRef.current - smoothFactorRef.current) * 0.06;
      const factor = smoothFactorRef.current;

      smoothParallaxRef.current.x += (parallaxRef.current.x - smoothParallaxRef.current.x) * 0.08;
      smoothParallaxRef.current.y += (parallaxRef.current.y - smoothParallaxRef.current.y) * 0.08;
      const px = smoothParallaxRef.current.x;
      const py = smoothParallaxRef.current.y;

      const targetCursor = cursorRef.current.active
        ? cursorRef.current
        : { x: width * 0.5, y: height * 0.45, active: false };

      smoothCursorRef.current.x += (targetCursor.x - smoothCursorRef.current.x) * 0.08;
      smoothCursorRef.current.y += (targetCursor.y - smoothCursorRef.current.y) * 0.08;
      const cx = smoothCursorRef.current.x;
      const cy = smoothCursorRef.current.y;

      ctx.clearRect(0, 0, width, height);

      // Moonlight breathing pulse: 4-6s cycle (5000ms period)
      const pulse = (Math.sin((time / 5000) * Math.PI * 2) + 1) / 2; // [0, 1] smooth breathing

      // -------------------------------------------------------------
      // 1. SKY & ATMOSPHERE TINT
      // Night (factor -> 1): Deep Cold Midnight Blue (#050b18, #0a1428)
      // Day (factor -> 0): Warm Honey Amber Dawn (#3c2316, #16120e)
      // -------------------------------------------------------------
      const skyGrad = ctx.createLinearGradient(0, 0, width, height);
      const topR = Math.round(52 * (1 - factor) + 5 * factor);
      const topG = Math.round(30 * (1 - factor) + 11 * factor);
      const topB = Math.round(18 * (1 - factor) + 26 * factor);

      const botR = Math.round(20 * (1 - factor) + 4 * factor);
      const botG = Math.round(14 * (1 - factor) + 6 * factor);
      const botB = Math.round(10 * (1 - factor) + 13 * factor);

      const topAlpha = 0.36 + factor * 0.28;
      const botAlpha = 0.42 + factor * 0.38;
      skyGrad.addColorStop(0, `rgba(${topR}, ${topG}, ${topB}, ${topAlpha})`);
      skyGrad.addColorStop(1, `rgba(${botR}, ${botG}, ${botB}, ${botAlpha})`);
      ctx.fillStyle = skyGrad;
      ctx.fillRect(0, 0, width, height);

      // -------------------------------------------------------------
      // 2. CELESTIAL BODIES: REALISTIC MOON (NIGHT) vs WARM SUN & SWEEP (DAY)
      // -------------------------------------------------------------

      // A. MẶT TRĂNG HUYỀN ẢO TẢ THỰC (Vút lên cao khi sang Đêm)
      const moonAlpha = Math.max(0, (factor - 0.15) / 0.85);
      if (moonAlpha > 0.01) {
        // Moon rises from horizon (height * 0.38) to high sky (height * 0.17)
        const moonY = height * 0.38 - factor * (height * 0.21) + py * 8;
        const moonX = width * 0.22 + px * 12;
        const moonRadius = 34; // Grand, mystical presence

        // 1. Quầng trăng xa (Ethereal 22-degree celestial halo)
        const farHalo = ctx.createRadialGradient(moonX, moonY, moonRadius * 1.4, moonX, moonY, 260);
        farHalo.addColorStop(0, `rgba(180, 215, 255, ${0.08 * moonAlpha + pulse * 0.04})`);
        farHalo.addColorStop(0.5, `rgba(90, 150, 235, ${0.035 * moonAlpha})`);
        farHalo.addColorStop(1, 'rgba(0, 0, 0, 0)');
        ctx.fillStyle = farHalo;
        ctx.beginPath();
        ctx.arc(moonX, moonY, 260, 0, Math.PI * 2);
        ctx.fill();

        // 2. Volumetric Cold Light Rays (Vệt sáng bạc lạnh xuyên qua kẽ cây)
        const rayAngles = [0.56, 0.70, 0.84];
        const maxRayDist = Math.max(width, height) * 1.3;
        ctx.save();
        for (let r = 0; r < rayAngles.length; r++) {
          const angle = rayAngles[r];
          const spread = 0.08;
          const rayAlpha = (0.045 + pulse * 0.035) * moonAlpha * (0.85 + Math.sin(frameCount * 0.02 + r) * 0.15);

          ctx.beginPath();
          ctx.moveTo(moonX, moonY);
          ctx.lineTo(moonX + Math.cos(angle - spread) * maxRayDist, moonY + Math.sin(angle - spread) * maxRayDist);
          ctx.lineTo(moonX + Math.cos(angle + spread) * maxRayDist, moonY + Math.sin(angle + spread) * maxRayDist);
          ctx.closePath();

          const rayGrad = ctx.createRadialGradient(
            moonX,
            moonY,
            40,
            moonX + Math.cos(angle) * maxRayDist * 0.5,
            moonY + Math.sin(angle) * maxRayDist * 0.5,
            maxRayDist * 0.7
          );
          rayGrad.addColorStop(0, `rgba(200, 228, 255, ${rayAlpha})`);
          rayGrad.addColorStop(0.4, `rgba(80, 140, 225, ${rayAlpha * 0.4})`);
          rayGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');

          ctx.fillStyle = rayGrad;
          ctx.fill();
        }
        ctx.restore();

        // 3. Quầng sáng thở (Breathing Lunar Corona)
        const coronaRadius = 140 + pulse * 40;
        const coronaGrad = ctx.createRadialGradient(moonX, moonY, moonRadius * 0.8, moonX, moonY, coronaRadius);
        coronaGrad.addColorStop(0, `rgba(235, 245, 255, ${0.44 * moonAlpha + pulse * 0.18})`);
        coronaGrad.addColorStop(0.3, `rgba(150, 200, 255, ${0.2 * moonAlpha + pulse * 0.1})`);
        coronaGrad.addColorStop(0.7, `rgba(50, 100, 180, ${0.05 * moonAlpha})`);
        coronaGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
        ctx.fillStyle = coronaGrad;
        ctx.beginPath();
        ctx.arc(moonX, moonY, coronaRadius, 0, Math.PI * 2);
        ctx.fill();

        // 4. Luminous Realistic Moon Disc
        const discGrad = ctx.createRadialGradient(
          moonX - moonRadius * 0.3,
          moonY - moonRadius * 0.3,
          moonRadius * 0.1,
          moonX,
          moonY,
          moonRadius
        );
        discGrad.addColorStop(0, `rgba(255, 255, 255, ${0.98 * moonAlpha})`);
        discGrad.addColorStop(0.55, `rgba(240, 246, 255, ${0.94 * moonAlpha})`);
        discGrad.addColorStop(0.85, `rgba(215, 230, 250, ${0.90 * moonAlpha})`);
        discGrad.addColorStop(1, `rgba(180, 205, 235, ${0.82 * moonAlpha})`);

        ctx.fillStyle = discGrad;
        ctx.beginPath();
        ctx.arc(moonX, moonY, moonRadius, 0, Math.PI * 2);
        ctx.fill();

        // 5. Lunar Maria & Surface Details (Mảng bề mặt tự nhiên, không cắt vector)
        const craters = [
          { dx: -8, dy: -6, r: 12, alpha: 0.18 },
          { dx: 6, dy: -4, r: 10, alpha: 0.15 },
          { dx: -4, dy: 8, r: 14, alpha: 0.2 },
          { dx: 10, dy: 6, r: 8, alpha: 0.14 },
          { dx: -12, dy: 4, r: 7, alpha: 0.16 },
        ];
        for (const c of craters) {
          const cg = ctx.createRadialGradient(moonX + c.dx, moonY + c.dy, 1, moonX + c.dx, moonY + c.dy, c.r);
          cg.addColorStop(0, `rgba(65, 90, 130, ${c.alpha * moonAlpha})`);
          cg.addColorStop(0.7, `rgba(90, 120, 165, ${c.alpha * 0.5 * moonAlpha})`);
          cg.addColorStop(1, 'rgba(90, 120, 165, 0)');
          ctx.fillStyle = cg;
          ctx.beginPath();
          ctx.arc(moonX + c.dx, moonY + c.dy, c.r, 0, Math.PI * 2);
          ctx.fill();
        }

        // 6. Wisps of Night Mist drifting across the moon
        const cloudOffset = ((time * 0.015) % 120) - 60;
        const cloudGrad = ctx.createLinearGradient(moonX - moonRadius * 1.4, moonY, moonX + moonRadius * 1.4, moonY);
        cloudGrad.addColorStop(0, 'rgba(10, 15, 26, 0)');
        cloudGrad.addColorStop(0.35, `rgba(12, 18, 30, ${0.4 * moonAlpha})`);
        cloudGrad.addColorStop(0.65, `rgba(14, 22, 36, ${0.36 * moonAlpha})`);
        cloudGrad.addColorStop(1, 'rgba(10, 15, 26, 0)');

        ctx.fillStyle = cloudGrad;
        ctx.beginPath();
        ctx.ellipse(moonX + cloudOffset * 0.4, moonY + 6, moonRadius * 1.5, 9, 0.08, 0, Math.PI * 2);
        ctx.fill();
      }

      // B. MẶT TRỜI & ÁNH NẮNG VÀNG ẤM QUÉT NGANG (Khi chuyển sang Ngày)
      const sunAlpha = Math.max(0, (0.80 - factor) / 0.80);
      if (sunAlpha > 0.01) {
        const sunX = width * 0.78 + px * 14;
        const sunY = height * 0.18 + (factor * 55) + py * 8;
        const sunRadius = 36;

        // 1. Ánh nắng vàng ấm quét ngang qua màn hình
        const sweepIntensity = sunAlpha * 0.28;
        const sweepGrad = ctx.createLinearGradient(sunX, sunY, width * 0.1, height);
        sweepGrad.addColorStop(0, `rgba(255, 230, 150, ${sweepIntensity})`);
        sweepGrad.addColorStop(0.28, `rgba(250, 185, 75, ${sweepIntensity * 0.75})`);
        sweepGrad.addColorStop(0.68, `rgba(215, 130, 40, ${sweepIntensity * 0.3})`);
        sweepGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');

        ctx.save();
        ctx.fillStyle = sweepGrad;
        ctx.beginPath();
        ctx.moveTo(sunX - 80, sunY - 60);
        ctx.lineTo(width + 40, 0);
        ctx.lineTo(width + 40, height * 0.8);
        ctx.lineTo(0, height + 40);
        ctx.lineTo(0, height * 0.3);
        ctx.closePath();
        ctx.fill();
        ctx.restore();

        // 2. Wide Sun Corona
        const sunGlow = ctx.createRadialGradient(sunX, sunY, sunRadius * 0.8, sunX, sunY, 260);
        sunGlow.addColorStop(0, `rgba(255, 225, 140, ${0.5 * sunAlpha})`);
        sunGlow.addColorStop(0.35, `rgba(245, 170, 60, ${0.25 * sunAlpha})`);
        sunGlow.addColorStop(0.75, `rgba(201, 134, 56, ${0.08 * sunAlpha})`);
        sunGlow.addColorStop(1, 'rgba(0, 0, 0, 0)');
        ctx.fillStyle = sunGlow;
        ctx.beginPath();
        ctx.arc(sunX, sunY, 260, 0, Math.PI * 2);
        ctx.fill();

        // 3. Sun Disc
        const sunDisc = ctx.createRadialGradient(sunX, sunY, 4, sunX, sunY, sunRadius);
        sunDisc.addColorStop(0, `rgba(255, 252, 240, ${0.98 * sunAlpha})`);
        sunDisc.addColorStop(0.7, `rgba(255, 230, 160, ${0.92 * sunAlpha})`);
        sunDisc.addColorStop(1, `rgba(245, 175, 70, ${0.75 * sunAlpha})`);
        ctx.fillStyle = sunDisc;
        ctx.beginPath();
        ctx.arc(sunX, sunY, sunRadius, 0, Math.PI * 2);
        ctx.fill();
      }

      // -------------------------------------------------------------
      // 3. FLASHLIGHT / LANTERN TORCH AT CURSOR
      // -------------------------------------------------------------
      const lanternRadius = 230;
      const lanternGrad = ctx.createRadialGradient(cx, cy, 10, cx, cy, lanternRadius);
      const torchIntensity = 0.14 + Math.sin(frameCount * 0.08) * 0.02;
      lanternGrad.addColorStop(0, `rgba(224, 159, 83, ${torchIntensity})`);
      lanternGrad.addColorStop(0.45, `rgba(201, 134, 56, ${torchIntensity * 0.35})`);
      lanternGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');

      ctx.fillStyle = lanternGrad;
      ctx.beginPath();
      ctx.arc(cx, cy, lanternRadius, 0, Math.PI * 2);
      ctx.fill();

      // -------------------------------------------------------------
      // 4. LAYER 3: SƯƠNG MÙ TRÔI TẦNG THẤP (Ambient Mist / Fog Layer)
      // -------------------------------------------------------------
      const horizonY = height - 170;

      // Drifting horizontal mist bands
      const mistBands = [
        { yOffset: 120, speed: 0.2, bandHeight: 110, alpha: 0.16 + pulse * 0.08 },
        { yOffset: 60, speed: 0.35, bandHeight: 90, alpha: 0.22 + pulse * 0.06 },
        { yOffset: 0, speed: 0.15, bandHeight: 80, alpha: 0.3 },
      ];

      for (let b = 0; b < mistBands.length; b++) {
        const band = mistBands[b];
        const fy = height - band.yOffset + py * -18;

        const mg = ctx.createLinearGradient(0, fy - band.bandHeight * 0.5, 0, fy + band.bandHeight * 0.5);
        mg.addColorStop(0, 'rgba(10, 13, 18, 0)');
        mg.addColorStop(0.5, `rgba(16, 20, 28, ${band.alpha})`);
        mg.addColorStop(1, 'rgba(8, 10, 14, 0)');

        ctx.fillStyle = mg;
        ctx.fillRect(0, fy - band.bandHeight * 0.5, width, band.bandHeight);
      }

      // Base horizon mist gradient
      const baseMistGrad = ctx.createLinearGradient(0, horizonY, 0, height);
      baseMistGrad.addColorStop(0, 'rgba(8, 10, 14, 0)');
      baseMistGrad.addColorStop(0.4, 'rgba(8, 10, 14, 0.55)');
      baseMistGrad.addColorStop(1, 'rgba(6, 8, 12, 0.95)');
      ctx.fillStyle = baseMistGrad;
      ctx.fillRect(0, horizonY, width, height - horizonY);

      // Glowing wolf eyes in deep woods (Night only easter egg)
      if (factor > 0.45) {
        const eyeFlicker = 0.7 + Math.sin(frameCount * 0.1) * 0.3;
        const totalEyeAlpha = Math.min(1, (factor - 0.45) * 2.2) * eyeFlicker;

        // Pair 1 (Right deep woods)
        const eyeX1 = width * 0.85 + px * -15;
        const eyeY1 = horizonY + 45 + py * -8;
        ctx.fillStyle = `rgba(235, 60, 60, ${totalEyeAlpha})`;
        ctx.beginPath();
        ctx.arc(eyeX1, eyeY1, 2.2, 0, Math.PI * 2);
        ctx.arc(eyeX1 + 9, eyeY1, 2.2, 0, Math.PI * 2);
        ctx.fill();

        // Pair 2 (Left woods)
        const eyeX2 = width * 0.12 + px * -15;
        const eyeY2 = horizonY + 55 + py * -8;
        ctx.fillStyle = `rgba(224, 159, 83, ${totalEyeAlpha * 0.85})`;
        ctx.beginPath();
        ctx.arc(eyeX2, eyeY2, 2, 0, Math.PI * 2);
        ctx.arc(eyeX2 + 8, eyeY2, 2, 0, Math.PI * 2);
        ctx.fill();
      }

      // -------------------------------------------------------------
      // 5. LAYER 3: ĐOM ĐÓM & BỤI SÁNG (Ambient 3D Particles)
      // Night: Golden amber fireflies
      // Day: Sunlit golden floating dust motes
      // -------------------------------------------------------------
      for (let i = 0; i < particles.length; i++) {
        const p = particles[i];

        // Cursor repulsion physics
        const dx = p.x - cx;
        const dy = p.y - cy;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const repelRadius = 130 * p.depth;

        if (dist < repelRadius && dist > 1) {
          const force = (1 - dist / repelRadius) * 2.2 * p.depth;
          p.x += (dx / dist) * force;
          p.y += (dy / dist) * force;
        }

        // Sinusoidal gentle hover movement
        p.x += p.vx + Math.sin(frameCount * 0.02 + p.seed) * 0.25;
        p.y += p.vy;

        // Wrap around viewport edges smoothly
        if (p.y < -15) {
          p.y = height + 15;
          p.x = Math.random() * width;
        }
        if (p.x < -15) p.x = width + 15;
        if (p.x > width + 15) p.x = -15;

        // Parallax screen offset based on particle depth tier
        const renderX = p.x + px * (-38 * p.depth);
        const renderY = p.y + py * (-24 * p.depth);

        // Warm amber / golden glow
        const particlePulse = p.baseAlpha * (0.65 + Math.sin(frameCount * 0.04 + p.seed) * 0.35);

        ctx.fillStyle = `rgba(245, 185, 85, ${particlePulse})`;
        ctx.beginPath();
        ctx.arc(renderX, renderY, p.size, 0, Math.PI * 2);
        ctx.fill();

        // Soft halo aura around close foreground fireflies
        if (p.depth > 0.7) {
          ctx.fillStyle = `rgba(224, 159, 83, ${particlePulse * 0.28})`;
          ctx.beginPath();
          ctx.arc(renderX, renderY, p.size * 3.2, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      animId = requestAnimationFrame(render);
    };

    animId = requestAnimationFrame(render);

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
