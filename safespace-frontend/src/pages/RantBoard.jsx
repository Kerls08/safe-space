import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { postsApi } from '../services/api';
import '../styles/rant.css';

const EMOTIONS = [
  { label: 'Sad' },
  { label: 'Angry' },
  { label: 'Anxious' },
  { label: 'Lonely' },
  { label: 'Frustrated' },
  { label: 'Neutral' },
  { label: 'Relieved' },
  { label: 'Happy' }
];

const PROFANITY_WORDS = [
  'fuck', 'shit', 'bitch', 'asshole', 'cunt',
  'putangina', 'gago', 'tarantado', 'bobo', 'puta',
  'pisti', 'giatay', 'buang'
];

const BOX_BREATHING_DATA = [
  { name: 'Inhale', sub: 'Breathe in slowly through your nose...', duration: 4, phaseClass: 'inhale', sphereText: 'Inhale' },
  { name: 'Hold', sub: 'Hold your breath gently. Stay still...', duration: 4, phaseClass: 'hold', sphereText: 'Hold' },
  { name: 'Exhale', sub: 'Breathe out slowly and gently through your mouth...', duration: 4, phaseClass: 'exhale', sphereText: 'Exhale' },
  { name: 'Hold', sub: 'Wait quietly before your next breath...', duration: 4, phaseClass: 'hold-empty', sphereText: 'Rest' }
];

const GROUNDING_DATA = [
  { count: 5, sense: 'SEE', icon: 'fas fa-eye', prompt: '5 things you can SEE', desc: 'Look around you. Find 5 things you can see (like a pen, a wall, a shoe, or a window).', items: ['1. Something you can see', '2. Something you can see', '3. Something you can see', '4. Something you can see', '5. Something you can see'] },
  { count: 4, sense: 'TOUCH', icon: 'fas fa-hand', prompt: '4 things you can TOUCH', desc: 'Find 4 things you can feel with your hands or body (like your shirt, a smooth desk, or the floor).', items: ['1. Something you can touch', '2. Something you can touch', '3. Something you can touch', '4. Something you can touch'] },
  { count: 3, sense: 'HEAR', icon: 'fas fa-ear-listen', prompt: '3 things you can HEAR', desc: 'Listen quietly. Find 3 sounds you can hear (like people talking far away, a fan humming, or your breath).', items: ['1. A sound you can hear', '2. A sound you can hear', '3. A sound you can hear'] },
  { count: 2, sense: 'SMELL', icon: 'fas fa-wind', prompt: '2 things you can SMELL', desc: 'Breathe in gently. Find 2 smells around you (like soap, fresh air, paper, food, or your clothes).', items: ['1. A smell around you', '2. A smell around you'] },
  { count: 1, sense: 'TASTE', icon: 'fas fa-droplet', prompt: '1 thing you can TASTE', desc: 'Notice 1 taste in your mouth (like water, mint, food you ate earlier, or take a sip of water).', items: ['1. A taste in your mouth'] }
];

const PMR_DATA = [
  { target: 'Hands & Arms', icon: 'fa-hand', tenseTip: 'Make tight fists with both hands. Squeeze hard and feel your arms tighten up.', releaseTip: 'Open your hands completely. Let your fingers go loose and feel the tension leave.' },
  { target: 'Shoulders & Neck', icon: 'fa-user-tie', tenseTip: 'Pull your shoulders up high towards your ears. Hold tight and feel the squeeze.', releaseTip: 'Drop your shoulders all the way down. Let them feel heavy, loose, and completely rested.' },
  { target: 'Face & Jaw', icon: 'fa-face-smile', tenseTip: 'Close your eyes tight, squeeze your face, and bite down gently. Hold it tight.', releaseTip: 'Let go. Relax your eyes, loosen your mouth, and let your whole face go soft.' },
  { target: 'Chest & Tummy', icon: 'fa-lungs', tenseTip: 'Take a deep breath and make your tummy muscles tight and firm. Hold it in.', releaseTip: 'Breathe out all the air. Let your stomach relax and feel soft and loose.' },
  { target: 'Feet & Lower Legs', icon: 'fa-shoe-prints', tenseTip: 'Point your toes down and tighten the back of your legs. Feel the tight squeeze.', releaseTip: 'Relax your feet and toes completely. Feel all the tightness melt away.' }
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

function getEmoji() {
  return '';
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
  const isTel = (r.link || '').startsWith('tel:');
  const isSms = (r.link || '').startsWith('sms:');
  const defaultIcon = isTel
    ? 'fas fa-phone'
    : isSms
    ? 'fas fa-comment'
    : r.category === 'CAMPUS'
    ? 'fas fa-building-columns'
    : 'fas fa-link';
  const iconClass = r.icon || defaultIcon;
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
      <div className="resource-card-icon">
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
  const [cooldownSeconds, setCooldownSeconds] = useState(0);

  // Anti-flood / mindful breathing cooldown between submissions
  useEffect(() => {
    if (cooldownSeconds <= 0) return;
    const timer = setInterval(() => {
      setCooldownSeconds((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(timer);
  }, [cooldownSeconds]);

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
  const [myPostsFilter, setMyPostsFilter] = useState('ACTIVE');
  const [deleteModal, setDeleteModal] = useState({ open: false, postId: null, pseudonym: '', content: '' });
  const [postActionLoadingId, setPostActionLoadingId] = useState(null);

  // Unread tracker for My Posts notification badge
  const [lastSeenMyPostsAt, setLastSeenMyPostsAt] = useState(() => {
    try {
      const saved = localStorage.getItem('safespace_last_seen_my_posts');
      if (saved) return parseInt(saved, 10);
      const now = Date.now();
      localStorage.setItem('safespace_last_seen_my_posts', String(now));
      return now;
    } catch {
      return Date.now();
    }
  });

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
  const kitStepRef = useRef(0);
  const kitCountdownRef = useRef(4);

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
  const loadMyPosts = useCallback(async (silent = false) => {
    if (isProfessional) return;
    if (!silent) setMyPostsLoading(true);
    try {
      const data = await postsApi.getMyPosts();
      setMyPosts(Array.isArray(data) ? data : data.content || []);
    } catch (err) {
      console.warn('My posts load error:', err);
    } finally {
      if (!silent) setMyPostsLoading(false);
    }
  }, [isProfessional]);

  // Fetch Resources
  const loadResources = useCallback(async (silent = false) => {
    if (!silent) setResourcesLoading(true);
    try {
      const data = await postsApi.getResources();
      setResources(Array.isArray(data) ? data : (data.content || []));
    } catch (err) {
      console.warn('Resources load error:', err);
    } finally {
      if (!silent) setResourcesLoading(false);
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
    if (tabId === 'mine') {
      const now = Date.now();
      setLastSeenMyPostsAt(now);
      try {
        localStorage.setItem('safespace_last_seen_my_posts', String(now));
      } catch {}
      loadMyPosts(myPosts.length > 0);
    }
    if (tabId === 'resources') loadResources(resources.length > 0);
  };

  useEffect(() => {
    if (activeTab === 'mine') {
      const now = Date.now();
      setLastSeenMyPostsAt(now);
      try {
        localStorage.setItem('safespace_last_seen_my_posts', String(now));
      } catch {}
    }
  }, [activeTab]);

  // My Posts Partitions & Dynamic Unread Badge
  const activeMyPosts = useMemo(() => myPosts.filter((p) => !p.archived), [myPosts]);
  const archivedMyPosts = useMemo(() => myPosts.filter((p) => !!p.archived), [myPosts]);

  const displayedMyPosts = useMemo(() => {
    if (myPostsFilter === 'ARCHIVED') return archivedMyPosts;
    return activeMyPosts;
  }, [myPostsFilter, activeMyPosts, archivedMyPosts]);

  const unseenMyPostsCount = useMemo(() => {
    if (activeTab === 'mine') return 0;
    if (!lastSeenMyPostsAt) return 0;
    return activeMyPosts.filter((p) => {
      const postTime = new Date(p.createdAt).getTime() || 0;
      return postTime > lastSeenMyPostsAt;
    }).length;
  }, [activeMyPosts, activeTab, lastSeenMyPostsAt]);

  // My Posts Action Handlers
  const handleArchivePost = async (postId) => {
    if (!postId) return;
    try {
      setPostActionLoadingId(`archive-${postId}`);
      await postsApi.archivePost(postId);
      showToast('Post moved to archive.');
      await loadMyPosts(true);
    } catch (err) {
      console.error('Failed to archive post:', err);
      showToast(err.message || 'Failed to archive post');
    } finally {
      setPostActionLoadingId(null);
    }
  };

  const handleRestorePost = async (postId) => {
    if (!postId) return;
    try {
      setPostActionLoadingId(`restore-${postId}`);
      await postsApi.unarchivePost(postId);
      showToast('Post restored to active posts.');
      await loadMyPosts(true);
    } catch (err) {
      console.error('Failed to restore post:', err);
      showToast(err.message || 'Failed to restore post');
    } finally {
      setPostActionLoadingId(null);
    }
  };

  const openDeleteModal = (post) => {
    setDeleteModal({
      open: true,
      postId: post.postId || post.id,
      pseudonym: post.pseudonym || 'Your Post',
      content: post.content ? (post.content.length > 80 ? post.content.substring(0, 80) + '…' : post.content) : ''
    });
  };

  const closeDeleteModal = () => {
    setDeleteModal({ open: false, postId: null, pseudonym: '', content: '' });
  };

  const handleConfirmDelete = async () => {
    if (!deleteModal.postId) return;
    try {
      setPostActionLoadingId(`delete-${deleteModal.postId}`);
      await postsApi.deletePost(deleteModal.postId);
      closeDeleteModal();
      showToast('Post permanently deleted.');
      await loadMyPosts(true);
    } catch (err) {
      console.error('Failed to delete post:', err);
      showToast(err.message || 'Failed to delete post');
    } finally {
      setPostActionLoadingId(null);
    }
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
        showToast('Your thoughts have been heard. Help is available.');
      } else {
        setAutoReplyData({
          flagged: false,
          autoReply: post.autoReply || "Thank you for sharing your thoughts in SafeSpace.",
          contextualResources: post.contextualResources || [],
          calmDownKit: post.calmDownKit
        });
        showToast('Your post has been shared anonymously.');
      }

      setCooldownSeconds(20);
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

  // Calm-Down Kit Controllers
  const openKit = (type) => {
    setActiveKit(type);
    setIsKitPaused(false);
    kitStepRef.current = 0;
    kitCountdownRef.current = 4;
    setKitStep(0);
    setBreathingCycle(1);
    setKitCountdown(4);
    setGroundingChecks({});
    setJournalSaved(false);
    setKitModalOpen(true);
    document.body.style.overflow = 'hidden';
    document.body.classList.add('kit-modal-open');
  };

  const closeKit = () => {
    if (kitTimerRef.current) clearInterval(kitTimerRef.current);
    setKitModalOpen(false);
    setActiveKit(null);
    document.body.style.overflow = '';
    document.body.classList.remove('kit-modal-open');
    showToast('Great job taking care of yourself.');
  };

  // Ensure body scroll lock and modal state are cleaned up on unmount
  useEffect(() => {
    return () => {
      document.body.style.overflow = '';
      document.body.classList.remove('kit-modal-open');
    };
  }, []);

  const handleSelectBreathingPhase = (phaseIndex) => {
    kitStepRef.current = phaseIndex;
    kitCountdownRef.current = 4;
    setKitStep(phaseIndex);
    setKitCountdown(4);
  };

  // Box Breathing Timer (Reliable non-nested phase sequencer)
  useEffect(() => {
    if (!kitModalOpen || activeKit !== 'breathing') return;

    kitTimerRef.current = setInterval(() => {
      if (isKitPaused) return;

      if (kitCountdownRef.current <= 1) {
        kitCountdownRef.current = 4;
        const nextStep = (kitStepRef.current + 1) % 4;
        kitStepRef.current = nextStep;
        if (nextStep === 0) {
          setBreathingCycle((c) => c + 1);
        }
        setKitStep(nextStep);
        setKitCountdown(4);
      } else {
        kitCountdownRef.current -= 1;
        setKitCountdown(kitCountdownRef.current);
      }
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
      {/* Toast Notification (Portaled for optimal responsive positioning across mobile & desktop) */}
      {toastMessage && createPortal(
        <div
          className="safespace-toast"
          id="safespaceToast"
          role="status"
          aria-live="polite"
        >
          <i className="fas fa-circle-check toast-icon"></i>
          <span className="toast-text">{toastMessage}</span>
          <button
            type="button"
            className="toast-dismiss-btn"
            onClick={() => setToastMessage('')}
            aria-label="Dismiss notification"
          >
            <i className="fas fa-xmark"></i>
          </button>
        </div>,
        document.body
      )}

      {/* Page Header */}
      <header className="rant-welcome" id="welcomeBanner">
        <div className="rant-welcome-inner">
          <div className="rant-welcome-left">
            <div className="rant-welcome-icon">
              <img src="/SafeSpace logo v2.svg" alt="SafeSpace Logo" className="brand-logo-img" />
            </div>
            <div>
              <h1>{isProfessional ? 'Student Expression Stream' : 'Community Reflections'}</h1>
              <p>
                {isProfessional
                  ? 'Observational clinical feed for campus sentiment tracking and early crisis detection.'
                  : 'An anonymous, confidential space to share thoughts, vent, and read shared student experiences.'}
              </p>
            </div>
          </div>
        </div>
      </header>

      {/* Tab Navigation */}
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
            {unseenMyPostsCount > 0 && (
              <span className="tab-count-pill" id="myPostsCount">{unseenMyPostsCount}</span>
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

      {/* Main Content */}
      <div className="rant-content">

        {/* TAB 1: Share */}
        {!isProfessional && activeTab === 'share' && (
          <div className="tab-panel active" id="panelShare">
            <div className="compose-studio">

              {/* Header */}
              <div className="compose-header">
                
                <div>
                  <h2>Express Yourself</h2>
                  <p>Your identity stays completely detached. Be honest; this is your safe space.</p>
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
                      <span className="energy-endpoint">Calm (1)</span>
                      <input
                        type="range"
                        id="energySlider"
                        min="1"
                        max="10"
                        value={energyScore}
                        style={{
                          background: `linear-gradient(to right, #7E9F9D 0%, #243E4C ${((energyScore - 1) / 9) * 100}%, #E1E8EB ${((energyScore - 1) / 9) * 100}%, #E1E8EB 100%)`
                        }}
                        onChange={(e) => setEnergyScore(parseInt(e.target.value, 10))}
                      />
                      <span className="energy-endpoint">Intense (10)</span>
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
                    <span>Your post is completely anonymous.</span>
                  </div>
                  <button
                    type="submit"
                    className={`btn-share ${contentBlocked ? 'blocked' : ''}`}
                    id="submitBtn"
                    disabled={isSubmitting || contentBlocked || !content.trim() || cooldownSeconds > 0}
                  >
                    {isSubmitting ? (
                      <>
                        <i className="fas fa-spinner fa-spin"></i> Posting...
                      </>
                    ) : cooldownSeconds > 0 ? (
                      <>
                        <i className="fas fa-wind"></i> Take a breath... ({cooldownSeconds}s)
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
                        We hear you, and we care about how you're feeling. Your post has been received. 
                        A counselor has been notified and may reach out to you through the{' '}
                        <Link to="/anon-chat" style={{ color: '#243E4C', fontWeight: 700, textDecoration: 'none', borderBottom: '1.5px solid #7E9F9D' }}>
                          Anonymous Chat
                        </Link>.
                      </p>
                      <p style={{ marginTop: '0.5rem', fontSize: '0.75rem', color: '#51646E' }}>
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
                              ? 'We noticed your energy is high: here are some immediate support options:'
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
                    <div style={{ marginTop: '1rem', background: '#F4F7F7', border: '1px solid #E1E8EB', borderRadius: '0.75rem', padding: '1rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.5rem' }}>
                      <div>
                        <div style={{ fontWeight: 700, fontSize: '0.88rem', color: '#182A34' }}>
                          <i className="fas fa-spa" style={{ marginRight: '6px', color: '#243E4C' }}></i> Recommended Calm-Down Exercise
                        </div>
                        <div style={{ fontSize: '0.8rem', color: '#51646E', marginTop: '2px' }}>
                          {autoReplyData.calmDownKit.exerciseType || 'Box Breathing'}. Take a moment to regain composure.
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => openKit(autoReplyData.calmDownKit.exerciseType === '5-4-3-2-1 Grounding' ? 'grounding' : autoReplyData.calmDownKit.exerciseType === 'Progressive Muscle Relaxation' ? 'muscle' : 'breathing')}
                        style={{ background: '#243E4C', color: '#fff', border: 'none', padding: '0.5rem 1rem', borderRadius: '0.5rem', fontWeight: 700, fontSize: '0.82rem', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
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

        {/* TAB 2: Peer Mirror Feed */}
        {(activeTab === 'feed' || isProfessional) && (
          <div className="tab-panel active" id="panelFeed">

            {/* Professional Stream Header */}
            {isProfessional && (
              <div id="proFeedHeader" style={{ display: 'flex', marginBottom: '1.25rem', padding: '0.9rem 1.25rem', background: '#FFFFFF', border: '1px solid #E1E8EB', borderRadius: '0.85rem', boxShadow: '0 2px 10px rgba(24,42,52,0.03)', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                  <div style={{ width: '2.25rem', height: '2.25rem', borderRadius: '0.6rem', background: '#F4F7F7', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#243E4C', fontSize: '1rem' }}>
                    <i className="fas fa-users-viewfinder"></i>
                  </div>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: '0.95rem', color: '#182A34' }}>Student Sentiment Stream</div>
                    <div style={{ fontSize: '0.78rem', color: '#51646E' }}>Real-time anonymous expressions &amp; emotional check-ins across campus</div>
                  </div>
                </div>
                <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#243E4C', background: '#F4F7F7', padding: '0.25rem 0.65rem', borderRadius: '0.35rem', border: '1px solid #E1E8EB', display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
                  <i className="fas fa-eye" style={{ color: '#243E4C' }}></i> Observational Stream
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
                    {e.label}
                  </button>
                ))}
              </div>
              <span style={{ fontSize: '0.72rem', color: '#728590' }} id="feedCount">
                {feedLoading ? 'Loading...' : `${feedTotalElements} post${feedTotalElements !== 1 ? 's' : ''}`}
              </span>
            </div>

            {/* Feed Cards Container */}
            <div id="feedContainer">
              {feedLoading && posts.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '3rem 1rem', color: '#51646E' }}>
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
                          {post.emotionTag}
                        </span>
                        <span className="post-meta-dot">•</span>
                        <span className={`tag-energy ${getEnergyTagClass(energyScoreVal)}`}>
                          Intensity {energyScoreVal}/10
                        </span>
                      </div>
                      {post.autoReply && (
                        <div className="post-reply">
                          <strong>SafeSpace Support:</strong> {post.autoReply}
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

        {/* TAB 3: My Posts */}
        {!isProfessional && activeTab === 'mine' && (
          <div className="tab-panel active" id="panelMine">
            {/* Sub-filter Bar */}
            <div className="my-posts-filter-bar">
              <button
                type="button"
                className={`my-posts-filter-pill ${myPostsFilter === 'ACTIVE' ? 'active' : ''}`}
                onClick={() => setMyPostsFilter('ACTIVE')}
              >
                Active Posts ({activeMyPosts.length})
              </button>
              <button
                type="button"
                className={`my-posts-filter-pill ${myPostsFilter === 'ARCHIVED' ? 'active' : ''}`}
                onClick={() => setMyPostsFilter('ARCHIVED')}
              >
                Archived ({archivedMyPosts.length})
              </button>
            </div>

            <div id="myPostsContainer">
              {myPostsLoading ? (
                <div style={{ textAlign: 'center', padding: '3rem 1rem', color: '#51646E' }}>
                  <i className="fas fa-spinner fa-spin" style={{ fontSize: '1.8rem', marginBottom: '0.75rem' }}></i>
                  <p>Loading your saved posts...</p>
                </div>
              ) : displayedMyPosts.length === 0 ? (
                <div className="my-posts-empty">
                  <i className={`fas ${myPostsFilter === 'ARCHIVED' ? 'fa-box-archive' : 'fa-inbox'}`}></i>
                  <p>
                    {myPostsFilter === 'ARCHIVED' ? (
                      <>You have no archived posts.<br />You can archive any post from the Active Posts tab.</>
                    ) : (
                      <>You haven't posted anything yet.<br />Share your thoughts in the <strong>Share</strong> tab.</>
                    )}
                  </p>
                </div>
              ) : (
                displayedMyPosts.map((post) => {
                  const initials = (post.pseudonym || 'AN').substring(0, 2).toUpperCase();
                  const timeAgo = getTimeAgo(post.createdAt);
                  const energyScoreVal = post.energyScore || 5;
                  const targetPostId = post.postId || post.id;
                  const isArchived = !!post.archived;

                  return (
                    <div key={post.id || post.postId} className={`post-card ${isArchived ? 'is-archived' : ''}`}>
                      <div className="post-header">
                        <div className="post-author">
                          <div className="post-avatar">{initials}</div>
                          <div className="post-author-meta">
                            <div className="post-name">{post.pseudonym}</div>
                            <div className="post-time">{timeAgo}</div>
                          </div>
                        </div>

                        {/* Top-Right Non-Overlapping Action Buttons */}
                        <div className="post-card-actions">
                          {isArchived ? (
                            <>
                              <button
                                type="button"
                                className="btn-post-action restore"
                                title="Restore to active posts"
                                aria-label="Restore post"
                                disabled={postActionLoadingId === `restore-${targetPostId}`}
                                onClick={() => handleRestorePost(targetPostId)}
                              >
                                {postActionLoadingId === `restore-${targetPostId}` ? (
                                  <i className="fas fa-spinner fa-spin"></i>
                                ) : (
                                  <i className="fas fa-rotate-left"></i>
                                )}
                              </button>
                              <button
                                type="button"
                                className="btn-post-action delete"
                                title="Permanently delete post"
                                aria-label="Delete post"
                                disabled={postActionLoadingId === `delete-${targetPostId}`}
                                onClick={() => openDeleteModal(post)}
                              >
                                <i className="fas fa-trash-alt"></i>
                              </button>
                            </>
                          ) : (
                            <>
                              <button
                                type="button"
                                className="btn-post-action archive"
                                title="Archive this post"
                                aria-label="Archive post"
                                disabled={postActionLoadingId === `archive-${targetPostId}`}
                                onClick={() => handleArchivePost(targetPostId)}
                              >
                                {postActionLoadingId === `archive-${targetPostId}` ? (
                                  <i className="fas fa-spinner fa-spin"></i>
                                ) : (
                                  <i className="fas fa-box-archive"></i>
                                )}
                              </button>
                              <button
                                type="button"
                                className="btn-post-action delete"
                                title="Permanently delete post"
                                aria-label="Delete post"
                                disabled={postActionLoadingId === `delete-${targetPostId}`}
                                onClick={() => openDeleteModal(post)}
                              >
                                <i className="fas fa-trash-alt"></i>
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                      <div className="post-body">{post.content}</div>
                      <div className="post-tags">
                        <span className="tag-emotion">
                          {post.emotionTag}
                        </span>
                        <span className="post-meta-dot">•</span>
                        <span className={`tag-energy ${getEnergyTagClass(energyScoreVal)}`}>
                          Intensity {energyScoreVal}/10
                        </span>
                        {isArchived && (
                          <>
                            <span className="post-meta-dot">•</span>
                            <span className="tag-archived">Archived</span>
                          </>
                        )}
                      </div>
                      {post.autoReply && (
                        <div className="post-reply">
                          <strong>SafeSpace Support:</strong> {post.autoReply}
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}

        {/* TAB 4: Calm-Down Kit */}
        {!isProfessional && activeTab === 'calm' && (
          <div className="tab-panel active" id="panelCalm">
            <div className="kit-grid">
              <div className="kit-card" data-kit="breathing" onClick={() => openKit('breathing')}>
                <div className="kit-icon breathing"><i className="fas fa-wind"></i></div>
                <h4>Slow Box Breathing</h4>
                <p>Breathe in, hold, and breathe out for 4 seconds</p>
              </div>
              <div className="kit-card" data-kit="grounding" onClick={() => openKit('grounding')}>
                <div className="kit-icon grounding"><i className="fas fa-hand"></i></div>
                <h4>5-4-3-2-1 Grounding</h4>
                <p>Use your 5 senses to feel calm and peaceful</p>
              </div>
              <div className="kit-card" data-kit="muscle" onClick={() => openKit('muscle')}>
                <div className="kit-icon muscle"><i className="fas fa-child-reaching"></i></div>
                <h4>Muscle Relaxation</h4>
                <p>Tighten and relax your body to let go of stress</p>
              </div>
              <div className="kit-card" data-kit="journal" onClick={() => openKit('journal')}>
                <div className="kit-icon journal"><i className="fas fa-pen-fancy"></i></div>
                <h4>3 Good Things Journal</h4>
                <p>Write 3 small things you are thankful for today</p>
              </div>
            </div>
          </div>
        )}

        {/* TAB 5: Resources */}
        {!isProfessional && activeTab === 'resources' && (
          <div className="tab-panel active" id="panelResources">
            <div className="resources-browser-card">
              <h2><i className="fas fa-hand-holding-heart"></i> Wellness Resources</h2>
              <p className="resources-subtitle">Support resources available to you: hotlines, campus services, and professional support.</p>
              
              {resourcesLoading ? (
                <div id="studentResourceEmpty" style={{ textAlign: 'center', padding: '2rem', color: '#728590' }}>
                  <i className="fas fa-spinner fa-spin" style={{ fontSize: '1.5rem' }}></i>
                  <p style={{ marginTop: '0.5rem' }}>Loading resources...</p>
                </div>
              ) : resources.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '2rem', color: '#728590' }}>
                  <i className="fas fa-box-open" style={{ fontSize: '1.5rem' }}></i>
                  <p style={{ marginTop: '0.5rem' }}>No resources available at this time.</p>
                </div>
              ) : (
                <div id="studentResourceGrid" style={{ display: 'grid', gap: '0.75rem', marginTop: '1rem' }}>
                  {[...resources]
                    .sort((a, b) => {
                      const aIsCrisis = Boolean(a.crisisOnly || (a.title && a.title.toLowerCase().includes('crisis text line')));
                      const bIsCrisis = Boolean(b.crisisOnly || (b.title && b.title.toLowerCase().includes('crisis text line')));
                      if (aIsCrisis && !bIsCrisis) return -1;
                      if (!aIsCrisis && bIsCrisis) return 1;

                      const pA = a.priority !== undefined && a.priority !== null ? a.priority : 999;
                      const pB = b.priority !== undefined && b.priority !== null ? b.priority : 999;
                      if (pA !== pB) return pA - pB;

                      return (a.title || '').localeCompare(b.title || '');
                    })
                    .map((res, i) => renderResourceCard(res, res.id || i))}
                </div>
              )}
            </div>
          </div>
        )}

      </div>

      {/* ══════════════════════════════════════════════ */}
      {/* CALM-DOWN KIT MODAL */}
      {/* ══════════════════════════════════════════════ */}
      {/* ══════════════════════════════════════════════ */}
      {/* CALM-DOWN KIT MODAL (Portaled to root) */}
      {/* ══════════════════════════════════════════════ */}
      {kitModalOpen && activeKit && createPortal(
        <div 
          className="kit-modal-overlay active" 
          id="kitModalOverlay"
          onClick={(e) => {
            if (e.target.id === 'kitModalOverlay') closeKit();
          }}
        >
          <div className="kit-modal" id="kitModal" role="dialog" aria-modal="true" aria-labelledby="kitModalTitle">
            <div className="kit-modal-header">
              <div className="kit-modal-header-info">
                <div className={`kit-modal-badge ${activeKit}`} id="kitModalBadge">
                  <i className={
                    activeKit === 'breathing' ? 'fas fa-wind' :
                    activeKit === 'grounding' ? 'fas fa-hand' :
                    activeKit === 'muscle' ? 'fas fa-child-reaching' : 'fas fa-pen-fancy'
                  } id="kitModalIcon"></i>
                </div>
                <div>
                  <h3 id="kitModalTitle">
                    {activeKit === 'breathing' && 'Slow Box Breathing (4-4-4-4)'}
                    {activeKit === 'grounding' && '5-4-3-2-1 Sensory Grounding'}
                    {activeKit === 'muscle' && 'Muscle Relaxation'}
                    {activeKit === 'journal' && '3 Good Things Journal'}
                  </h3>
                  <p id="kitModalSubtitle">
                    {activeKit === 'breathing' && 'Slow down your breathing to help your mind and body relax.'}
                    {activeKit === 'grounding' && 'Pause and notice the simple things around you right now.'}
                    {activeKit === 'muscle' && 'Tighten and then relax your muscles to let go of body stress.'}
                    {activeKit === 'journal' && 'Take a quiet moment to write down 3 good things in your day.'}
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
                <div className="breathing-content-box">
                  <div className="breathing-sphere-wrap">
                    <div className="breathing-ring-outer"></div>
                    <div className={`breathing-sphere ${BOX_BREATHING_DATA[kitStep].phaseClass}`} id="breathingSphere">
                      <span className="breathing-count" id="breathingCount">{kitCountdown}</span>
                      <span className="breathing-label" id="breathingSphereLabel">{BOX_BREATHING_DATA[kitStep].sphereText}</span>
                    </div>
                  </div>
                  <div className="kit-phase-instruction" id="breathingPhaseName">{BOX_BREATHING_DATA[kitStep].name}</div>
                  <div className="kit-phase-sub" id="breathingPhaseSub">{BOX_BREATHING_DATA[kitStep].sub}</div>
                  <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '0.65rem' }}>
                    <span style={{ background: '#F4F7F7', color: '#243E4C', border: '1px solid #E1E8EB', padding: '0.25rem 0.85rem', borderRadius: '0.4rem', fontSize: '0.78rem', fontWeight: 700 }} id="breathingCycleCounter">
                      Cycle {breathingCycle}
                    </span>
                  </div>
                  <div className="box-phases-bar">
                    <button
                      type="button"
                      className={`box-phase-chip ${kitStep === 0 ? 'active' : ''}`}
                      onClick={() => handleSelectBreathingPhase(0)}
                    >
                      Inhale 4s
                    </button>
                    <button
                      type="button"
                      className={`box-phase-chip ${kitStep === 1 ? 'active' : ''}`}
                      onClick={() => handleSelectBreathingPhase(1)}
                    >
                      Hold 4s
                    </button>
                    <button
                      type="button"
                      className={`box-phase-chip ${kitStep === 2 ? 'active' : ''}`}
                      onClick={() => handleSelectBreathingPhase(2)}
                    >
                      Exhale 4s
                    </button>
                    <button
                      type="button"
                      className={`box-phase-chip ${kitStep === 3 ? 'active' : ''}`}
                      onClick={() => handleSelectBreathingPhase(3)}
                    >
                      Hold 4s
                    </button>
                  </div>
                </div>
              )}

              {/* 2. 5-4-3-2-1 Sensory Grounding UI */}
              {activeKit === 'grounding' && (
                <div className="grounding-content-box">
                  <div className="grounding-step-tabs" role="tablist" aria-label="Grounding senses">
                    {GROUNDING_DATA.map((d, idx) => (
                      <button
                        key={idx}
                        type="button"
                        className={`grounding-step-tab ${idx === kitStep ? 'active' : idx < kitStep ? 'completed' : ''}`}
                        onClick={() => setKitStep(idx)}
                        aria-label={`Step ${idx + 1}: ${d.prompt}`}
                      >
                        <span className="grounding-tab-count">{d.count}</span>
                        <span className="grounding-tab-sense">{d.sense}</span>
                      </button>
                    ))}
                  </div>

                  <div className="grounding-header-box">
                    <div className="grounding-header-icon">
                      <i className={GROUNDING_DATA[kitStep].icon}></i>
                    </div>
                    <h4 className="grounding-header-title">{GROUNDING_DATA[kitStep].prompt}</h4>
                    <p className="grounding-header-desc">{GROUNDING_DATA[kitStep].desc}</p>
                  </div>

                  <div className="grounding-items-list">
                    {GROUNDING_DATA[kitStep].items.map((itemText, i) => {
                      const key = `${kitStep}-${i}`;
                      const isChecked = Boolean(groundingChecks[key]);

                      return (
                        <div
                          key={i}
                          className={`grounding-item-card ${isChecked ? 'checked' : ''}`}
                          onClick={() => setGroundingChecks((prev) => ({ ...prev, [key]: !prev[key] }))}
                          role="checkbox"
                          aria-checked={isChecked}
                          tabIndex={0}
                        >
                          <i className={isChecked ? 'fas fa-circle-check' : 'far fa-circle'}></i>
                          <span>{itemText}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* 3. Progressive Muscle Relaxation UI */}
              {activeKit === 'muscle' && (
                <div className="pmr-content-box">
                  <div className="pmr-step-tabs" role="tablist" aria-label="Muscle steps">
                    {PMR_DATA.map((d, idx) => (
                      <button
                        key={idx}
                        type="button"
                        className={`pmr-step-tab ${idx === kitStep ? 'active' : idx < kitStep ? 'completed' : ''}`}
                        onClick={() => setKitStep(idx)}
                        aria-label={`Step ${idx + 1}: ${d.target}`}
                      >
                        {idx + 1}
                      </button>
                    ))}
                  </div>

                  <div className="pmr-icon-wrap">
                    <i className={`fas ${PMR_DATA[kitStep].icon}`}></i>
                  </div>
                  <h4 className="pmr-step-title">
                    Step {kitStep + 1} of {PMR_DATA.length}: {PMR_DATA[kitStep].target}
                  </h4>
                  
                  <div className="pmr-tense-card">
                    <strong>Squeeze (5s):</strong> {PMR_DATA[kitStep].tenseTip}
                  </div>

                  <div className="pmr-release-card">
                    <strong>Relax (10s):</strong> {PMR_DATA[kitStep].releaseTip}
                  </div>
                </div>
              )}

              {/* 4. 3 Good Things Journal UI */}
              {activeKit === 'journal' && (
                <div className="journal-content-box">
                  <p className="journal-intro-text">
                    Take a slow breath. Write down 3 small things that made you smile or feel thankful today:
                  </p>

                  <div className="journal-inputs-group">
                    <div className="journal-input-wrap">
                      <span className="journal-input-num">1</span>
                      <input
                        type="text"
                        className="journal-text-input"
                        placeholder="A kind person, sweet moment, or someone who helped..."
                        value={journalEntries.one}
                        onChange={(e) => setJournalEntries({ ...journalEntries, one: e.target.value })}
                        aria-label="Good thing 1"
                      />
                    </div>
                    <div className="journal-input-wrap">
                      <span className="journal-input-num">2</span>
                      <input
                        type="text"
                        className="journal-text-input"
                        placeholder="Something nice you saw, heard, or tasted today..."
                        value={journalEntries.two}
                        onChange={(e) => setJournalEntries({ ...journalEntries, two: e.target.value })}
                        aria-label="Good thing 2"
                      />
                    </div>
                    <div className="journal-input-wrap">
                      <span className="journal-input-num">3</span>
                      <input
                        type="text"
                        className="journal-text-input"
                        placeholder="Something you did well, or a kind thought for yourself..."
                        value={journalEntries.three}
                        onChange={(e) => setJournalEntries({ ...journalEntries, three: e.target.value })}
                        aria-label="Good thing 3"
                      />
                    </div>
                  </div>

                  {journalSaved && (
                    <div className="journal-saved-alert">
                      <i className="fas fa-circle-check"></i>
                      <span>Saved! You did a great job taking this quiet moment for yourself.</span>
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="kit-modal-footer" id="kitModalFooter">
              {activeKit === 'breathing' && (
                <>
                  <button type="button" className="btn-kit-secondary" onClick={closeKit}>
                    Finished
                  </button>
                  <button type="button" className="btn-kit-primary" onClick={() => setIsKitPaused(!isKitPaused)}>
                    {isKitPaused ? 'Resume' : 'Pause'}
                  </button>
                </>
              )}

              {activeKit === 'grounding' && (
                <>
                  <button type="button" className="btn-kit-secondary" onClick={closeKit}>
                    Close
                  </button>
                  <button
                    type="button"
                    className="btn-kit-primary"
                    onClick={() => {
                      if (kitStep < GROUNDING_DATA.length - 1) setKitStep(kitStep + 1);
                      else closeKit();
                    }}
                  >
                    {kitStep < GROUNDING_DATA.length - 1 ? 'Next Step →' : 'Finish'}
                  </button>
                </>
              )}

              {activeKit === 'muscle' && (
                <>
                  <button type="button" className="btn-kit-secondary" onClick={closeKit}>
                    Close
                  </button>
                  <button
                    type="button"
                    className="btn-kit-primary"
                    onClick={() => {
                      if (kitStep < PMR_DATA.length - 1) setKitStep(kitStep + 1);
                      else closeKit();
                    }}
                  >
                    {kitStep < PMR_DATA.length - 1 ? 'Next Step →' : 'Finish'}
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
                    Save My 3 Things
                  </button>
                </>
              )}
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Delete Post Confirmation Modal (Portaled) */}
      {deleteModal.open && createPortal(
        <div className="modal-backdrop active" id="deletePostModal">
          <div className="modal-box delete-modal-box">
            <div className="delete-modal-icon">
              <i className="fas fa-triangle-exclamation"></i>
            </div>
            <h3 style={{ margin: '0 0 0.5rem', color: '#182A34', fontSize: '1.15rem' }}>
              Permanently Delete Post?
            </h3>
            <p className="delete-modal-desc">
              Are you sure you want to delete this post?
              {deleteModal.content && (
                <span style={{ display: 'block', fontStyle: 'italic', color: '#51646E', marginTop: '0.4rem' }}>
                  "{deleteModal.content}"
                </span>
              )}
            </p>
            <div className="delete-modal-warning">
              <i className="fas fa-info-circle"></i>
              <span>
                This action cannot be undone. This reflection will be permanently erased from your safe space account.
              </span>
            </div>
            <div className="modal-btns">
              <button
                type="button"
                className="cancel"
                onClick={closeDeleteModal}
                disabled={!!postActionLoadingId}
              >
                Cancel
              </button>
              <button
                type="button"
                className="confirm delete-confirm-btn"
                onClick={handleConfirmDelete}
                disabled={!!postActionLoadingId}
              >
                {postActionLoadingId?.startsWith('delete-') ? (
                  <><i className="fas fa-spinner fa-spin"></i> Deleting...</>
                ) : (
                  <><i className="fas fa-trash-alt"></i> Delete Permanently</>
                )}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
