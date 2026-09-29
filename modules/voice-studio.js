// modules/voice-studio.js - 100% Free Sovereign Voice Interaction Mode (Zero External Costs)
(function(window) {
  'use strict';

  let recognition = null;
  let isListening = false;
  let isSpeaking = false;
  let isThinking = false;
  let continuousMode = true;
  let selectedVoice = null;
  let voicesList = [];
  let speechRate = 1.0;
  let speechPitch = 1.0;
  let silenceTimer = null;
  let animFrameId = null;
  let visualizerState = 'idle'; // 'idle', 'listening', 'thinking', 'speaking'
  let canvasContext = null;
  let canvasEl = null;

  let audioCtx = null;
  let analyser = null;
  let micSource = null;
  let micDataArray = null;
  let micStream = null;

  async function requestMicrophonePermission() {
    if (typeof navigator === 'undefined' || !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      return true; // Non-browser / Node test environment
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      });
      setupAudioAnalyser(stream);
      showMicrophonePermissionHelp(false);
      return true;
    } catch (err) {
      console.warn('[VoiceStudio] getUserMedia permission error:', err);
      const isDenied = err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError';
      const msg = isDenied 
        ? 'Microphone access denied. Please click the lock icon in your address bar and allow Microphone.'
        : `Microphone error: ${err.message || 'Unable to access audio device.'}`;
      updateVoiceStatus('error', msg);
      showMicrophonePermissionHelp(true);
      if (window.showToast) {
        window.showToast('Microphone Denied', 'Please allow microphone access in your browser address bar.');
      }
      return false;
    }
  }

  function setupAudioAnalyser(stream) {
    try {
      micStream = stream;
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextClass) return;

      if (!audioCtx) {
        audioCtx = new AudioContextClass();
      }
      if (audioCtx.state === 'suspended') {
        audioCtx.resume();
      }

      analyser = audioCtx.createAnalyser();
      analyser.fftSize = 64;
      analyser.smoothingTimeConstant = 0.8;
      micSource = audioCtx.createMediaStreamSource(stream);
      micSource.connect(analyser);
      micDataArray = new Uint8Array(analyser.frequencyBinCount);
    } catch (e) {
      console.warn('[VoiceStudio] AudioContext setup error:', e);
    }
  }

  function getLiveAudioVolume() {
    if (!analyser || !micDataArray || !isListening) return 0;
    try {
      analyser.getByteFrequencyData(micDataArray);
      let sum = 0;
      for (let i = 0; i < micDataArray.length; i++) {
        sum += micDataArray[i];
      }
      return sum / micDataArray.length; // 0..255
    } catch (e) {
      return 0;
    }
  }

  function cleanupAudioAnalyser() {
    if (micStream) {
      try {
        micStream.getTracks().forEach(t => t.stop());
      } catch (e) {}
      micStream = null;
    }
    if (micSource) {
      try { micSource.disconnect(); } catch (e) {}
      micSource = null;
    }
  }

  function showMicrophonePermissionHelp(show) {
    const btn = document.getElementById('voiceRetryMicBtn');
    if (btn) {
      if (show) {
        btn.classList.remove('hidden');
      } else {
        btn.classList.add('hidden');
      }
    }
  }

  async function retryMicrophoneAccess() {
    updateVoiceStatus('ready', 'Requesting microphone permission...');
    const ok = await requestMicrophonePermission();
    if (ok) {
      showMicrophonePermissionHelp(false);
      startListening();
    }
  }

  // 1. Initialize Speech Recognition
  function initSpeechEngine() {
    const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRec) {
      console.warn('[VoiceStudio] Web Speech Recognition not supported in this browser.');
      return false;
    }

    try {
      recognition = new SpeechRec();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = 'en-US';

      recognition.onstart = () => {
        isListening = true;
        updateVoiceStatus('listening', 'Listening to you...');
        setVisualizerState('listening');
      };

      recognition.onresult = (event) => {
        // If AI is currently speaking, user speech immediately interrupts it!
        if (isSpeaking) {
          stopSpeaking();
          updateVoiceStatus('listening', 'Listening to you...');
          setVisualizerState('listening');
        }

        let interimTranscript = '';
        let finalTranscript = '';

        for (let i = event.resultIndex; i < event.results.length; ++i) {
          if (event.results[i].isFinal) {
            finalTranscript += event.results[i][0].transcript;
          } else {
            interimTranscript += event.results[i][0].transcript;
          }
        }

        const currentStream = (finalTranscript || interimTranscript || '').trim();
        const transcriptEl = document.getElementById('voiceUserTranscript');
        if (transcriptEl) {
          transcriptEl.textContent = currentStream || 'Listening...';
        }

        // Real-Time Speculative Execution: AI starts formulating immediately on every word!
        if (currentStream) {
          onSpeculativeSpeechUpdate(currentStream);
        }

        // Reset silence timer on interim speech
        if (silenceTimer) clearTimeout(silenceTimer);

        if (finalTranscript.trim()) {
          handleVoiceInputReceived(finalTranscript.trim());
        } else if (interimTranscript.trim()) {
          // If paused for 1.2s after speaking, commit interim transcript
          silenceTimer = setTimeout(() => {
            if (interimTranscript.trim() && isListening && !isThinking && !isSpeaking) {
              handleVoiceInputReceived(interimTranscript.trim());
            }
          }, 1200);
        }
      };

      recognition.onerror = (event) => {
        if (event.error === 'no-speech') return;
        console.warn('[VoiceStudio] Recognition event:', event.error);
        if (event.error === 'not-allowed') {
          updateVoiceStatus('error', 'Microphone access denied. Please allow microphone in browser.');
          showMicrophonePermissionHelp(true);
          if (window.showToast) window.showToast('Mic Blocked', 'Please grant microphone permissions in your browser address bar.');
        } else if (event.error === 'audio-capture') {
          updateVoiceStatus('error', 'No microphone detected or audio capture failed.');
          showMicrophonePermissionHelp(true);
        }
      };

      recognition.onend = () => {
        isListening = false;
        // Auto-restart if voice mode is still open and we are waiting for user
        const modal = document.getElementById('aiVoiceModal');
        if (modal && modal.style.display !== 'none' && continuousMode && !isSpeaking && !isThinking) {
          try {
            recognition.start();
          } catch (e) {}
        }
      };

      return true;
    } catch (e) {
      console.warn('[VoiceStudio] SpeechRec initialization error:', e);
      return false;
    }
  }

  // 2. Load and Configure Neural Web Speech Voices
  function loadSpeechVoices() {
    if (!('speechSynthesis' in window)) return;
    voicesList = window.speechSynthesis.getVoices();

    const voiceSelect = document.getElementById('voiceSelectDropdown');
    if (voiceSelect) {
      voiceSelect.innerHTML = '';
      const englishVoices = voicesList.filter(v => v.lang.startsWith('en'));
      const activeList = englishVoices.length > 0 ? englishVoices : voicesList;

      activeList.forEach((v, idx) => {
        const opt = document.createElement('option');
        opt.value = idx;
        opt.textContent = `${v.name} (${v.lang})${v.default ? ' [Default]' : ''}`;
        voiceSelect.appendChild(opt);
      });

      // Prefer natural/neural voices if available
      const preferred = activeList.find(v =>
        v.name.includes('Natural') ||
        v.name.includes('Online') ||
        v.name.includes('Google') ||
        v.name.includes('Samantha') ||
        v.name.includes('Jenny')
      );
      if (preferred) {
        selectedVoice = preferred;
        voiceSelect.value = activeList.indexOf(preferred);
      } else if (activeList[0]) {
        selectedVoice = activeList[0];
      }
    }
  }

  if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
    window.speechSynthesis.onvoiceschanged = loadSpeechVoices;
    loadSpeechVoices();
  }

  // --- REAL-TIME SPECULATIVE PRE-COMPUTATION ENGINE ---
  let speculativeDebounceTimer = null;
  let activeSpeculativeTask = null;
  let cachedSpeculativeResult = null;
  let lastSpeculativeText = '';

  function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function onSpeculativeSpeechUpdate(currentTranscript) {
    const text = currentTranscript.trim();
    if (!text || text.length < 3 || text === lastSpeculativeText) return;
    lastSpeculativeText = text;

    // Live In-Flight HUD telemetry: shows AI actively thinking and adjusting route as user speaks
    const specHud = document.getElementById('voiceSpeculativeStream');
    const jev = window.classifyJevIntentClient ? window.classifyJevIntentClient(text, window.vfs || {}) : { route: 'CONVERSATION' };

    if (specHud) {
      const snippet = text.length > 40 ? '...' + text.slice(-38) : text;
      specHud.innerHTML = `
        <div class="px-3 py-1 bg-cyan-500/10 border border-cyan-500/30 rounded-full flex items-center gap-2 text-[11px] text-cyan-300 font-mono animate-fadeIn shadow-sm">
          <span class="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-ping"></span>
          <span><strong>In-Flight Speculation:</strong> [${jev.route}] • Pre-drafting: "<em>${escapeHtml(snippet)}</em>"</span>
        </div>
      `;
    }

    if (speculativeDebounceTimer) clearTimeout(speculativeDebounceTimer);
    speculativeDebounceTimer = setTimeout(async () => {
      if (!isListening || isThinking || isSpeaking) return;
      try {
        activeSpeculativeTask = text;
        if (window.generateSimulatedAutonomousReply) {
          const candidate = await window.generateSimulatedAutonomousReply(text);
          if (activeSpeculativeTask === text) {
            cachedSpeculativeResult = { text, candidate };
          }
        }
      } catch (e) {}
    }, 240);
  }

  // 3. Strip Markdown and Code for Natural Spoken Text
  function sanitizeForVoice(text) {
    if (!text) return '';
    return text
      // Remove thoughts
      .replace(/<(?:thought_process|thought)>[\s\S]*?<\/(?:thought_process|thought)>/gi, '')
      // Remove tool directives
      .replace(/\[TOOL:[\s\S]*?\[\/TOOL:[\w]+\]/gi, '')
      .replace(/\[TOOL:[\s\S]*?\/\]/gi, '')
      // Remove code blocks
      .replace(/```[\s\S]*?```/gi, 'Code block omitted for voice.')
      .replace(/`([^`]+)`/g, '$1')
      // Remove markdown headers, bold, links, tables
      .replace(/^#{1,6}\s+/gm, '')
      .replace(/\*\*([^*]+)\*\*/g, '$1')
      .replace(/\*([^*]+)\*/g, '$1')
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
      .replace(/\|[^\n]+\|/g, '')
      .replace(/[-*•]\s+/g, '')
      .replace(/\n+/g, ' ')
      .trim();
  }

  function splitIntoSentences(text) {
    const clean = sanitizeForVoice(text);
    if (!clean) return [];
    const matched = clean.match(/[^.!?]+[.!?]+(?:\s+|$)|[^.!?]+$/g);
    return matched ? matched.map(s => s.trim()).filter(Boolean) : [clean];
  }

  // 4. Speak Natural AI Response via Chunked Sentence Queue (Immediate Audio Dispatch)
  function speakAiResponse(text, onComplete) {
    if (!('speechSynthesis' in window)) {
      if (onComplete) onComplete();
      return;
    }

    const sentences = splitIntoSentences(text);
    if (!sentences || sentences.length === 0) {
      if (onComplete) onComplete();
      return;
    }

    window.speechSynthesis.cancel(); // Cancel any existing speech
    let currentIdx = 0;

    function speakNext() {
      if (currentIdx >= sentences.length) {
        isSpeaking = false;
        setVisualizerState('idle');
        if (onComplete) onComplete();

        // Automatically re-arm listening for hands-free loop
        const modal = document.getElementById('aiVoiceModal');
        if (modal && modal.style.display !== 'none' && continuousMode) {
          setTimeout(() => {
            startListening();
          }, 350);
        }
        return;
      }

      const sentence = sentences[currentIdx++];
      if (!sentence) {
        speakNext();
        return;
      }

      const utterance = new SpeechSynthesisUtterance(sentence);
      if (selectedVoice) utterance.voice = selectedVoice;
      utterance.rate = speechRate;
      utterance.pitch = speechPitch;

      utterance.onstart = () => {
        isSpeaking = true;
        updateVoiceStatus('speaking', `AI Speaking (${currentIdx}/${sentences.length})...`);
        setVisualizerState('speaking');
        // Pause mic while speaking to avoid echo loop
        if (recognition && isListening) {
          try { recognition.stop(); } catch (e) {}
        }
      };

      utterance.onend = () => {
        speakNext();
      };

      utterance.onerror = (e) => {
        console.warn('[VoiceStudio] TTS Error:', e);
        speakNext();
      };

      window.speechSynthesis.speak(utterance);
    }

    speakNext();
  }

  function stopSpeaking() {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    isSpeaking = false;
  }

  // 5. Handle Received Voice Input -> Send to AI
  async function handleVoiceInputReceived(promptText) {
    if (!promptText || isThinking) return;

    if (silenceTimer) clearTimeout(silenceTimer);
    if (speculativeDebounceTimer) clearTimeout(speculativeDebounceTimer);

    const specHud = document.getElementById('voiceSpeculativeStream');
    if (specHud) specHud.innerHTML = '';

    isThinking = true;
    updateVoiceStatus('thinking', 'Finalizing answer...');
    setVisualizerState('thinking');

    const aiBubble = document.getElementById('voiceAiResponse');
    if (aiBubble) {
      aiBubble.textContent = 'Thinking...';
    }

    // Stop listening while thinking
    if (recognition && isListening) {
      try { recognition.stop(); } catch (e) {}
    }

    try {
      // Add user message to conversation history
      if (!window.aiConversation) window.aiConversation = [];
      window.aiConversation.push({ role: 'user', content: promptText });
      if (window.renderAiChat) window.renderAiChat();

      // Query AI via sovereign backend endpoint or simulation fallback
      const provider = localStorage.getItem('lumina_ai_provider') || 'hybrid_pool';
      const model = localStorage.getItem('lumina_ai_model') || 'gpt-oss:20b';
      const persona = localStorage.getItem('lumina_ai_persona') || '';
      const category = localStorage.getItem('lumina_ai_category') || 'general';

      let aiReply = '';
      const cleanPrompt = promptText.trim().toLowerCase();

      // In-Flight Speculative Hit: Answer was pre-computed while user was speaking!
      if (cachedSpeculativeResult && cachedSpeculativeResult.text.trim().toLowerCase() === cleanPrompt) {
        aiReply = cachedSpeculativeResult.candidate;
      }

      if (!aiReply) {
        if (provider === 'simulation') {
          if (window.generateSimulatedAutonomousReply) {
            aiReply = await window.generateSimulatedAutonomousReply(promptText);
          } else {
            aiReply = "I have processed your voice command within the sovereign workspace.";
          }
        } else {
          const res = await fetch('/api/chat', {
            method: 'POST',
            credentials: 'include',
            headers: {
              'Content-Type': 'application/json',
              'x-session-id': localStorage.getItem('lumina_session_id') || 'sovereign_session'
            },
            body: JSON.stringify({
              prompt: promptText,
              messages: window.aiConversation,
              provider,
              model,
              persona,
              category,
              currentVfs: window.vfs || {}
            })
          });

          if (res.ok) {
            const data = await res.json();
            aiReply = data.reply || data.output || "I have completed your request.";
          } else {
            aiReply = "I encountered an upstream network issue, but I am ready for your next voice command.";
          }
        }
      }

      // Record in conversation
      window.aiConversation.push({ role: 'assistant', content: aiReply });
      if (window.renderAiChat) window.renderAiChat();

      // Display in voice modal
      if (aiBubble) {
        aiBubble.textContent = sanitizeForVoice(aiReply).substring(0, 300) + (aiReply.length > 300 ? '...' : '');
      }

      isThinking = false;

      // Speak back out loud
      speakAiResponse(aiReply, () => {
        updateVoiceStatus('listening', 'Listening to you...');
      });

    } catch (err) {
      console.error('[VoiceStudio] Error in query:', err);
      isThinking = false;
      updateVoiceStatus('error', 'Voice query error.');
      speakAiResponse("Sorry, I ran into an error processing that. Please try speaking again.");
    }
  }

  // 6. Audio Visualizer Canvas (Cyber-Luminous Soundwave & Orb)
  function initVisualizer(canvas) {
    if (!canvas) return;
    canvasEl = canvas;
    canvasContext = canvas.getContext('2d');
    startVisualizerLoop();
  }

  let phase = 0;
  function startVisualizerLoop() {
    if (animFrameId) cancelAnimationFrame(animFrameId);

    function draw() {
      if (!canvasContext || !canvasEl) return;
      const ctx = canvasContext;
      const w = canvasEl.width;
      const h = canvasEl.height;
      ctx.clearRect(0, 0, w, h);

      const cx = w / 2;
      const cy = h / 2;
      phase += 0.04;

      const liveVol = getLiveAudioVolume();
      const volBoost = (liveVol / 255) * 36;

      // Base radius and color based on visualizerState
      let radius = 48;
      let colorPrimary = 'rgba(0, 242, 254, 0.85)';
      let colorSecondary = 'rgba(79, 70, 229, 0.5)';
      let numRings = 3;

      if (visualizerState === 'listening') {
        radius = 52 + volBoost + Math.sin(phase * 2) * 6;
        const alpha = Math.min(1, 0.75 + (liveVol / 255) * 0.25);
        colorPrimary = `rgba(6, 182, 212, ${alpha})`; // Cyan
        colorSecondary = `rgba(14, 165, 233, ${Math.min(1, 0.45 + (liveVol / 255) * 0.45)})`;
        numRings = 4;
      } else if (visualizerState === 'thinking') {
        radius = 46 + Math.sin(phase * 4) * 4;
        colorPrimary = 'rgba(168, 85, 247, 0.9)'; // Purple
        colorSecondary = 'rgba(99, 102, 241, 0.6)';
        numRings = 5;
      } else if (visualizerState === 'speaking') {
        radius = 56 + Math.sin(phase * 3) * 12;
        colorPrimary = 'rgba(16, 185, 129, 0.9)'; // Emerald
        colorSecondary = 'rgba(52, 211, 153, 0.6)';
        numRings = 4;
      }

      // 1. Draw glowing background radial gradient
      const glow = ctx.createRadialGradient(cx, cy, radius * 0.2, cx, cy, radius * 2.2);
      glow.addColorStop(0, colorPrimary);
      glow.addColorStop(0.6, colorSecondary);
      glow.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(cx, cy, radius * 2.2, 0, Math.PI * 2);
      ctx.fill();

      // 2. Draw organic harmonic wave rings
      for (let r = 0; r < numRings; r++) {
        ctx.beginPath();
        const rOffset = radius + (r * 12);
        for (let a = 0; a <= Math.PI * 2; a += 0.08) {
          const distortion = Math.sin(a * (4 + r) + phase + r) * (visualizerState === 'idle' ? 3 : 7);
          const x = cx + (rOffset + distortion) * Math.cos(a);
          const y = cy + (rOffset + distortion) * Math.sin(a);
          if (a === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.closePath();
        ctx.strokeStyle = r === 0 ? colorPrimary : colorSecondary;
        ctx.lineWidth = 2;
        ctx.stroke();
      }

      // 3. Center pulsating core
      ctx.beginPath();
      ctx.arc(cx, cy, radius * 0.45, 0, Math.PI * 2);
      ctx.fillStyle = '#ffffff';
      ctx.shadowColor = colorPrimary;
      ctx.shadowBlur = 20;
      ctx.fill();
      ctx.shadowBlur = 0;

      animFrameId = requestAnimationFrame(draw);
    }

    draw();
  }

  function setVisualizerState(st) {
    visualizerState = st;
  }

  // 7. Status HUD Indicator
  function updateVoiceStatus(state, msg) {
    const badge = document.getElementById('voiceStateBadge');
    const label = document.getElementById('voiceStateLabel');

    if (badge) {
      badge.className = 'px-3 py-1 rounded-full text-xs font-mono font-bold flex items-center gap-1.5 shadow-md';
      if (state === 'listening') {
        badge.classList.add('bg-cyan-500/20', 'text-cyan-300', 'border', 'border-cyan-500/40');
        badge.innerHTML = '<span class="w-2 h-2 rounded-full bg-cyan-400 animate-ping"></span> Listening';
      } else if (state === 'thinking') {
        badge.classList.add('bg-purple-500/20', 'text-purple-300', 'border', 'border-purple-500/40');
        badge.innerHTML = '<span class="w-2 h-2 rounded-full bg-purple-400 animate-pulse"></span> Thinking';
      } else if (state === 'speaking') {
        badge.classList.add('bg-emerald-500/20', 'text-emerald-300', 'border', 'border-emerald-500/40');
        badge.innerHTML = '<span class="w-2 h-2 rounded-full bg-emerald-400 animate-bounce"></span> AI Speaking';
      } else if (state === 'error') {
        badge.classList.add('bg-rose-500/20', 'text-rose-300', 'border', 'border-rose-500/40');
        badge.innerHTML = '<span class="w-2 h-2 rounded-full bg-rose-500"></span> Mic Blocked';
      } else {
        badge.classList.add('bg-zinc-800', 'text-zinc-400', 'border', 'border-white/10');
        badge.innerHTML = '<span class="w-2 h-2 rounded-full bg-zinc-500"></span> Ready';
      }
    }

    if (label) {
      label.textContent = msg || '';
    }
  }

  // 8. Public Interface: Open/Close Voice Mode
  async function openVoiceInteractionMode() {
    const modal = document.getElementById('aiVoiceModal');
    if (!modal) return;

    modal.style.display = 'flex';
    setTimeout(() => {
      modal.classList.remove('opacity-0');
      const c = modal.querySelector('.glass-panel');
      if (c) c.classList.remove('scale-95');
    }, 10);

    const canvas = document.getElementById('voiceCanvas');
    if (canvas) initVisualizer(canvas);

    loadSpeechVoices();

    updateVoiceStatus('ready', 'Initializing sovereign microphone stream...');
    const granted = await requestMicrophonePermission();
    if (granted) {
      startListening();
    }

    if (window.lucide && window.lucide.createIcons) window.lucide.createIcons();
    if (window.showToast) window.showToast('Voice Interaction', 'Two-Way Sovereign Voice Mode Active.');
  }

  function closeVoiceInteractionMode() {
    const modal = document.getElementById('aiVoiceModal');
    if (!modal) return;

    stopListening();
    stopSpeaking();
    cleanupAudioAnalyser();

    modal.classList.add('opacity-0');
    const c = modal.querySelector('.glass-panel');
    if (c) c.classList.add('scale-95');

    if (animFrameId) cancelAnimationFrame(animFrameId);
    setTimeout(() => modal.style.display = 'none', 200);
  }

  function toggleVoiceInteractionMode() {
    const modal = document.getElementById('aiVoiceModal');
    if (modal && modal.style.display !== 'none') {
      closeVoiceInteractionMode();
    } else {
      openVoiceInteractionMode();
    }
  }

  function startListening() {
    if (!recognition) {
      const ok = initSpeechEngine();
      if (!ok) return;
    }
    try {
      recognition.start();
    } catch (e) {}
  }

  function stopListening() {
    if (recognition) {
      try { recognition.stop(); } catch (e) {}
    }
    isListening = false;
  }

  function toggleContinuousMode() {
    continuousMode = !continuousMode;
    const btn = document.getElementById('voiceContinuousToggleBtn');
    if (btn) {
      btn.textContent = continuousMode ? 'Hands-Free Loop: ON' : 'Hands-Free Loop: OFF';
      btn.className = continuousMode
        ? 'px-3 py-1.5 rounded-xl bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 text-xs font-mono font-bold cursor-pointer transition-colors'
        : 'px-3 py-1.5 rounded-xl bg-surface-800 text-zinc-400 border border-white/10 text-xs font-mono cursor-pointer transition-colors';
    }
  }

  function onVoiceDropdownChange(idx) {
    if (voicesList[idx]) {
      selectedVoice = voicesList[idx];
    }
  }

  // Export to window
  window.openVoiceInteractionMode = openVoiceInteractionMode;
  window.closeVoiceInteractionMode = closeVoiceInteractionMode;
  window.toggleVoiceInteractionMode = toggleVoiceInteractionMode;
  window.toggleContinuousMode = toggleContinuousMode;
  window.onVoiceDropdownChange = onVoiceDropdownChange;
  window.stopVoiceSpeaking = stopSpeaking;
  window.requestMicrophonePermission = requestMicrophonePermission;
  window.retryMicrophoneAccess = retryMicrophoneAccess;
  window.getLiveAudioVolume = getLiveAudioVolume;

})(typeof window !== 'undefined' ? window : global);
