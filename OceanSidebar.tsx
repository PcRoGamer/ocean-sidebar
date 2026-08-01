import React, { useState, useEffect, useRef, type ReactNode } from 'react';
import { useSpring, useAnimationFrame, motion } from 'framer-motion';
import { Home, Search, Library, Settings } from 'lucide-react';

function seededUnit(seed: number) {
  const value = Math.sin(seed * 12.9898) * 43758.5453;
  return value - Math.floor(value);
}

export interface OceanSidebarProps {
  collapsed?: boolean;
  onToggle?: () => void;
  /** When provided as JSX or render function receiving interaction and expansion controls. */
  children?: ReactNode | ((
    spawnBubbles: (e: React.MouseEvent) => void,
    isExpanded: boolean,
    isHovered: boolean,
    toggleSidebar: () => void,
  ) => ReactNode);
  /** Width of the expanded sidebar in px (default 275) */
  expandedWidth?: number;
  /** Width of the collapsed rail in px (default 52) */
  collapsedWidth?: number;
}

export function OceanSidebar({
  collapsed = false,
  onToggle,
  children,
  expandedWidth = 275,
  collapsedWidth = 52,
}: OceanSidebarProps) {
  // Visual shell only. In app mode, SidebarShell supplies children containing
  // navigation and footer controls; the built-in demo nav is fallback-only.
  const [isHovered, setIsHovered] = useState(false);
  const [hoverPreview, setHoverPreview] = useState(false);
  const [activeItem, setActiveItem] = useState('Home');
  const [windowSize, setWindowSize] = useState({ width: 1200, height: 800 });
  const hoverIntentTimerRef = useRef<number | null>(null);
  const washStageTimersRef = useRef<number[]>([]);
  const bubbleSequenceRef = useRef(0);

  // ``collapsed`` means unpinned/auto. Hover opens a temporary preview; pinning
  // converts that preview into a persistent expanded sidebar.
  const isExpanded = !collapsed || hoverPreview;

  const clearHoverIntent = () => {
    if (hoverIntentTimerRef.current !== null) {
      window.clearTimeout(hoverIntentTimerRef.current);
      hoverIntentTimerRef.current = null;
    }
  };

  const clearWashStages = () => {
    washStageTimersRef.current.forEach((timer) => window.clearTimeout(timer));
    washStageTimersRef.current = [];
  };

  const handleMouseEnter = () => {
    setIsHovered(true);
    if (!collapsed) return;
    clearHoverIntent();
    hoverIntentTimerRef.current = window.setTimeout(() => {
      setHoverPreview(true);
      hoverIntentTimerRef.current = null;
    }, 120);
  };

  const handleMouseLeave = () => {
    clearHoverIntent();
    setIsHovered(false);
    setHoverPreview(false);
  };

  const handleToggle = () => {
    clearHoverIntent();
    // Unpinning while the pointer is still inside returns to auto-preview
    // instead of snapping shut. The water recedes when the pointer leaves.
    setHoverPreview(collapsed ? false : isHovered);
    onToggle?.();
  };

  useEffect(() => {
    setWindowSize({ width: window.innerWidth, height: window.innerHeight });
    const handleResize = () => {
      setWindowSize({ width: window.innerWidth, height: window.innerHeight });
    };
    window.addEventListener('resize', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
      clearHoverIntent();
      clearWashStages();
    };
  }, []);

  const path1Ref = useRef<SVGPathElement | null>(null);
  const path2Ref = useRef<SVGPathElement | null>(null);
  const path3Ref = useRef<SVGPathElement | null>(null);
  const foamPathRef = useRef<SVGPathElement | null>(null);
  const frontClipPathRef = useRef<SVGPathElement | null>(null);
  const midClipPathRef = useRef<SVGPathElement | null>(null);
  const backClipPathRef = useRef<SVGPathElement | null>(null);
  const wetSandPathRef = useRef<SVGPathElement | null>(null);
  const dampSandPathRef = useRef<SVGPathElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const wetSandEdgesRef = useRef<number[]>([]);
  const dampSandEdgesRef = useRef<number[]>([]);
  const wetSandStrengthRef = useRef(0);
  const dampSandStrengthRef = useRef(0);
  const lastFrameTimeRef = useRef<number | null>(null);
  const bubbles = useRef<Array<{ x: number; y: number; size: number; speed: number; life: number }>>([]);

  // Theme-driven water tuning. The canvas can't read CSS variables directly,
  // so resolve the --ocean-* tokens (with the canonical beach fallbacks) once
  // per theme-class change; the signature check runs each frame.
  const oceanThemeVarsRef = useRef({
    foamRgb: '255, 255, 255',
    waveScale: 1,
    themeSignature: '',
  });
  const syncOceanThemeVars = () => {
    if (typeof document === 'undefined') return;
    const signature = document.documentElement.className;
    if (signature === oceanThemeVarsRef.current.themeSignature) return;
    const styles = getComputedStyle(document.documentElement);
    const read = (name: string, fallback: string) => {
      const value = styles.getPropertyValue(name).trim();
      return value || fallback;
    };
    oceanThemeVarsRef.current = {
      foamRgb: read('--ocean-foam-rgb', '255, 255, 255'),
      waveScale: Number.parseFloat(read('--ocean-wave-scale', '1')) || 1,
      themeSignature: signature,
    };
  };

  // The physics spring gives the wave its natural momentum and bounce
  const sidebarWidth = useSpring(isExpanded ? expandedWidth : collapsedWidth, {
    stiffness: 110,
    damping: 18,
    mass: 0.9,
  });
  const midWaveWidth = useSpring(
    isExpanded ? expandedWidth : collapsedWidth,
    {
      stiffness: 112,
      damping: 18,
      mass: 0.92,
    },
  );
  const backWaveWidth = useSpring(
    isExpanded ? expandedWidth : collapsedWidth,
    {
      stiffness: 105,
      damping: 17,
      mass: 0.98,
    },
  );
  const foamWaveWidth = useSpring(
    isExpanded ? expandedWidth : collapsedWidth,
    {
      stiffness: 96,
      damping: 16,
      mass: 1,
    },
  );

  useEffect(() => {
    clearWashStages();
    const targetWidth = isExpanded ? expandedWidth : collapsedWidth;

    if (isExpanded) {
      // Water reaches across from left to right in layers: the undertow and
      // foam lead, teal follows, then the glass/content layer settles.
      backWaveWidth.set(targetWidth);
      foamWaveWidth.set(targetWidth);
      washStageTimersRef.current.push(
        window.setTimeout(() => midWaveWidth.set(targetWidth), 42),
        window.setTimeout(() => sidebarWidth.set(targetWidth), 82),
      );
    } else {
      // Receding water reverses the layer order so foam lingers briefly at the
      // shoreline instead of every layer shrinking as one ribbon.
      sidebarWidth.set(targetWidth);
      washStageTimersRef.current.push(
        window.setTimeout(() => midWaveWidth.set(targetWidth), 42),
        window.setTimeout(() => backWaveWidth.set(targetWidth), 84),
        window.setTimeout(() => foamWaveWidth.set(targetWidth), 122),
      );
    }

    return clearWashStages;
  }, [
    backWaveWidth,
    collapsedWidth,
    expandedWidth,
    foamWaveWidth,
    isExpanded,
    midWaveWidth,
    sidebarWidth,
  ]);

  useAnimationFrame((time) => {
    const t = time / 1000;
    const height = windowSize.height;
    const deltaSeconds =
      lastFrameTimeRef.current === null
        ? 1 / 60
        : Math.min(0.05, Math.max(0, (time - lastFrameTimeRef.current) / 1000));
    lastFrameTimeRef.current = time;
    
    syncOceanThemeVars();
    const frontWidth = sidebarWidth.get();
    const midWidth = midWaveWidth.get();
    const backWidth = backWaveWidth.get();
    const foamWidth = foamWaveWidth.get();
    const frontVelocity = sidebarWidth.getVelocity();
    const midVelocity = midWaveWidth.getVelocity();
    const backVelocity = backWaveWidth.getVelocity();
    const foamVelocity = foamWaveWidth.getVelocity();
    const waveVelocity = Math.max(
      Math.abs(frontVelocity),
      Math.abs(midVelocity),
      Math.abs(backVelocity),
      Math.abs(foamVelocity),
    );
    const dominantWidth = Math.max(
      frontWidth,
      midWidth,
      backWidth,
      foamWidth,
    );
    
    // Scale down amplitude when sidebar is thin
    const widthScale = Math.min(1, dominantWidth / 200);
    const baseAmplitude = 12 * widthScale * oceanThemeVarsRef.current.waveScale;

    const frequency = 0.0025; // Smoother, wider peaks
    const numPoints = 40; // Increased fidelity for smoother soft-max combining
    const segmentHeight = height / numPoints;

    let pathFront = `M 0,0 L ${frontWidth},0 `;
    let pathMid = `M 0,0 L ${midWidth},0 `;
    let pathBack = `M 0,0 L ${backWidth},0 `;

    // Decreased offset for a tighter, subtle seafoam outline
    const foamOffsetBase = 8; 
    // Clamp foam push to prevent it from shooting out wildly
    const foamVelocityPush = Math.min(12, waveVelocity * 0.02);
    const outerLayerWidth = Math.max(frontWidth, midWidth, backWidth);
    const foamLead = Math.max(
      -8,
      Math.min(18, foamWidth - outerLayerWidth),
    );
    let pathFoam =
      `M 0,0 L ${outerLayerWidth + foamLead + foamOffsetBase + foamVelocityPush},0 `;
    let maxFoamExtent = dominantWidth;
    const foamEdgePoints: Array<{ x: number; y: number }> = [];

    // Soft-max parameter for organic blending (lower = smoother, rounder bubbly edges)
    const k = 0.4;

    for (let i = 0; i <= numPoints; i++) {
      const y = i * segmentHeight;
      
      // Helper to calculate X for a specific layer
      const getX = (
        layerWidth: number,
        layerOffset: number,
        layerVelocity: number,
      ) => {
        const travelRange = Math.max(1, expandedWidth - collapsedWidth);
        const layerProgress = Math.max(
          0,
          Math.min(1, (layerWidth - collapsedWidth) / travelRange),
        );
        // Tie the crest roll to horizontal travel. The sine still shapes a
        // vertical shoreline, but its phase now advances with the x-position
        // of each spring instead of merely drifting with elapsed time.
        const travelPhase = layerProgress * Math.PI * 1.45;
        const ambientPhase = t * 0.55 + layerOffset * 3.5;
        const velocitySwell =
          layerVelocity > 0 ? Math.min(18, layerVelocity * 0.04) : 0;
        const amplitude = baseAmplitude + velocitySwell;
        
        // Primary smooth wave
        let xOffset =
          Math.sin(
            y * frequency * 2.2 + ambientPhase + travelPhase,
          ) * amplitude;
        
        // The smaller detail wave counter-rolls slightly, creating the sense
        // that water is folding forward rather than sliding as a rigid ribbon.
        const detailAmplitude = (baseAmplitude * 0.5) + (velocitySwell * 0.2); 
        xOffset +=
          Math.sin(
            y * frequency * 4.2 -
              ambientPhase * 0.8 +
              travelPhase * 0.55,
          ) * detailAmplitude;
        
        // Offset deeper layers to the right so they proudly peek out from behind the front layer
        const staticSpread = layerOffset * 12; 
        
        // Each layer has its own horizontal spring. This small velocity offset
        // makes the leading edge stretch naturally without introducing a
        // vertical travelling ripple.
        const parallaxLag = (layerOffset * layerVelocity * -0.004);
        // A tiny damped horizontal sway gives each moving front a wing-like
        // recoil. It is velocity-bound, so it disappears when the water rests.
        const wingEnergy = Math.min(1, Math.abs(layerVelocity) / 520);
        const wingOffset =
          Math.sin(t * 10.5 + layerOffset * 0.9) *
          (3.4 + layerOffset * 1.05) *
          wingEnergy *
          oceanThemeVarsRef.current.waveScale;
        
        return layerWidth + xOffset + parallaxLag + wingOffset + staticSpread;
      };

      const xFront = getX(frontWidth, 0, frontVelocity); // Front glass layer
      const xMid = getX(midWidth, 1, midVelocity);       // Middle teal layer
      const xBack = getX(backWidth, 2, backVelocity);    // Back dark layer

      pathFront += `L ${xFront},${y} `;
      pathMid += `L ${xMid},${y} `;
      pathBack += `L ${xBack},${y} `;

      // Foam represents the combined outline (Soft Maximum) of all 3 waves
      // LogSumExp formula creates a beautiful, organic bounding curve
      const maxVal = Math.max(xFront, xMid, xBack);
      const sum = Math.exp(k * (xFront - maxVal)) + Math.exp(k * (xMid - maxVal)) + Math.exp(k * (xBack - maxVal));
      const combinedX = maxVal + Math.log(sum) / k;
      
      const foamX =
        combinedX + foamLead + foamOffsetBase + foamVelocityPush;
      maxFoamExtent = Math.max(maxFoamExtent, foamX);
      foamEdgePoints.push({ x: foamX, y });
      pathFoam += `L ${foamX},${y} `;
    }

    // The shoreline remembers where the water has been. Once the water
    // recedes, its silhouette stays fixed and only its opacity evaporates.
    // Moving the remembered edge inward looked like a second set of waves.
    const maxWetExtent = expandedWidth + 72;
    const holdHighWaterEdge = (
      previous: number | undefined,
      current: number,
      strength: number,
    ) => {
      const boundedCurrent = Math.min(maxWetExtent, current);
      if (isExpanded) {
        return Math.max(previous ?? boundedCurrent, boundedCurrent);
      }
      return strength > 0 && previous !== undefined
        ? previous
        : boundedCurrent;
    };

    const wetSandEdges = foamEdgePoints.map((point, index) =>
      holdHighWaterEdge(
        wetSandEdgesRef.current[index],
        point.x,
        wetSandStrengthRef.current,
      ),
    );
    const dampSandEdges = foamEdgePoints.map((point, index) =>
      holdHighWaterEdge(
        dampSandEdgesRef.current[index],
        point.x,
        dampSandStrengthRef.current,
      ),
    );

    if (isExpanded) {
      wetSandStrengthRef.current = 1;
      dampSandStrengthRef.current = 1;
    } else {
      // Fresh wetness disappears first; its broader damp memory remains.
      wetSandStrengthRef.current = Math.max(
        0,
        wetSandStrengthRef.current - deltaSeconds / 5.5,
      );
      dampSandStrengthRef.current = Math.max(
        0,
        dampSandStrengthRef.current - deltaSeconds / 13,
      );
    }
    wetSandEdgesRef.current = wetSandEdges;
    dampSandEdgesRef.current = dampSandEdges;

    const buildShorePath = (edges: number[]) => {
      let path = `M 0,0 L ${edges[0] ?? 0},0 `;
      edges.forEach((x, index) => {
        path += `L ${x},${index * segmentHeight} `;
      });
      return `${path}L 0,${height} Z`;
    };
    const pathWetSand = buildShorePath(wetSandEdges);
    const pathDampSand = buildShorePath(dampSandEdges);
    
    pathFront += `L 0,${height} Z`;
    pathMid += `L 0,${height} Z`;
    pathBack += `L 0,${height} Z`;
    pathFoam += `L 0,${height} Z`;

    // Update SVG DOM directly for 60fps
    if (path3Ref.current) path3Ref.current.setAttribute('d', pathFront);
    // Frost clips follow each layer so blur + veil stay layer-scoped: the
    // front carries the blur, and the icy veil fades with depth (front >
    // mid > back) instead of flattening the three layers into one pane.
    if (frontClipPathRef.current) frontClipPathRef.current.setAttribute('d', pathFront);
    if (midClipPathRef.current) midClipPathRef.current.setAttribute('d', pathMid);
    if (backClipPathRef.current) backClipPathRef.current.setAttribute('d', pathBack);
    if (path2Ref.current) path2Ref.current.setAttribute('d', pathMid);
    if (path1Ref.current) path1Ref.current.setAttribute('d', pathBack);
    if (foamPathRef.current) foamPathRef.current.setAttribute('d', pathFoam);
    if (wetSandPathRef.current) {
      wetSandPathRef.current.setAttribute('d', pathWetSand);
      wetSandPathRef.current.setAttribute(
        'opacity',
        wetSandStrengthRef.current.toFixed(3),
      );
    }
    if (dampSandPathRef.current) {
      dampSandPathRef.current.setAttribute('d', pathDampSand);
      dampSandPathRef.current.setAttribute(
        'opacity',
        dampSandStrengthRef.current.toFixed(3),
      );
    }

    // Sync root div width with the maximum wave extent so sibling flex items
    // (the main content area) reserve space for the waves and never overlap.
    if (rootRef.current) {
      // Reserve the full moving wave envelope, not just the flat panel width.
      // The previous width calculation ignored layer spread and amplitude,
      // which let the outer wave overlap the main workspace.
      const stableReserve = 44 + (12 * widthScale);
      const motionReserve = Math.min(42, waveVelocity * 0.025);
      const reservedWidth = dominantWidth + stableReserve + motionReserve;
      rootRef.current.style.width =
        `${Math.ceil(Math.max(reservedWidth, maxFoamExtent + 4))}px`;
    }

    // 2. Handle Canvas Canvas Particles and Specular Highlight
    const canvas = canvasRef.current;
    if (canvas) {
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        
        // Update and draw bubbles
        for (let i = bubbles.current.length - 1; i >= 0; i--) {
          const b = bubbles.current[i];
          b.y -= b.speed;
          b.x += Math.sin(b.y * 0.05 + t * 2) * 0.5; // Wobble
          b.life -= 0.01;
          
          ctx.beginPath();
          ctx.arc(b.x, b.y, b.size, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(${oceanThemeVarsRef.current.foamRgb}, ${b.life})`;
          ctx.fill();
          
          if (b.life <= 0) bubbles.current.splice(i, 1);
        }
        
        // Draw specular highlight travelling along the crest
        const highlightY = (t * 120) % height;
        const highlightWidth =
          foamWidth + Math.sin(highlightY * 0.01 + t) * 15;
        
        ctx.beginPath();
        const gradient = ctx.createRadialGradient(highlightWidth - 5, highlightY, 0, highlightWidth - 5, highlightY, 30);
        gradient.addColorStop(0, `rgba(${oceanThemeVarsRef.current.foamRgb}, 0.4)`);
        gradient.addColorStop(1, `rgba(${oceanThemeVarsRef.current.foamRgb}, 0)`);
        
        ctx.fillStyle = gradient;
        ctx.arc(highlightWidth - 5, highlightY, 30, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  });

  const spawnBubbles = (e: React.MouseEvent) => {
    const rect = e.currentTarget.getBoundingClientRect();
    for (let i = 0; i < 4; i++) {
      const seed = (++bubbleSequenceRef.current * 4) + i;
      bubbles.current.push({
        x: rect.left + 15 + seededUnit(seed) * 25,
        y: rect.top + 15 + seededUnit(seed + 17) * 10,
        size: seededUnit(seed + 31) * 2.5 + 1,
        speed: seededUnit(seed + 47) * 1.2 + 0.6,
        life: 1
      });
    }
  };

  const handleInteraction = (e: React.MouseEvent<HTMLButtonElement>, itemName: string) => {
    setActiveItem(itemName);
    spawnBubbles(e);
  };

  // Built-in demo nav items (only used when no children provided)
  const navItems = [
    { name: 'Home', icon: Home },
    { name: 'Search', icon: Search },
    { name: 'Library', icon: Library },
    { name: 'Settings', icon: Settings },
  ];

  // Fallback-only accent styles (demo nav). In app mode the host chrome owns
  // the theme accent; the CSS var + fallback keeps the standalone demo cyan.
  const oceanAccentStyle = {
    color: 'rgb(var(--ocean-accent-rgb, 103, 232, 249))',
    background: 'rgb(var(--ocean-accent-rgb, 103, 232, 249))',
    boxShadow: '0 0 10px rgba(var(--ocean-accent-rgb, 103, 232, 249), 0.7)',
  };
  const oceanAccentColor = { color: oceanAccentStyle.color };

  let renderedChildren: ReactNode =
    typeof children === 'function' ? null : children;
  if (typeof children === 'function') {
    // The render prop only receives event handlers; their refs are read after
    // user interaction, never while this render function is executing.
    renderedChildren = children(
      // eslint-disable-next-line react-hooks/refs
      spawnBubbles,
      isExpanded,
      isHovered,
      // eslint-disable-next-line react-hooks/refs
      handleToggle,
    );
  }

  return (
    <div 
      ref={rootRef}
      className="ocean-sidebar-root"
      style={{
        position: 'relative',
        height: '100vh',
        overflow: 'visible',
        flexShrink: 0,
      }}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {/* 
        This is where the magic happens. The glass blur is mathematically clipped to the 
        exact shape of the front SVG wave. No rectangle bounding box exists anymore!
      */}
      {/* Front glass blur — stays front-layer scoped so the deeper layers
          keep their sharp parallax depth (all themes). */}
      <div 
        className="absolute inset-0 z-[5] pointer-events-none"
        style={{
          clipPath: 'url(#frontClip)',
          backdropFilter: 'blur(var(--ocean-blur, 12px))',
          WebkitBackdropFilter: 'blur(var(--ocean-blur, 12px))',
        }}
      />
      {/* Frosted veil — icy tint layered per wave layer (snow theme only),
          strongest at the front and fading with depth. */}
      <div
        className="absolute inset-0 z-[6] pointer-events-none"
        style={{
          clipPath: 'url(#backClip)',
          backgroundColor: 'rgb(var(--ocean-frost-rgb, 255, 255, 255))',
          opacity: 'calc(var(--ocean-frost-opacity, 0) * 0.35)',
        }}
      />
      <div
        className="absolute inset-0 z-[6] pointer-events-none"
        style={{
          clipPath: 'url(#midClip)',
          backgroundColor: 'rgb(var(--ocean-frost-rgb, 255, 255, 255))',
          opacity: 'calc(var(--ocean-frost-opacity, 0) * 0.6)',
        }}
      />
      <div
        className="absolute inset-0 z-[6] pointer-events-none"
        style={{
          clipPath: 'url(#frontClip)',
          backgroundColor: 'rgb(var(--ocean-frost-rgb, 255, 255, 255))',
          opacity: 'var(--ocean-frost-opacity, 0)',
        }}
      />
      
      {/* Organic Wave SVGs */}
      <svg 
        className="absolute top-0 left-0 h-full pointer-events-none z-0" 
        style={{ width: `${Math.max(windowSize.width, expandedWidth + 200)}px` }} 
      >
        <defs>
          <clipPath id="frontClip">
            <path ref={frontClipPathRef} />
          </clipPath>
          <clipPath id="midClip">
            <path ref={midClipPathRef} />
          </clipPath>
          <clipPath id="backClip">
            <path ref={backClipPathRef} />
          </clipPath>
          {/* Theme-driven gradients. Stops read the --ocean-* RGB triplet
              tokens published by the host app (fallbacks = canonical beach
              palette, so the standalone demo renders unchanged). */}
          <linearGradient id="glassGradient" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" style={{ stopColor: 'rgba(var(--ocean-front-deep-rgb, 8, 145, 178), 0.75)' }} />
            <stop offset="100%" style={{ stopColor: 'rgba(var(--ocean-front-light-rgb, 103, 232, 249), 0.55)' }} />
          </linearGradient>
          <linearGradient id="dampSandGradient" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" style={{ stopColor: 'rgba(var(--ocean-sand-damp-dark-rgb, 69, 93, 86), 0.13)' }} />
            <stop offset="72%" style={{ stopColor: 'rgba(var(--ocean-sand-damp-light-rgb, 100, 86, 63), 0.1)' }} />
            <stop offset="100%" style={{ stopColor: 'rgba(var(--ocean-sand-damp-light-rgb, 100, 86, 63), 0)' }} />
          </linearGradient>
          <linearGradient id="wetSandGradient" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" style={{ stopColor: 'rgba(var(--ocean-sand-wet-dark-rgb, 55, 82, 78), 0.22)' }} />
            <stop offset="78%" style={{ stopColor: 'rgba(var(--ocean-sand-wet-light-rgb, 91, 75, 52), 0.16)' }} />
            <stop offset="100%" style={{ stopColor: 'rgba(var(--ocean-sand-wet-light-rgb, 91, 75, 52), 0.015)' }} />
          </linearGradient>
          {/* Glass gradient for the middle depth layer — deeper, richer, same glassy feel */}
          <linearGradient id="middleGlassGradient" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" style={{ stopColor: 'rgba(var(--ocean-mid-deep-rgb, 13, 148, 136), 0.7)' }} />
            <stop offset="100%" style={{ stopColor: 'rgba(var(--ocean-mid-light-rgb, 94, 208, 200), 0.45)' }} />
          </linearGradient>
        </defs>
        
        {/* The high-water mark remains on the sand and evaporates in two stages. */}
        <path
          ref={dampSandPathRef}
          data-ocean-layer="damp-sand"
          fill="url(#dampSandGradient)"
        />
        <path
          ref={wetSandPathRef}
          data-ocean-layer="wet-sand"
          fill="url(#wetSandGradient)"
        />
        {/* Foam Layer - Solid White, pushed slightly forward */}
        <path
          ref={foamPathRef}
          data-ocean-layer="foam"
          fill="rgba(var(--ocean-foam-rgb, 255, 255, 255), 0.85)"
        />
        {/* Back Layer - Bright cyan, lowered opacity to look like thinner water */}
        <path ref={path1Ref} fill="rgba(var(--ocean-back-rgb, 6, 182, 212), 0.55)" />
        {/* Middle Layer - Glass gradient bridging back and front, same glassy feel as the front */}
        <path ref={path2Ref} fill="url(#middleGlassGradient)" />
        {/* Front Glass Layer */}
        <path ref={path3Ref} fill="url(#glassGradient)" />
      </svg>

      {/* Canvas for interaction bubbles & lighting */}
      <canvas
        ref={canvasRef}
        width={windowSize.width}
        height={windowSize.height}
        className="absolute inset-0 z-[15] pointer-events-none"
      />

      {/* Content Layer — either children (integration mode) or built-in demo nav */}
      {children !== undefined && children !== null ? (
        <motion.div
          className="relative z-[20] h-full flex flex-col"
          style={{ width: sidebarWidth }}
        >
          {renderedChildren}
        </motion.div>
      ) : (
        /* ── Standalone Demo Mode ── */
        <motion.nav 
          className="relative z-[20] h-full flex flex-col pt-14 pb-8"
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
                    className="absolute left-0 w-1 h-8 rounded-r-full"
                    style={oceanAccentStyle}
                  />
                )}
                
                <div className="relative z-10 w-6 h-6 flex justify-center items-center shrink-0">
                  <item.icon
                    size={22}
                    className={activeItem === item.name ? undefined : "text-white/70"}
                    style={activeItem === item.name ? oceanAccentColor : undefined}
                  />
                </div>
                
                <motion.span 
                  className={`whitespace-nowrap font-medium ${activeItem === item.name ? '' : 'text-white/80'}`}
                  style={activeItem === item.name ? oceanAccentColor : undefined}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: isHovered ? 1 : 0 }}
                >
                  {item.name}
                </motion.span>
              </motion.button>
            ))}
          </div>

          {/* Collapsed UI state (always visible when sidebar is thin) */}
          <div className={`absolute top-14 left-0 w-[52px] flex flex-col space-y-4 items-center transition-opacity duration-300 ${isHovered ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}>
             {navItems.map((item) => (
               <div key={item.name + 'collapsed'} className="w-10 h-10 flex justify-center items-center relative">
                 {activeItem === item.name && (
                    <div className="absolute left-[-12px] w-1 h-6 rounded-r-full" style={oceanAccentStyle} />
                 )}
                 <item.icon
                   size={20}
                   className={activeItem === item.name ? undefined : "text-white/60"}
                   style={activeItem === item.name ? oceanAccentColor : undefined}
                 />
               </div>
             ))}
          </div>
        </motion.nav>
      )}
    </div>
  );
}

export default OceanSidebar;
