import React, { useEffect, useState } from 'react';

/**
 * A smooth count-up animation component for numbers on page load
 */
export function CountUp({ value = 0, duration = 1200, className = '' }) {
  const [displayValue, setDisplayValue] = useState('');

  useEffect(() => {
    let animationFrameId;
    let startTimestamp = null;

    // Parse string or number
    const strVal = String(value);
    const numMatch = strVal.match(/[\d,.]+/);

    if (!numMatch) {
      setDisplayValue(strVal);
      return;
    }

    const rawNumStr = numMatch[0].replace(/,/g, '');
    const targetNum = parseFloat(rawNumStr);

    if (isNaN(targetNum) || targetNum === 0) {
      setDisplayValue(strVal);
      return;
    }

    const prefix = strVal.slice(0, numMatch.index);
    const suffix = strVal.slice(numMatch.index + numMatch[0].length);

    const step = (timestamp) => {
      if (!startTimestamp) startTimestamp = timestamp;
      const progress = Math.min((timestamp - startTimestamp) / duration, 1);
      // Smooth ease-out cubic curve for natural decelerating count-up
      const easeOutCubic = 1 - Math.pow(1 - progress, 3);
      const current = Math.floor(easeOutCubic * targetNum);
      
      const formattedCurrent = numMatch[0].includes(',') 
        ? current.toLocaleString() 
        : current;

      setDisplayValue(`${prefix}${formattedCurrent}${suffix}`);

      if (progress < 1) {
        animationFrameId = requestAnimationFrame(step);
      } else {
        setDisplayValue(strVal);
      }
    };

    animationFrameId = requestAnimationFrame(step);

    return () => {
      if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
      }
    };
  }, [value, duration]);

  return <span className={className}>{displayValue}</span>;
}
