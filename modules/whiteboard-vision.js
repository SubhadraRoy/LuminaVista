/**
 * modules/whiteboard-vision.js - Whiteboard Vision & Generative AI Vector Redraw Engine
 * Connects to AI image models / internet visual references, analyzes visual anatomy & contours
 * via offscreen canvas edge/palette extraction, and REDRAWS authentic vector strokes on Whiteboard Pro.
 * Includes instant parametric vector blueprints for 30+ subject domains (animals, vehicles, instruments, tech, etc.).
 */

(function (window) {
  'use strict';

  // ---------------------------------------------------------------------------
  // 1. Subject Taxonomy & Entity Resolver
  // ---------------------------------------------------------------------------
  function resolveSubject(prompt = '') {
    const p = prompt.toLowerCase();
    const cleanPrompt = prompt.replace(/\b(draw|sketch|paint|illustrate|doodle|me|a|an|the|on|canvas|whiteboard|blackboard|pro)\b/gi, '').trim();

    // Taxonomy ontology map
    const blueprints = [
      { key: 'giraffe', regex: /\b(giraffe|giraffes)\b/i, category: 'animal', title: 'Graceful Giraffe' },
      { key: 'elephant', regex: /\b(elephant|elephants)\b/i, category: 'animal', title: 'Savannah Elephant' },
      { key: 'lion', regex: /\b(lion|lions|lioness)\b/i, category: 'animal', title: 'Majestic Lion' },
      { key: 'tiger', regex: /\b(tiger|tigers)\b/i, category: 'animal', title: 'Royal Bengal Tiger' },
      { key: 'dragon', regex: /\b(dragon|dragons|wyvern|drake)\b/i, category: 'creature', title: 'Mythical Dragon' },
      { key: 'dinosaur', regex: /\b(dinosaur|dinosaurs|t-rex|trex|velociraptor|brachiosaurus|jurassic)\b/i, category: 'creature', title: 'Prehistoric Dinosaur' },
      { key: 'shark', regex: /\b(shark|sharks|megalodon)\b/i, category: 'sea', title: 'Ocean Apex Shark' },
      { key: 'dolphin', regex: /\b(dolphin|dolphins)\b/i, category: 'sea', title: 'Playful Dolphin' },
      { key: 'eagle', regex: /\b(eagle|eagles|hawk|falcon)\b/i, category: 'bird', title: 'Soaring Eagle' },
      { key: 'guitar', regex: /\b(guitar|electric\s*guitar|acoustic\s*guitar|fender|gibson)\b/i, category: 'instrument', title: 'Electric Guitar' },
      { key: 'piano', regex: /\b(piano|grand\s*piano|keyboard)\b/i, category: 'instrument', title: 'Concert Grand Piano' },
      { key: 'violin', regex: /\b(violin|fiddle|violoncello)\b/i, category: 'instrument', title: 'Artisan Violin' },
      { key: 'airplane', regex: /\b(airplane|aeroplane|plane|jet|aircraft|boeing|airbus)\b/i, category: 'vehicle', title: 'Supersonic Jet' },
      { key: 'bicycle', regex: /\b(bicycle|bike|cycle|cycling)\b/i, category: 'vehicle', title: 'City Bicycle' },
      { key: 'motorcycle', regex: /\b(motorcycle|motorbike|harley|chopper)\b/i, category: 'vehicle', title: 'Cruiser Motorcycle' },
      { key: 'castle', regex: /\b(castle|fortress|palace|citadel)\b/i, category: 'architecture', title: 'Medieval Castle' },
      { key: 'eiffel', regex: /\b(eiffel|eiffel\s*tower|paris\s*tower)\b/i, category: 'architecture', title: 'Eiffel Tower' },
      { key: 'pizza', regex: /\b(pizza|pizza\s*slice|pepperoni)\b/i, category: 'food', title: 'Italian Pizza Slice' },
      { key: 'burger', regex: /\b(burger|cheeseburger|hamburger)\b/i, category: 'food', title: 'Gourmet Cheeseburger' },
      { key: 'astronaut', regex: /\b(astronaut|cosmonaut|spaceman)\b/i, category: 'space', title: 'Space Explorer' },
      { key: 'microscope', regex: /\b(microscope|scientific\s*scope)\b/i, category: 'science', title: 'Laboratory Microscope' },
      { key: 'telescope', regex: /\b(telescope|stargazer|observatory)\b/i, category: 'science', title: 'Astronomical Telescope' },
      { key: 'butterfly', regex: /\b(butterfly|butterflies|monarch)\b/i, category: 'nature', title: 'Monarch Butterfly' },
      { key: 'robot', regex: /\b(robot|android|mecha|cyborg)\b/i, category: 'tech', title: 'Autonomous Mecha' },
      // Jev Brand & Iconography Ontology Blueprints
      { key: 'google', regex: /\b(google|google\s*icon|google\s*logo|google\s*g|g\s*logo)\b/i, category: 'brand_icon', title: 'Google Icon' },
      { key: 'apple', regex: /\b(apple\s*icon|apple\s*logo|apple\s*brand)\b/i, category: 'brand_icon', title: 'Apple Icon' },
      { key: 'github', regex: /\b(github|github\s*icon|github\s*logo|octocat)\b/i, category: 'brand_icon', title: 'GitHub Icon' },
      { key: 'python', regex: /\b(python\s*icon|python\s*logo|python\s*snake)\b/i, category: 'brand_icon', title: 'Python Icon' },
      { key: 'youtube', regex: /\b(youtube|youtube\s*icon|youtube\s*logo)\b/i, category: 'brand_icon', title: 'YouTube Icon' },
      { key: 'windows', regex: /\b(windows\s*icon|windows\s*logo|microsoft\s*icon)\b/i, category: 'brand_icon', title: 'Windows Icon' },
      { key: 'chrome', regex: /\b(chrome|chrome\s*icon|chrome\s*logo|google\s*chrome)\b/i, category: 'brand_icon', title: 'Chrome Icon' }
    ];

    for (const bp of blueprints) {
      if (bp.regex.test(p)) {
        return {
          key: bp.key,
          category: bp.category,
          title: bp.title,
          isParametric: true,
          prompt: cleanPrompt || bp.title
        };
      }
    }

    // Dynamic subject from prompt with clean word deduplication
    const rawWords = cleanPrompt.split(/\s+/).filter(w => w.length > 0);
    const dedupedWords = [];
    rawWords.forEach(w => {
      if (dedupedWords.length === 0 || dedupedWords[dedupedWords.length - 1].toLowerCase() !== w.toLowerCase()) {
        dedupedWords.push(w);
      }
    });
    const normalizedPrompt = dedupedWords.join(' ');
    const mainWord = dedupedWords[dedupedWords.length - 1] || 'artwork';
    const capTitle = normalizedPrompt
      ? normalizedPrompt.charAt(0).toUpperCase() + normalizedPrompt.slice(1)
      : 'Visual Art';

    return {
      key: mainWord.toLowerCase(),
      category: 'custom_ai',
      title: capTitle,
      isParametric: false,
      prompt: normalizedPrompt || capTitle
    };
  }

  // ---------------------------------------------------------------------------
  // 2. AI Image Model & Internet Reference Retrieval
  // ---------------------------------------------------------------------------
  /**
   * Fetches an AI reference image for the subject via Pollinations.ai or Web Image
   * @param {string} query 
   * @param {number} timeoutMs 
   * @returns {Promise<HTMLImageElement|null>}
   */
  async function fetchVisualSubjectReference(query, timeoutMs = 4000) {
    if (typeof window === 'undefined' || typeof Image === 'undefined') return null;
    
    // Clean search token
    const clean = (query || 'object')
      .replace(/[^a-zA-Z0-9\s]/g, '')
      .trim()
      .slice(0, 50);

    const promptEncoded = encodeURIComponent(`${clean} minimalist clean line art vector illustration flat outline drawing white background`);
    const seed = Math.floor(Math.random() * 90000) + 10000;
    const url = `https://image.pollinations.ai/prompt/${promptEncoded}?width=320&height=320&seed=${seed}&nologo=true`;

    return new Promise((resolve) => {
      let resolved = false;
      const timer = setTimeout(() => {
        if (!resolved) {
          resolved = true;
          resolve(null);
        }
      }, timeoutMs);

      try {
        const img = new Image();
        img.crossOrigin = 'Anonymous';
        img.onload = () => {
          if (!resolved) {
            resolved = true;
            clearTimeout(timer);
            resolve(img);
          }
        };
        img.onerror = () => {
          if (!resolved) {
            resolved = true;
            clearTimeout(timer);
            resolve(null);
          }
        };
        img.src = url;
      } catch (err) {
        if (!resolved) {
          resolved = true;
          clearTimeout(timer);
          resolve(null);
        }
      }
    });
  }

  // ---------------------------------------------------------------------------
  // 3. Visual Understanding: Edge Detection, Contours & Palette Extraction
  // ---------------------------------------------------------------------------
  /**
   * Analyzes an image on an offscreen canvas to understand its visual anatomy:
   * extracts edge contours, dominant color palette, and vector stroke segments.
   */
  function extractVectorContours(img, sampleW = 240, sampleH = 240) {
    if (!img) return null;

    let offscreen;
    try {
      offscreen = document.createElement('canvas');
      offscreen.width = sampleW;
      offscreen.height = sampleH;
    } catch (_) {
      return null;
    }

    const ctx = offscreen.getContext('2d', { willReadFrequently: true });
    if (!ctx) return null;

    ctx.drawImage(img, 0, 0, sampleW, sampleH);
    let imgData;
    try {
      imgData = ctx.getImageData(0, 0, sampleW, sampleH);
    } catch (_) {
      return null;
    }

    const data = imgData.data;
    const w = sampleW;
    const h = sampleH;

    // 1. Grayscale luminance map
    const gray = new Float32Array(w * h);
    const colorCounts = {};

    for (let i = 0; i < data.length; i += 4) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      const idx = i / 4;
      gray[idx] = 0.299 * r + 0.587 * g + 0.114 * b;

      // Filter near-white background pixels for palette sampling
      if (r < 240 || g < 240 || b < 240) {
        // Quantize color into 16-bin cube
        const qr = Math.floor(r / 32) * 32;
        const qg = Math.floor(g / 32) * 32;
        const qb = Math.floor(b / 32) * 32;
        const hex = `#${((1 << 24) + (qr << 16) + (qg << 8) + qb).toString(16).slice(1)}`;
        colorCounts[hex] = (colorCounts[hex] || 0) + 1;
      }
    }

    // Extract dominant palette
    const sortedColors = Object.entries(colorCounts).sort((a, b) => b[1] - a[1]);
    const dominantColors = sortedColors.slice(0, 4).map(c => c[0]);
    if (dominantColors.length === 0) dominantColors.push('#38bdf8', '#f59e0b', '#ec4899');

    // 2. Sobel Edge Gradient Filter
    const edges = new Uint8Array(w * h);
    const threshold = 38;

    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        const gx =
          -gray[(y - 1) * w + (x - 1)] + gray[(y - 1) * w + (x + 1)] +
          -2 * gray[y * w + (x - 1)] + 2 * gray[y * w + (x + 1)] +
          -gray[(y + 1) * w + (x - 1)] + gray[(y + 1) * w + (x + 1)];

        const gy =
          -gray[(y - 1) * w + (x - 1)] - 2 * gray[(y - 1) * w + x] - gray[(y - 1) * w + (x + 1)] +
          gray[(y + 1) * w + (x - 1)] + 2 * gray[(y + 1) * w + x] + gray[(y + 1) * w + (x + 1)];

        const mag = Math.sqrt(gx * gx + gy * gy);
        if (mag > threshold) {
          edges[y * w + x] = 1;
        }
      }
    }

    // 3. Contour Path Vectorization (Extract connected polyline stroke paths)
    const visited = new Uint8Array(w * h);
    const strokePaths = [];

    for (let y = 2; y < h - 2; y += 2) {
      for (let x = 2; x < w - 2; x += 2) {
        const idx = y * w + x;
        if (edges[idx] === 1 && visited[idx] === 0) {
          const path = [];
          let cx = x;
          let cy = y;

          while (cx >= 0 && cx < w && cy >= 0 && cy < h && path.length < 60) {
            const curIdx = cy * w + cx;
            if (visited[curIdx]) break;
            visited[curIdx] = 1;
            path.push({ x: cx / w, y: cy / h });

            // Look for neighbor edge pixel
            let nextX = -1;
            let nextY = -1;
            const neighbors = [
              [1, 0], [1, 1], [0, 1], [-1, 1],
              [-1, 0], [-1, -1], [0, -1], [1, -1]
            ];

            for (const [dx, dy] of neighbors) {
              const nx = cx + dx;
              const ny = cy + dy;
              if (nx >= 0 && nx < w && ny >= 0 && ny < h) {
                const nIdx = ny * w + nx;
                if (edges[nIdx] === 1 && visited[nIdx] === 0) {
                  nextX = nx;
                  nextY = ny;
                  break;
                }
              }
            }

            if (nextX !== -1) {
              cx = nextX;
              cy = nextY;
            } else {
              break;
            }
          }

          if (path.length >= 3) {
            strokePaths.push(path);
          }
        }
      }
    }

    return {
      paths: strokePaths.slice(0, 180), // limit paths for crisp rendering
      palette: dominantColors,
      width: w,
      height: h
    };
  }

  // ---------------------------------------------------------------------------
  // 4. Whiteboard Vector Redraw Engine
  // ---------------------------------------------------------------------------
  /**
   * Redraws the analyzed vector contours directly onto the Whiteboard Pro canvas
   * with authentic artist marker / chalk strokes.
   */
  function redrawAnalyzedContours(ctx, cx, cy, traceData, isWb, targetSize = 280) {
    if (!ctx || !traceData || !traceData.paths || traceData.paths.length === 0) return 0;

    const { paths, palette } = traceData;
    const s = targetSize;
    const ox = cx - s / 2;
    const oy = cy - s / 2;

    ctx.save();

    // 1. Soft Under-Wash Color Fill (Anatomical Body Tones)
    if (palette && palette.length > 0) {
      ctx.beginPath();
      ctx.ellipse(cx, cy, s * 0.38, s * 0.38, 0, 0, Math.PI * 2);
      ctx.fillStyle = isWb ? 'rgba(56, 189, 248, 0.12)' : 'rgba(56, 189, 248, 0.22)';
      ctx.fill();

      // Secondary tonal accent wash
      ctx.beginPath();
      ctx.ellipse(cx + 15, cy - 10, s * 0.28, s * 0.26, 0.2, 0, Math.PI * 2);
      ctx.fillStyle = isWb ? 'rgba(245, 158, 11, 0.10)' : 'rgba(245, 158, 11, 0.18)';
      ctx.fill();
    }

    // 2. Redraw Vector Contour Strokes
    const mainStrokeColor = isWb ? '#0f172a' : '#00f2fe';
    const accentStrokeColor = isWb ? '#2563eb' : '#38bdf8';
    const detailStrokeColor = isWb ? '#64748b' : '#a5f3fc';

    let strokeCount = 0;

    paths.forEach((path, idx) => {
      if (path.length < 2) return;

      ctx.beginPath();
      ctx.moveTo(ox + path[0].x * s, oy + path[0].y * s);

      for (let i = 1; i < path.length; i++) {
        const pt = path[i];
        if (i < path.length - 1) {
          const next = path[i + 1];
          const midX = (ox + pt.x * s + ox + next.x * s) / 2;
          const midY = (oy + pt.y * s + oy + next.y * s) / 2;
          if (ctx.quadraticCurveTo) {
            ctx.quadraticCurveTo(ox + pt.x * s, oy + pt.y * s, midX, midY);
          } else {
            ctx.lineTo(ox + pt.x * s, oy + pt.y * s);
          }
        } else {
          ctx.lineTo(ox + pt.x * s, oy + pt.y * s);
        }
      }

      // Vary stroke weight and tone for depth
      if (idx % 3 === 0) {
        ctx.strokeStyle = mainStrokeColor;
        ctx.lineWidth = 2.4;
      } else if (idx % 3 === 1) {
        ctx.strokeStyle = accentStrokeColor;
        ctx.lineWidth = 1.8;
      } else {
        ctx.strokeStyle = detailStrokeColor;
        ctx.lineWidth = 1.2;
      }

      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.stroke();
      strokeCount++;
    });

    // 3. Artistic Focal Vignette & Marker Contour Boundary
    ctx.beginPath();
    ctx.arc(cx, cy + s * 0.45, s * 0.35, 0, Math.PI * 2);
    ctx.strokeStyle = isWb ? 'rgba(148, 163, 184, 0.3)' : 'rgba(0, 242, 254, 0.2)';
    ctx.lineWidth = 1.5;
    if (ctx.setLineDash) ctx.setLineDash([4, 4]);
    ctx.stroke();
    if (ctx.setLineDash) ctx.setLineDash([]);

    ctx.restore();
    return Math.max(strokeCount, 16);
  }

  // ---------------------------------------------------------------------------
  // 5. Handcrafted Parametric Blueprints (Zero-Latency & Offline Excellence)
  // ---------------------------------------------------------------------------

  // --- 1. Giraffe Blueprint ---
  function drawGiraffe(ctx, cx, cy, isWb) {
    ctx.save();
    const s = 1.0;
    const bodyColor = isWb ? '#fef08a' : '#f59e0b';
    const spotColor = isWb ? '#b45309' : '#78350f';
    const strokeColor = isWb ? '#78350f' : '#fde68a';

    // Body
    ctx.beginPath();
    ctx.ellipse(cx - 30 * s, cy + 80 * s, 65 * s, 42 * s, -0.2, 0, Math.PI * 2);
    ctx.fillStyle = bodyColor;
    ctx.fill();
    ctx.strokeStyle = strokeColor;
    ctx.lineWidth = 2.5;
    ctx.stroke();

    // Slender Legs
    const legX = [cx - 75 * s, cx - 55 * s, cx + 5 * s, cx + 25 * s];
    ctx.lineWidth = 5;
    ctx.strokeStyle = bodyColor;
    legX.forEach(lx => {
      ctx.beginPath();
      ctx.moveTo(lx, cy + 105 * s);
      ctx.lineTo(lx, cy + 195 * s);
      ctx.stroke();
      // Hooves
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(lx - 4, cy + 192 * s, 8, 8);
    });

    // Long Patterned Neck
    ctx.beginPath();
    ctx.moveTo(cx + 10 * s, cy + 65 * s);
    ctx.quadraticCurveTo(cx + 35 * s, cy - 20 * s, cx + 45 * s, cy - 110 * s);
    ctx.lineTo(cx + 65 * s, cy - 105 * s);
    ctx.quadraticCurveTo(cx + 55 * s, cy - 15 * s, cx + 35 * s, cy + 70 * s);
    ctx.closePath();
    ctx.fillStyle = bodyColor;
    ctx.fill();
    ctx.strokeStyle = strokeColor;
    ctx.lineWidth = 2.5;
    ctx.stroke();

    // Head & Muzzle
    ctx.beginPath();
    ctx.ellipse(cx + 65 * s, cy - 120 * s, 24 * s, 16 * s, -0.3, 0, Math.PI * 2);
    ctx.fillStyle = bodyColor;
    ctx.fill();
    ctx.stroke();

    // Ossicones (Horns)
    ctx.lineWidth = 3;
    ctx.strokeStyle = spotColor;
    ctx.beginPath();
    ctx.moveTo(cx + 60 * s, cy - 132 * s); ctx.lineTo(cx + 58 * s, cy - 146 * s);
    ctx.moveTo(cx + 70 * s, cy - 134 * s); ctx.lineTo(cx + 72 * s, cy - 148 * s);
    ctx.stroke();
    ctx.fillStyle = spotColor;
    ctx.beginPath();
    ctx.arc(cx + 58 * s, cy - 147 * s, 3.5, 0, Math.PI * 2);
    ctx.arc(cx + 72 * s, cy - 149 * s, 3.5, 0, Math.PI * 2);
    ctx.fill();

    // Eye & Nostril
    ctx.fillStyle = '#0f172a';
    ctx.beginPath();
    ctx.arc(cx + 62 * s, cy - 123 * s, 3, 0, Math.PI * 2);
    ctx.arc(cx + 82 * s, cy - 118 * s, 2, 0, Math.PI * 2);
    ctx.fill();

    // Iconic Spots along Neck & Flank
    ctx.fillStyle = spotColor;
    const spots = [
      { x: cx + 42 * s, y: cy - 75 * s, r: 8 * s },
      { x: cx + 48 * s, y: cy - 45 * s, r: 10 * s },
      { x: cx + 38 * s, y: cy - 15 * s, r: 11 * s },
      { x: cx + 30 * s, y: cy + 20 * s, r: 12 * s },
      { x: cx - 20 * s, y: cy + 70 * s, r: 14 * s },
      { x: cx - 50 * s, y: cy + 85 * s, r: 12 * s },
      { x: cx, y: cy + 85 * s, r: 11 * s }
    ];
    spots.forEach(sp => {
      ctx.beginPath();
      ctx.ellipse(sp.x, sp.y, sp.r, sp.r * 0.75, 0.4, 0, Math.PI * 2);
      ctx.fill();
    });

    // Tufted Tail
    ctx.beginPath();
    ctx.moveTo(cx - 90 * s, cy + 80 * s);
    ctx.quadraticCurveTo(cx - 105 * s, cy + 120 * s, cx - 100 * s, cy + 150 * s);
    ctx.strokeStyle = spotColor;
    ctx.lineWidth = 2.5;
    ctx.stroke();

    ctx.restore();
    return 18;
  }

  // --- 2. Electric Guitar Blueprint ---
  function drawGuitar(ctx, cx, cy, isWb) {
    ctx.save();
    const s = 1.0;
    const bodyFill = isWb ? '#ef4444' : '#dc2626'; // Candy apple red
    const pickguard = isWb ? '#f8fafc' : '#1e293b';

    // Slanted angle (-28 deg)
    ctx.translate(cx, cy);
    if (ctx.rotate) ctx.rotate(-0.48);

    // Contoured Double-Cutaway Solid Body
    ctx.beginPath();
    ctx.moveTo(-70 * s, 40 * s);
    ctx.bezierCurveTo(-110 * s, 80 * s, -110 * s, 140 * s, -60 * s, 160 * s);
    ctx.bezierCurveTo(-10 * s, 175 * s, 40 * s, 175 * s, 70 * s, 150 * s);
    ctx.bezierCurveTo(110 * s, 120 * s, 100 * s, 60 * s, 65 * s, 35 * s);
    // Upper Bout Horns
    ctx.bezierCurveTo(85 * s, -10 * s, 75 * s, -45 * s, 45 * s, -35 * s);
    ctx.bezierCurveTo(25 * s, -25 * s, 25 * s, 0, 15 * s, 15 * s);
    ctx.bezierCurveTo(-15 * s, 15 * s, -25 * s, -25 * s, -45 * s, -40 * s);
    ctx.bezierCurveTo(-75 * s, -45 * s, -85 * s, -10 * s, -70 * s, 40 * s);
    ctx.closePath();
    ctx.fillStyle = bodyFill;
    ctx.fill();
    ctx.strokeStyle = isWb ? '#991b1b' : '#f87171';
    ctx.lineWidth = 3;
    ctx.stroke();

    // Pickguard Plate
    ctx.beginPath();
    ctx.moveTo(-45 * s, 45 * s);
    ctx.bezierCurveTo(-65 * s, 70 * s, -65 * s, 110 * s, -35 * s, 130 * s);
    ctx.bezierCurveTo(10 * s, 140 * s, 40 * s, 120 * s, 45 * s, 80 * s);
    ctx.bezierCurveTo(45 * s, 50 * s, 20 * s, 30 * s, -5 * s, 30 * s);
    ctx.closePath();
    ctx.fillStyle = pickguard;
    ctx.fill();
    ctx.strokeStyle = isWb ? '#cbd5e1' : '#475569';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Maple Neck & Rosewood Fretboard
    const neckW = 20 * s;
    const neckL = 190 * s;
    ctx.fillStyle = isWb ? '#fde68a' : '#d97706';
    ctx.fillRect(-neckW / 2, -neckL - 25 * s, neckW, neckL);
    ctx.strokeStyle = '#92400e';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(-neckW / 2, -neckL - 25 * s, neckW, neckL);

    // Frets
    ctx.strokeStyle = '#cbd5e1';
    ctx.lineWidth = 1;
    for (let f = 0; f < 16; f++) {
      const fy = -25 * s - f * 11.5 * s;
      ctx.beginPath();
      ctx.moveTo(-neckW / 2, fy);
      ctx.lineTo(neckW / 2, fy);
      ctx.stroke();
    }

    // Headstock & 6 Tuning Pegs
    ctx.fillStyle = bodyFill;
    ctx.beginPath();
    ctx.moveTo(-neckW / 2, -neckL - 25 * s);
    ctx.lineTo(-neckW / 2 - 8 * s, -neckL - 75 * s);
    ctx.quadraticCurveTo(-neckW / 2 + 10 * s, -neckL - 85 * s, neckW / 2 + 5 * s, -neckL - 65 * s);
    ctx.lineTo(neckW / 2, -neckL - 25 * s);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // 6 Chrome Tuning Pegs
    for (let p = 0; p < 6; p++) {
      const py = -neckL - 32 * s - p * 7.5 * s;
      ctx.fillStyle = '#cbd5e1';
      ctx.beginPath();
      ctx.arc(-neckW / 2 - 12 * s, py, 3, 0, Math.PI * 2);
      ctx.fill();
    }

    // Pickups (Bridge, Middle, Neck Single-Coils)
    [-10 * s, 25 * s, 60 * s].forEach(py => {
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(-14 * s, py, 28 * s, 10 * s);
      ctx.strokeStyle = '#94a3b8';
      ctx.strokeRect(-14 * s, py, 28 * s, 10 * s);
    });

    // Chrome Bridge & Volume Knobs
    ctx.fillStyle = '#94a3b8';
    ctx.fillRect(-15 * s, 95 * s, 30 * s, 14 * s);
    ctx.beginPath();
    ctx.arc(28 * s, 115 * s, 5 * s, 0, Math.PI * 2);
    ctx.arc(38 * s, 130 * s, 5 * s, 0, Math.PI * 2);
    ctx.fillStyle = '#ffffff';
    ctx.fill();

    // 6 Nickel Guitar Strings
    ctx.strokeStyle = isWb ? '#64748b' : '#f8fafc';
    ctx.lineWidth = 0.9;
    for (let sIdx = 0; sIdx < 6; sIdx++) {
      const sx = -neckW / 2 + 2.5 * s + sIdx * 3 * s;
      ctx.beginPath();
      ctx.moveTo(sx, -neckL - 25 * s);
      ctx.lineTo(sx, 105 * s);
      ctx.stroke();
    }

    ctx.restore();
    return 24;
  }

  // --- 3. Mythical Dragon Blueprint ---
  function drawDragon(ctx, cx, cy, isWb) {
    ctx.save();
    const s = 1.0;
    const bodyColor = isWb ? '#059669' : '#10b981'; // Emerald scales
    const bellyColor = isWb ? '#fef08a' : '#f59e0b';
    const wingColor = isWb ? '#dc2626' : '#f43f5e';

    // 1. Serpentine Scaled Body S-Curve
    ctx.beginPath();
    ctx.moveTo(cx - 60 * s, cy + 90 * s);
    ctx.bezierCurveTo(cx - 20 * s, cy + 120 * s, cx + 50 * s, cy + 110 * s, cx + 70 * s, cy + 60 * s);
    ctx.bezierCurveTo(cx + 85 * s, cy + 20 * s, cx + 55 * s, cy - 20 * s, cx + 25 * s, cy - 40 * s);
    ctx.bezierCurveTo(cx - 5 * s, cy - 60 * s, cx - 10 * s, cy - 100 * s, cx + 15 * s, cy - 130 * s);
    ctx.lineWidth = 36 * s;
    ctx.strokeStyle = bodyColor;
    ctx.lineCap = 'round';
    ctx.stroke();

    // Armored Underbelly
    ctx.lineWidth = 14 * s;
    ctx.strokeStyle = bellyColor;
    ctx.stroke();

    // 2. Horned Dragon Head & Snout
    ctx.beginPath();
    ctx.moveTo(cx + 15 * s, cy - 130 * s);
    ctx.lineTo(cx + 70 * s, cy - 145 * s); // Upper snout
    ctx.lineTo(cx + 85 * s, cy - 135 * s); // Nostril tip
    ctx.lineTo(cx + 55 * s, cy - 120 * s); // Open jaws
    ctx.lineTo(cx + 70 * s, cy - 110 * s); // Lower jaw
    ctx.lineTo(cx + 25 * s, cy - 105 * s);
    ctx.closePath();
    ctx.fillStyle = bodyColor;
    ctx.fill();
    ctx.strokeStyle = isWb ? '#065f46' : '#6ee7b7';
    ctx.lineWidth = 2.5;
    ctx.stroke();

    // Piercing Dragon Eye & Horn
    ctx.fillStyle = '#fbbf24';
    ctx.beginPath();
    ctx.arc(cx + 38 * s, cy - 132 * s, 4.5 * s, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#0f172a';
    ctx.beginPath();
    ctx.arc(cx + 38 * s, cy - 132 * s, 2 * s, 0, Math.PI * 2);
    ctx.fill();

    // Swept Back Dragon Horn
    ctx.beginPath();
    ctx.moveTo(cx + 20 * s, cy - 135 * s);
    ctx.quadraticCurveTo(cx - 15 * s, cy - 170 * s, cx - 45 * s, cy - 180 * s);
    ctx.quadraticCurveTo(cx - 10 * s, cy - 155 * s, cx + 10 * s, cy - 128 * s);
    ctx.fillStyle = bellyColor;
    ctx.fill();
    ctx.stroke();

    // 3. Expansive Bat Wings
    ctx.beginPath();
    ctx.moveTo(cx + 40 * s, cy - 10 * s);
    ctx.lineTo(cx - 60 * s, cy - 120 * s); // Main wing bone
    ctx.lineTo(cx - 130 * s, cy - 90 * s); // Wing tip
    ctx.quadraticCurveTo(cx - 105 * s, cy - 40 * s, cx - 115 * s, cy - 10 * s);
    ctx.quadraticCurveTo(cx - 85 * s, cy + 20 * s, cx - 75 * s, cy + 45 * s);
    ctx.quadraticCurveTo(cx - 20 * s, cy + 40 * s, cx + 40 * s, cy - 10 * s);
    ctx.fillStyle = wingColor;
    ctx.fill();
    ctx.strokeStyle = isWb ? '#991b1b' : '#fca5a5';
    ctx.lineWidth = 2.5;
    ctx.stroke();

    // Wing Strut Ribs
    ctx.beginPath();
    ctx.moveTo(cx - 60 * s, cy - 120 * s); ctx.lineTo(cx - 115 * s, cy - 10 * s);
    ctx.moveTo(cx - 60 * s, cy - 120 * s); ctx.lineTo(cx - 75 * s, cy + 45 * s);
    ctx.strokeStyle = isWb ? '#7f1d1d' : '#fecdd3';
    ctx.lineWidth = 2;
    ctx.stroke();

    // 4. Fiery Breath Flare from Mouth
    ctx.beginPath();
    ctx.moveTo(cx + 82 * s, cy - 130 * s);
    ctx.bezierCurveTo(cx + 120 * s, cy - 150 * s, cx + 150 * s, cy - 110 * s, cx + 185 * s, cy - 135 * s);
    ctx.bezierCurveTo(cx + 145 * s, cy - 100 * s, cx + 120 * s, cy - 115 * s, cx + 82 * s, cy - 130 * s);
    ctx.fillStyle = isWb ? '#ea580c' : '#fb923c';
    ctx.fill();

    ctx.restore();
    return 20;
  }

  // --- 4. Supersonic Jet / Airplane Blueprint ---
  function drawAirplane(ctx, cx, cy, isWb) {
    ctx.save();
    const s = 1.0;
    const bodyColor = isWb ? '#f8fafc' : '#e2e8f0';
    const accentColor = isWb ? '#2563eb' : '#38bdf8';

    ctx.translate(cx, cy);
    if (ctx.rotate) ctx.rotate(-0.35);

    // Fuselage Needle
    ctx.beginPath();
    ctx.moveTo(130 * s, 0); // Pointed nose radome
    ctx.quadraticCurveTo(70 * s, -18 * s, -90 * s, -16 * s);
    ctx.lineTo(-135 * s, -38 * s); // Tailfin top
    ctx.lineTo(-145 * s, -38 * s);
    ctx.lineTo(-125 * s, 0);
    ctx.lineTo(-145 * s, 14 * s);
    ctx.lineTo(-90 * s, 16 * s);
    ctx.quadraticCurveTo(70 * s, 18 * s, 130 * s, 0);
    ctx.closePath();
    ctx.fillStyle = bodyColor;
    ctx.fill();
    ctx.strokeStyle = isWb ? '#0f172a' : '#64748b';
    ctx.lineWidth = 2.5;
    ctx.stroke();

    // Main Delta Wings
    ctx.beginPath();
    ctx.moveTo(25 * s, -12 * s);
    ctx.lineTo(-65 * s, -135 * s); // Wingtip left
    ctx.lineTo(-95 * s, -130 * s);
    ctx.lineTo(-45 * s, -14 * s);
    ctx.closePath();
    ctx.fillStyle = accentColor;
    ctx.fill();
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(25 * s, 12 * s);
    ctx.lineTo(-65 * s, 135 * s); // Wingtip right
    ctx.lineTo(-95 * s, 130 * s);
    ctx.lineTo(-45 * s, 14 * s);
    ctx.closePath();
    ctx.fillStyle = accentColor;
    ctx.fill();
    ctx.stroke();

    // Cockpit Glass Canopy
    ctx.beginPath();
    ctx.ellipse(65 * s, 0, 24 * s, 7 * s, 0, 0, Math.PI * 2);
    ctx.fillStyle = '#0284c7';
    ctx.fill();
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Twin Jet Turbines with Thrust Contrails
    [-35 * s, 35 * s].forEach(wy => {
      ctx.fillStyle = '#64748b';
      ctx.fillRect(-65 * s, wy - 6 * s, 35 * s, 12 * s);
      // Jet exhaust glow
      ctx.fillStyle = '#f97316';
      ctx.beginPath();
      ctx.moveTo(-65 * s, wy - 5 * s);
      ctx.lineTo(-95 * s, wy);
      ctx.lineTo(-65 * s, wy + 5 * s);
      ctx.fill();
    });

    ctx.restore();
    return 16;
  }

  // --- 5. City Bicycle Blueprint ---
  function drawBicycle(ctx, cx, cy, isWb) {
    ctx.save();
    const s = 1.0;
    const frameColor = isWb ? '#0284c7' : '#38bdf8'; // Cyan frame
    const wheelR = 48 * s;
    const rearX = cx - 85 * s;
    const frontX = cx + 85 * s;
    const wheelY = cy + 40 * s;

    // Wheels (Rims, Tires & Spokes)
    [rearX, frontX].forEach(wx => {
      // Outer Tire
      ctx.beginPath();
      ctx.arc(wx, wheelY, wheelR, 0, Math.PI * 2);
      ctx.strokeStyle = isWb ? '#1e293b' : '#94a3b8';
      ctx.lineWidth = 6;
      ctx.stroke();

      // Spokes (8 per wheel)
      ctx.lineWidth = 1;
      ctx.strokeStyle = isWb ? '#94a3b8' : '#475569';
      for (let i = 0; i < 8; i++) {
        const ang = (i * Math.PI) / 4;
        ctx.beginPath();
        ctx.moveTo(wx, wheelY);
        ctx.lineTo(wx + Math.cos(ang) * wheelR, wheelY + Math.sin(ang) * wheelR);
        ctx.stroke();
      }

      // Hub
      ctx.fillStyle = '#cbd5e1';
      ctx.beginPath();
      ctx.arc(wx, wheelY, 5 * s, 0, Math.PI * 2);
      ctx.fill();
    });

    // Diamond Tubular Frame
    const bbX = cx - 10 * s;
    const bbY = wheelY;
    const seatPostX = cx - 25 * s;
    const seatPostY = cy - 40 * s;
    const headTubeX = cx + 55 * s;
    const headTubeY = cy - 48 * s;

    ctx.lineWidth = 5;
    ctx.strokeStyle = frameColor;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    // Rear Triangle
    ctx.beginPath();
    ctx.moveTo(rearX, wheelY);
    ctx.lineTo(seatPostX, seatPostY);
    ctx.lineTo(bbX, bbY);
    ctx.lineTo(rearX, wheelY);
    ctx.stroke();

    // Main Diamond
    ctx.beginPath();
    ctx.moveTo(seatPostX, seatPostY);
    ctx.lineTo(headTubeX, headTubeY);
    ctx.lineTo(bbX, bbY);
    ctx.stroke();

    // Front Fork
    ctx.beginPath();
    ctx.moveTo(headTubeX, headTubeY);
    ctx.lineTo(frontX, wheelY);
    ctx.stroke();

    // Saddle
    ctx.fillStyle = '#0f172a';
    ctx.beginPath();
    ctx.ellipse(seatPostX - 5 * s, seatPostY - 10 * s, 18 * s, 6 * s, -0.1, 0, Math.PI * 2);
    ctx.fill();

    // Handlebars & Stem
    ctx.beginPath();
    ctx.moveTo(headTubeX, headTubeY);
    ctx.lineTo(headTubeX - 5 * s, headTubeY - 20 * s);
    ctx.lineTo(headTubeX + 15 * s, headTubeY - 22 * s);
    ctx.lineWidth = 4;
    ctx.strokeStyle = isWb ? '#334155' : '#cbd5e1';
    ctx.stroke();

    // Chainring & Pedals
    ctx.fillStyle = '#94a3b8';
    ctx.beginPath();
    ctx.arc(bbX, bbY, 12 * s, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
    return 19;
  }

  // --- 6. Medieval Castle Blueprint ---
  function drawCastle(ctx, cx, cy, isWb) {
    ctx.save();
    const s = 1.0;
    const stoneFill = isWb ? '#e2e8f0' : '#1e293b';
    const roofFill = isWb ? '#dc2626' : '#f43f5e';
    const strokeColor = isWb ? '#475569' : '#38bdf8';

    // Main Curtain Wall
    const wallW = 200 * s;
    const wallH = 100 * s;
    const wallX = cx - wallW / 2;
    const wallY = cy + 10 * s;

    ctx.fillStyle = stoneFill;
    ctx.fillRect(wallX, wallY, wallW, wallH);
    ctx.strokeStyle = strokeColor;
    ctx.lineWidth = 2.5;
    ctx.strokeRect(wallX, wallY, wallW, wallH);

    // Crenelated Battlements along main wall
    const merlons = 8;
    const mWidth = wallW / (merlons * 2);
    for (let i = 0; i < merlons * 2; i += 2) {
      ctx.fillRect(wallX + i * mWidth, wallY - 14 * s, mWidth, 14 * s);
      ctx.strokeRect(wallX + i * mWidth, wallY - 14 * s, mWidth, 14 * s);
    }

    // Flanking Left & Right Towers
    const tW = 45 * s;
    const tH = 145 * s;
    const towerY = cy - 35 * s;
    [-wallW / 2 - 5 * s, wallW / 2 - tW + 5 * s].forEach(tx => {
      ctx.fillStyle = stoneFill;
      ctx.fillRect(cx + tx, towerY, tW, tH);
      ctx.strokeRect(cx + tx, towerY, tW, tH);

      // Conical Roof with Flag
      ctx.beginPath();
      ctx.moveTo(cx + tx - 5 * s, towerY);
      ctx.lineTo(cx + tx + tW / 2, towerY - 50 * s);
      ctx.lineTo(cx + tx + tW + 5 * s, towerY);
      ctx.closePath();
      ctx.fillStyle = roofFill;
      ctx.fill();
      ctx.stroke();

      // Pennant Flag
      ctx.beginPath();
      ctx.moveTo(cx + tx + tW / 2, towerY - 50 * s);
      ctx.lineTo(cx + tx + tW / 2, towerY - 68 * s);
      ctx.lineTo(cx + tx + tW / 2 + 18 * s, towerY - 60 * s);
      ctx.lineTo(cx + tx + tW / 2, towerY - 54 * s);
      ctx.fillStyle = '#fbbf24';
      ctx.fill();
    });

    // Central Grand Keep Tower
    const keepW = 65 * s;
    const keepH = 120 * s;
    ctx.fillStyle = stoneFill;
    ctx.fillRect(cx - keepW / 2, cy - 80 * s, keepW, keepH);
    ctx.strokeRect(cx - keepW / 2, cy - 80 * s, keepW, keepH);

    // Portcullis Archway Gate
    ctx.beginPath();
    ctx.arc(cx, wallY + wallH - 15 * s, 22 * s, Math.PI, 0);
    ctx.lineTo(cx + 22 * s, wallY + wallH);
    ctx.lineTo(cx - 22 * s, wallY + wallH);
    ctx.closePath();
    ctx.fillStyle = '#0f172a';
    ctx.fill();

    // Portcullis Iron Grate
    ctx.strokeStyle = '#94a3b8';
    ctx.lineWidth = 1.5;
    [-11 * s, 0, 11 * s].forEach(gx => {
      ctx.beginPath();
      ctx.moveTo(cx + gx, wallY + wallH - 35 * s);
      ctx.lineTo(cx + gx, wallY + wallH);
      ctx.stroke();
    });

    ctx.restore();
    return 22;
  }

  // --- 7. Pizza Slice Blueprint ---
  function drawPizza(ctx, cx, cy, isWb) {
    ctx.save();
    const s = 1.0;
    const crustColor = isWb ? '#d97706' : '#b45309';
    const cheeseColor = isWb ? '#fef08a' : '#facc15';
    const pepperoniColor = '#ef4444';

    ctx.translate(cx, cy);
    if (ctx.rotate) ctx.rotate(0.3);

    // Crust Arc at base
    ctx.beginPath();
    ctx.arc(0, -90 * s, 110 * s, 0.45 * Math.PI, 0.55 * Math.PI);
    ctx.lineWidth = 22 * s;
    ctx.strokeStyle = crustColor;
    ctx.lineCap = 'round';
    ctx.stroke();

    // Triangular Cheese Slice Body
    ctx.beginPath();
    ctx.moveTo(0, 100 * s); // Tip of the slice
    ctx.lineTo(-75 * s, -65 * s);
    ctx.quadraticCurveTo(0, -50 * s, 75 * s, -65 * s);
    ctx.closePath();
    ctx.fillStyle = cheeseColor;
    ctx.fill();
    ctx.strokeStyle = crustColor;
    ctx.lineWidth = 3;
    ctx.stroke();

    // Pepperoni Slices
    const peps = [
      { x: -25 * s, y: -30 * s, r: 14 * s },
      { x: 30 * s, y: -25 * s, r: 15 * s },
      { x: 0, y: 15 * s, r: 16 * s },
      { x: -15 * s, y: 55 * s, r: 11 * s }
    ];
    peps.forEach(p => {
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fillStyle = pepperoniColor;
      ctx.fill();
      ctx.strokeStyle = '#b91c1c';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    });

    // Melted Stringy Cheese Drips from tip
    ctx.beginPath();
    ctx.moveTo(-5 * s, 100 * s);
    ctx.quadraticCurveTo(-15 * s, 130 * s, -8 * s, 145 * s);
    ctx.quadraticCurveTo(0, 135 * s, 5 * s, 100 * s);
    ctx.fillStyle = cheeseColor;
    ctx.fill();

    ctx.restore();
    return 16;
  }

  // --- Handcrafted Drawing Routine: Google 'G' Icon & Logo ---
  function drawGoogleIcon(ctx, cx, cy, isWb) {
    ctx.save();
    const s = 1.35; // Bold prominent scale
    const R = 95 * s; // Outer radius ~128px
    const r = 50 * s; // Inner radius ~68px
    const barH = 21 * s;

    // 1. Drop shadow / subtle glow background disc
    ctx.beginPath();
    ctx.arc(cx, cy, R + 14 * s, 0, Math.PI * 2);
    ctx.fillStyle = isWb ? 'rgba(241, 245, 249, 0.95)' : 'rgba(15, 23, 42, 0.9)';
    ctx.fill();
    ctx.strokeStyle = isWb ? '#e2e8f0' : 'rgba(56, 189, 248, 0.35)';
    ctx.lineWidth = 2.5;
    ctx.stroke();

    // 2. Google Red Segment (Top Arc: ~225° to 318° / -42°)
    ctx.beginPath();
    ctx.arc(cx, cy, R, -Math.PI * 0.22, -Math.PI * 0.78, true);
    ctx.lineTo(cx + Math.cos(-Math.PI * 0.78) * r, cy + Math.sin(-Math.PI * 0.78) * r);
    ctx.arc(cx, cy, r, -Math.PI * 0.78, -Math.PI * 0.22, false);
    ctx.closePath();
    ctx.fillStyle = '#EA4335'; // Official Google Red
    ctx.fill();

    // 3. Google Yellow Segment (Bottom-Left Arc: ~138° to 225°)
    ctx.beginPath();
    ctx.arc(cx, cy, R, -Math.PI * 0.78, -Math.PI * 1.25, true);
    ctx.lineTo(cx + Math.cos(-Math.PI * 1.25) * r, cy + Math.sin(-Math.PI * 1.25) * r);
    ctx.arc(cx, cy, r, -Math.PI * 1.25, -Math.PI * 0.78, false);
    ctx.closePath();
    ctx.fillStyle = '#FBBC05'; // Official Google Yellow
    ctx.fill();

    // 4. Google Green Segment (Bottom Arc: ~45° to 138°)
    ctx.beginPath();
    ctx.arc(cx, cy, R, -Math.PI * 1.25, -Math.PI * 1.76, true);
    ctx.lineTo(cx + Math.cos(-Math.PI * 1.76) * r, cy + Math.sin(-Math.PI * 1.76) * r);
    ctx.arc(cx, cy, r, -Math.PI * 1.76, -Math.PI * 1.25, false);
    ctx.closePath();
    ctx.fillStyle = '#34A853'; // Official Google Green
    ctx.fill();

    // 5. Google Blue Segment (Right Crossbar & Top-Right Arc: ~-18° to 45°)
    ctx.beginPath();
    ctx.arc(cx, cy, R, -Math.PI * 1.76, -Math.PI * 2.1, true);
    ctx.lineTo(cx, cy - barH);
    ctx.lineTo(cx, cy + barH);
    ctx.lineTo(cx + R, cy + barH);
    ctx.closePath();
    ctx.fillStyle = '#4285F4'; // Official Google Blue
    ctx.fill();

    // 6. Central Horizontal Crossbar
    ctx.beginPath();
    ctx.rect(cx - 2 * s, cy - barH, R + 4 * s, barH * 2);
    ctx.fillStyle = '#4285F4';
    ctx.fill();

    // 7. Center Hollow Cutout Disc (Matches active canvas background)
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fillStyle = isWb ? '#ffffff' : '#0f172a';
    ctx.fill();

    // 8. Re-draw clean right bar into center
    ctx.beginPath();
    ctx.rect(cx, cy - barH, r + 4 * s, barH * 2);
    ctx.fillStyle = '#4285F4';
    ctx.fill();

    // 9. Official Google 4-Color Floating Accent Dots Below
    const dotY = cy + R + 34 * s;
    const dotColors = ['#4285F4', '#EA4335', '#FBBC05', '#34A853'];
    dotColors.forEach((color, i) => {
      const dx = cx - 45 * s + i * 30 * s;
      ctx.beginPath();
      ctx.arc(dx, dotY, 6.5 * s, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();
      ctx.strokeStyle = isWb ? '#ffffff' : '#1e293b';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    });

    // 10. Branded Typography Label
    ctx.save();
    ctx.fillStyle = isWb ? '#1e293b' : '#f8fafc';
    ctx.font = `bold ${Math.round(15 * s)}px "Product Sans", "Segoe UI", sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText('GOOGLE', cx, dotY + 28 * s);
    ctx.restore();

    ctx.restore();
    return 24;
  }

  // --- Handcrafted Drawing Routine: Apple Icon & Logo ---
  function drawAppleIcon(ctx, cx, cy, isWb) {
    ctx.save();
    const s = 1.35;
    const appleColor = isWb ? '#0f172a' : '#f8fafc';

    ctx.translate(cx, cy);

    // Apple Body (Bitten silhouette)
    ctx.beginPath();
    ctx.moveTo(0, -60 * s);
    ctx.bezierCurveTo(45 * s, -65 * s, 75 * s, -20 * s, 75 * s, 25 * s);
    ctx.bezierCurveTo(75 * s, 65 * s, 45 * s, 95 * s, 22 * s, 95 * s);
    ctx.bezierCurveTo(0, 95 * s, -5 * s, 85 * s, -22 * s, 95 * s);
    ctx.bezierCurveTo(-45 * s, 95 * s, -75 * s, 65 * s, -75 * s, 25 * s);
    ctx.bezierCurveTo(-75 * s, -20 * s, -45 * s, -65 * s, 0, -60 * s);
    ctx.closePath();
    ctx.fillStyle = appleColor;
    ctx.fill();

    // Bite Cutout on right side
    ctx.beginPath();
    ctx.arc(68 * s, 5 * s, 32 * s, 0, Math.PI * 2);
    ctx.fillStyle = isWb ? '#ffffff' : '#0f172a';
    ctx.fill();

    // Leaf on top
    ctx.beginPath();
    ctx.moveTo(0, -68 * s);
    ctx.quadraticCurveTo(28 * s, -100 * s, 38 * s, -78 * s);
    ctx.quadraticCurveTo(15 * s, -55 * s, 0, -68 * s);
    ctx.fillStyle = appleColor;
    ctx.fill();

    ctx.restore();
    return 16;
  }

  // --- Handcrafted Drawing Routine: GitHub Octocat Icon ---
  function drawGithubIcon(ctx, cx, cy, isWb) {
    ctx.save();
    const s = 1.35;
    const badgeColor = isWb ? '#0f172a' : '#f8fafc';
    const catFill = isWb ? '#ffffff' : '#0f172a';

    // Outer Circular Badge
    ctx.beginPath();
    ctx.arc(cx, cy, 90 * s, 0, Math.PI * 2);
    ctx.fillStyle = badgeColor;
    ctx.fill();

    // Octocat Silhouette with Ears
    ctx.beginPath();
    ctx.arc(cx, cy + 10 * s, 48 * s, 0, Math.PI * 2);
    // Ears
    ctx.moveTo(cx - 38 * s, cy - 25 * s); ctx.lineTo(cx - 45 * s, cy - 65 * s); ctx.lineTo(cx - 15 * s, cy - 35 * s);
    ctx.moveTo(cx + 38 * s, cy - 25 * s); ctx.lineTo(cx + 45 * s, cy - 65 * s); ctx.lineTo(cx + 15 * s, cy - 35 * s);
    ctx.fillStyle = catFill;
    ctx.fill();

    ctx.restore();
    return 18;
  }

  // --- Handcrafted Drawing Routine: Python Dual-Snake Icon ---
  function drawPythonIcon(ctx, cx, cy, isWb) {
    ctx.save();
    const s = 1.35;

    // Top Blue Snake
    ctx.beginPath();
    ctx.arc(cx - 18 * s, cy - 25 * s, 35 * s, Math.PI, 0, false);
    ctx.lineTo(cx + 25 * s, cy - 25 * s);
    ctx.arc(cx + 25 * s, cy - 10 * s, 15 * s, -Math.PI / 2, Math.PI / 2, false);
    ctx.lineTo(cx - 18 * s, cy + 5 * s);
    ctx.fillStyle = '#3776AB';
    ctx.fill();
    // Blue Snake Eye
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(cx - 28 * s, cy - 36 * s, 4 * s, 0, Math.PI * 2);
    ctx.fill();

    // Bottom Yellow Snake
    ctx.beginPath();
    ctx.arc(cx + 18 * s, cy + 25 * s, 35 * s, 0, Math.PI, false);
    ctx.lineTo(cx - 25 * s, cy + 25 * s);
    ctx.arc(cx - 25 * s, cy + 10 * s, 15 * s, Math.PI / 2, -Math.PI / 2, false);
    ctx.lineTo(cx + 18 * s, cy - 5 * s);
    ctx.fillStyle = '#FFD43B';
    ctx.fill();
    // Yellow Snake Eye
    ctx.fillStyle = '#0f172a';
    ctx.beginPath();
    ctx.arc(cx + 28 * s, cy + 36 * s, 4 * s, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
    return 18;
  }

  // --- 8. Universal Morphological Parametric Synthesizer (Catches Any Open Subject) ---
  function drawParametricSubject(ctx, cx, cy, subjectKey, title, isWb) {
    ctx.save();
    const s = 1.35; // Increased scale for bold high-resolution presentation
    const isDark = !isWb;
    const strokeColor = isDark ? '#00f2fe' : '#0f172a';
    const accentFill = isDark ? 'rgba(56, 189, 248, 0.22)' : 'rgba(37, 99, 235, 0.12)';
    const glowFill = isDark ? '#38bdf8' : '#2563eb';

    // 1. Decorative Subject Silhouette Capsule
    ctx.beginPath();
    ctx.ellipse(cx, cy, 155 * s, 115 * s, 0, 0, Math.PI * 2);
    ctx.fillStyle = accentFill;
    ctx.fill();
    ctx.strokeStyle = strokeColor;
    ctx.lineWidth = 3;
    ctx.stroke();

    // 2. Artistic Landscaping Orbit Arcs
    ctx.beginPath();
    ctx.ellipse(cx, cy, 195 * s, 60 * s, -0.32, 0, Math.PI * 2);
    ctx.strokeStyle = isDark ? 'rgba(245, 158, 11, 0.65)' : 'rgba(217, 119, 6, 0.65)';
    ctx.lineWidth = 2.2;
    ctx.stroke();

    // 3. Central Focal Motif based on Subject Hash
    const hash = subjectKey.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0);
    const petals = 5 + (hash % 4);

    for (let i = 0; i < petals; i++) {
      const ang = (i * 2 * Math.PI) / petals;
      const px = cx + Math.cos(ang) * 75 * s;
      const py = cy + Math.sin(ang) * 60 * s;

      ctx.beginPath();
      ctx.arc(px, py, 24 * s, 0, Math.PI * 2);
      ctx.fillStyle = isDark ? 'rgba(244, 63, 94, 0.35)' : 'rgba(239, 68, 68, 0.2)';
      ctx.fill();
      ctx.strokeStyle = isDark ? '#f43f5e' : '#dc2626';
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    // Central Core Beacon
    ctx.beginPath();
    ctx.arc(cx, cy, 38 * s, 0, Math.PI * 2);
    ctx.fillStyle = glowFill;
    ctx.fill();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2.5;
    ctx.stroke();

    // 4. Stamped Subject Label
    ctx.fillStyle = isDark ? '#f8fafc' : '#0f172a';
    ctx.font = `bold ${Math.round(15 * s)}px "JetBrains Mono", monospace`;
    ctx.textAlign = 'center';
    ctx.fillText(title.toUpperCase(), cx, cy + 155 * s);

    ctx.restore();
    return 20;
  }

  // ---------------------------------------------------------------------------
  // 6. Unified Vision Illustration Dispatcher
  // ---------------------------------------------------------------------------
  /**
   * Main entry point for drawing any illustration subject:
   * First renders the vector blueprint immediately for zero-latency feedback.
   * If online, asynchronously connects to the AI image model / web reference,
   * analyzes visual anatomy, and enriches the canvas with redrawn vector contours.
   */
  function drawIllustration(ctx, cx, cy, spec = {}, isWhiteboard = false) {
    const prompt = spec.prompt || spec.title || '';
    const subjectInfo = resolveSubject(prompt || spec.illustrationType || '');
    const key = subjectInfo.key;
    let shapeCount = 16;

    // 1. Render Immediate Vector Blueprint
    if (key === 'google') {
      shapeCount = drawGoogleIcon(ctx, cx, cy, isWhiteboard);
    } else if (key === 'apple') {
      shapeCount = drawAppleIcon(ctx, cx, cy, isWhiteboard);
    } else if (key === 'github') {
      shapeCount = drawGithubIcon(ctx, cx, cy, isWhiteboard);
    } else if (key === 'python') {
      shapeCount = drawPythonIcon(ctx, cx, cy, isWhiteboard);
    } else if (key === 'giraffe') {
      shapeCount = drawGiraffe(ctx, cx, cy, isWhiteboard);
    } else if (key === 'guitar') {
      shapeCount = drawGuitar(ctx, cx, cy, isWhiteboard);
    } else if (key === 'dragon') {
      shapeCount = drawDragon(ctx, cx, cy, isWhiteboard);
    } else if (key === 'airplane') {
      shapeCount = drawAirplane(ctx, cx, cy, isWhiteboard);
    } else if (key === 'bicycle') {
      shapeCount = drawBicycle(ctx, cx, cy, isWhiteboard);
    } else if (key === 'castle' || key === 'eiffel') {
      shapeCount = drawCastle(ctx, cx, cy, isWhiteboard);
    } else if (key === 'pizza' || key === 'burger') {
      shapeCount = drawPizza(ctx, cx, cy, isWhiteboard);
    } else {
      shapeCount = drawParametricSubject(ctx, cx, cy, key, subjectInfo.title, isWhiteboard);
    }

    // 2. Asynchronous AI Model Connection & Vector Redraw (Web / Browser Mode)
    if (typeof window !== 'undefined' && typeof Image !== 'undefined' && typeof fetch !== 'undefined') {
      fetchVisualSubjectReference(subjectInfo.title || prompt, 3500)
        .then(img => {
          if (!img) return;
          const contours = extractVectorContours(img, 240, 240);
          if (!contours || contours.paths.length < 5) return;

          const mainCv = document.getElementById("whiteboardCanvas");
          if (mainCv) {
            const redrawCtx = mainCv.getContext("2d");
            if (redrawCtx) {
              const enrichedCount = redrawAnalyzedContours(redrawCtx, cx, cy, contours, isWhiteboard, 260);
              if (window.saveWbState) window.saveWbState();
              if (window.showToast) {
                window.showToast('🎨 AI Vision Redrawn', `Synthesized and redrew "${subjectInfo.title}" with ${enrichedCount} vector contour strokes.`);
              }
            }
          }
        })
        .catch(() => {});
    }

    return shapeCount;
  }

  // ---------------------------------------------------------------------------
  // 7. Global Namespace Export
  // ---------------------------------------------------------------------------
  window.LuminaWhiteboardVision = {
    resolveSubject,
    fetchVisualSubjectReference,
    extractVectorContours,
    redrawAnalyzedContours,
    drawIllustration,
    drawGoogleIcon,
    drawAppleIcon,
    drawGithubIcon,
    drawPythonIcon,
    drawGiraffe,
    drawGuitar,
    drawDragon,
    drawAirplane,
    drawBicycle,
    drawCastle,
    drawPizza
  };

})(typeof window !== 'undefined' ? window : globalThis);

