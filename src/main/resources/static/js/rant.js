document.addEventListener('DOMContentLoaded', () => {
  const energy = document.getElementById('energy');
  const energyValue = document.getElementById('energyValue');
  const postForm = document.getElementById('postForm');
  const feedEl = document.getElementById('feed');
  const autoReplyEl = document.getElementById('autoReply');
  const autoReplyText = document.getElementById('autoReplyText');
  const safeExitBtn = document.getElementById('safeExit');
  const openCalmBtn = document.getElementById('openCalm');

  const resourceBanner = document.getElementById('resourceBanner');
  const bannerCall = document.getElementById('bannerCall');
  const bannerResources = document.getElementById('bannerResources');
  const bannerDismiss = document.getElementById('bannerDismiss');

  const successModal = document.getElementById('successModal');
  const modalBody = document.getElementById('modalBody');
  const modalTitle = document.getElementById('modalTitle');
  const modalClose = document.getElementById('modalClose');
  const modalDone = document.getElementById('modalDone');

  const CRISIS_KEYWORDS = [
    'suicide', 'kill myself', "die", 'end my life', 'want to die', 'hurt myself', 'overdose', 'cant go on', "can't go on"
  ];

  const energyWrap = document.getElementById('energyWrap');
  let resourceBannerShown = false;

  // initialize firebase if config exists
  try {
    if (window.firebaseConfig && typeof firebase !== 'undefined') {
      try { firebase.initializeApp(window.firebaseConfig); } catch (e) { /* already initialized */ }
    }
  } catch (e) { console.warn('Firebase not initialized', e); }

  function generatePseudonym() {
    const seeds = ['Willow','Nova','Echo','Sol','River','Sky','Leaf','Sage','Mira','Kai'];
    return 'Anon-' + seeds[Math.floor(Math.random()*seeds.length)] + '-' + Math.floor(Math.random()*9000+1000);
  }

  function uid() { return 'id-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2,8); }

  function humanTime(iso) { try { return new Date(iso).toLocaleString(); } catch(e){ return iso; } }

  function isFlagged(text) {
    if (!text) return false;
    const t = text.toLowerCase();
    return CRISIS_KEYWORDS.some(k => t.includes(k));
  }

  function saveLocal(post) {
    const key = 'safe_space_posts';
    let arr = [];
    try { arr = JSON.parse(localStorage.getItem(key) || '[]'); } catch(e){ arr = []; }
    arr.unshift(post);
    try { localStorage.setItem(key, JSON.stringify(arr)); } catch(e){ console.warn('localStorage failed', e); }
  }

  function renderPost(post) {
    const div = document.createElement('div');
    div.className = 'post' + (post.is_flagged ? ' post-flagged' : '');

    const meta = document.createElement('div');
    meta.className = 'meta';

    const left = document.createElement('div');
    left.innerHTML = `<span class="pseudonym">${post.pseudonym}</span> <span class="muted">• ${humanTime(post.timestamp)}</span>`;

    const right = document.createElement('div');
    const energyLevel = energyClassFromValue(post.energy_score);
    right.innerHTML = `<span class="emotion-badge">${post.emotion_tag}</span> <span class="energy-badge ${energyLevel}">Energy ${post.energy_score}/10</span>`;

    meta.appendChild(left);
    meta.appendChild(right);

    const content = document.createElement('div');
    content.className = 'content';
    content.textContent = post.content;

    div.appendChild(meta);
    div.appendChild(content);

    feedEl.prepend(div);
  }

  function energyClassFromValue(v) {
    const n = Number(v) || 0;
    if (n >= 7) return 'high';
    if (n >= 5) return 'mid';
    return 'low';
  }

  // Rule-based auto-reply: consider emotion + energy
  function getRuleBasedReply(emotion, energy) {
    const e = Number(energy) || 0;
    const low = {
      'Angry': "It's okay to feel upset. Take a short pause and notice your breath.",
      'Sad': "I'm sorry you're feeling sad — a small kindness to yourself can help.",
      'Anxious': "A brief grounding or slow breath may lower your anxiety right now.",
      'Lonely': "Feeling alone is valid — consider reaching out to a friend or trying a short grounding exercise.",
      'Frustrated': "Frustration is normal. Try stepping away for a minute and returning when ready.",
      'Neutral': "Thanks for sharing — noticing your feelings is a helpful first step.",
      'Relieved': "It's good to feel relief. Keep doing what helps you maintain balance.",
      'Happy': "Nice to hear — celebrate this moment and the things that helped it happen."
    };

    const mid = {
      'Angry': "I can see you're upset. Try a 4-4-4 breathing cycle and come back when calmer.",
      'Sad': "This seems heavy. Try the breathing exercise below or a short grounding technique.",
      'Anxious': "You're showing notable anxiety. Guided breathing can help reduce intensity.",
      'Lonely': "Consider a quick grounding exercise or contact someone you trust.",
      'Frustrated': "Try a breathing or movement break — small actions can reduce build-up.",
      'Neutral': "You've noted your feelings — here are a few steps that might help.",
      'Relieved': "Keep the practices that helped you reach relief.",
      'Happy': "Enjoy the moment — breathing and reflection help build resilience."
    };

    const high = {
      'Angry': "I can tell you're really hurting right now. Please look at the resources below and consider contacting someone immediate.",
      'Sad': "You seem deeply distressed. If you're in danger, call emergency services now. Resources are shown below.",
      'Anxious': "This looks severe — please review immediate resources and consider contacting support.",
      'Lonely': "This indicates high distress. Support resources are available — please check them now.",
      'Frustrated': "You're experiencing high emotional intensity. Please see the resources and consider reaching out.",
      'Neutral': "Your intensity is high — please consider immediate support options.",
      'Relieved': "Even strong relief can be intense; if you feel unsafe, use resources below.",
      'Happy': "High-intensity feelings present — if this feels overwhelming please consider support resources."
    };

    if (e >= 8) return high[emotion] || high['Neutral'];
    if (e >= 5) return mid[emotion] || mid['Neutral'];
    return low[emotion] || low['Neutral'];
  }

  function trySendToFirestore(post) {
    if (typeof firebase !== 'undefined' && firebase.firestore && window.firebaseConfig) {
      try {
        const db = firebase.firestore();
        db.collection('posts').add({
          pseudonym: post.pseudonym,
          content: post.content,
          emotion_tag: post.emotion_tag,
          energy_score: post.energy_score,
          timestamp: firebase.firestore.FieldValue.serverTimestamp(),
          is_flagged: post.is_flagged
        }).then(() => console.log('Post saved to Firestore')).catch(e => console.warn('Firestore save failed', e));
      } catch (e) { console.warn('Firestore unavailable', e); }
    }
  }

  // Load existing posts
  (function load() {
    try {
      const arr = JSON.parse(localStorage.getItem('safe_space_posts') || '[]');
      if (Array.isArray(arr)) arr.forEach(p => renderPost(p));
    } catch (e) { /* ignore */ }
  })();

  // Update energy value display and color classes on input
  function updateEnergyUI(val) {
    const cls = energyClassFromValue(val);
    energyValue.textContent = val;
    energyValue.classList.remove('low','mid','high');
    energyValue.classList.add(cls);
    if (energyWrap) {
      energyWrap.classList.remove('low','mid','high');
      energyWrap.classList.add(cls);
    }

    // If extremely high energy (9-10) show pre-submission resource banner once
    if (Number(val) >= 9 && !resourceBannerShown) {
      showResourceBanner();
    }
  }

  energy.addEventListener('input', () => { updateEnergyUI(energy.value); });

  // initialize energy UI
  updateEnergyUI(energy.value);

  // Resource banner handlers
  function showResourceBanner() {
    if (!resourceBanner) return;
    resourceBanner.style.display = 'block';
    resourceBannerShown = true;
  }
  function hideResourceBanner() {
    if (!resourceBanner) return;
    resourceBanner.style.display = 'none';
  }
  if (bannerDismiss) bannerDismiss.addEventListener('click', hideResourceBanner);
  if (bannerResources) bannerResources.addEventListener('click', () => {
    hideResourceBanner();
    // open success modal with high-energy resources
    openSuccessModal('High energy detected', { mode: 'resources', energy: 10 });
  });

  // Modal helpers
  function openSuccessModal(title, opts) {
    if (!successModal) return;
    modalTitle.textContent = title || 'Support';
    modalBody.innerHTML = '';
    successModal.style.display = 'flex';
    successModal.setAttribute('aria-hidden','false');
    // choose content by opts.energy or opts.mode
    const energyVal = opts && opts.energy ? Number(opts.energy) : 0;
    if (opts && opts.mode === 'resources') {
      renderHighResources();
      return;
    }
    if (energyVal <= 3) renderLowKit();
    else if (energyVal <= 7) renderBreathingPacer();
    else renderGroundingAndResources();
  }

  function closeSuccessModal() {
    if (!successModal) return;
    successModal.style.display = 'none';
    successModal.setAttribute('aria-hidden','true');
    stopBreathing();
  }

  if (modalClose) modalClose.addEventListener('click', closeSuccessModal);
  if (modalDone) modalDone.addEventListener('click', closeSuccessModal);

  // Low (1-3): positive quote/reflective prompt
  const QUOTES = [
    'Take a moment to appreciate one good thing today.',
    'You are allowed to feel what you feel—small steps count.',
    'Breathe in, notice one small positive detail, and breathe out.'
  ];
  function renderLowKit() {
    const q = QUOTES[Math.floor(Math.random()*QUOTES.length)];
    modalBody.innerHTML = `<div class="card"><p style="font-size:1.05rem">${q}</p><div style="margin-top:0.75rem;display:flex;gap:0.5rem;justify-content:flex-end;"><button id="anotherQuote" class="btn btn-ghost">Another</button><button id="closeQuote" class="btn btn-primary">Done</button></div></div>`;
    document.getElementById('anotherQuote').addEventListener('click', renderLowKit);
    document.getElementById('closeQuote').addEventListener('click', closeSuccessModal);
  }

  // Mid (4-7): breathing pacer
  let breathingTimer = null;
  let breathingRunning = false;
  function renderBreathingPacer() {
    modalBody.innerHTML = `
      <div class="pacer">
        <div id="pacerCircle" class="pacer-circle" aria-hidden="true">Breathe</div>
        <div id="pacerInstruction" class="pacer-instruction">Ready to start a 4-4-4 breathing cycle.</div>
        <div style="display:flex;gap:0.5rem;"><button id="pacerStart" class="btn btn-primary">Start</button><button id="pacerStop" class="btn btn-ghost">Stop</button></div>
      </div>
    `;

    const pacerStart = document.getElementById('pacerStart');
    const pacerStop = document.getElementById('pacerStop');
    const pacerCircle = document.getElementById('pacerCircle');
    const pacerInstruction = document.getElementById('pacerInstruction');

    function cycleBreathing() {
      if (!pacerCircle) return;
      const inhale = 4000, hold = 4000, exhale = 4000;
      pacerInstruction.textContent = 'Inhale (4s)';
      pacerCircle.style.transform = 'scale(1.25)';
      breathingTimer = setTimeout(() => {
        pacerInstruction.textContent = 'Hold (4s)';
        breathingTimer = setTimeout(() => {
          pacerInstruction.textContent = 'Exhale (4s)';
          pacerCircle.style.transform = 'scale(0.85)';
          breathingTimer = setTimeout(() => {
            if (breathingRunning) cycleBreathing();
          }, exhale);
        }, hold);
      }, inhale);
    }

    function startBreathing() { if (breathingRunning) return; breathingRunning = true; cycleBreathing(); }
    function stopBreathing() { breathingRunning = false; if (breathingTimer) { clearTimeout(breathingTimer); breathingTimer = null; } if (pacerCircle) pacerCircle.style.transform = ''; }

    pacerStart.addEventListener('click', startBreathing);
    pacerStop.addEventListener('click', stopBreathing);
    // expose stopBreathing to outer scope to ensure modal close stops timers
    window.stopBreathing = stopBreathing;
  }

  function stopBreathing() { if (breathingRunning && typeof window.stopBreathing === 'function') window.stopBreathing(); }

  // High (8-10): grounding 5-4-3-2-1 and resource linker
  function renderGroundingAndResources() {
    modalBody.innerHTML = `
      <div class="grounding">
        <p style="font-weight:700">Try this 5-4-3-2-1 grounding exercise now:</p>
        <div class="step"><label>5 things you can see</label><input id="g1" placeholder="List 5 things, separated by commas"></div>
        <div class="step"><label>4 things you can touch</label><input id="g2" placeholder="List 4 things, separated by commas"></div>
        <div class="step"><label>3 things you can hear</label><input id="g3" placeholder="List 3 things, separated by commas"></div>
        <div class="step"><label>2 things you can smell</label><input id="g4" placeholder="List 2 things, separated by commas"></div>
        <div class="step"><label>1 thing you can taste</label><input id="g5" placeholder="List 1 thing"></div>
        <div style="display:flex;gap:0.5rem;justify-content:flex-end;margin-top:0.5rem;"><button id="completeGrounding" class="btn btn-primary">Complete</button></div>
      </div>
      <hr />
      <div style="display:flex;flex-direction:column;gap:0.5rem;">
        <strong>Immediate resources</strong>
        <div style="display:flex;gap:0.5rem;flex-wrap:wrap;margin-top:0.5rem;">
          <a class="btn btn-accent" href="tel:112">Call Emergency</a>
          <a class="btn btn-primary" href="mailto:psychometrician@ustp.edu.ph">Contact Psychometrician</a>
          <a class="btn btn-ghost" href="#" id="moreResources">More resources</a>
        </div>
      </div>
    `;

    document.getElementById('completeGrounding').addEventListener('click', () => {
      // simple acknowledgement
      modalBody.innerHTML = '<div class="card"><p>Well done — grounding can help reduce intensity. If you still feel unsafe, please use the resources above.</p><div style="display:flex;justify-content:flex-end;margin-top:0.5rem;"><button id="closeAfterGround" class="btn btn-primary">Done</button></div></div>';
      document.getElementById('closeAfterGround').addEventListener('click', closeSuccessModal);
    });

    document.getElementById('moreResources').addEventListener('click', (e) => {
      e.preventDefault();
      renderHighResources();
    });
  }

  function renderHighResources() {
    modalBody.innerHTML = `
      <div>
        <h4>Immediate Support</h4>
        <p>If you're in immediate danger, call your local emergency number. Below are quick options:</p>
        <div style="display:flex;gap:0.5rem;flex-wrap:wrap;margin-top:0.5rem;">
          <a class="btn btn-accent" href="tel:112">Call Emergency</a>
          <a class="btn btn-primary" href="mailto:psychometrician@ustp.edu.ph">Contact Psychometrician</a>
          <a class="btn btn-ghost" href="#" id="openCampusInfo">Campus Support Page</a>
        </div>
        <p style="margin-top:0.75rem;color:var(--dark-600)">These are sample links. Psychometricians should configure accurate contacts in the system settings.</p>
      </div>
    `;
    const openCampus = document.getElementById('openCampusInfo');
    if (openCampus) openCampus.addEventListener('click', (e)=>{ e.preventDefault(); alert('Open campus support page (configure link in psychometrician settings).'); });
  }

  // Submission flow: show rule-based reply + success modal (prescribe kit)
  postForm.addEventListener('submit', (ev) => {
    ev.preventDefault();
    const content = document.getElementById('content').value.trim();
    const emotion = document.getElementById('emotion').value;
    const energyVal = parseInt(document.getElementById('energy').value, 10) || 5;
    if (!content) return;

    const post = {
      post_id: uid(),
      pseudonym: generatePseudonym(),
      content: content,
      emotion_tag: emotion,
      energy_score: energyVal,
      timestamp: new Date().toISOString(),
      is_flagged: isFlagged(content)
    };

    renderPost(post);
    saveLocal(post);

    // Rule-based reply (emotion + energy)
    autoReplyText.textContent = getRuleBasedReply(post.emotion_tag, post.energy_score);
    autoReplyEl.style.display = 'block';

    // Firestore sink
    trySendToFirestore(post);

    // Prescribe the Calm-Down Kit or resources based on energy
    openSuccessModal('Calm-Down Kit', { energy: post.energy_score });

    // reset form for next post (keeps modal open)
    postForm.reset();
    energy.value = 5; updateEnergyUI(5);
  });

  safeExitBtn.addEventListener('click', () => { window.location.href = 'https://ustp.edu.ph'; });

  openCalmBtn.addEventListener('click', () => { openSuccessModal('Calm-Down Kit', { energy: 5 }); });

  // ensure banners/modals are interactive even on keyboard
  if (bannerCall) bannerCall.addEventListener('click', () => { /* telephony handled by browser */ });
});
