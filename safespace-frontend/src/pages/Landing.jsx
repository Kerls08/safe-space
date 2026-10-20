import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import '../styles/landing.css';

const MOOD_RESPONSES = {
  overwhelmed: "It is completely okay to feel full. Take one deep breath; you do not need to figure out everything right now. SafeSpace is here for you.",
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
    title: 'Anonymous Peer Board',
    desc: 'Read and share student experiences. Pseudonyms protect your identity in every discussion.'
  },
  {
    title: 'Confidential Counseling',
    desc: 'Message licensed campus counselors in private, one-on-one sessions.'
  },
  {
    title: 'Crisis Support',
    desc: 'Direct access to verified 24/7 national emergency hotlines and campus crisis contacts.'
  },
  {
    title: 'Grounding Exercises',
    desc: 'Interactive 4-7-8 breathing pacers and sensory exercises for immediate stress relief.'
  },
  {
    title: 'Campus Resources',
    desc: 'Verified contact information and operating hours for university health clinics and support offices.'
  },
  {
    title: 'Data Privacy Protection',
    desc: 'No personal identification tracking, with complete privacy over your activity.'
  }
];

export default function Landing() {
  const navigate = useNavigate();
  const { isAuthenticated, role } = useAuth();

  // Navigation states
  const [navScrolled, setNavScrolled] = useState(false);
  const [navOpen, setNavOpen] = useState(false);
  const [activeSection, setActiveSection] = useState('hero');
  const isProgrammaticScrollRef = useRef(false);
  const scrollTimeoutRef = useRef(null);

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

  // Navbar scroll elevation and accurate scroll spy
  useEffect(() => {
    const handleScroll = () => {
      setNavScrolled(window.scrollY > 15);

      // Avoid overriding activeSection while smooth scrolling to a target
      if (isProgrammaticScrollRef.current) return;

      const windowHeight = window.innerHeight;
      const docHeight = document.documentElement.scrollHeight;
      const currentScroll = window.scrollY;

      // 1. If at or near bottom of document, activate last section (privacy)
      if (currentScroll + windowHeight >= docHeight - 70) {
        setActiveSection('privacy');
        return;
      }

      // 2. If near top of document, hero is active
      if (currentScroll < 220) {
        setActiveSection('hero');
        return;
      }

      // 3. Section in active optical focus (42% down the screen, below the fixed navbar)
      const sectionIds = ['hero', 'how-it-works', 'grounding', 'features', 'privacy'];
      const focusLine = windowHeight * 0.42;
      let activeId = 'hero';

      for (const id of sectionIds) {
        const el = document.getElementById(id);
        if (el) {
          const rect = el.getBoundingClientRect();
          if (rect.top <= focusLine && rect.bottom > focusLine) {
            activeId = id;
            break;
          }
        }
      }

      setActiveSection(activeId);
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    handleScroll();
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

  // Touch swipe handlers for mobile
  const handleTouchStart = (e) => {
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
  };

  const toggleSensoryStep = (index) => {
    setCompletedSteps((prev) => ({
      ...prev,
      [index]: !prev[index]
    }));
  };

  const scrollToSection = (e, id) => {
    if (e && e.preventDefault) e.preventDefault();
    setNavOpen(false);
    setActiveSection(id);
    isProgrammaticScrollRef.current = true;
    clearTimeout(scrollTimeoutRef.current);
    scrollTimeoutRef.current = setTimeout(() => {
      isProgrammaticScrollRef.current = false;
    }, 900);

    const el = document.getElementById(id);
    if (el) {
      const navOffset = 68;
      const targetTop = el.getBoundingClientRect().top + window.scrollY - navOffset;
      window.scrollTo({
        top: Math.max(0, Math.round(targetTop)),
        behavior: 'smooth'
      });
    }
  };

  const maxIndex = getMaxIndex();
  const stepWidthPercentage = 100 / getVisibleCount();
  const translatePercent = -(carouselIndex * stepWidthPercentage);

  return (
    <div className="landing-page-root">
      {/*  1. Navigation Bar  */}
      <nav className={`landing-nav ${navScrolled ? 'scrolled' : ''}`} id="landingNav">
        <div className="landing-nav-inner">
          <Link to="/" className="landing-brand">
            <div className="brand-logo-icon logo-only">
              <img src="/SafeSpace logo v2.svg" alt="SafeSpace Logo" className="brand-logo-img" />
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

      {/*  2. Hero Section  */}
      <section className="hero" id="hero">
        <div className="hero-inner-centered">
          <div className="hero-content animate-fade-up">
            <div className="hero-badge">
              Voluntary & Confidential Campus Sanctuary
            </div>
            <h1>
              A Quiet Harbor for Your Mind.<br />
              Speak <span className="highlight">Freely.</span>
            </h1>
            <p>
              Share what you carry without academic judgment or social pressure. Here, university students find room to exhale, reset their thoughts, and reach licensed campus guidance on their own terms.
            </p>
            <div className="hero-actions">
              <Link to="/register" className="hero-btn-primary" id="heroRegisterBtn">
                Enter Anonymous Space
              </Link>
              <a href="#how-it-works" className="hero-btn-ghost" onClick={(e) => scrollToSection(e, 'how-it-works')}>
                Explore How It Works
              </a>
            </div>

            <div className="hero-trust-bar">
              <div className="hero-trust-item">
                Completely Voluntary
              </div>
              <div className="hero-trust-item">
                Full Anonymity
              </div>
              <div className="hero-trust-item">
                Verified Professionals
              </div>
              <div className="hero-trust-item">
                Protected Data Privacy
              </div>
            </div>
          </div>
        </div>
      </section>

      {/*  3. Dedicated Spotlight: A Glimpse Inside SafeSpace  */}
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
                <div className="preview-avatar">QH</div>
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
                  Pseudonym Protected
                </div>
                <span style={{ fontSize: '0.68rem', color: '#728590', fontWeight: 600 }}>Energy Score: 4/10</span>
              </div>

              <div className="preview-response">
                <strong>Campus Counselor:</strong> Taking one gentle step at a time is strength, not weakness.
                Remember our confidential chat is open if you need a listening ear today.
              </div>
            </div>

            <div className="preview-interactive-checkin">
              <div className="preview-interactive-title">
                How is your mind feeling right now?
              </div>
              <div className="preview-mood-btns">
                {['overwhelmed', 'anxious', 'exhausted', 'hopeful'].map((mood) => {
                  const labels = {
                    overwhelmed: 'Overwhelmed',
                    anxious: 'Anxious',
                    exhausted: 'Exhausted',
                    hopeful: 'Hopeful'
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
              Create your anonymous profile →
            </Link>
          </div>
        </div>
      </section>

      {/*  4. Core Sanctuary Pillars Ribbon  */}
      <section className="pillars-ribbon">
        <div className="pillars-inner">
          <div className="pillar-card animate-fade-up">
            <div className="pillar-icon"><i className="fas fa-hand-holding-heart"></i></div>
            <div className="pillar-text">
              <h4>Always Your Choice</h4>
              <p>Participation is voluntary with zero academic tracking.</p>
            </div>
          </div>
          <div className="pillar-card animate-fade-up animate-delay-1">
            <div className="pillar-icon"><i className="fas fa-shield-halved"></i></div>
            <div className="pillar-text">
              <h4>Protected Anonymity</h4>
              <p>Random pseudonyms protect your identity across all discussions.</p>
            </div>
          </div>
          <div className="pillar-card animate-fade-up animate-delay-2">
            <div className="pillar-icon"><i className="fas fa-user-doctor"></i></div>
            <div className="pillar-text">
              <h4>Verified Campus Guidance</h4>
              <p>Confidential sessions with licensed university psychometricians and counselors.</p>
            </div>
          </div>
          <div className="pillar-card animate-fade-up animate-delay-3">
            <div className="pillar-icon"><i className="fas fa-shield-heart"></i></div>
            <div className="pillar-text">
              <h4>Immediate Support</h4>
              <p>24/7 emergency hotlines and guided calming exercises.</p>
            </div>
          </div>
        </div>
      </section>

      {/*  5. How It Works Section  */}
      <section className="steps-section" id="how-it-works">
        <div className="section-label">A Clear & Private Path</div>
        <h2 className="section-title">How SafeSpace Protects Your Journey</h2>
        <p className="section-desc">
          How student privacy and support work in three simple steps.
        </p>

        <div className="steps-grid">
          <div className="step-card animate-fade-up">
            <div className="step-badge">Step 01</div>
            <div className="step-icon-wrap"><i className="fas fa-user-pen"></i></div>
            <h3>Create an Account</h3>
            <p>
              Sign up privately without linking personal social profiles. Your participation is completely optional with zero university tracking.
            </p>
          </div>

          <div className="step-card animate-fade-up animate-delay-1">
            <div className="step-badge">Step 02</div>
            <div className="step-icon-wrap"><i className="fas fa-fingerprint"></i></div>
            <h3>Automatic Pseudonyms</h3>
            <p>
              Your real name is detached immediately. All public posts and peer chats display generated pseudonyms so your thoughts cannot be traced to you.
            </p>
          </div>

          <div className="step-card animate-fade-up animate-delay-2">
            <div className="step-badge">Step 03</div>
            <div className="step-icon-wrap"><i className="fas fa-comments"></i></div>
            <h3>Vent, Ground, or Chat</h3>
            <p>
              Post anonymously on the board, practice guided calming exercises, or message a verified campus counselor in private.
            </p>
          </div>
        </div>

        <div className="steps-cta-wrap animate-fade-up animate-delay-3">
          <Link to="/register" className="hero-btn-primary">
            Begin Anonymously
          </Link>
        </div>
      </section>

      {/*  6. Grounding & Mindful Oasis  */}
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
                <div className="grounding-tool-badge">Guided Breathing</div>
                <h4>4-7-8 Serene Pacer</h4>
              </div>
              <p className="grounding-tool-desc">
                Slow down your heart rate and ease nervous system arousal. Follow the rhythmic visual circle.
              </p>

              <div className="breathing-oasis-visual">
                <div className="mindful-bubble" id="mindfulBubble"></div>
                <div className="breathing-meta">
                  <div className="mindful-state-text">{PACER_STATES[pacerIdx].text}</div>
                  <div className="mindful-state-sub">{PACER_STATES[pacerIdx].sub}</div>
                </div>
              </div>

              <div className="breathing-tips">
                <span>Inhale 4s</span>
                <span>Hold 7s</span>
                <span>Exhale 8s</span>
              </div>
            </div>

            {/* Tool 2: 5-4-3-2-1 Sensory Grounding */}
            <div className="grounding-tool-card animate-fade-up animate-delay-1">
              <div className="grounding-tool-header">
                <div className="grounding-tool-badge">Sensory Grounding</div>
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

      {/*  7. Features Ecosystem Carousel  */}
      <section className="features-section" id="features">
        <div className="section-label">Campus Support Tools</div>
        <h2 className="section-title">Core Platform Features</h2>
        <p className="section-desc">
          Confidential tools designed to support student mental health and well-being.
        </p>

        <div className="features-carousel-wrapper" id="featuresCarouselWrapper">
          <button 
            type="button" 
            className="carousel-nav-btn prev" 
            onClick={prevSlide}
            aria-label="Previous feature"
          >
            <i className="fas fa-chevron-left"></i>
          </button>

          <div 
            className="features-carousel-viewport" 
            ref={carouselViewportRef}
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
          >
            <div 
              className="features-carousel-track" 
              ref={carouselTrackRef}
              style={{
                transform: `translate3d(calc(${translatePercent}% + ${dragTranslate}px), 0, 0)`,
                transition: isDragging ? 'none' : 'transform 0.5s cubic-bezier(0.2, 0.8, 0.2, 1)'
              }}
            >
              {FEATURES.map((feat, i) => (
                <div key={i} className="features-slide" role="group" aria-label={`${i + 1} of ${FEATURES.length}`}>
                  <div className="feature-card">
                    <h3>{feat.title}</h3>
                    <p>{feat.desc}</p>
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
              onClick={() => setCarouselIndex(i)}
              aria-label={`Go to slide ${i + 1}`}
            />
          ))}
        </div>
      </section>

      {/*  8. Privacy Charter Section  */}
      <section className="privacy-section" id="privacy">
        <div className="privacy-card animate-fade-up">
          <div className="privacy-grid">
            <div className="privacy-intro">
              <span className="privacy-eyebrow">Data Protection & Privacy Charter</span>
              <h2>Your Right to Privacy Is Absolute</h2>
              <p>
                SafeSpace operates in strict adherence to the Philippine Data Privacy Act of 2012 (RA 10173).
                Mental health support is accessible without identity exposure, faculty surveillance, or academic penalties.
              </p>
              <div className="privacy-compliance-note">
                Republic Act No. 10173 guarantees student data privacy. SafeSpace never shares individual wellness records with educational institutions or third parties.
              </div>
            </div>

            <div className="privacy-commitments">
              <div className="privacy-commitment-item">
                <h3>Academic Separation</h3>
                <p>Counseling sessions and check-in records are never attached to university transcripts, grades, or official student files.</p>
              </div>
              <div className="privacy-commitment-item">
                <h3>Zero Faculty Visibility</h3>
                <p>Professors, campus administrators, and staff have no access to your peer interactions, messages, or activity.</p>
              </div>
              <div className="privacy-commitment-item">
                <h3>Pseudonymous Community</h3>
                <p>Peer board discussions and questions use generated pseudonyms, ensuring your real student identity remains hidden.</p>
              </div>
              <div className="privacy-commitment-item">
                <h3>Complete Data Control</h3>
                <p>You maintain full authority to delete your check-in logs, mood records, and personal entries whenever you choose.</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/*  9. Empathetic Pre-Footer Sanctuary CTA  */}
      <section className="prefooter-cta">
        <div className="prefooter-inner animate-fade-up">
          <h2>You don't have to carry it all alone.</h2>
          <p>
            Join students and campus counselors finding clarity, emotional release, and guidance in a completely confidential space.
          </p>
          <div className="cta-actions">
            <Link to="/register" className="hero-btn-primary">
              Join SafeSpace Free
            </Link>
            <Link to="/login" className="hero-btn-ghost">
              Sign In to Your Space
            </Link>
          </div>
        </div>
      </section>

      {/*  10. Footer & Crisis Hotlines  */}
      <footer className="landing-footer">
        <div className="footer-crisis-bar">
          <i className="fas fa-phone-volume"></i>
          <span><strong>In Immediate Crisis?</strong> National Mental Health Crisis Hotline: <strong>1553</strong> (Toll-Free) or <strong>0966-351-4518</strong></span>
        </div>
        <p style={{ marginTop: '1.25rem' }}>SafeSpace • Dedicated to Student Well-Being, Psychological Safety & Dignity</p>
        <p style={{ marginTop: '0.4rem', fontSize: '0.75rem', color: '#8CA4A2' }}>
          Built with the Compass Psychological Services Design System for University Mental Health Programs
        </p>
      </footer>
    </div>
  );
}
