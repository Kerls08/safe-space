import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import '../styles/landing.css';

const MOOD_RESPONSES = {
  overwhelmed: "It is completely okay to feel full. Take one deep breath — you do not need to figure out everything right now. SafeSpace is here for you.",
  anxious: "Notice the ground beneath your feet. Inhale slowly for 4 seconds, exhale for 6. Your feelings are real, but they will pass safely.",
  exhausted: "Rest is not earned, it is needed. Give yourself permission to pause and recharge without guilt today.",
  hopeful: "Hold onto that warmth. Your resilience is powerful, and sharing your journey can brighten another student's day."
};

const PACER_STATES = [
  { text: "Inhale Slowly...", sub: "Fill your lungs with calm" },
  { text: "Hold Gently...", sub: "Rest in stillness" },
  { text: "Exhale Softly...", sub: "Release all tension" },
  { text: "Pause & Center...", sub: "You are safe and present" }
];

const FEATURES = [
  {
    icon: 'fas fa-comment-dots',
    iconClass: 'calm-ocean',
    title: 'Anonymous Rant Board',
    desc: 'Unburden your thoughts and frustrations in a supportive community space. Posts are bound to dynamic pseudonyms that preserve your identity while fostering genuine peer empathy.',
    tags: ['Dynamic Pseudonyms', 'Zero Identity Link']
  },
  {
    icon: 'fas fa-comments',
    iconClass: 'calm-steel',
    title: 'Confidential 1-on-1 Chat',
    desc: 'Connect in real-time with verified campus psychometricians and counselors. Sessions remain completely confidential, giving you direct guidance when you need it most.',
    tags: ['Real-Time Messaging', 'Counselor Verified']
  },
  {
    icon: 'fas fa-shield-heart',
    iconClass: 'calm-amber',
    title: 'Proactive AI Safety Net',
    desc: 'Intelligent sentiment analysis flags high-distress signals in real time and automatically routes compassionate resources and counselor alerts without compromising user identity.',
    tags: ['24/7 Early Detection', 'Automated Safety Net']
  },
  {
    icon: 'fas fa-spa',
    iconClass: 'calm-sky',
    title: 'Calm-Down & Grounding Studio',
    desc: 'Access evidence-based sensory grounding techniques, guided 4-7-8 breathing pacers, and mindful de-escalation tools to restore inner equilibrium during stressful moments.',
    tags: ['Breathing Pacer', '5-4-3-2-1 Grounding']
  },
  {
    icon: 'fas fa-chart-line',
    iconClass: 'calm-slate',
    title: 'Institutional Wellness Insights',
    desc: 'Campus mental health teams receive aggregate emotional climate trends, peak stress cycles, and anonymized metrics to tailor preventative programs and workshops.',
    tags: ['Anonymous Analytics', 'Institutional Trends']
  },
  {
    icon: 'fas fa-book-bookmark',
    iconClass: 'calm-mist',
    title: 'Curated Resource Directory',
    desc: 'Immediate access to national emergency hotlines, campus clinic services, self-help literature, and certified mental health professionals curated specifically for your university.',
    tags: ['24/7 Hotlines', 'Self-Help Vault']
  }
];

export default function Landing() {
  const navigate = useNavigate();
  const { isAuthenticated, role } = useAuth();

  // Navigation states
  const [navScrolled, setNavScrolled] = useState(false);
  const [navOpen, setNavOpen] = useState(false);
  const [activeSection, setActiveSection] = useState('hero');

  // Interactive Mood Check-in
  const [selectedMood, setSelectedMood] = useState(null);

  // Breathing Pacer
  const [pacerIdx, setPacerIdx] = useState(0);

  // Sensory Grounding Steps
  const [completedSteps, setCompletedSteps] = useState({});

  // Carousel State
  const [carouselIndex, setCarouselIndex] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [dragStartX, setDragStartX] = useState(0);
  const [dragTranslate, setDragTranslate] = useState(0);
  const carouselTrackRef = useRef(null);
  const carouselViewportRef = useRef(null);
  const autoplayTimerRef = useRef(null);

  // Redirect if authenticated
  useEffect(() => {
    if (isAuthenticated) {
      if (role === 'PROFESSIONAL' || role === 'SUPER_ADMIN') {
        navigate('/pro-dashboard', { replace: true });
      } else if (role === 'MAINTENANCE' || role === 'ADMIN') {
        navigate('/system-maintenance', { replace: true });
      } else {
        navigate('/rant-board', { replace: true });
      }
    }
  }, [isAuthenticated, role, navigate]);

  // Navbar scroll elevation and scroll spy
  useEffect(() => {
    const handleScroll = () => {
      setNavScrolled(window.scrollY > 15);

      const sectionIds = ['hero', 'how-it-works', 'grounding', 'features', 'privacy'];
      const scrollPos = window.scrollY + 140;

      for (const id of sectionIds) {
        const el = document.getElementById(id);
        if (el) {
          const top = el.offsetTop;
          const height = el.offsetHeight;
          if (scrollPos >= top && scrollPos < top + height) {
            setActiveSection(id);
          }
        }
      }
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // Breathing pacer interval
  useEffect(() => {
    const timer = setInterval(() => {
      setPacerIdx((prev) => (prev + 1) % PACER_STATES.length);
    }, 2000);
    return () => clearInterval(timer);
  }, []);

  // Carousel helpers
  const getVisibleCount = useCallback(() => {
    if (typeof window === 'undefined') return 3;
    if (window.innerWidth <= 680) return 1;
    if (window.innerWidth <= 1024) return 2;
    return 3;
  }, []);

  const getMaxIndex = useCallback(() => {
    return Math.max(0, FEATURES.length - getVisibleCount());
  }, [getVisibleCount]);

  const nextSlide = useCallback(() => {
    setCarouselIndex((prev) => {
      const max = getMaxIndex();
      return prev >= max ? 0 : prev + 1;
    });
  }, [getMaxIndex]);

  const prevSlide = useCallback(() => {
    setCarouselIndex((prev) => {
      const max = getMaxIndex();
      return prev <= 0 ? max : prev - 1;
    });
  }, [getMaxIndex]);

  // Autoplay
  useEffect(() => {
    autoplayTimerRef.current = setInterval(nextSlide, 4500);
    return () => clearInterval(autoplayTimerRef.current);
  }, [nextSlide]);

  const pauseAutoplay = () => {
    if (autoplayTimerRef.current) clearInterval(autoplayTimerRef.current);
  };

  const resumeAutoplay = () => {
    pauseAutoplay();
    autoplayTimerRef.current = setInterval(nextSlide, 4500);
  };

  // Drag handlers
  const handleTouchStart = (e) => {
    pauseAutoplay();
    setIsDragging(true);
    setDragStartX(e.touches ? e.touches[0].clientX : e.pageX);
  };

  const handleTouchMove = (e) => {
    if (!isDragging) return;
    const currentX = e.touches ? e.touches[0].clientX : e.pageX;
    setDragTranslate(currentX - dragStartX);
  };

  const handleTouchEnd = () => {
    if (!isDragging) return;
    setIsDragging(false);
    if (dragTranslate < -45) {
      nextSlide();
    } else if (dragTranslate > 45) {
      prevSlide();
    }
    setDragTranslate(0);
    resumeAutoplay();
  };

  const toggleSensoryStep = (index) => {
    setCompletedSteps((prev) => ({
      ...prev,
      [index]: !prev[index]
    }));
  };

  const scrollToSection = (e, id) => {
    e.preventDefault();
    setNavOpen(false);
    const el = document.getElementById(id);
    if (el) {
      const navHeight = 70;
      const targetTop = el.getBoundingClientRect().top + window.pageYOffset - navHeight;
      window.scrollTo({ top: targetTop, behavior: 'smooth' });
      setActiveSection(id);
    }
  };

  const maxIndex = getMaxIndex();
  const stepWidthPercentage = 100 / getVisibleCount();
  const translatePercent = -(carouselIndex * stepWidthPercentage);

  return (
    <div className="landing-page-root">
      {/* ── 1. Navigation Bar ── */}
      <nav className={`landing-nav ${navScrolled ? 'scrolled' : ''}`} id="landingNav">
        <div className="landing-nav-inner">
          <Link to="/" className="landing-brand">
            <div className="brand-logo-icon">
              <i className="fas fa-shield-heart"></i>
            </div>
            <span className="brand-text">Safe<span>Space</span></span>
          </Link>

          <div className={`landing-nav-center ${navOpen ? 'open' : ''}`} id="navCenter">
            <div className="landing-nav-links">
              <a 
                href="#hero" 
                className={activeSection === 'hero' ? 'active' : ''} 
                onClick={(e) => scrollToSection(e, 'hero')}
              >
                Home
              </a>
              <a 
                href="#how-it-works" 
                className={activeSection === 'how-it-works' ? 'active' : ''} 
                onClick={(e) => scrollToSection(e, 'how-it-works')}
              >
                How It Works
              </a>
              <a 
                href="#grounding" 
                className={activeSection === 'grounding' ? 'active' : ''} 
                onClick={(e) => scrollToSection(e, 'grounding')}
              >
                Grounding Oasis
              </a>
              <a 
                href="#features" 
                className={activeSection === 'features' ? 'active' : ''} 
                onClick={(e) => scrollToSection(e, 'features')}
              >
                Ecosystem
              </a>
              <a 
                href="#privacy" 
                className={activeSection === 'privacy' ? 'active' : ''} 
                onClick={(e) => scrollToSection(e, 'privacy')}
              >
                Privacy Charter
              </a>
            </div>
            <div className="landing-nav-actions">
              <Link to="/login" className="landing-login-link">Log In</Link>
              <Link to="/register" className="landing-register-btn" id="navRegisterBtn">
                <i className="fas fa-user-plus"></i> Register
              </Link>
            </div>
          </div>

          <button 
            className="landing-nav-toggle" 
            id="navToggle" 
            aria-label="Toggle navigation menu"
            onClick={() => setNavOpen((prev) => !prev)}
          >
            <span></span><span></span><span></span>
          </button>
        </div>
      </nav>

      {/* ── 2. Hero Section ── */}
      <section className="hero" id="hero">
        <div className="hero-inner-centered">
          <div className="hero-content animate-fade-up">
            <div className="hero-badge">
              <i className="fas fa-shield-halved"></i>
              Voluntary & Confidential Campus Sanctuary
            </div>
            <h1>
              A Calm Harbor for Your Thoughts.<br />
              Heal <span className="highlight">Anonymously.</span>
            </h1>
            <p>
              Express what you carry without fear of exposure or academic judgment. SafeSpace provides students and faculty
              a safe environment to release emotional stress, practice grounding exercises, and
              connect with verified campus counselors in complete confidence.
            </p>
            <div className="hero-actions">
              <Link to="/register" className="hero-btn-primary" id="heroRegisterBtn">
                <i className="fas fa-user-shield"></i> Join SafeSpace
              </Link>
              <a href="#how-it-works" className="hero-btn-ghost" onClick={(e) => scrollToSection(e, 'how-it-works')}>
                <i className="fas fa-route"></i> See How It Works
              </a>
            </div>

            <div className="hero-trust-bar">
              <div className="hero-trust-item">
                <i className="fas fa-check-circle"></i> Voluntary Self-Registration
              </div>
              <div className="hero-trust-item">
                <i className="fas fa-shield"></i> Zero Identity Logging
              </div>
              <div className="hero-trust-item">
                <i className="fas fa-user-doctor"></i> Licensed Counselors
              </div>
              <div className="hero-trust-item">
                <i className="fas fa-lock"></i> RA 10173 Compliant
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── 3. Dedicated Spotlight: A Glimpse Inside SafeSpace ── */}
      <section className="haven-spotlight-section" id="sanctuary-preview">
        <div className="haven-spotlight-inner">
          <div className="haven-spotlight-header animate-fade-up">
            <div className="section-label">A Safe Haven in Action</div>
            <h2 className="section-title">A Glimpse Inside SafeSpace</h2>
            <p className="section-desc">
              Experience how students unburden their thoughts anonymously and receive warm,
              confidential guidance from verified campus counselors.
            </p>
          </div>

          <div className="spotlight-console-wrap animate-fade-up animate-delay-1">
            <div className="preview-header">
              <div className="preview-dots">
                <div className="preview-dot d1"></div>
                <div className="preview-dot d2"></div>
                <div className="preview-dot d3"></div>
              </div>
              <div className="preview-live-indicator">
                <div className="preview-pulse-dot"></div>
                Safe Haven Active • 142 Sharing Safely
              </div>
            </div>

            <div className="preview-post">
              <div className="preview-post-header">
                <div className="preview-avatar"><i className="fas fa-mask"></i></div>
                <div>
                  <div className="preview-username">QuietHarbor_27</div>
                  <div className="preview-time">3 minutes ago</div>
                </div>
              </div>
              <div className="preview-text">
                "Between thesis revisions and family expectations, I felt completely drained today.
                Writing it down here made me realize I don't have to carry it all alone."
              </div>
              <div className="preview-mood-row">
                <div className="preview-mood">
                  <i className="fas fa-shield-cat"></i> Pseudonym Protected
                </div>
                <span style={{ fontSize: '0.68rem', color: '#6C7A92', fontWeight: 600 }}>Energy Score: 4/10</span>
              </div>

              <div className="preview-response">
                <i className="fas fa-user-doctor"></i>
                <strong>Campus Counselor:</strong> Taking one gentle step at a time is strength, not weakness.
                Remember our confidential chat is open if you need a listening ear today. 💙
              </div>
            </div>

            <div className="preview-interactive-checkin">
              <div className="preview-interactive-title">
                <i className="fas fa-heart-pulse"></i> How is your mind feeling right now?
              </div>
              <div className="preview-mood-btns">
                {['overwhelmed', 'anxious', 'exhausted', 'hopeful'].map((mood) => {
                  const labels = {
                    overwhelmed: 'Overwhelmed 🌧️',
                    anxious: 'Anxious ⚡',
                    exhausted: 'Exhausted 🌙',
                    hopeful: 'Hopeful 🌤️'
                  };
                  return (
                    <button
                      key={mood}
                      type="button"
                      className={`preview-mood-btn ${selectedMood === mood ? 'selected' : ''}`}
                      onClick={() => setSelectedMood(mood)}
                    >
                      {labels[mood]}
                    </button>
                  );
                })}
              </div>
              {selectedMood && (
                <div className="preview-mood-feedback" style={{ display: 'block' }}>
                  {MOOD_RESPONSES[selectedMood]}
                </div>
              )}
            </div>
          </div>

          <div className="spotlight-footer-cta animate-fade-up animate-delay-2">
            <span>Curious how it feels to speak freely?</span>
            <Link to="/register" className="spotlight-link">
              Create your anonymous profile <i className="fas fa-arrow-right"></i>
            </Link>
          </div>
        </div>
      </section>

      {/* ── 4. Core Sanctuary Pillars Ribbon ── */}
      <section className="pillars-ribbon">
        <div className="pillars-inner">
          <div className="pillar-card animate-fade-up">
            <div className="pillar-icon"><i className="fas fa-hand-holding-heart"></i></div>
            <div className="pillar-text">
              <h4>100% Voluntary</h4>
              <p>You choose to participate. No automated lists or mandatory harvesting.</p>
            </div>
          </div>
          <div className="pillar-card animate-fade-up animate-delay-1">
            <div className="pillar-icon"><i className="fas fa-user-secret"></i></div>
            <div className="pillar-text">
              <h4>Cryptographic Shield</h4>
              <p>Dynamic pseudonyms detach your real identity from your shared thoughts.</p>
            </div>
          </div>
          <div className="pillar-card animate-fade-up animate-delay-2">
            <div className="pillar-icon"><i className="fas fa-user-doctor"></i></div>
            <div className="pillar-text">
              <h4>Certified Campus Care</h4>
              <p>Connect with licensed university psychometricians and counselors.</p>
            </div>
          </div>
          <div className="pillar-card animate-fade-up animate-delay-3">
            <div className="pillar-icon"><i className="fas fa-shield-heart"></i></div>
            <div className="pillar-text">
              <h4>24/7 Safety Net</h4>
              <p>Intelligent crisis protocol surfaces immediate help when distress peaks.</p>
            </div>
          </div>
        </div>
      </section>

      {/* ── 5. How It Works Section ── */}
      <section className="steps-section" id="how-it-works">
        <div className="section-label">A Clear & Private Path</div>
        <h2 className="section-title">How SafeSpace Protects Your Journey</h2>
        <p className="section-desc">
          Engineered for complete student dignity, zero barriers, and unconditional privacy from day one.
        </p>

        <div className="steps-grid">
          <div className="step-card animate-fade-up">
            <div className="step-badge">Step 01</div>
            <div className="step-icon-wrap"><i className="fas fa-user-pen"></i></div>
            <h3>Voluntary Self-Registration</h3>
            <p>
              You control your account. Register yourself with your institutional ID and your own private password.
              No automated pre-enrollment or harvesting.
            </p>
            <div className="step-tags">
              <span className="step-tag">100% Student Choice</span>
              <span className="step-tag">RA 10173 Protected</span>
            </div>
          </div>

          <div className="step-card animate-fade-up animate-delay-1">
            <div className="step-badge">Step 02</div>
            <div className="step-icon-wrap"><i className="fas fa-fingerprint"></i></div>
            <h3>Cryptographic Pseudonym Shield</h3>
            <p>
              When you enter the sanctuary, your real name and ID are detached. Community interactions display an auto-generated pseudonym that cannot be mapped back.
            </p>
            <div className="step-tags">
              <span className="step-tag">Zero Exposure</span>
              <span className="step-tag">Unlinked Pseudonym</span>
            </div>
          </div>

          <div className="step-card animate-fade-up animate-delay-2">
            <div className="step-badge">Step 03</div>
            <div className="step-icon-wrap"><i className="fas fa-comments"></i></div>
            <h3>Express, Ground & Connect</h3>
            <p>
              Share honest reflections on the Rant Board, explore the Calm-Down Studio, or initiate a live, confidential chat session with an active campus counselor.
            </p>
            <div className="step-tags">
              <span className="step-tag">Peer Empathy</span>
              <span className="step-tag">Counselor Support</span>
            </div>
          </div>
        </div>

        <div className="steps-cta-wrap animate-fade-up animate-delay-3">
          <Link to="/register" className="hero-btn-primary">
            <i className="fas fa-user-plus"></i> Begin Your Anonymous Journey
          </Link>
        </div>
      </section>

      {/* ── 6. Grounding & Mindful Oasis ── */}
      <section className="grounding-section" id="grounding">
        <div className="grounding-inner">
          <div className="grounding-header">
            <div className="section-label">Instant Grounding Studio</div>
            <h2 className="section-title">Pause, Breathe & Center Yourself</h2>
            <p className="section-desc">
              Evidence-based sensory grounding techniques accessible immediately right here in your browser.
            </p>
          </div>

          <div className="grounding-grid">
            {/* Tool 1: 4-7-8 Breathing Pacer */}
            <div className="grounding-tool-card animate-fade-up">
              <div className="grounding-tool-header">
                <div className="grounding-tool-badge"><i className="fas fa-wind"></i> Guided Breathing</div>
                <h4>4-7-8 Serene Pacer</h4>
              </div>
              <p className="grounding-tool-desc">
                Slow down your heart rate and ease nervous system arousal. Follow the rhythmic visual circle.
              </p>

              <div className="breathing-oasis-visual">
                <div className="mindful-bubble" id="mindfulBubble">
                  <i className="fas fa-spa"></i>
                </div>
                <div className="breathing-meta">
                  <div className="mindful-state-text">{PACER_STATES[pacerIdx].text}</div>
                  <div className="mindful-state-sub">{PACER_STATES[pacerIdx].sub}</div>
                </div>
              </div>

              <div className="breathing-tips">
                <span><i className="fas fa-check"></i> Inhale 4s</span>
                <span><i className="fas fa-check"></i> Hold 7s</span>
                <span><i className="fas fa-check"></i> Exhale 8s</span>
              </div>
            </div>

            {/* Tool 2: 5-4-3-2-1 Sensory Grounding */}
            <div className="grounding-tool-card animate-fade-up animate-delay-1">
              <div className="grounding-tool-header">
                <div className="grounding-tool-badge"><i className="fas fa-hand"></i> Sensory Grounding</div>
                <h4>5-4-3-2-1 Reset Technique</h4>
              </div>
              <p className="grounding-tool-desc">
                When thoughts become overwhelming, click each anchor to gently reconnect with the present moment.
              </p>

              <div className="sensory-steps-list">
                {[
                  { num: 5, title: 'See', sub: 'Notice 5 objects around you (a book, a window, a shadow)' },
                  { num: 4, title: 'Touch', sub: 'Feel 4 physical textures (your desk, fabric, cool air)' },
                  { num: 3, title: 'Hear', sub: 'Listen for 3 distinct sounds (distant voices, clock tick)' },
                  { num: 2, title: 'Smell', sub: 'Identify 2 subtle scents around your room' },
                  { num: 1, title: 'Affirm', sub: 'Acknowledge 1 thing you are grateful for right now' }
                ].map((step, idx) => (
                  <div 
                    key={step.num}
                    className={`sensory-step-item ${completedSteps[idx] ? 'completed' : ''}`}
                    onClick={() => toggleSensoryStep(idx)}
                    role="button"
                    tabIndex={0}
                  >
                    <span className="sensory-num">{step.num}</span>
                    <div className="sensory-content">
                      <strong>{step.title}</strong>
                      <span>{step.sub}</span>
                    </div>
                    <i className="fas fa-circle-check sensory-check"></i>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── 7. Features Ecosystem Carousel ── */}
      <section className="features-section" id="features">
        <div className="section-label">Comprehensive Wellness Ecosystem</div>
        <h2 className="section-title">Thoughtfully Crafted For Emotional Safety</h2>
        <p className="section-desc">
          Every tool in SafeSpace is engineered around unconditional anonymity, proactive crisis support,
          and holistic student well-being.
        </p>

        <div 
          className="features-carousel-wrapper" 
          id="featuresCarouselWrapper"
          onMouseEnter={pauseAutoplay}
          onMouseLeave={resumeAutoplay}
        >
          <button 
            type="button" 
            className="carousel-nav-btn prev" 
            onClick={prevSlide}
            aria-label="Previous feature"
          >
            <i className="fas fa-chevron-left"></i>
          </button>

          <div 
            className={`features-carousel-viewport ${isDragging ? 'is-dragging' : ''}`} 
            ref={carouselViewportRef}
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
            onMouseDown={handleTouchStart}
            onMouseMove={handleTouchMove}
            onMouseUp={handleTouchEnd}
          >
            <div 
              className={`features-carousel-track ${isDragging ? 'no-transition' : ''}`} 
              ref={carouselTrackRef}
              style={{
                transform: `translate3d(calc(${translatePercent}% + ${dragTranslate}px), 0, 0)`,
                transition: isDragging ? 'none' : 'transform 0.5s cubic-bezier(0.2, 0.8, 0.2, 1)'
              }}
            >
              {FEATURES.map((feat, i) => (
                <div key={i} className="features-slide" role="group" aria-label={`${i + 1} of ${FEATURES.length}`}>
                  <div className="feature-card">
                    <div className={`feature-icon ${feat.iconClass}`}>
                      <i className={feat.icon}></i>
                    </div>
                    <h3>{feat.title}</h3>
                    <p>{feat.desc}</p>
                    <div className="feature-tags">
                      {feat.tags.map((t, idx) => (
                        <span key={idx} className="feature-tag">{t}</span>
                      ))}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <button 
            type="button" 
            className="carousel-nav-btn next" 
            onClick={nextSlide}
            aria-label="Next feature"
          >
            <i className="fas fa-chevron-right"></i>
          </button>
        </div>

        {/* Carousel Dots */}
        <div className="carousel-pagination" id="featuresCarouselDots">
          {Array.from({ length: maxIndex + 1 }).map((_, i) => (
            <button
              key={i}
              type="button"
              className={`carousel-dot ${i === carouselIndex ? 'active' : ''}`}
              onClick={() => {
                setCarouselIndex(i);
                resumeAutoplay();
              }}
              aria-label={`Go to slide ${i + 1}`}
            />
          ))}
        </div>
      </section>

      {/* ── 8. Privacy Charter Section ── */}
      <section className="privacy-section" id="privacy">
        <div className="privacy-card animate-fade-up">
          <div className="privacy-icon">
            <i className="fas fa-shield-halved"></i>
          </div>
          <h2>Your Right to Privacy Is Absolute</h2>
          <p>
            SafeSpace was engineered in strict compliance with the Philippine Data Privacy Act of 2012 (RA 10173).
            Every student has the fundamental right to seek mental wellness support without fear of academic
            repercussions, peer exposure, or mandatory surveillance.
          </p>
          <div className="privacy-badges">
            <div className="privacy-badge">
              <i className="fas fa-user-lock"></i> Voluntary Self-Registration
            </div>
            <div className="privacy-badge">
              <i className="fas fa-mask"></i> Decoupled Pseudonyms
            </div>
            <div className="privacy-badge">
              <i className="fas fa-key"></i> Token-Based Cryptography
            </div>
            <div className="privacy-badge">
              <i className="fas fa-database"></i> Zero Data Harvesting
            </div>
          </div>
        </div>
      </section>

      {/* ── 9. Empathetic Pre-Footer Sanctuary CTA ── */}
      <section className="prefooter-cta">
        <div className="prefooter-inner animate-fade-up">
          <div className="cta-icon-badge"><i className="fas fa-heart-circle-check"></i></div>
          <h2>You don't have to carry it all alone.</h2>
          <p>
            Join students and campus counselors finding clarity, emotional release, and guidance in a completely confidential space.
          </p>
          <div className="cta-actions">
            <Link to="/register" className="hero-btn-primary">
              <i className="fas fa-user-shield"></i> Join SafeSpace Free
            </Link>
            <Link to="/login" className="hero-btn-ghost">
              <i className="fas fa-arrow-right-to-bracket"></i> Sign In to Your Space
            </Link>
          </div>
        </div>
      </section>

      {/* ── 10. Footer & Crisis Hotlines ── */}
      <footer className="landing-footer">
        <div className="footer-crisis-bar">
          <i className="fas fa-phone-volume"></i>
          <span><strong>In Immediate Crisis?</strong> National Mental Health Crisis Hotline: <strong>1553</strong> (Toll-Free) or <strong>0966-351-4518</strong></span>
        </div>
        <p style={{ marginTop: '1.25rem' }}>SafeSpace • Dedicated to Student Well-Being, Psychological Safety & Dignity</p>
        <p style={{ marginTop: '0.4rem', fontSize: '0.75rem', color: '#BACBD8' }}>
          Built with the Compass Psychological Services Design System for University Mental Health Programs
        </p>
      </footer>
    </div>
  );
}
