import React, { useEffect, useState } from 'react';

/**
 * A cosmic parallax background component with animated stars and text
 */
const CosmicParallaxBg = ({
  head,
  text,
  loop = true,
  className = '',
  children,
}) => {
  const [smallStars, setSmallStars] = useState('');
  const [mediumStars, setMediumStars] = useState('');
  const [bigStars, setBigStars] = useState('');
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });

  // Split the text by commas and trim whitespace
  const textParts = text ? text.split(',').map(part => part.trim()) : [];

  // Generate random star positions
  const generateStarBoxShadow = (count) => {
    let shadows = [];

    for (let i = 0; i < count; i++) {
      const x = Math.floor(Math.random() * 2000);
      const y = Math.floor(Math.random() * 2000);
      shadows.push(`${x}px ${y}px #FFF`);
    }

    return shadows.join(', ');
  };

  useEffect(() => {
    // Generate star shadows when component mounts
    setSmallStars(generateStarBoxShadow(700));
    setMediumStars(generateStarBoxShadow(200));
    setBigStars(generateStarBoxShadow(100));

    // Set animation iteration based on loop prop
    document.documentElement.style.setProperty(
      '--animation-iteration',
      loop ? 'infinite' : '1'
    );
  }, [loop]);

  // 3D Cursor Parallax tracking effect
  useEffect(() => {
    let animationFrameId;
    let targetX = 0;
    let targetY = 0;
    let currentX = 0;
    let currentY = 0;

    const handleMouseMove = (e) => {
      const { innerWidth, innerHeight } = window;
      targetX = (e.clientX - innerWidth / 2) / (innerWidth / 2);
      targetY = (e.clientY - innerHeight / 2) / (innerHeight / 2);
    };

    const handleMouseLeave = () => {
      targetX = 0;
      targetY = 0;
    };

    const updatePosition = () => {
      currentX += (targetX - currentX) * 0.08;
      currentY += (targetY - currentY) * 0.08;

      setMousePos({ x: currentX, y: currentY });
      animationFrameId = requestAnimationFrame(updatePosition);
    };

    window.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseleave', handleMouseLeave);
    animationFrameId = requestAnimationFrame(updatePosition);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseleave', handleMouseLeave);
      cancelAnimationFrame(animationFrameId);
    };
  }, []);

  return (
    <div className={`cosmic-parallax-container ${className}`}>
      {/* 3D Mouse Parallax Stars layers */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          transform: `translate3d(${mousePos.x * 18}px, ${mousePos.y * 18}px, 0)`,
          willChange: 'transform',
        }}
      >
        <div
          id="stars"
          style={{ boxShadow: smallStars }}
          className="cosmic-stars"
        ></div>
      </div>

      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          transform: `translate3d(${mousePos.x * 40}px, ${mousePos.y * 40}px, 0)`,
          willChange: 'transform',
        }}
      >
        <div
          id="stars2"
          style={{ boxShadow: mediumStars }}
          className="cosmic-stars-medium"
        ></div>
      </div>

      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          transform: `translate3d(${mousePos.x * 75}px, ${mousePos.y * 75}px, 0)`,
          willChange: 'transform',
        }}
      >
        <div
          id="stars3"
          style={{ boxShadow: bigStars }}
          className="cosmic-stars-large"
        ></div>
      </div>

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
