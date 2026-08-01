# Ocean Sidebar Component

A high-performance, 60fps organic ocean wave physics sidebar component using `framer-motion`, `useAnimationFrame`, LogSumExp soft-max wave blending, and canvas specular highlights.

## Features
- Physics-based spring momentum (`useSpring`)
- 3D parallax wave layers (`xFront`, `xMid`, `xBack`)
- LogSumExp soft-max foam outline curve
- Interaction particle bubbles & specular crest highlights
- Theme-driven per-layer blur + depth-faded frosted veil on every wave layer (`frontClip`/`midClip`/`backClip`)
- Canvas foam color + wave amplitude + layer alpha follow the host theme via `--ocean-*` CSS tokens

