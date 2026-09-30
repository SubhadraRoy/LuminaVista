/**
 * personas.js
 * LuminaVista OS — Master Persona Registry & 35-Category Matrix Orchestrator
 * Coordinates and aggregates modular personas across modules/personas/*.js
 */
(function(window) {
  'use strict';

  // 1. Master Categories Matrix (35 Domains)
  const categories = [
  {
    "id": "general",
    "name": "General & Everyday Assistant (Default)",
    "icon": "sparkles",
    "description": "All-purpose reasoning, conversational problem solving, and day-to-day productivity."
  },
  {
    "id": "software_eng",
    "name": "Software Engineering & System Architecture",
    "icon": "cpu",
    "description": "Design patterns, clean code, distributed systems, DDD, and refactoring."
  },
  {
    "id": "frontend_design",
    "name": "Frontend Development & Creative Web Design",
    "icon": "palette",
    "description": "Modern React/Vue/Svelte, CSS shaders, animations, Tailwind, and Awwwards UX."
  },
  {
    "id": "backend_systems",
    "name": "Backend Systems, APIs & Microservices",
    "icon": "server",
    "description": "High-throughput APIs, GraphQL, gRPC, Node.js, Go, Rust, and event architectures."
  },
  {
    "id": "devops_cloud",
    "name": "DevOps, Cloud Infrastructure & SRE",
    "icon": "cloud",
    "description": "Kubernetes, Docker, Terraform, CI/CD, AWS/GCP, monitoring, and zero-downtime."
  },
  {
    "id": "cybersecurity",
    "name": "Cybersecurity, Pentesting & Cryptography",
    "icon": "shield",
    "description": "Zero-trust, OWASP Top 10, binary exploitation, reverse engineering, and threat modeling."
  },
  {
    "id": "hardware_embedded",
    "name": "Hardware Engineering & Embedded Firmware",
    "icon": "circuit-board",
    "description": "Microcontrollers, ARM/RISC-V, RTOS, PCB layout, FPGA, and Verilog/VHDL."
  },
  {
    "id": "ai_deeplearning",
    "name": "Artificial Intelligence & Deep Learning",
    "icon": "brain",
    "description": "LLMs, transformers, fine-tuning, RAG, PyTorch, model quantization, and agents."
  },
  {
    "id": "data_science",
    "name": "Data Science, Machine Learning & Analytics",
    "icon": "bar-chart-2",
    "description": "Pandas, statistical modeling, feature engineering, Jupyter, and data pipelines."
  },
  {
    "id": "mobile_dev",
    "name": "Mobile App Development",
    "icon": "smartphone",
    "description": "iOS Swift, Android Kotlin, React Native, Flutter, offline-first sync, and store release."
  },
  {
    "id": "game_dev",
    "name": "Game Development & 3D Interactive Graphics",
    "icon": "gamepad-2",
    "description": "Unreal Engine, Unity, WebGL/Three.js, physics simulation, shaders, and game math."
  },
  {
    "id": "database_storage",
    "name": "Database Engineering & Distributed Storage",
    "icon": "database",
    "description": "PostgreSQL, MySQL, Redis, ClickHouse, sharding, query plans, and vector search."
  },
  {
    "id": "blockchain_web3",
    "name": "Blockchain, Web3 & Smart Contracts",
    "icon": "link",
    "description": "Solidity, EVM, zero-knowledge proofs, DeFi protocols, audit, and consensus."
  },
  {
    "id": "quantum_computing",
    "name": "Quantum Computing & Quantum Physics",
    "icon": "atom",
    "description": "Qubits, Qiskit, quantum algorithms, error correction, and quantum simulation."
  },
  {
    "id": "robotics_mechatronics",
    "name": "Robotics, Mechatronics & Automation",
    "icon": "bot",
    "description": "ROS/ROS2, kinematics, PID controllers, SLAM, computer vision, and servo systems."
  },
  {
    "id": "networking_telecom",
    "name": "Computer Networking & Telecommunications",
    "icon": "wifi",
    "description": "TCP/IP, BGP, SD-WAN, packet analysis, HTTP/3, QUIC, and low-latency protocols."
  },
  {
    "id": "teaching_academia",
    "name": "Teaching, Academia & Educational Pedagogy",
    "icon": "graduation-cap",
    "description": "Curriculum design, Socratic explanation, tutoring, grading, and academic research."
  },
  {
    "id": "culinary_gastronomy",
    "name": "Culinary Arts, Gastronomy & Cooking",
    "icon": "utensils",
    "description": "Recipe design, molecular gastronomy, food science, baking math, and menu engineering."
  },
  {
    "id": "travel_nomad",
    "name": "Travel Planning, Expedition & Digital Nomad",
    "icon": "compass",
    "description": "Itinerary optimization, visa regulations, flight hacking, gear, and cultural etiquette."
  },
  {
    "id": "finance_fintech",
    "name": "Finance, Quantitative Trading & Fintech",
    "icon": "dollar-sign",
    "description": "Algorithmic trading, Black-Scholes, ledger systems, risk management, and SEC compliance."
  },
  {
    "id": "healthcare_bio",
    "name": "Healthcare, Medicine & Bioinformatics",
    "icon": "heart-pulse",
    "description": "Genomics, clinical trial analysis, HIPAA, pharmacology math, and medical data."
  },
  {
    "id": "legal_compliance",
    "name": "Legal, Governance & Regulatory Compliance",
    "icon": "scale",
    "description": "Contract analysis, GDPR/CCPA, patent filing, corporate governance, and terms of service."
  },
  {
    "id": "creative_writing",
    "name": "Creative Writing, Screenwriting & Storytelling",
    "icon": "feather",
    "description": "Three-act structure, worldbuilding, character arcs, dialogue polish, and lore design."
  },
  {
    "id": "music_audio",
    "name": "Music Production, Sound Design & Audio DSP",
    "icon": "music",
    "description": "Synthesizer patch design, mixing/mastering, audio DSP, MIDI algorithms, and acoustics."
  },
  {
    "id": "cinema_vfx",
    "name": "Cinema, Video Production & VFX",
    "icon": "video",
    "description": "Color grading, storyboard pacing, DaVinci/Premiere workflows, CGI compositing, and optics."
  },
  {
    "id": "marketing_growth",
    "name": "Marketing, Growth & Technical SEO",
    "icon": "trending-up",
    "description": "Conversion rate optimization, programmatic SEO, attribution models, and funnel copy."
  },
  {
    "id": "product_strategy",
    "name": "Product Management & Startup Strategy",
    "icon": "target",
    "description": "PRD writing, user stories, North Star metrics, unit economics, and pitch decks."
  },
  {
    "id": "philosophy_ethics",
    "name": "Philosophy, Ethics & Cognitive Science",
    "icon": "book",
    "description": "Epistemology, AI alignment, decision theory, logic, and existential reasoning."
  },
  {
    "id": "fitness_longevity",
    "name": "Fitness, Sports Science & Human Longevity",
    "icon": "activity",
    "description": "Periodization programming, biomechanics, VO2 max optimization, and metabolic health."
  },
  {
    "id": "aerospace_space",
    "name": "Aerospace Engineering & Orbital Mechanics",
    "icon": "rocket",
    "description": "Delta-v calculations, CFD aerodynamics, propulsion cycles, and satellite orbits."
  },
  {
    "id": "productivity_automation",
    "name": "Productivity, Workflow Automation & Agents",
    "icon": "workflow",
    "description": "Zapier/n8n, bash scripts, cron jobs, autonomous task orchestration, and personal workflows."
  },
  {
    "id": "technical_support",
    "name": "IT Support, Diagnostics & Systems Troubleshooting",
    "icon": "wrench",
    "description": "Bug diagnosis, stacktrace debugging, OS kernel panics, network connectivity, and log auditing."
  },
  {
    "id": "data_visualization",
    "name": "Data Visualization, Dashboards & Telemetry",
    "icon": "pie-chart",
    "description": "Interactive D3.js, Chart.js, SVG visualizers, Canvas telemetry, and analytics reporting."
  },
  {
    "id": "cloud_native",
    "name": "Cloud Native, Edge Computing & MicroVM Systems",
    "icon": "layers",
    "description": "Serverless edge runtimes, Cloudflare Workers, Firecracker microVMs, and multi-region resilience."
  },
  {
    "id": "language_specialists",
    "name": "Programming Language Masters & Syntax Virtuosos",
    "icon": "code",
    "description": "Pythonic masters, Rust ownership specialists, TypeScript type-level wizards, and Go systems programmers."
  }
];

  // 2. Persona Registry Initialization
  window.LuminaPersonaRegistry = window.LuminaPersonaRegistry || [];

  // Server-side / Node.js fallback loader to ensure personas load in JSDOM / test harnesses
  if (typeof require !== 'undefined' && (window.LuminaPersonaRegistry.length === 0 || !window.LuminaPersonas)) {
    try {
      const fs = require('fs');
      const path = require('path');
      const pDir = path.join(__dirname, 'modules', 'personas');
      if (fs.existsSync(pDir)) {
        const pFiles = fs.readdirSync(pDir).filter(f => f.endsWith('.js'));
        pFiles.forEach(f => {
          try {
            const modPersonas = require(path.join(pDir, f));
            if (Array.isArray(modPersonas) && window.LuminaPersonaRegistry.length < 500) {
              modPersonas.forEach(p => window.LuminaPersonaRegistry.push(p));
            }
          } catch (e) {}
        });
      }
    } catch (e) {}
  }

  // De-duplicate registry personas
  const personaMap = new Map();
  window.LuminaPersonaRegistry.forEach(p => {
    if (p && p.id && !personaMap.has(p.id)) {
      personaMap.set(p.id, p);
    }
  });
  const personas = Array.from(personaMap.values());

  // 3. Global Exports
  window.LuminaPersonaCategories = categories;
  window.LuminaPersonas = personas;
  window.PERSONA_CATEGORIES = categories;
  window.PERSONAS = personas;

  // 4. Query & Filter API
  window.getPersonasForCategory = function(catId) {
    if (!catId) return window.LuminaPersonas;
    return window.LuminaPersonas.filter(p => p.category === catId);
  };

  window.getPersonaById = function(id) {
    return window.LuminaPersonas.find(p => p.id === id) || null;
  };

  // 5. DOM Dropdown Populators
  window.populateCategoryDropdown = function(selectId = 'modalAiCategorySelect', activeCatId = 'general') {
    const sel = document.getElementById(selectId);
    if (!sel) return;
    sel.innerHTML = '';
    categories.forEach(cat => {
      const opt = document.createElement('option');
      opt.value = cat.id;
      opt.textContent = cat.name;
      if (cat.id === activeCatId) opt.selected = true;
      sel.appendChild(opt);
    });
  };

  window.populateSpecialistDropdown = function(selectId = 'modalAiPersonaSelect', catId = 'general', activeSpecId = '') {
    const sel = document.getElementById(selectId);
    if (!sel) return;
    sel.innerHTML = '';
    const filtered = window.getPersonasForCategory(catId);
    const hasSubCategories = filtered.some(p => p.subCategory);

    if (hasSubCategories) {
      const groups = {};
      filtered.forEach(p => {
        const sub = p.subCategory || 'General Specialists';
        if (!groups[sub]) groups[sub] = [];
        groups[sub].push(p);
      });
      Object.keys(groups).forEach(subName => {
        const optgroup = document.createElement('optgroup');
        optgroup.label = subName;
        groups[subName].forEach(p => {
          const opt = document.createElement('option');
          opt.value = p.id;
          opt.textContent = p.name;
          if (p.id === activeSpecId) opt.selected = true;
          optgroup.appendChild(opt);
        });
        sel.appendChild(optgroup);
      });
    } else {
      filtered.forEach(p => {
        const opt = document.createElement('option');
        opt.value = p.id;
        opt.textContent = p.name;
        if (p.id === activeSpecId) opt.selected = true;
        sel.appendChild(opt);
      });
    }
  };

  window.populatePersonasDropdown = function() {
    const savedCat = (typeof localStorage !== 'undefined' ? localStorage.getItem('lumina_ai_category') : null) || 'general';
    const savedSpec = (typeof localStorage !== 'undefined' ? localStorage.getItem('lumina_ai_persona') : null) || '';
    window.populateCategoryDropdown('modalAiCategorySelect', savedCat);
    window.populateSpecialistDropdown('modalAiPersonaSelect', savedCat, savedSpec);
  };

  window.onModalCategoryChange = function() {
    const catSelect = document.getElementById('modalAiCategorySelect');
    if (!catSelect) return;
    const catId = catSelect.value;
    if (typeof localStorage !== 'undefined') localStorage.setItem('lumina_ai_category', catId);
    window.populateSpecialistDropdown('modalAiPersonaSelect', catId, '');
    window.onModalPersonaChange();
  };

  window.onModalPersonaChange = function() {
    const specSelect = document.getElementById('modalAiPersonaSelect');
    if (!specSelect) return;
    const specId = specSelect.value;
    if (typeof localStorage !== 'undefined') localStorage.setItem('lumina_ai_persona', specId);
    const p = window.getPersonaById(specId);
    const descEl = document.getElementById('modalAiPersonaDesc');
    if (descEl && p) {
      descEl.textContent = p.description;
    }
    if (window.updateAiConfigBadge) {
      window.updateAiConfigBadge();
    }
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { categories, personas };
  }
})(typeof window !== 'undefined' ? window : global);
