import React, { useState, useEffect, useRef } from 'react';
import { useSpring, useAnimationFrame, motion } from 'framer-motion';
import { Home, Search, Library, Settings } from 'lucide-react';

export default function App() {
  const [isHovered, setIsHovered] = useState(false);
  const [activeItem, setActiveItem] = useState('Home');
  const [windowSize, setWindowSize] = useState({ width: window.innerWidth, height: window.innerHeight });

  const path1Ref = useRef(null);
  const path2Ref = useRef(null);
  const path3Ref = useRef(null);
  const foamPathRef = useRef(null);
  const clipPathRef = useRef(null);
  const canvasRef = useRef(null);
  const bubbles = useRef([]);

  useEffect(() => {
    const handleResize = () => {
      setWindowSize({ width: window.innerWidth, height: window.innerHeight });
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // The physics spring gives the wave its natural momentum and bounce
  const sidebarWidth = useSpring(isHovered ? 260 : 72, {
    stiffness: 110,
    damping: 18,
    mass: 0.9,
  });

  useEffect(() => {
    sidebarWidth.set(isHovered ? 260 : 72);
  }, [isHovered, sidebarWidth]);

  useAnimationFrame((time) => {
    const t = time / 1000;
    const height = windowSize.height;
    
    const currentWidth = sidebarWidth.get();
    const velocity = sidebarWidth.getVelocity();

    // Wave swells out when expanding. When retracting, it flattens smoothly.
    const velocitySwell = velocity > 0 ? velocity * 0.1 : 0; 
    
    // Scale down amplitude when sidebar is thin
    const widthScale = Math.min(1, currentWidth / 200);
    const amplitude = (12 + velocitySwell) * widthScale; 

    const frequency = 0.0025; // Smoother, wider peaks
    const numPoints = 40; // Increased fidelity for smoother soft-max combining
    const segmentHeight = height / numPoints;

    let pathFront = `M 0,0 L ${currentWidth},0 `;
    let pathMid = `M 0,0 L ${currentWidth},0 `;
    let pathBack = `M 0,0 L ${currentWidth},0 `;

    // Decreased offset for a tighter, subtle seafoam outline
    const foamOffsetBase = 8; 
    const foamVelocityPush = Math.max(0, velocity * 0.1); // Pushes ahead during expansion
    let pathFoam = `M 0,0 L ${currentWidth + foamOffsetBase + foamVelocityPush},0 `;

    // Soft-max parameter for organic blending (lower = smoother, rounder bubbly edges)
    const k = 0.4;

    for (let i = 0; i <= numPoints; i++) {
      const y = i * segmentHeight;
      
      // Helper to calculate X for a specific layer
      const getX = (layerOffset) => {
        const timeOffset = t * 1.5 + layerOffset * 2.3;
        let xOffset = Math.sin(y * frequency * 2.2 + timeOffset + currentWidth * 0.01) * amplitude;
        xOffset += Math.sin(y * frequency * 4.5 - timeOffset * 0.8) * (amplitude * 0.5);
        const parallaxLag = (layerOffset * velocity * -0.015);
        return currentWidth + xOffset + parallaxLag;
      };

      const xFront = getX(0); // Front glass layer
      const xMid = getX(1);   // Middle teal layer
      const xBack = getX(2);  // Back dark layer

      pathFront += `L ${xFront},${y} `;
      pathMid += `L ${xMid},${y} `;
      pathBack += `L ${xBack},${y} `;

      // Foam represents the combined outline (Soft Maximum) of all 3 waves
      // LogSumExp formula creates a beautiful, organic bounding curve
      const maxVal = Math.max(xFront, xMid, xBack);
      const sum = Math.exp(k * (xFront - maxVal)) + Math.exp(k * (xMid - maxVal)) + Math.exp(k * (xBack - maxVal));
      const combinedX = maxVal + Math.log(sum) / k;
      
      pathFoam += `L ${combinedX + foamOffsetBase + foamVelocityPush},${y} `;
    }
    
    pathFront += `L 0,${height} Z`;
    pathMid += `L 0,${height} Z`;
    pathBack += `L 0,${height} Z`;
    pathFoam += `L 0,${height} Z`;

    // Update SVG DOM directly for 60fps
    if (path3Ref.current) path3Ref.current.setAttribute('d', pathFront);
    if (clipPathRef.current) clipPathRef.current.setAttribute('d', pathFront);
    if (path2Ref.current) path2Ref.current.setAttribute('d', pathMid);
    if (path1Ref.current) path1Ref.current.setAttribute('d', pathBack);
    if (foamPathRef.current) foamPathRef.current.setAttribute('d', pathFoam);

    // 2. Handle Canvas Canvas Particles and Specular Highlight
    const canvas = canvasRef.current;
    if (canvas) {
      const ctx = canvas.getContext('2d');
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      
      // Update and draw bubbles
      for (let i = bubbles.current.length - 1; i >= 0; i--) {
        const b = bubbles.current[i];
        b.y -= b.speed;
        b.x += Math.sin(b.y * 0.05 + t * 2) * 0.5; // Wobble
        b.life -= 0.01;
        
        ctx.beginPath();
        ctx.arc(b.x, b.y, b.size, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255, 255, 255, ${b.life})`;
        ctx.fill();
        
        if (b.life <= 0) bubbles.current.splice(i, 1);
      }
      
      // Draw specular highlight travelling along the crest
      const highlightY = (t * 120) % height;
      const highlightWidth = currentWidth + Math.sin(highlightY * 0.01 + t) * 15;
      
      ctx.beginPath();
      const gradient = ctx.createRadialGradient(highlightWidth - 5, highlightY, 0, highlightWidth - 5, highlightY, 30);
      gradient.addColorStop(0, 'rgba(255, 255, 255, 0.4)');
      gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
      
      ctx.fillStyle = gradient;
      ctx.arc(highlightWidth - 5, highlightY, 30, 0, Math.PI * 2);
      ctx.fill();
    }
  });

  const handleInteraction = (e, itemName) => {
    setActiveItem(itemName);
    const rect = e.currentTarget.getBoundingClientRect();
    
    // Spawn bubbles on interaction
    for(let i=0; i<3; i++) {
      bubbles.current.push({
        x: rect.left + 20 + Math.random() * 20,
        y: rect.top + 20 + Math.random() * 10,
        size: Math.random() * 2 + 1,
        speed: Math.random() * 1 + 0.5,
        life: 1
      });
    }
  };

  const navItems = [
    { name: 'Home', icon: Home },
    { name: 'Search', icon: Search },
    { name: 'Library', icon: Library },
    { name: 'Settings', icon: Settings },
  ];

  return (
    <div 
      className="fixed inset-0 bg-gray-900 text-white overflow-hidden flex"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* Background with slight animated caustics */}
      <div className="absolute inset-0 pointer-events-none opacity-20 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-teal-800 via-gray-900 to-gray-900" />
      
      {/* 
        This is where the magic happens. The glass blur is mathematically clipped to the 
        exact shape of the front SVG wave. No rectangle bounding box exists anymore!
      */}
      <div 
        className="absolute inset-0 z-10 backdrop-blur-md pointer-events-none"
        style={{ clipPath: 'url(#waterClip)' }}
      />
      
      {/* Organic Wave SVGs */}
      <svg 
        className="absolute top-0 left-0 h-full pointer-events-none z-0" 
        style={{ width: `${windowSize.width}px` }} 
      >
        <defs>
          <clipPath id="waterClip">
            <path ref={clipPathRef} />
          </clipPath>
          {/* Brighter Teal/Cyan gradient for the front wave */}
          <linearGradient id="glassGradient" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="rgba(8, 110, 125, 0.95)" />
            <stop offset="100%" stopColor="rgba(34, 211, 238, 0.7)" />
          </linearGradient>
        </defs>
        
        {/* Foam Layer - Solid White, pushed slightly forward */}
        <path ref={foamPathRef} fill="rgba(255, 255, 255, 0.9)" />
        {/* Back Layer - Deep Teal */}
        <path ref={path1Ref} fill="rgba(4, 75, 86, 0.95)" />
        {/* Middle Layer - Vibrant Teal */}
        <path ref={path2Ref} fill="rgba(13, 148, 166, 0.85)" />
        {/* Front Glass Layer */}
        <path ref={path3Ref} fill="url(#glassGradient)" />
      </svg>

      {/* Canvas for interaction bubbles & lighting */}
      <canvas
        ref={canvasRef}
        width={windowSize.width}
        height={windowSize.height}
        className="absolute inset-0 z-20 pointer-events-none"
      />

      {/* Navigation UI */}
      <motion.nav 
        className="relative z-30 h-full flex flex-col pt-12 pb-8"
        style={{ width: sidebarWidth }}
      >
        <div className="flex-1 px-4 space-y-4 relative w-full overflow-hidden">
          {navItems.map((item, index) => (
            <motion.button
              key={item.name}
              onClick={(e) => handleInteraction(e, item.name)}
              onMouseEnter={(e) => handleInteraction(e, item.name)}
              initial={{ opacity: 0, y: 15 }}
              animate={{ 
                opacity: isHovered ? 1 : 0, 
                y: isHovered ? 0 : 15 
              }}
              transition={{ 
                delay: isHovered ? index * 0.08 : 0,
                type: "spring",
                stiffness: 100,
                damping: 15
              }}
              className="w-full flex items-center space-x-4 p-3 rounded-xl relative group transition-colors hover:bg-white/10"
            >
              {/* Glowing current indicator */}
              {activeItem === item.name && (
                <motion.div
                  layoutId="activeCurrent"
                  className="absolute left-0 w-1 h-8 bg-cyan-300 rounded-r-full shadow-[0_0_10px_rgba(103,232,249,0.7)]"
                />
              )}
              
              <div className="relative z-10 w-6 h-6 flex justify-center items-center shrink-0">
                <item.icon size={22} className={activeItem === item.name ? "text-cyan-300" : "text-white/70"} />
              </div>
              
              <motion.span 
                className={`whitespace-nowrap font-medium ${activeItem === item.name ? 'text-cyan-300' : 'text-white/80'}`}
                initial={{ opacity: 0 }}
                animate={{ opacity: isHovered ? 1 : 0 }}
              >
                {item.name}
              </motion.span>
            </motion.button>
          ))}
        </div>

        {/* Collapsed UI state (always visible when sidebar is thin) */}
        <div className={`absolute top-12 left-0 w-[72px] flex flex-col space-y-4 items-center transition-opacity duration-300 ${isHovered ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}>
           {navItems.map((item) => (
             <div key={item.name + 'collapsed'} className="w-12 h-12 flex justify-center items-center relative">
               {activeItem === item.name && (
                  <div className="absolute left-[-16px] w-1 h-6 bg-cyan-300 rounded-r-full shadow-[0_0_10px_rgba(103,232,249,0.7)]" />
               )}
               <item.icon size={22} className={activeItem === item.name ? "text-cyan-300" : "text-white/60"} />
             </div>
           ))}
        </div>
      </motion.nav>
    </div>
  );
}