import React, { useEffect, useRef } from 'react';

interface CosmicParallaxBgProps {
  /**
   * Main heading text (displayed large in the center)
   */
  head?: string;

  /**
   * Subtitle text (displayed below the heading)
   * Comma-separated string that will be split into animated parts
   */
  text?: string;

  /**
   * Whether the text animations should loop
   * @default true
   */
  loop?: boolean;

  /**
   * Custom class name for additional styling
   */
  className?: string;

  /**
   * Children nodes to render inside cosmic container
   */
  children?: React.ReactNode;
}

interface Star {
  x: number;
  y: number;
}

/**
 * A responsive, high-performance cosmic parallax background component
 * with animated starfield and 3D cursor parallax that seamlessly adapts to any screen size.
 */
const CosmicParallaxBg: React.FC<CosmicParallaxBgProps> = ({
  head,
  text,
  loop = true,
  className = '',
  children,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const mouseRef = useRef<{ x: number; y: number; targetX: number; targetY: number }>({
    x: 0,
    y: 0,
    targetX: 0,
    targetY: 0,
  });

  // Split the text by commas and trim whitespace
  const textParts = text ? text.split(',').map(part => part.trim()) : [];

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationFrameId: number;
    let width = 0;
    let height = 0;
    let smallStars: Star[] = [];
    let mediumStars: Star[] = [];
    let bigStars: Star[] = [];

    // Initialize stars matching original density (700 small, 200 medium, 100 big per 2000x2000 area)
    const initStars = () => {
      const dpr = window.devicePixelRatio || 1;
      const rect = canvas.getBoundingClientRect();
      width = rect.width || window.innerWidth;
      height = rect.height || window.innerHeight;

      canvas.width = width * dpr;
      canvas.height = height * dpr;
      ctx.scale(dpr, dpr);

      const areaRatio = (width * height) / (2000 * 2000);
      const smallCount = Math.max(250, Math.floor(700 * areaRatio));
      const mediumCount = Math.max(70, Math.floor(200 * areaRatio));
      const bigCount = Math.max(35, Math.floor(100 * areaRatio));

      smallStars = Array.from({ length: smallCount }, () => ({
        x: Math.random() * width,
        y: Math.random() * height,
      }));

      mediumStars = Array.from({ length: mediumCount }, () => ({
        x: Math.random() * width,
        y: Math.random() * height,
      }));

      bigStars = Array.from({ length: bigCount }, () => ({
        x: Math.random() * width,
        y: Math.random() * height,
      }));
    };

    initStars();

    const handleResize = () => {
      initStars();
    };

    window.addEventListener('resize', handleResize);

    const handleMouseMove = (e: MouseEvent) => {
      const { innerWidth, innerHeight } = window;
      mouseRef.current.targetX = (e.clientX - innerWidth / 2) / (innerWidth / 2);
      mouseRef.current.targetY = (e.clientY - innerHeight / 2) / (innerHeight / 2);
    };

    const handleMouseLeave = () => {
      mouseRef.current.targetX = 0;
      mouseRef.current.targetY = 0;
    };

    window.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseleave', handleMouseLeave);

    const render = () => {
      // Smooth mouse lerp identical to original
      mouseRef.current.x += (mouseRef.current.targetX - mouseRef.current.x) * 0.08;
      mouseRef.current.y += (mouseRef.current.targetY - mouseRef.current.y) * 0.08;

      ctx.clearRect(0, 0, width, height);
      ctx.fillStyle = '#FFFFFF';

      const mouseX = mouseRef.current.x;
      const mouseY = mouseRef.current.y;

      // Layer 1: Small stars (1px by 1px, 50s speed, 18px mouse parallax)
      const smallOffsetX = mouseX * 18;
      const smallOffsetY = mouseY * 18;
      for (let i = 0; i < smallStars.length; i++) {
        const star = smallStars[i];
        star.y -= 0.67;
        if (star.y < 0) {
          star.y = height;
          star.x = Math.random() * width;
        }
        let drawX = (star.x + smallOffsetX) % width;
        let drawY = (star.y + smallOffsetY) % height;
        if (drawX < 0) drawX += width;
        if (drawY < 0) drawY += height;
        ctx.fillRect(Math.floor(drawX), Math.floor(drawY), 1, 1);
      }

      // Layer 2: Medium stars (2px by 2px, 100s speed, 40px mouse parallax)
      const medOffsetX = mouseX * 40;
      const medOffsetY = mouseY * 40;
      for (let i = 0; i < mediumStars.length; i++) {
        const star = mediumStars[i];
        star.y -= 0.33;
        if (star.y < 0) {
          star.y = height;
          star.x = Math.random() * width;
        }
        let drawX = (star.x + medOffsetX) % width;
        let drawY = (star.y + medOffsetY) % height;
        if (drawX < 0) drawX += width;
        if (drawY < 0) drawY += height;
        ctx.fillRect(Math.floor(drawX), Math.floor(drawY), 2, 2);
      }

      // Layer 3: Big stars (3px by 3px, 150s speed, 75px mouse parallax)
      const bigOffsetX = mouseX * 75;
      const bigOffsetY = mouseY * 75;
      for (let i = 0; i < bigStars.length; i++) {
        const star = bigStars[i];
        star.y -= 0.22;
        if (star.y < 0) {
          star.y = height;
          star.x = Math.random() * width;
        }
        let drawX = (star.x + bigOffsetX) % width;
        let drawY = (star.y + bigOffsetY) % height;
        if (drawX < 0) drawX += width;
        if (drawY < 0) drawY += height;
        ctx.fillRect(Math.floor(drawX), Math.floor(drawY), 3, 3);
      }

      animationFrameId = requestAnimationFrame(render);
    };

    animationFrameId = requestAnimationFrame(render);

    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseleave', handleMouseLeave);
      cancelAnimationFrame(animationFrameId);
    };
  }, []);

  return (
    <div className={`cosmic-parallax-container ${className}`}>
      {/* Interactive dynamic canvas covering the entire viewport width & height */}
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full pointer-events-none z-0"
        style={{ willChange: 'transform' }}
      />

      {/* Content slot or default title/subtitle */}
      {children ? (
        <div className="relative z-10 w-full flex flex-col items-center justify-center">
          {children}
        </div>
      ) : (
        <>
          {head && <div id="title">{head.toUpperCase()}</div>}
          {textParts.length > 0 && (
            <div id="subtitle">
              {textParts.map((part, index) => (
                <React.Fragment key={index}>
                  <span className={`subtitle-part-${index + 1}`}>{part.toUpperCase()}</span>
                  {index < textParts.length - 1 && ' '}
                </React.Fragment>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
};

export { CosmicParallaxBg };
