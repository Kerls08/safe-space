import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { postsApi } from '../services/api';
import '../styles/rant.css';

const EMOTIONS = [
  { label: 'Sad', emoji: '😢' },
  { label: 'Angry', emoji: '😤' },
  { label: 'Anxious', emoji: '😰' },
  { label: 'Lonely', emoji: '🥺' },
  { label: 'Frustrated', emoji: '😩' },
  { label: 'Neutral', emoji: '😐' },
  { label: 'Relieved', emoji: '😌' },
  { label: 'Happy', emoji: '😊' }
];

const PROFANITY_WORDS = [
  'fuck', 'shit', 'bitch', 'asshole', 'cunt',
  'putangina', 'gago', 'tarantado', 'bobo', 'puta',
  'pisti', 'giatay', 'buang'
];

const BOX_BREATHING_DATA = [
  { name: 'Inhale', sub: 'Breathe in slowly through your nose...', duration: 4, phaseClass: 'inhale', sphereText: 'Inhale' },
  { name: 'Hold', sub: 'Hold your breath gently. Rest in stillness...', duration: 4, phaseClass: 'hold', sphereText: 'Hold' },
  { name: 'Exhale', sub: 'Release slowly and completely through your mouth...', duration: 4, phaseClass: 'exhale', sphereText: 'Exhale' },
  { name: 'Hold', sub: 'Pause quietly before the next breath begins...', duration: 4, phaseClass: 'hold', sphereText: 'Rest' }
];

const GROUNDING_DATA = [
  { count: 5, sense: 'SEE', icon: '👁️', prompt: '5 things you can SEE', desc: 'Look around. Notice colors, shadows, a pen, light shining on a wall, or small details.', items: ['1st thing you see', '2nd thing you see', '3rd thing you see', '4th thing you see', '5th thing you see'] },
  { count: 4, sense: 'TOUCH', icon: '✋', prompt: '4 things you can TOUCH', desc: 'Notice physical sensations: the fabric of your clothes, feet on the floor, or the cool desk.', items: ['1st texture', '2nd texture', '3rd texture', '4th texture'] },
  { count: 3, sense: 'HEAR', icon: '👂', prompt: '3 things you can HEAR', desc: 'Listen carefully: distant conversation, the hum of an air conditioner, birds, or your breathing.', items: ['1st sound', '2nd sound', '3rd sound'] },
  { count: 2, sense: 'SMELL', icon: '👃', prompt: '2 things you can SMELL', desc: 'Take a gentle breath in: notice any soap, fresh air, coffee, paper, or clothing.', items: ['1st scent', '2nd scent'] },
  { count: 1, sense: 'TASTE', icon: '👅', prompt: '1 thing you can TASTE', desc: 'Notice the lingering taste of a drink, food, mint, or the natural taste inside your mouth.', items: ['1 taste'] }
];

const PMR_DATA = [
  { target: 'Hands & Forearms', icon: 'fa-hand', tenseTip: 'Make tight fists with both hands. Squeeze hard and feel the tension build in your forearms.', releaseTip: 'Release your fists completely. Let your fingers uncurl and feel the warmth and relief.' },
  { target: 'Shoulders & Neck', icon: 'fa-user-tie', tenseTip: 'Shrug your shoulders up toward your ears. Hold tight and feel the strain in your neck.', releaseTip: 'Drop your shoulders all the way down. Let gravity take over and feel all heaviness vanish.' },
  { target: 'Face & Forehead', icon: 'fa-face-smile', tenseTip: 'Scrunch up your eyes, wrinkle your forehead, and clench your jaw gently. Hold tight.', releaseTip: 'Soften your forehead, unclamp your jaw, and let all facial muscles smooth out.' },
  { target: 'Chest & Stomach', icon: 'fa-lungs', tenseTip: 'Take a deep breath and tighten your core/abdominal muscles firmly. Hold it in.', releaseTip: 'Exhale completely. Let your belly relax and soften into pure ease.' },
  { target: 'Feet & Calves', icon: 'fa-shoe-prints', tenseTip: 'Point your toes downwards and tense your calf muscles tight. Feel the tightness.', releaseTip: 'Release your feet and toes. Feel the tension drain away into the ground.' }
];

function getTimeAgo(dateStr) {
  if (!dateStr) return 'just now';
  const past = new Date(dateStr).getTime();
  const now = Date.now();
  const diffSec = Math.max(0, Math.floor((now - past) / 1000));
  if (diffSec < 60) return `${diffSec}s ago`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  return `${diffDay}d ago`;
}

function getEmoji(tag) {
  const match = EMOTIONS.find(e => e.label.toLowerCase() === (tag || '').toLowerCase());
  return match ? match.emoji : '💬';
}

function getCategoryIcon(cat) {
  const map = {
    'HOTLINE': 'fas fa-phone-volume',
    'CAMPUS': 'fas fa-building-columns',
    'EXTERNAL_LINK': 'fas fa-globe',
    'CHAT_SERVICE': 'fas fa-comment-medical',
    'ARTICLE': 'fas fa-book-open'
  };
  return map[cat] || 'fas fa-link';
}

function getCategoryLabel(cat) {
  const map = {
    'HOTLINE': 'Hotline',
    'CAMPUS': 'Campus Service',
    'EXTERNAL_LINK': 'External Resource',
    'CHAT_SERVICE': 'Chat Support',
    'ARTICLE': 'Article'
  };
  return map[cat] || 'Resource';
}

function renderResourceCard(r, key) {
  const iconClass = r.icon || getCategoryIcon(r.category);
  const catLabel = getCategoryLabel(r.category);
  const isUrgent = !!r.crisisOnly;
  const linkHref = r.link || '#';
  const isExternal =
    linkHref.startsWith('http') ||
    linkHref.startsWith('tel:') ||
    linkHref.startsWith('mailto:') ||
    linkHref.startsWith('sms:');

  return (
    <a
      key={key !== undefined ? key : r.id || r.title}
      className={`resource-card ${isUrgent ? 'urgent' : ''}`}
      href={linkHref}
      target={isExternal ? '_blank' : undefined}
      rel={isExternal ? 'noopener noreferrer' : undefined}
      onClick={(e) => {
        if (!r.link || r.link === '#') {
          e.preventDefault();
        }
      }}
    >
      <div className={`resource-card-icon ${r.category || ''}`}>
        <i className={iconClass}></i>
      </div>
      <div className="resource-card-body">
        <div className="resource-card-title">
          {r.title}
          {isUrgent && <span className="resource-urgent-badge">Crisis</span>}
        </div>
        {r.description && <div className="resource-card-desc">{r.description}</div>}
        <span className="resource-card-cat">{catLabel}</span>
      </div>
      <i className="fas fa-arrow-up-right-from-square resource-card-arrow"></i>
    </a>
  );
}

export default function RantBoard() {
  const { role, fullName, username } = useAuth();
  const isProfessional = role === 'PROFESSIONAL' || role === 'SUPER_ADMIN';

  // Active Tab: 'share', 'feed', 'mine', 'calm', 'resources'
  const [activeTab, setActiveTab] = useState(isProfessional ? 'feed' : 'share');

  // Share form states
  const [selectedEmotion, setSelectedEmotion] = useState('Anxious');
  const [energyScore, setEnergyScore] = useState(5);
  const [content, setContent] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [contentBlocked, setContentBlocked] = useState(false);
  const [autoReplyData, setAutoReplyData] = useState(null); // { autoReply, flagged, contextualResources }
  const [toastMessage, setToastMessage] = useState('');

  // Crisis resource banner state (shown when energyScore >= 9)
  const [crisisBannerVisible, setCrisisBannerVisible] = useState(false);
  const [crisisBannerDismissed, setCrisisBannerDismissed] = useState(false);
  const [crisisResources, setCrisisResources] = useState([]);

  // Feed states
  const [posts, setPosts] = useState([]);
  const [feedPage, setFeedPage] = useState(0);
  const [feedTotalPages, setFeedTotalPages] = useState(0);
  const [feedTotalElements, setFeedTotalElements] = useState(0);
  const [feedEmotion, setFeedEmotion] = useState('ALL');
  const [feedLoading, setFeedLoading] = useState(false);

  // My Posts
  const [myPosts, setMyPosts] = useState([]);
  const [myPostsLoading, setMyPostsLoading] = useState(false);

  // Student Resources
  const [resources, setResources] = useState([]);
  const [resourcesLoading, setResourcesLoading] = useState(false);

  // Calm-Down Kit Modal State
  const [kitModalOpen, setKitModalOpen] = useState(false);
  const [activeKit, setActiveKit] = useState(null); // 'breathing', 'grounding', 'muscle', 'journal'
  const [isKitPaused, setIsKitPaused] = useState(false);
  const [kitStep, setKitStep] = useState(0);
  const [kitCountdown, setKitCountdown] = useState(4);
  const [breathingCycle, setBreathingCycle] = useState(1);
  const [groundingChecks, setGroundingChecks] = useState({});
  const [journalEntries, setJournalEntries] = useState({ one: '', two: '', three: '' });
  const [journalSaved, setJournalSaved] = useState(false);
  const kitTimerRef = useRef(null);

  // Pre-submission crisis resources banner listener (energyScore >= 9)
  useEffect(() => {
    if (energyScore >= 9 && !crisisBannerDismissed) {
      postsApi.getCrisisResources().then((res) => {
        if (res && res.length > 0) {
          setCrisisResources(res);
          setCrisisBannerVisible(true);
        }
      }).catch(() => {});
    } else if (energyScore < 9) {
      setCrisisBannerVisible(false);
      setCrisisBannerDismissed(false);
    }
  }, [energyScore, crisisBannerDismissed]);

  const showToast = (msg) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(''), 3500);
  };

  // Check profanity on textarea change
  const handleContentChange = (e) => {
    const val = e.target.value;
    setContent(val);

    const normalized = val.toLowerCase().replace(/[^a-z0-9\s']/g, ' ').replace(/\s+/g, ' ').trim();
    let blocked = false;
    for (const w of PROFANITY_WORDS) {
      if (new RegExp(`\\b${w}\\b`).test(normalized)) {
        blocked = true;
        break;
      }
    }
    setContentBlocked(blocked);
  };

  // Fetch Feed Posts
  const loadFeed = useCallback(async (pageToLoad = 0, append = false) => {
    setFeedLoading(true);
    try {
      const data = await postsApi.getPosts({
        page: pageToLoad,
        size: 10,
        emotion: feedEmotion
      });
      const contentList = Array.isArray(data) ? data : data.content || [];
      const totalPages = data.totalPages !== undefined ? data.totalPages : 1;
      const totalElems = data.totalElements !== undefined ? data.totalElements : contentList.length;

      setPosts((prev) => append ? [...prev, ...contentList] : contentList);
      setFeedPage(pageToLoad);
      setFeedTotalPages(totalPages);
      setFeedTotalElements(totalElems);
    } catch (err) {
      console.warn('Feed load error:', err);
    } finally {
      setFeedLoading(false);
    }
  }, [feedEmotion]);

  // Fetch My Posts
  const loadMyPosts = useCallback(async () => {
    if (isProfessional) return;
    setMyPostsLoading(true);
    try {
      const data = await postsApi.getMyPosts();
      setMyPosts(Array.isArray(data) ? data : data.content || []);
    } catch (err) {
      console.warn('My posts load error:', err);
    } finally {
      setMyPostsLoading(false);
    }
  }, [isProfessional]);

  // Fetch Resources
  const loadResources = useCallback(async () => {
    setResourcesLoading(true);
    try {
      const data = await postsApi.getResources();
      setResources(Array.isArray(data) ? data : (data.content || []));
    } catch (err) {
      console.warn('Resources load error:', err);
    } finally {
      setResourcesLoading(false);
    }
  }, []);

  // Initial load
  useEffect(() => {
    loadFeed(0, false);
    if (!isProfessional) {
      loadMyPosts();
      loadResources();
    }
  }, [loadFeed, loadMyPosts, loadResources, isProfessional]);

  // Handle Tab Switch
  const handleSwitchTab = (tabId) => {
    if (isProfessional && tabId !== 'feed') return;
    setActiveTab(tabId);
    if (tabId === 'feed') loadFeed(0, false);
    if (tabId === 'mine') loadMyPosts();
    if (tabId === 'resources') loadResources();
  };

  // Handle Post Submit
  const handlePost = async (e) => {
    e.preventDefault();
    if (isProfessional) {
      alert('Professionals are in clinical observation mode and cannot submit rants.');
      return;
    }
    const trimmed = content.trim();
    if (!trimmed || contentBlocked) return;

    setIsSubmitting(true);
    try {
      const post = await postsApi.createPost({
        content: trimmed,
        emotionTag: selectedEmotion,
        energyScore
      });

      if (post.flagged) {
        setAutoReplyData({
          flagged: true,
          autoReply: null,
          contextualResources: post.contextualResources || [],
          calmDownKit: post.calmDownKit
        });
        showToast('Your thoughts have been heard. Help is on the way 💚');
      } else {
        setAutoReplyData({
          flagged: false,
          autoReply: post.autoReply || "Thank you for sharing your thoughts in SafeSpace.",
          contextualResources: post.contextualResources || [],
          calmDownKit: post.calmDownKit
        });
        showToast('Your post has been shared anonymously ✓');
      }

      setContent('');
      setContentBlocked(false);
      loadFeed(0, false);
      loadMyPosts();
    } catch (err) {
      showToast(err.message || 'Failed to publish post. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // ── Calm-Down Kit Controllers ──
  const openKit = (type) => {
    setActiveKit(type);
    setIsKitPaused(false);
    setKitStep(0);
    setBreathingCycle(1);
    setKitCountdown(4);
    setGroundingChecks({});
    setJournalSaved(false);
    setKitModalOpen(true);
    document.body.style.overflow = 'hidden';
  };

  const closeKit = () => {
    if (kitTimerRef.current) clearInterval(kitTimerRef.current);
    setKitModalOpen(false);
    setActiveKit(null);
    document.body.style.overflow = '';
    showToast('Great job taking care of yourself 💚');
  };

  // Box Breathing Timer
  useEffect(() => {
    if (!kitModalOpen || activeKit !== 'breathing') return;

    kitTimerRef.current = setInterval(() => {
      if (isKitPaused) return;

      setKitCountdown((prevCount) => {
        if (prevCount <= 1) {
          setKitStep((prevStep) => {
            const nextStep = (prevStep + 1) % 4;
            if (nextStep === 0) {
              setBreathingCycle((c) => c + 1);
            }
            return nextStep;
          });
          return 4;
        }
        return prevCount - 1;
      });
    }, 1000);

    return () => clearInterval(kitTimerRef.current);
  }, [kitModalOpen, activeKit, isKitPaused]);

  // Energy Class Helper
  const getEnergyClass = (score) => {
    return score <= 4 ? 'energy-low' : score <= 7 ? 'energy-mid' : 'energy-high';
  };

  const getEnergyTagClass = (score) => {
    return score <= 4 ? 'low' : score <= 7 ? 'mid' : 'high';
  };

  return (
    <div className="rant-layout">
      {/* Toast Notification */}
      {toastMessage && (
        <div style={{
          position: 'fixed',
          bottom: '2rem',
          right: '2rem',
          background: '#161F36',
          color: '#FAF7F2',
          padding: '0.85rem 1.4rem',
          borderRadius: '0.75rem',
          boxShadow: '0 10px 25px rgba(22, 31, 54, 0.25)',
          zIndex: 11000,
          fontWeight: 600,
          fontSize: '0.88rem',
          display: 'flex',
          alignItems: 'center',
          gap: '0.6rem'
        }}>
          <i className="fas fa-circle-check" style={{ color: '#10B981' }}></i>
          <span>{toastMessage}</span>
        </div>
      )}

      {/* ── Welcome Banner ── */}
      <header className="rant-welcome" id="welcomeBanner">
        <div className="rant-welcome-inner">
          <div className="rant-welcome-left">
            <div className="rant-welcome-icon">
              <i className="fas fa-shield-heart"></i>
            </div>
            <div>
              <h1>Welcome back, <span className="welcome-greeting" id="welcomeName">{(fullName || username || 'Friend').split(' ')[0]}</span></h1>
              <p>This is your anonymous, judgment-free space. Share what you feel — your identity is always protected.</p>
            </div>
          </div>
          <div className="welcome-badge-pill">
            <i className={isProfessional ? "fas fa-eye" : "fas fa-shield-halved"}></i>{' '}
            {isProfessional ? "Clinical Observational Stream" : "100% Voluntary & Decoupled Anonymity"}
          </div>
        </div>
      </header>

      {/* ── Tab Navigation ── */}
      {!isProfessional && (
        <div className="rant-tabs" id="rantTabs">
          <button
            type="button"
            className={`rant-tab ${activeTab === 'share' ? 'active' : ''}`}
            onClick={() => handleSwitchTab('share')}
          >
            <i className="fas fa-pen-to-square"></i> Share
          </button>
          <button
            type="button"
            className={`rant-tab ${activeTab === 'feed' ? 'active' : ''}`}
            onClick={() => handleSwitchTab('feed')}
          >
            <i className="fas fa-users"></i> Peer Mirror
          </button>
          <button
            type="button"
            className={`rant-tab ${activeTab === 'mine' ? 'active' : ''}`}
            onClick={() => handleSwitchTab('mine')}
          >
            <i className="fas fa-bookmark"></i> My Posts
            {myPosts.length > 0 && (
              <span className="tab-badge" id="myPostsBadge">{myPosts.length}</span>
            )}
          </button>
          <button
            type="button"
            className={`rant-tab ${activeTab === 'calm' ? 'active' : ''}`}
            onClick={() => handleSwitchTab('calm')}
          >
            <i className="fas fa-spa"></i> Calm-Down Kit
          </button>
          <button
            type="button"
            className={`rant-tab ${activeTab === 'resources' ? 'active' : ''}`}
            onClick={() => handleSwitchTab('resources')}
          >
            <i className="fas fa-hand-holding-heart"></i> Resources
          </button>
        </div>
      )}

      {/* ── Main Content ── */}
      <div className="rant-content">

        {/* ── TAB 1: Share ── */}
        {!isProfessional && activeTab === 'share' && (
          <div className="tab-panel active" id="panelShare">
            <div className="compose-studio">

              {/* Header */}
              <div className="compose-header">
                <div className="compose-header-icon">
                  <i className="fas fa-feather"></i>
                </div>
                <div>
                  <h2>Express Yourself</h2>
                  <p>Your identity stays completely detached. Be honest — this is your safe space.</p>
                </div>
              </div>

              {/* Pre-submission Crisis Resource Banner */}
              {crisisBannerVisible && crisisResources.length > 0 && (
                <div className="crisis-resource-banner" id="crisisResourceBanner" style={{ marginBottom: '1.5rem' }}>
                  <div className="crisis-banner-header">
                    <div className="crisis-banner-icon"><i className="fas fa-heart-pulse"></i></div>
                    <div>
                      <strong>Your energy is very high</strong>
                      <p>If you're in distress, these resources are here for you right now.</p>
                    </div>
                    <button
                      type="button"
                      className="crisis-banner-dismiss"
                      onClick={() => {
                        setCrisisBannerVisible(false);
                        setCrisisBannerDismissed(true);
                      }}
                      title="Dismiss banner"
                    >
                      <i className="fas fa-xmark"></i>
                    </button>
                  </div>
                  <div className="crisis-banner-resources">
                    {crisisResources.slice(0, 4).map((r, i) => (
                      <a key={i} className="crisis-banner-link" href={r.link || '#'} target="_blank" rel="noopener noreferrer">
                        <i className={r.icon || 'fas fa-phone-volume'}></i>
                        <span>{r.title}</span>
                      </a>
                    ))}
                  </div>
                </div>
              )}

              <form id="postForm" onSubmit={handlePost} autoComplete="off">

                {/* Section 1: Emotion Selection */}
                <div className="compose-segment">
                  <div className="segment-label">
                    <span className="segment-number">1</span>
                    <span>How are you feeling right now?</span>
                  </div>
                  <div className="emotion-grid" id="emotionPicker">
                    {EMOTIONS.map((e) => (
                      <button
                        key={e.label}
                        type="button"
                        className={`mood-card ${selectedEmotion === e.label ? 'selected' : ''}`}
                        onClick={() => setSelectedEmotion(e.label)}
                      >
                        <span className="mood-emoji">{e.emoji}</span>
                        <span className="mood-label">{e.label}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Section 2: Energy Gauge */}
                <div className="compose-segment">
                  <div className="segment-label">
                    <span className="segment-number">2</span>
                    <span>How intense does it feel?</span>
                  </div>
                  <div className="energy-gauge">
                    <div className="energy-gauge-track">
                      <span className="energy-endpoint"><i className="fas fa-leaf"></i> Calm</span>
                      <input
                        type="range"
                        id="energySlider"
                        min="1"
                        max="10"
                        value={energyScore}
                        onChange={(e) => setEnergyScore(parseInt(e.target.value, 10))}
                      />
                      <span className="energy-endpoint intense"><i className="fas fa-fire"></i> Intense</span>
                    </div>
                    <div className={`energy-level-badge ${getEnergyClass(energyScore)}`} id="energyNumber">
                      {energyScore}
                    </div>
                  </div>
                </div>

                {/* Section 3: Expression Field */}
                <div className="compose-segment">
                  <div className="segment-label">
                    <span className="segment-number">3</span>
                    <span>What's on your mind?</span>
                  </div>
                  <div className="expression-field">
                    <textarea
                      className="expression-textarea"
                      id="postContent"
                      placeholder="Write how you feel… be honest. This is completely anonymous."
                      maxLength={5000}
                      required
                      value={content}
                      onChange={handleContentChange}
                    />
                    <div className="expression-footer">
                      <span className="char-count" id="charCount">{content.length} / 5000</span>
                    </div>
                  </div>
                </div>

                {/* Real-time Profanity Warning */}
                {contentBlocked && (
                  <div className="sensitive-warning" id="sensitiveWarning" style={{ display: 'block' }}>
                    <div className="sensitive-warning-header">
                      <div className="sensitive-warning-icon">
                        <i className="fas fa-ban"></i>
                      </div>
                      <div className="sensitive-warning-title">This content cannot be posted</div>
                    </div>
                    <div className="sensitive-warning-body">
                      Your message contains inappropriate language that cannot appear on the board.
                      Please rephrase your message to keep this a safe space for everyone.
                    </div>
                  </div>
                )}

                {/* Action Bar */}
                <div className="compose-action-bar">
                  <div className="action-bar-info">
                    <i className="fas fa-shield-halved"></i>
                    <span>Your identity is fully protected</span>
                  </div>
                  <button
                    type="submit"
                    className={`btn-share ${contentBlocked ? 'blocked' : ''}`}
                    id="submitBtn"
                    disabled={isSubmitting || contentBlocked || !content.trim()}
                  >
                    {isSubmitting ? (
                      <>
                        <i className="fas fa-spinner fa-spin"></i> Posting...
                      </>
                    ) : contentBlocked ? (
                      <>
                        <i className="fas fa-ban"></i> Cannot Post
                      </>
                    ) : (
                      <>
                        <i className="fas fa-paper-plane"></i> Post Anonymously
                      </>
                    )}
                  </button>
                </div>
              </form>

              {/* Auto Reply (shown after post) */}
              {autoReplyData && (
                <div id="autoReplySection" style={{ display: 'block', marginTop: '1.5rem' }}>
                  {autoReplyData.flagged ? (
                    <div className="auto-reply-card crisis">
                      <h4><i className="fas fa-hand-holding-heart"></i> Your thoughts have been heard</h4>
                      <p>
                        We hear you, and we care about how you're feeling. Your post has been received — 
                        a counselor has been notified and may reach out to you through the{' '}
                        <Link to="/anon-chat" style={{ color: '#161F36', fontWeight: 700, textDecoration: 'none', borderBottom: '1.5px solid #BACBD8' }}>
                          Anonymous Chat
                        </Link>.
                      </p>
                      <p style={{ marginTop: '0.5rem', fontSize: '0.75rem', color: '#6b7280' }}>
                        To protect other students who may be vulnerable, your post will not appear on the Peer Mirror. 
                        But your voice matters and help is on the way.
                      </p>
                    </div>
                  ) : (
                    <div className="auto-reply-card">
                      <h4><i className="fas fa-heart"></i> Safe Space says</h4>
                      <p>{autoReplyData.autoReply}</p>
                    </div>
                  )}

                  {/* Contextual Resources from Resource Linker */}
                  {autoReplyData.contextualResources && autoReplyData.contextualResources.length > 0 && (
                    <div id="resourceLinkerSection" style={{ display: 'block', marginTop: '1rem' }}>
                      <div className={`resource-linker-panel ${energyScore >= 8 ? 'urgent' : ''}`}>
                        <div className={`resource-linker-header ${energyScore >= 8 ? 'urgent' : ''}`}>
                          <i className={`fas fa-${energyScore >= 8 ? 'exclamation-triangle' : 'hand-holding-heart'}`}></i>
                          <span>
                            {energyScore >= 8
                              ? 'We noticed your energy is high — here are some immediate support options:'
                              : 'Here are some resources that may help you right now:'}
                          </span>
                        </div>
                        <div className="resource-linker-grid">
                          {autoReplyData.contextualResources.slice(0, 6).map((r, i) => renderResourceCard(r, r.id || i))}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Adaptive Calm-Down Kit Recommendation */}
                  {autoReplyData.calmDownKit && (
                    <div style={{ marginTop: '1rem', background: '#EFF6FF', border: '1px solid #BFDBFE', borderRadius: '0.75rem', padding: '1rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.5rem' }}>
                      <div>
                        <div style={{ fontWeight: 700, fontSize: '0.88rem', color: '#1E3A8A' }}>
                          <i className="fas fa-spa" style={{ marginRight: '6px', color: '#2563EB' }}></i> Recommended Calm-Down Exercise
                        </div>
                        <div style={{ fontSize: '0.8rem', color: '#3B82F6', marginTop: '2px' }}>
                          {autoReplyData.calmDownKit.exerciseType || 'Box Breathing'} — take a moment to regain composure.
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => openKit(autoReplyData.calmDownKit.exerciseType === '5-4-3-2-1 Grounding' ? 'grounding' : autoReplyData.calmDownKit.exerciseType === 'Progressive Muscle Relaxation' ? 'muscle' : 'breathing')}
                        style={{ background: '#2563EB', color: '#fff', border: 'none', padding: '0.5rem 1rem', borderRadius: '0.5rem', fontWeight: 700, fontSize: '0.82rem', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                      >
                        <i className="fas fa-play"></i> Start Exercise
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── TAB 2: Peer Mirror Feed ── */}
        {(activeTab === 'feed' || isProfessional) && (
          <div className="tab-panel active" id="panelFeed">

            {/* Professional Stream Header */}
            {isProfessional && (
              <div id="proFeedHeader" style={{ display: 'flex', marginBottom: '1.25rem', padding: '0.9rem 1.25rem', background: '#FFFFFF', border: '1px solid #E0D7C6', borderRadius: '0.85rem', boxShadow: '0 2px 10px rgba(22,31,54,0.03)', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                  <div style={{ width: '2.25rem', height: '2.25rem', borderRadius: '0.6rem', background: '#EFF6FF', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#2563EB', fontSize: '1rem' }}>
                    <i className="fas fa-users-viewfinder"></i>
                  </div>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: '0.95rem', color: '#161F36' }}>Student Sentiment Stream</div>
                    <div style={{ fontSize: '0.78rem', color: '#6b7280' }}>Real-time anonymous expressions &amp; emotional check-ins across campus</div>
                  </div>
                </div>
                <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#1D4ED8', background: '#EFF6FF', padding: '0.35rem 0.75rem', borderRadius: '999px', border: '1px solid #BFDBFE', display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
                  <i className="fas fa-eye" style={{ color: '#2563EB' }}></i> Observational Stream
                </span>
              </div>
            )}

            {/* Feed Controls */}
            <div className="feed-controls">
              <div className="feed-emotion-pills" id="feedPills">
                <button
                  type="button"
                  className={`feed-pill ${feedEmotion === 'ALL' ? 'active' : ''}`}
                  onClick={() => setFeedEmotion('ALL')}
                >
                  All
                </button>
                {EMOTIONS.map((e) => (
                  <button
                    key={e.label}
                    type="button"
                    className={`feed-pill ${feedEmotion === e.label ? 'active' : ''}`}
                    onClick={() => setFeedEmotion(e.label)}
                  >
                    {e.emoji} {e.label}
                  </button>
                ))}
              </div>
              <span style={{ fontSize: '0.72rem', color: '#9ca3af' }} id="feedCount">
                {feedLoading ? 'Loading...' : `${feedTotalElements} post${feedTotalElements !== 1 ? 's' : ''}`}
              </span>
            </div>

            {/* Feed Cards Container */}
            <div id="feedContainer">
              {feedLoading && posts.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '3rem 1rem', color: '#6C7A92' }}>
                  <i className="fas fa-spinner fa-spin" style={{ fontSize: '1.8rem', marginBottom: '0.75rem' }}></i>
                  <p>Loading rants from the SafeSpace community...</p>
                </div>
              ) : posts.length === 0 ? (
                <div className="feed-empty">
                  <i className="fas fa-leaf"></i>
                  <p>No posts yet. Be the first to share!</p>
                </div>
              ) : (
                posts.map((post) => {
                  const initials = (post.pseudonym || 'AN').substring(0, 2).toUpperCase();
                  const timeAgo = getTimeAgo(post.createdAt);
                  const energyScoreVal = post.energyScore || 5;

                  return (
                    <div key={post.id} className="post-card">
                      <div className="post-header">
                        <div className="post-author">
                          <div className="post-avatar">{initials}</div>
                          <div>
                            <div className="post-name">{post.pseudonym}</div>
                            <div className="post-time">{timeAgo}</div>
                          </div>
                        </div>
                      </div>
                      <div className="post-body">{post.content}</div>
                      <div className="post-tags">
                        <span className="tag-emotion">
                          {getEmoji(post.emotionTag)} {post.emotionTag}
                        </span>
                        <span className={`tag-energy ${getEnergyTagClass(energyScoreVal)}`}>
                          ⚡ {energyScoreVal}/10
                        </span>
                      </div>
                      {post.autoReply && (
                        <div className="post-reply">
                          <strong>💚 Safe Space:</strong> {post.autoReply}
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>

            {/* Load More Button */}
            {feedPage + 1 < feedTotalPages && (
              <div className="load-more-wrap" id="loadMoreWrap" style={{ display: 'flex', justifyContent: 'center', margin: '1.5rem 0' }}>
                <button
                  type="button"
                  className="btn-load-more"
                  id="loadMoreBtn"
                  onClick={() => loadFeed(feedPage + 1, true)}
                >
                  <i className="fas fa-chevron-down"></i> Load more posts
                </button>
              </div>
            )}
          </div>
        )}

        {/* ── TAB 3: My Posts ── */}
        {!isProfessional && activeTab === 'mine' && (
          <div className="tab-panel active" id="panelMine">
            <div id="myPostsContainer">
              {myPostsLoading ? (
                <div style={{ textAlign: 'center', padding: '3rem 1rem', color: '#6C7A92' }}>
                  <i className="fas fa-spinner fa-spin" style={{ fontSize: '1.8rem', marginBottom: '0.75rem' }}></i>
                  <p>Loading your saved posts...</p>
                </div>
              ) : myPosts.length === 0 ? (
                <div className="my-posts-empty">
                  <i className="fas fa-inbox"></i>
                  <p>
                    You haven't posted anything yet.<br />
                    Share your thoughts in the <strong>Share</strong> tab.
                  </p>
                </div>
              ) : (
                myPosts.map((post) => {
                  const initials = (post.pseudonym || 'AN').substring(0, 2).toUpperCase();
                  const timeAgo = getTimeAgo(post.createdAt);
                  const energyScoreVal = post.energyScore || 5;

                  return (
                    <div key={post.id} className="post-card">
                      <div className="post-header">
                        <div className="post-author">
                          <div className="post-avatar">{initials}</div>
                          <div>
                            <div className="post-name">{post.pseudonym}</div>
                            <div className="post-time">{timeAgo}</div>
                          </div>
                        </div>
                      </div>
                      <div className="post-body">{post.content}</div>
                      <div className="post-tags">
                        <span className="tag-emotion">
                          {getEmoji(post.emotionTag)} {post.emotionTag}
                        </span>
                        <span className={`tag-energy ${getEnergyTagClass(energyScoreVal)}`}>
                          ⚡ {energyScoreVal}/10
                        </span>
                      </div>
                      {post.autoReply && (
                        <div className="post-reply">
                          <strong>💚 Safe Space:</strong> {post.autoReply}
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}

        {/* ── TAB 4: Calm-Down Kit ── */}
        {!isProfessional && activeTab === 'calm' && (
          <div className="tab-panel active" id="panelCalm">
            <div className="kit-grid">
              <div className="kit-card" data-kit="breathing" onClick={() => openKit('breathing')}>
                <div className="kit-icon breathing"><i className="fas fa-wind"></i></div>
                <h4>Box Breathing</h4>
                <p>Inhale 4s · Hold 4s · Exhale 4s · Hold 4s</p>
              </div>
              <div className="kit-card" data-kit="grounding" onClick={() => openKit('grounding')}>
                <div className="kit-icon grounding"><i className="fas fa-hand-holding-heart"></i></div>
                <h4>5-4-3-2-1 Grounding</h4>
                <p>Engage all five senses to anchor yourself</p>
              </div>
              <div className="kit-card" data-kit="muscle" onClick={() => openKit('muscle')}>
                <div className="kit-icon muscle"><i className="fas fa-dumbbell"></i></div>
                <h4>Progressive Relaxation</h4>
                <p>Tense and release muscle groups</p>
              </div>
              <div className="kit-card" data-kit="journal" onClick={() => openKit('journal')}>
                <div className="kit-icon journal"><i className="fas fa-pen-fancy"></i></div>
                <h4>Micro Journal</h4>
                <p>Write 3 things you're grateful for right now</p>
              </div>
            </div>
          </div>
        )}

        {/* ── TAB 5: Resources ── */}
        {!isProfessional && activeTab === 'resources' && (
          <div className="tab-panel active" id="panelResources">
            <div className="resources-browser-card">
              <h2><i className="fas fa-hand-holding-heart"></i> Wellness Resources</h2>
              <p className="resources-subtitle">Support resources available to you — hotlines, campus services, and professional support.</p>
              
              {resourcesLoading ? (
                <div id="studentResourceEmpty" style={{ textAlign: 'center', padding: '2rem', color: '#9ca3af' }}>
                  <i className="fas fa-spinner fa-spin" style={{ fontSize: '1.5rem' }}></i>
                  <p style={{ marginTop: '0.5rem' }}>Loading resources...</p>
                </div>
              ) : resources.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '2rem', color: '#9ca3af' }}>
                  <i className="fas fa-box-open" style={{ fontSize: '1.5rem' }}></i>
                  <p style={{ marginTop: '0.5rem' }}>No resources available at this time.</p>
                </div>
              ) : (
                <div id="studentResourceGrid" style={{ display: 'grid', gap: '0.75rem', marginTop: '1rem' }}>
                  {resources.map((res, i) => renderResourceCard(res, res.id || i))}
                </div>
              )}
            </div>
          </div>
        )}

      </div>

      {/* ══════════════════════════════════════════════ */}
      {/* CALM-DOWN KIT MODAL */}
      {/* ══════════════════════════════════════════════ */}
      <div 
        className={`kit-modal-overlay ${kitModalOpen ? 'active' : ''}`} 
        id="kitModalOverlay"
        onClick={(e) => {
          if (e.target.id === 'kitModalOverlay') closeKit();
        }}
      >
        <div className="kit-modal" id="kitModal" role="dialog" aria-modal="true" aria-labelledby="kitModalTitle">
          <div className="kit-modal-header">
            <div className="kit-modal-header-info">
              <div className={`kit-modal-badge ${activeKit || 'breathing'}`} id="kitModalBadge">
                <i className={
                  activeKit === 'breathing' ? 'fas fa-wind' :
                  activeKit === 'grounding' ? 'fas fa-hand-holding-heart' :
                  activeKit === 'muscle' ? 'fas fa-dumbbell' : 'fas fa-pen-fancy'
                } id="kitModalIcon"></i>
              </div>
              <div>
                <h3 id="kitModalTitle">
                  {activeKit === 'breathing' && 'Box Breathing (4-4-4-4)'}
                  {activeKit === 'grounding' && '5-4-3-2-1 Sensory Grounding'}
                  {activeKit === 'muscle' && 'Progressive Muscle Relaxation'}
                  {activeKit === 'journal' && 'Micro Gratitude Journal'}
                </h3>
                <p id="kitModalSubtitle">
                  {activeKit === 'breathing' && 'Calm your nervous system and regain mental composure'}
                  {activeKit === 'grounding' && 'Anchor your awareness in the physical environment right now'}
                  {activeKit === 'muscle' && 'Consciously isolate, tense, and release physical stress'}
                  {activeKit === 'journal' && 'Gently shift perspective by noting 3 meaningful positives'}
                </p>
              </div>
            </div>
            <button className="kit-modal-close" onClick={closeKit} aria-label="Close exercise">
              <i className="fas fa-xmark"></i>
            </button>
          </div>

          <div className="kit-modal-body" id="kitModalBody">
            {/* 1. Box Breathing UI */}
            {activeKit === 'breathing' && (
              <>
                <div className="breathing-sphere-wrap">
                  <div className="breathing-ring-outer"></div>
                  <div className={`breathing-sphere ${BOX_BREATHING_DATA[kitStep].phaseClass}`} id="breathingSphere">
                    <span className="breathing-count" id="breathingCount">{kitCountdown}</span>
                    <span className="breathing-label" id="breathingSphereLabel">{BOX_BREATHING_DATA[kitStep].sphereText}</span>
                  </div>
                </div>
                <div className="kit-phase-instruction" id="breathingPhaseName">{BOX_BREATHING_DATA[kitStep].name}</div>
                <div className="kit-phase-sub" id="breathingPhaseSub">{BOX_BREATHING_DATA[kitStep].sub}</div>
                <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '0.75rem' }}>
                  <span style={{ background: '#eff6ff', color: '#1d4ed8', padding: '0.25rem 0.85rem', borderRadius: '999px', fontSize: '0.78rem', fontWeight: 700 }} id="breathingCycleCounter">
                    <i className="fas fa-rotate"></i> Cycle {breathingCycle}
                  </span>
                </div>
                <div className="box-phases-bar">
                  <div className={`box-phase-chip ${kitStep === 0 ? 'active' : ''}`}><i className="fas fa-arrow-up"></i> Inhale 4s</div>
                  <div className={`box-phase-chip ${kitStep === 1 ? 'active' : ''}`}><i className="fas fa-pause"></i> Hold 4s</div>
                  <div className={`box-phase-chip ${kitStep === 2 ? 'active' : ''}`}><i className="fas fa-arrow-down"></i> Exhale 4s</div>
                  <div className={`box-phase-chip ${kitStep === 3 ? 'active' : ''}`}><i className="fas fa-pause"></i> Hold 4s</div>
                </div>
              </>
            )}

            {/* 2. 5-4-3-2-1 Sensory Grounding UI */}
            {activeKit === 'grounding' && (
              <>
                <div className="grounding-progress-bar" style={{ display: 'flex', justifyContent: 'center', gap: '8px', marginBottom: '1.25rem' }}>
                  {GROUNDING_DATA.map((d, idx) => (
                    <div
                      key={idx}
                      style={{
                        width: '12px',
                        height: '12px',
                        borderRadius: '50%',
                        background: idx === kitStep ? '#161F36' : idx < kitStep ? '#10B981' : '#E2E8F0',
                        cursor: 'pointer'
                      }}
                      onClick={() => setKitStep(idx)}
                    />
                  ))}
                </div>

                <div className="grounding-step-box" style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: '2.5rem', marginBottom: '0.5rem' }}>{GROUNDING_DATA[kitStep].icon}</div>
                  <h4 style={{ fontSize: '1.25rem', color: '#161F36', marginBottom: '0.4rem', fontWeight: 800 }}>{GROUNDING_DATA[kitStep].prompt}</h4>
                  <p style={{ fontSize: '0.85rem', color: '#64748B', maxWidth: '380px', margin: '0 auto 1.25rem' }}>{GROUNDING_DATA[kitStep].desc}</p>
                </div>

                <div style={{ display: 'grid', gap: '0.5rem', maxWidth: '400px', margin: '0 auto' }}>
                  {GROUNDING_DATA[kitStep].items.map((itemText, i) => {
                    const key = `${kitStep}-${i}`;
                    const isChecked = Boolean(groundingChecks[key]);

                    return (
                      <div
                        key={i}
                        onClick={() => setGroundingChecks((prev) => ({ ...prev, [key]: !prev[key] }))}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.75rem',
                          padding: '0.75rem 1rem',
                          borderRadius: '0.75rem',
                          border: isChecked ? '1.5px solid #10B981' : '1.5px solid #E2E8F0',
                          background: isChecked ? '#F0FDF4' : '#fff',
                          cursor: 'pointer',
                          fontSize: '0.88rem',
                          color: isChecked ? '#166534' : '#334155',
                          fontWeight: isChecked ? 600 : 400
                        }}
                      >
                        <i className={isChecked ? 'fas fa-circle-check' : 'far fa-circle'} style={{ color: isChecked ? '#10B981' : '#94A3B8' }}></i>
                        <span>{itemText}</span>
                      </div>
                    );
                  })}
                </div>
              </>
            )}

            {/* 3. Progressive Muscle Relaxation UI */}
            {activeKit === 'muscle' && (
              <div style={{ textAlign: 'center' }}>
                <div style={{ width: '4rem', height: '4rem', borderRadius: '50%', background: '#ede9fe', color: '#7c3aed', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.5rem', marginBottom: '1rem' }}>
                  <i className={`fas ${PMR_DATA[kitStep].icon}`}></i>
                </div>
                <h4 style={{ fontSize: '1.2rem', color: '#161F36', fontWeight: 800, marginBottom: '0.5rem' }}>
                  Step {kitStep + 1} of {PMR_DATA.length}: {PMR_DATA[kitStep].target}
                </h4>
                
                <div style={{ background: '#FEF3C7', border: '1px solid #FDE68A', padding: '1rem', borderRadius: '0.75rem', color: '#92400E', fontSize: '0.85rem', marginBottom: '0.75rem', textAlign: 'left' }}>
                  <strong><i className="fas fa-hand-fist"></i> Tense (5s):</strong> {PMR_DATA[kitStep].tenseTip}
                </div>

                <div style={{ background: '#ECFDF5', border: '1px solid #A7F3D0', padding: '1rem', borderRadius: '0.75rem', color: '#065F46', fontSize: '0.85rem', textAlign: 'left' }}>
                  <strong><i className="fas fa-hand-holding-heart"></i> Release (10s):</strong> {PMR_DATA[kitStep].releaseTip}
                </div>
              </div>
            )}

            {/* 4. Micro Gratitude Journal UI */}
            {activeKit === 'journal' && (
              <div>
                <p style={{ fontSize: '0.85rem', color: '#64748B', textAlign: 'center', marginBottom: '1.25rem' }}>
                  Take a deep breath. Write down 3 small, authentic things that bring a spark of warmth to your day:
                </p>

                <div style={{ display: 'grid', gap: '0.75rem' }}>
                  <input
                    type="text"
                    placeholder="1. One kind gesture, person, or peaceful moment..."
                    value={journalEntries.one}
                    onChange={(e) => setJournalEntries({ ...journalEntries, one: e.target.value })}
                    style={{ width: '100%', padding: '0.75rem 1rem', borderRadius: '0.75rem', border: '1.5px solid #E0D7C6', fontSize: '0.88rem' }}
                  />
                  <input
                    type="text"
                    placeholder="2. Something pleasant you tasted, saw, or listened to..."
                    value={journalEntries.two}
                    onChange={(e) => setJournalEntries({ ...journalEntries, two: e.target.value })}
                    style={{ width: '100%', padding: '0.75rem 1rem', borderRadius: '0.75rem', border: '1.5px solid #E0D7C6', fontSize: '0.88rem' }}
                  />
                  <input
                    type="text"
                    placeholder="3. An accomplishment or a gentle reminder to yourself..."
                    value={journalEntries.three}
                    onChange={(e) => setJournalEntries({ ...journalEntries, three: e.target.value })}
                    style={{ width: '100%', padding: '0.75rem 1rem', borderRadius: '0.75rem', border: '1.5px solid #E0D7C6', fontSize: '0.88rem' }}
                  />
                </div>

                {journalSaved && (
                  <div style={{ background: '#ECFDF5', color: '#065F46', padding: '0.75rem', borderRadius: '0.6rem', marginTop: '1rem', fontSize: '0.85rem', textAlign: 'center', fontWeight: 600 }}>
                    <i className="fas fa-check-circle"></i> Reflections saved in your heart! Keep holding onto that light.
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="kit-modal-footer" id="kitModalFooter">
            {activeKit === 'breathing' && (
              <>
                <button type="button" className="btn-kit-secondary" onClick={closeKit}>
                  <i className="fas fa-check"></i> Finished
                </button>
                <button type="button" className="btn-kit-primary" onClick={() => setIsKitPaused(!isKitPaused)}>
                  <i className={isKitPaused ? "fas fa-play" : "fas fa-pause"}></i> {isKitPaused ? 'Resume' : 'Pause'}
                </button>
              </>
            )}

            {activeKit === 'grounding' && (
              <>
                <button type="button" className="btn-kit-secondary" onClick={closeKit}>
                  Finish Exercise
                </button>
                <button
                  type="button"
                  className="btn-kit-primary"
                  onClick={() => {
                    if (kitStep < GROUNDING_DATA.length - 1) setKitStep(kitStep + 1);
                    else closeKit();
                  }}
                >
                  {kitStep < GROUNDING_DATA.length - 1 ? 'Next Sense →' : 'Done ✓'}
                </button>
              </>
            )}

            {activeKit === 'muscle' && (
              <>
                <button type="button" className="btn-kit-secondary" onClick={closeKit}>
                  Finish
                </button>
                <button
                  type="button"
                  className="btn-kit-primary"
                  onClick={() => {
                    if (kitStep < PMR_DATA.length - 1) setKitStep(kitStep + 1);
                    else closeKit();
                  }}
                >
                  {kitStep < PMR_DATA.length - 1 ? 'Next Group →' : 'Complete ✓'}
                </button>
              </>
            )}

            {activeKit === 'journal' && (
              <>
                <button type="button" className="btn-kit-secondary" onClick={closeKit}>
                  Close
                </button>
                <button
                  type="button"
                  className="btn-kit-primary"
                  onClick={() => {
                    setJournalSaved(true);
                    setTimeout(() => closeKit(), 1500);
                  }}
                >
                  <i className="fas fa-heart"></i> Save Reflections
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
