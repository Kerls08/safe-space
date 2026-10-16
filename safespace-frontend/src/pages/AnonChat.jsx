import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { chatApi } from '../services/api';
import '../styles/chat.css';

function generateRandomPseudonym() {
  const seeds = ['Willow', 'Nova', 'Echo', 'Sol', 'River', 'Sky', 'Leaf', 'Sage', 'Mira', 'Kai', 'Harbor', 'Breeze'];
  const seed = seeds[Math.floor(Math.random() * seeds.length)];
  const num = Math.floor(Math.random() * 9000 + 1000);
  return `Anon-${seed}-${num}`;
}

const CANNED_RESPONSES = [
  "I am listening, take all the time you need.",
  "You are safe here. What you are feeling is completely valid.",
  "Let's pause and take a gentle deep breath together.",
  "Can you tell me a little more about what triggered this feeling?"
];

function formatTime(timestamp) {
  if (!timestamp) return '';
  const d = new Date(timestamp);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export default function AnonChat() {
  const location = useLocation();
  const { role, username, fullName, updateBadge } = useAuth();
  const isProfessional = role === 'PROFESSIONAL' || role === 'SUPER_ADMIN';

  // Sessions list & active session
  const [sessions, setSessions] = useState([]);
  const [activeSessionId, setActiveSessionId] = useState(null);
  const [activeSession, setActiveSession] = useState(null);
  const activeSessionIdRef = useRef(activeSessionId);
  useEffect(() => {
    activeSessionIdRef.current = activeSessionId;
  }, [activeSessionId]);

  const handleSelectSession = useCallback((sid) => {
    setActiveSessionId(sid);
    if (!isProfessional && sid) {
      const seenInvites = new Set(JSON.parse(localStorage.getItem('safespace_seen_invites') || '[]'));
      seenInvites.add(sid);
      localStorage.setItem('safespace_seen_invites', JSON.stringify(Array.from(seenInvites)));

      setSessions((prevSessions) => {
        let remaining = 0;
        prevSessions.forEach((s) => {
          if (s.sessionId === sid) return;
          if (s.status === 'INVITED') {
            if (!seenInvites.has(s.sessionId)) remaining++;
          } else if (s.status !== 'CLOSED' && s.status !== 'DECLINED' && (s.unreadCount || 0) > 0) {
            remaining += s.unreadCount;
          }
        });
        updateBadge('anon-chat', remaining);
        return prevSessions;
      });
    }
  }, [isProfessional, updateBadge]);
  const [messages, setMessages] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterTab, setFilterTab] = useState('all'); // 'all' | 'unread' | 'checkin' | 'waiting'
  const [counselorOnline, setCounselorOnline] = useState(false);

  // Composer
  const [messageText, setMessageText] = useState('');
  const [isSending, setIsSending] = useState(false);
  const messagesEndRef = useRef(null);

  // Modals
  const [newChatModalOpen, setNewChatModalOpen] = useState(false);
  const [choiceModalOpen, setChoiceModalOpen] = useState(false);
  const [pendingChoiceSession, setPendingChoiceSession] = useState(null);
  const [modalTopic, setModalTopic] = useState('');
  const [modalEmotion, setModalEmotion] = useState('Neutral');
  const [modalEnergy, setModalEnergy] = useState('5');
  const [modalPseudonym, setModalPseudonym] = useState(() => {
    const stored = JSON.parse(localStorage.getItem('safespace_pseudonyms') || '[]');
    return stored[0] || generateRandomPseudonym();
  });
  const [isCreatingSession, setIsCreatingSession] = useState(false);
  const [endSessionModalOpen, setEndSessionModalOpen] = useState(false);

  // Outreach Invite Modal (Student)
  const [inviteModalOpen, setInviteModalOpen] = useState(false);
  const [inviteModalSession, setInviteModalSession] = useState(null);

  // Mobile / Contextmenu Session Options Sheet
  const [optionsModalOpen, setOptionsModalOpen] = useState(false);
  const [optionsModalSession, setOptionsModalSession] = useState(null);
  const [optionsModalMsg, setOptionsModalMsg] = useState(null);

  const handleOpenOptionsModal = (session, msg = null) => {
    setOptionsModalSession(session);
    setOptionsModalMsg(msg);
    setOptionsModalOpen(true);
  };

  // Delete Confirmation & Decline Reassurance Modals
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [deleteModalSessionId, setDeleteModalSessionId] = useState(null);
  const [deleteModalLoading, setDeleteModalLoading] = useState(false);
  const [declineHotlineModalOpen, setDeclineHotlineModalOpen] = useState(false);
  const [toastMessage, setToastMessage] = useState('');

  const showToast = (msg) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(''), 3000);
  };

  // Auto-scroll messages
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Load sessions list
  const loadSessions = useCallback(async () => {
    try {
      if (isProfessional) {
        const data = await chatApi.getProfessionalSessions(username || '');
        const combined = [
          ...(data.waiting || []),
          ...(data.invited || []),
          ...(data.active || [])
        ];
        const unique = [];
        const seen = new Set();
        for (const s of combined) {
          if (!seen.has(s.sessionId)) {
            seen.add(s.sessionId);
            unique.push(s);
          }
        }
        setSessions(unique);
      } else {
        const pseudonyms = JSON.parse(localStorage.getItem('safespace_pseudonyms') || '[]');
        const map = new Map();

        for (const p of pseudonyms) {
          try {
            const list = await chatApi.getStudentSessions(p);
            (list || []).forEach((s) => map.set(s.sessionId, s));
          } catch (e) { /* ignore */ }
        }

        if (username) {
          try {
            const userSessions = await chatApi.getUserSessions(username);
            (userSessions || []).forEach((s) => {
              map.set(s.sessionId, s);
              // Save pseudonym
              if (s.studentPseudonym && !pseudonyms.includes(s.studentPseudonym)) {
                pseudonyms.unshift(s.studentPseudonym);
                localStorage.setItem('safespace_pseudonyms', JSON.stringify(pseudonyms));
              }
            });
          } catch (e) { /* ignore */ }
        }

        const sessionList = Array.from(map.values());
        setSessions(sessionList);

        const currentActiveId = activeSessionIdRef.current;
        const seenInvites = new Set(JSON.parse(localStorage.getItem('safespace_seen_invites') || '[]'));
        if (currentActiveId && !seenInvites.has(currentActiveId)) {
          seenInvites.add(currentActiveId);
          localStorage.setItem('safespace_seen_invites', JSON.stringify(Array.from(seenInvites)));
        }

        let studentUnviewed = 0;
        sessionList.forEach((s) => {
          if (s.sessionId === currentActiveId) return;
          if (s.status === 'INVITED') {
            if (!seenInvites.has(s.sessionId)) studentUnviewed++;
          } else if (s.status !== 'CLOSED' && s.status !== 'DECLINED' && (s.unreadCount || 0) > 0) {
            studentUnviewed += s.unreadCount;
          }
        });
        updateBadge('anon-chat', studentUnviewed);
      }
    } catch (e) {
      console.warn('Failed to load sessions:', e);
    }
  }, [isProfessional, username, updateBadge]);

  // For professionals, clear badge on mount & set lastSeen timestamp
  useEffect(() => {
    if (isProfessional) {
      updateBadge('anon-chat', 0);
      localStorage.setItem('safespace_last_seen_pro_chat', new Date().toISOString());
    }
  }, [updateBadge, isProfessional]);

  // Initial boot and counselor heartbeat
  useEffect(() => {
    loadSessions();

    const sessionPollTimer = setInterval(() => {
      loadSessions();
    }, 4000);

    let heartbeatTimer = null;
    if (isProfessional) {
      chatApi.heartbeat(username || '');
      heartbeatTimer = setInterval(() => {
        chatApi.heartbeat(username || '');
      }, 30000);
    }
    return () => {
      clearInterval(sessionPollTimer);
      if (heartbeatTimer) clearInterval(heartbeatTimer);
    };
  }, [loadSessions, isProfessional, username]);

  // Handle URL query param: ?session=...
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const sid = params.get('session');
    if (sid) {
      handleSelectSession(sid);
    }
  }, [location.search, handleSelectSession]);

  // Poll messages and session state
  useEffect(() => {
    if (!activeSessionId) {
      setActiveSession(null);
      setMessages([]);
      return;
    }

    let isMounted = true;

    const fetchSessionData = async () => {
      try {
        const viewerType = isProfessional ? 'professional' : 'student';
        const sessionData = await chatApi.getSession(activeSessionId);
        const msgList = await chatApi.getMessages(activeSessionId, viewerType);
        
        if (isMounted) {
          if (isProfessional && activeSession && activeSession.status === 'INVITED' && sessionData.status === 'ACTIVE') {
            showToast(`Student ${sessionData.studentPseudonym || 'Anonymous'} accepted the outreach invitation! Active counseling session is ready 💚`);
            loadSessions();
          }
          setActiveSession(sessionData);
          setMessages(msgList || []);
        }
      } catch (e) {
        console.warn('Error fetching chat messages:', e);
      }
    };

    fetchSessionData();
    const interval = setInterval(fetchSessionData, 3000);

    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [activeSessionId, isProfessional]);

  // Check counselor availability
  useEffect(() => {
    if (!isProfessional && activeSessionId) {
      chatApi.checkCounselorAvailable().then((res) => {
        setCounselorOnline(Boolean(res && res.available));
      }).catch(() => setCounselorOnline(false));
    }
  }, [isProfessional, activeSessionId]);

  // Send message
  const handleSendMessage = async (textToSend) => {
    const text = (textToSend || messageText).trim();
    if (!text || !activeSessionId || isSending) return;

    setIsSending(true);
    try {
      const sender = isProfessional
        ? fullName || username || 'Lead Psychometrician, RPM'
        : activeSession?.studentPseudonym || 'Student';

      const sentMsg = await chatApi.sendMessage(activeSessionId, {
        content: text,
        senderType: isProfessional ? 'professional' : 'student',
        senderName: sender
      });

      setMessages((prev) => [...prev, sentMsg]);
      setMessageText('');
    } catch (err) {
      showToast(err.message || 'Failed to send message.');
    } finally {
      setIsSending(false);
    }
  };

  // Trigger New Chat with existing session guard (Student)
  const triggerOpenNewChat = (topic = '') => {
    if (isProfessional) return;
    const openSession = sessions.find((s) => s.status === 'WAITING' || s.status === 'ACTIVE' || s.status === 'INVITED');
    if (openSession) {
      setPendingChoiceSession(openSession);
      setChoiceModalOpen(true);
      return;
    }
    if (topic) setModalTopic(topic);
    setNewChatModalOpen(true);
  };

  const handleResumeCurrentSession = () => {
    if (pendingChoiceSession) {
      handleSelectSession(pendingChoiceSession.sessionId);
    }
    setChoiceModalOpen(false);
    setPendingChoiceSession(null);
  };

  const handleEndOldAndStartNew = async () => {
    if (pendingChoiceSession) {
      try {
        await chatApi.closeSession(pendingChoiceSession.sessionId, 'student');
        loadSessions();
      } catch (e) {
        console.warn('Error closing old session:', e);
      }
    }
    setChoiceModalOpen(false);
    setPendingChoiceSession(null);
    setNewChatModalOpen(true);
  };

  // Create session (Student)
  const handleCreateSession = async () => {
    const topic = modalTopic.trim() || 'General emotional support';
    const chosenPseudo = modalPseudonym.trim() || generateRandomPseudonym();

    setIsCreatingSession(true);
    try {
      const stored = JSON.parse(localStorage.getItem('safespace_pseudonyms') || '[]');
      if (!stored.includes(chosenPseudo)) {
        stored.unshift(chosenPseudo);
        localStorage.setItem('safespace_pseudonyms', JSON.stringify(stored));
      }

      const newSession = await chatApi.createSession({
        pseudonym: chosenPseudo,
        studentPseudonym: chosenPseudo,
        studentUserId: username,
        userId: username,
        topic,
        emotionTag: modalEmotion,
        energyScore: parseInt(modalEnergy, 10)
      });

      setNewChatModalOpen(false);
      setModalTopic('');
      handleSelectSession(newSession.sessionId);
      loadSessions();
    } catch (err) {
      showToast(err.message || 'Failed to create chat session.');
    } finally {
      setIsCreatingSession(false);
    }
  };

  // Accept session (Counselor)
  const handleAcceptSession = async (sid) => {
    try {
      await chatApi.acceptSession(sid, username, fullName || 'Campus Counselor');
      loadSessions();
      setActiveSessionId(sid);
    } catch (err) {
      showToast(err.message || 'Failed to accept session.');
    }
  };

  // Accept outreach invite (Student)
  const handleAcceptInvite = async () => {
    if (!activeSessionId) return;
    try {
      await chatApi.acceptInvite(activeSessionId);
      loadSessions();
      // Reload session
      const updated = await chatApi.getSession(activeSessionId);
      setActiveSession(updated);
    } catch (err) {
      showToast(err.message || 'Failed to accept invite.');
    }
  };

  // Decline outreach invite (Student)
  const handleDeclineInvite = async () => {
    if (!activeSessionId) return;
    try {
      await chatApi.declineInvite(activeSessionId);
      loadSessions();
      const updated = await chatApi.getSession(activeSessionId);
      setActiveSession(updated);
      setDeclineHotlineModalOpen(true);
    } catch (err) {
      showToast(err.message || 'Failed to decline invite.');
    }
  };

  // End session
  const handleExecuteEndSession = async () => {
    if (!activeSessionId) return;
    try {
      await chatApi.closeSession(activeSessionId, isProfessional ? 'professional' : 'student');
      setEndSessionModalOpen(false);
      loadSessions();
      const updated = await chatApi.getSession(activeSessionId);
      setActiveSession(updated);
    } catch (err) {
      showToast(err.message || 'Failed to end session.');
    }
  };

  // Delete session modal controls
  const handleOpenDeleteModal = (sid) => {
    setDeleteModalSessionId(sid || activeSessionId);
    setDeleteModalOpen(true);
  };

  const closeDeleteConfirmModal = () => {
    setDeleteModalOpen(false);
    setDeleteModalSessionId(null);
  };

  const handleExecuteDeleteSession = async () => {
    if (!deleteModalSessionId) return;
    setDeleteModalLoading(true);
    try {
      const targetId = deleteModalSessionId;
      const targetSession = sessions.find((s) => s.sessionId === targetId);
      const pseud = targetSession ? targetSession.studentPseudonym : (modalPseudonym || '');
      await chatApi.deleteSession(targetId, pseud);

      setDeleteModalOpen(false);
      setDeleteModalSessionId(null);

      if (targetId === activeSessionId) {
        setActiveSessionId(null);
        setActiveSession(null);
      }
      loadSessions();
      showToast(isProfessional ? 'Conversation removed from your queue.' : 'Conversation removed from your view.');
    } catch (err) {
      showToast(err.message || 'Failed to delete conversation.');
    } finally {
      setDeleteModalLoading(false);
    }
  };

  // Filtered sessions
  const filteredSessions = sessions.filter((s) => {
    // Tab filter
    if (filterTab === 'unread') {
      const seenInvites = new Set(JSON.parse(localStorage.getItem('safespace_seen_invites') || '[]'));
      const isUnviewedInvite = !isProfessional && s.status === 'INVITED' && !seenInvites.has(s.sessionId);
      if ((s.unreadCount || 0) === 0 && !isUnviewedInvite) return false;
    } else if (filterTab === 'checkin') {
      if (s.status !== 'INVITED' && !(s.topic && s.topic.includes('Outreach'))) return false;
    } else if (filterTab === 'waiting' && isProfessional) {
      if (s.status !== 'WAITING') return false;
    }

    // Search query filter
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const name = (s.studentPseudonym || '').toLowerCase();
      const pro = (s.professionalName || '').toLowerCase();
      const topic = (s.topic || '').toLowerCase();
      return name.includes(q) || pro.includes(q) || topic.includes(q);
    }
    return true;
  });

  return (
    <div className={`chat-layout ${activeSessionId ? 'mobile-chat-active' : ''}`} id="chatLayout">
      {/* ── Sidebar ── */}
      <aside className="chat-sidebar" id="chatSidebar">
        <div className="sidebar-header">
          <div className="sidebar-header-top">
            <h2 className="sidebar-header-title">Chats</h2>
            <div className="sidebar-header-actions">
              <button
                type="button"
                className="sidebar-icon-btn"
                title="Sanctuary Lounge"
                onClick={() => {
                  setActiveSessionId(null);
                  setActiveSession(null);
                  if (!isProfessional) {
                    const seenInvites = new Set(JSON.parse(localStorage.getItem('safespace_seen_invites') || '[]'));
                    let unviewed = 0;
                    sessions.forEach((s) => {
                      if (s.status === 'INVITED') {
                        if (!seenInvites.has(s.sessionId)) unviewed++;
                      } else if (s.status !== 'CLOSED' && s.status !== 'DECLINED' && (s.unreadCount || 0) > 0) {
                        unviewed += s.unreadCount;
                      }
                    });
                    updateBadge('anon-chat', unviewed);
                  }
                }}
              >
                <i className="fas fa-house"></i>
              </button>
              {!isProfessional && (
                <button
                  type="button"
                  className="sidebar-icon-btn primary"
                  id="newChatBtn"
                  title="New Conversation"
                  onClick={() => triggerOpenNewChat()}
                >
                  <i className="fas fa-pen-to-square"></i>
                </button>
              )}
            </div>
          </div>

          {/* Search Box */}
          <div className="sidebar-search-box">
            <i className="fas fa-magnifying-glass search-icon"></i>
            <input
              type="text"
              id="chatSearchInput"
              className="sidebar-search-input"
              placeholder="Search conversations..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            {searchQuery && (
              <button
                type="button"
                className="sidebar-search-clear"
                onClick={() => setSearchQuery('')}
                title="Clear search"
                style={{ display: 'inline-flex' }}
              >
                <i className="fas fa-xmark"></i>
              </button>
            )}
          </div>

          {/* Filter Pills */}
          <div className="sidebar-filter-tabs">
            <button
              type="button"
              className={`filter-tab-pill ${filterTab === 'all' ? 'active' : ''}`}
              onClick={() => setFilterTab('all')}
            >
              All
            </button>
            <button
              type="button"
              className={`filter-tab-pill ${filterTab === 'unread' ? 'active' : ''}`}
              onClick={() => setFilterTab('unread')}
            >
              Unread
            </button>
            {!isProfessional ? (
              <button
                type="button"
                id="filterTabCheckin"
                className={`filter-tab-pill ${filterTab === 'checkin' ? 'active' : ''} ${sessions.some((s) => s.status === 'INVITED') && filterTab !== 'checkin' ? 'highlighted' : ''}`}
                onClick={() => setFilterTab('checkin')}
              >
                Counselor Check-in
              </button>
            ) : (
              <button
                type="button"
                className={`filter-tab-pill ${filterTab === 'waiting' ? 'active' : ''}`}
                onClick={() => setFilterTab('waiting')}
              >
                Waiting Queue
              </button>
            )}
          </div>
        </div>

        {/* Sessions List */}
        <div className="sidebar-list" id="sessionList">
          {filteredSessions.length === 0 ? (
            <div className="sidebar-empty" id="sidebarEmpty" style={{ display: 'flex' }}>
              <i className="fas fa-comment-slash"></i>
              <p>
                {isProfessional
                  ? 'No sessions in queue.<br>Waiting for students...'
                  : 'No conversations yet.<br>Start one to talk anonymously.'}
              </p>
            </div>
          ) : (
            filteredSessions.map((s) => {
              const seenInvites = new Set(JSON.parse(localStorage.getItem('safespace_seen_invites') || '[]'));
              const isSelected = s.sessionId === activeSessionId;
              const isUnviewedInvite = !isProfessional && s.status === 'INVITED' && !seenInvites.has(s.sessionId);
              const hasUnread = ((s.unreadCount || 0) > 0 || isUnviewedInvite) && !isSelected;
              const displayCount = (s.unreadCount || 0) > 0 ? s.unreadCount : (isUnviewedInvite ? 1 : 0);
              const initials = (s.studentPseudonym || 'AN').split('-').slice(1, 2).join('').substring(0, 2).toUpperCase() || 'AN';
              const time = formatTime(s.lastMessageAt || s.createdAt);
              const statusClass = s.status ? s.status.toLowerCase() : 'waiting';
              const statusLabel = s.status === 'INVITED' ? 'CHECK-IN' : s.status;
              const avatarClass = s.crisisFlag ? 'crisis' : (s.status === 'INVITED' ? 'invited' : (s.status === 'WAITING' ? 'waiting' : (s.status === 'ACTIVE' ? 'active' : '')));

              return (
                <div
                  key={s.sessionId}
                  className={`session-card ${isSelected ? 'active' : ''} ${hasUnread ? 'has-unread' : ''}`}
                  onClick={() => {
                    handleSelectSession(s.sessionId);
                  }}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    handleOpenOptionsModal(s);
                  }}
                >
                  {isProfessional && s.crisisFlag && s.status === 'WAITING' && (
                    <div className="session-crisis-dot" title="Crisis Alert"></div>
                  )}
                  <div className={`session-avatar ${avatarClass}`}>{initials}</div>
                  <div className="session-info">
                    <div className="session-info-top">
                      <span className="session-name">{s.studentPseudonym || 'Anonymous Student'}</span>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
                        {hasUnread && (
                          <span className="session-unread-badge">{displayCount > 9 ? '9+' : displayCount}</span>
                        )}
                        <span className="session-time">{time}</span>
                        <button
                          type="button"
                          className="session-card-delete-btn"
                          title="Delete conversation"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleOpenDeleteModal(s.sessionId);
                          }}
                        >
                          <i className="fas fa-trash-alt"></i>
                        </button>
                      </span>
                    </div>
                    <div className="session-preview">{s.topic || 'Support session'}</div>
                    <div className="session-meta">
                      <span className={`session-status-badge ${statusClass}`}>
                        <i className={`fas fa-${s.status === 'ACTIVE' ? 'circle' : s.status === 'WAITING' ? 'clock' : s.status === 'INVITED' ? 'envelope-open-text' : 'lock'}`}></i>{' '}
                        {statusLabel}
                      </span>
                      {s.emotionTag && (
                        <span className="session-emotion-badge">{s.emotionTag}</span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </aside>

      {/* ── Main Chat Area ── */}
      <main className="chat-main" id="chatMain">

        {/* 1. Welcome State: Sanctuary Lounge */}
        {!activeSessionId && (
          isProfessional ? (
            <div className="chat-welcome pro-welcome" id="proWelcome" style={{ display: 'flex' }}>
              <div className="welcome-badge-pill">
                <i className="fas fa-user-md"></i> Clinical Counselor Gateway
              </div>
              <div className="welcome-icon pro-icon">
                <i className="fas fa-headset"></i>
              </div>
              <h2>Counseling &amp; Triage Desk</h2>
              <p>
                Welcome, <strong style={{ color: '#161F36' }}>{fullName || username || 'Counselor'}</strong>.
                You are connected in active responder mode. Select a student conversation from the waiting queue to provide real-time confidential support.
              </p>

              <div className="pro-status-banner">
                <span className="pro-pulse-indicator"></span>
                <span><strong>Active Presence:</strong> Your counselor heartbeat is active. Students seeking support route directly to your queue.</span>
              </div>

              <div className="welcome-features pro-guidelines">
                <div className="welcome-feature">
                  <i className="fas fa-inbox"></i>
                  <div className="feature-text">
                    <strong>Triage &amp; Accept</strong>
                    <span>Review student emotions and energy tags before accepting</span>
                  </div>
                </div>
                <div className="welcome-feature">
                  <i className="fas fa-user-shield"></i>
                  <div className="feature-text">
                    <strong>Anonymous Boundaries</strong>
                    <span>Student identities remain pseudonymized for objective care</span>
                  </div>
                </div>
                <div className="welcome-feature">
                  <i className="fas fa-triangle-exclamation"></i>
                  <div className="feature-text">
                    <strong>Crisis Protocols</strong>
                    <span>High-risk indicators trigger automatic alerts in Crisis Alerts</span>
                  </div>
                </div>
              </div>

              <div className="pro-queue-hint" style={{ marginTop: '1.25rem', fontSize: '0.85rem', color: '#6C7A92' }}>
                <i className="fas fa-arrow-left"></i> Select a conversation from the sidebar to review and respond
              </div>
            </div>
          ) : (
            <div className="chat-welcome" id="chatWelcome" style={{ display: 'flex' }}>
              <div className="welcome-badge-pill">
                <i className="fas fa-shield-alt"></i> Confidential &amp; Encrypted Dialogue
              </div>
              <div className="welcome-icon">
                <i className="fas fa-hand-holding-heart"></i>
              </div>
              <h2>Safe, Anonymous Sanctuary</h2>
              <p>
                Connect with a campus mental health professional in real time. Your student credentials, name, and email are completely detached from this session.
              </p>

              <div className="welcome-quick-topics">
                <span className="quick-topics-label">Choose a starting topic or begin an open dialogue:</span>
                <div className="quick-topic-chips">
                  <button
                    type="button"
                    className="quick-topic-chip"
                    onClick={() => triggerOpenNewChat('Feeling overwhelmed with academic deadlines and coursework')}
                  >
                    <i className="fas fa-graduation-cap"></i> Academic Overwhelm
                  </button>
                  <button
                    type="button"
                    className="quick-topic-chip"
                    onClick={() => triggerOpenNewChat('Struggling with persistent anxiety and racing thoughts')}
                  >
                    <i className="fas fa-wind"></i> Anxiety &amp; Stress
                  </button>
                  <button
                    type="button"
                    className="quick-topic-chip"
                    onClick={() => triggerOpenNewChat('Feeling isolated and needing a supportive listener')}
                  >
                    <i className="fas fa-heart"></i> Need to Talk
                  </button>
                </div>
              </div>

              <button
                type="button"
                className="welcome-cta-btn"
                id="welcomeStartBtn"
                onClick={() => triggerOpenNewChat()}
              >
                <i className="fas fa-comment-dots"></i> Begin Anonymous Session
              </button>

              <div className="welcome-features">
                <div className="welcome-feature">
                  <i className="fas fa-user-shield"></i>
                  <div className="feature-text">
                    <strong>Pseudonym Only</strong>
                    <span>No names or student IDs shared</span>
                  </div>
                </div>
                <div className="welcome-feature">
                  <i className="fas fa-lock"></i>
                  <div className="feature-text">
                    <strong>Decoupled Records</strong>
                    <span>Separated from your academic files</span>
                  </div>
                </div>
                <div className="welcome-feature">
                  <i className="fas fa-certificate"></i>
                  <div className="feature-text">
                    <strong>Licensed Counselors</strong>
                    <span>Compassionate, certified guidance</span>
                  </div>
                </div>
              </div>
            </div>
          )
        )}

        {/* 2. Active Chat View */}
        {activeSessionId && (
          <div className="chat-view" id="chatView" style={{ display: 'flex' }}>
            {/* Chat Header */}
            <div className="chat-header" id="chatHeader">
              <div className="chat-header-left">
                <button
                  type="button"
                  className="mobile-back-btn"
                  title="Back to chats"
                  onClick={() => {
                    setActiveSessionId(null);
                    setActiveSession(null);
                  }}
                >
                  <i className="fas fa-arrow-left"></i>
                </button>
                <div className="chat-header-avatar" id="headerAvatar">
                  <i className="fas fa-user-shield"></i>
                </div>
                <div className="chat-header-info">
                  <h4 id="headerName">
                    {activeSession?.professionalName
                      ? activeSession.professionalName
                      : activeSession?.studentPseudonym
                      ? activeSession.studentPseudonym
                      : 'Waiting for counselor...'}
                  </h4>
                  <span id="headerStatus">
                    <span className={`session-status-badge ${activeSession?.status ? activeSession.status.toLowerCase() : 'waiting'}`} id="headerBadge">
                      {activeSession?.status || 'WAITING'}
                    </span>
                    {!isProfessional && (
                      <span className={`availability-indicator ${counselorOnline ? 'online' : 'offline'}`} id="availIndicator" style={{ display: 'inline-flex', marginLeft: '0.5rem' }}>
                        <span className="avail-dot"></span>
                        <span id="availText">{counselorOnline ? 'Counselor Online' : 'Counselor Offline'}</span>
                      </span>
                    )}
                  </span>
                </div>
              </div>

              <div className="chat-header-actions">
                <button
                  type="button"
                  title="Refresh messages"
                  onClick={async () => {
                    const msgs = await chatApi.getMessages(activeSessionId, isProfessional ? 'professional' : 'student');
                    setMessages(msgs || []);
                  }}
                >
                  <i className="fas fa-rotate-right"></i>
                </button>
                <button
                  type="button"
                  title="Delete conversation"
                  className="danger delete-btn"
                  id="deleteSessionBtn"
                  onClick={() => handleOpenDeleteModal(activeSessionId)}
                >
                  <i className="fas fa-trash-alt"></i>
                </button>
                {activeSession?.status !== 'CLOSED' && (
                  <button
                    type="button"
                    title="End conversation"
                    className="danger end-session-btn"
                    id="endSessionBtn"
                    onClick={() => setEndSessionModalOpen(true)}
                  >
                    <i className="fas fa-power-off"></i> <span className="end-btn-text">End Session</span>
                  </button>
                )}
                <button
                  type="button"
                  title="Exit to Sanctuary Lounge"
                  className="exit-lounge-btn"
                  id="exitChatBtn"
                  onClick={() => {
                    setActiveSessionId(null);
                    setActiveSession(null);
                  }}
                >
                  <i className="fas fa-xmark"></i>
                </button>
              </div>
            </div>

            {/* Accept Session Banner (Professional only, for WAITING) */}
            {isProfessional && activeSession?.status === 'WAITING' && (
              <div id="acceptSessionBanner" style={{ display: 'block', padding: '0.85rem 1.5rem', background: '#FAF7F2', borderBottom: '1.5px solid #E0D7C6', textAlign: 'center' }}>
                <span style={{ fontSize: '0.85rem', color: '#161F36', fontWeight: 600, marginRight: '1rem' }}>
                  This session is waiting to be accepted.
                </span>
                <button
                  type="button"
                  id="acceptSessionBtn"
                  onClick={() => handleAcceptSession(activeSessionId)}
                  style={{ background: '#161F36', color: '#FAF7F2', border: 'none', padding: '0.6rem 1.5rem', borderRadius: '0.6rem', fontSize: '0.88rem', fontWeight: 700, cursor: 'pointer', boxShadow: '0 2px 8px rgba(22,31,54,0.15)' }}
                >
                  <i className="fas fa-check"></i> Accept Session
                </button>
              </div>
            )}

            {/* Invited Session Banner (shown for INVITED sessions) */}
            {activeSession?.status === 'INVITED' && (
              <div id="invitedSessionBanner" style={{ display: 'block', padding: '0.85rem 1.5rem', background: '#FFFBEB', borderBottom: '1.5px solid #FEF3C7', textAlign: 'center' }}>
                <span id="invitedBannerText" style={{ fontSize: '0.85rem', color: '#92400E', fontWeight: 600, marginRight: '1rem' }}>
                  {isProfessional
                    ? 'Outreach invitation sent to student. Awaiting student consent.'
                    : 'A guidance counselor has initiated a private check-in with you.'}
                </span>
                {!isProfessional && (
                  <button
                    type="button"
                    id="studentJoinInviteBtn"
                    onClick={() => handleAcceptInvite(activeSessionId)}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '0.4rem',
                      background: '#10B981',
                      color: '#fff',
                      border: 'none',
                      padding: '0.55rem 1.25rem',
                      borderRadius: '0.6rem',
                      fontSize: '0.85rem',
                      fontWeight: 700,
                      cursor: 'pointer',
                      fontFamily: 'Inter,sans-serif',
                      boxShadow: '0 2px 8px rgba(16,185,129,0.25)'
                    }}
                  >
                    <i className="fas fa-check"></i> Join Conversation
                  </button>
                )}
              </div>
            )}

            {/* Messages Scroll Area */}
            <div className="chat-messages" id="chatMessages">
              {/* Outreach Dedicated Card (for INVITED sessions) */}
              {activeSession?.status === 'INVITED' && (
                !isProfessional ? (
                  <div className="chat-outreach-container">
                    <div className="chat-outreach-card">
                      <div className="outreach-header">
                        <div className="outreach-icon-wrap">
                          <i className="fas fa-heart"></i>
                        </div>
                        <div className="outreach-title-block">
                          <h3>Guidance Counselor Check-in</h3>
                          <span className="outreach-counselor-tag">
                            <i className="fas fa-user-md"></i> From: <strong>{activeSession.professionalName || 'Lead Psychometrician, RPM'}</strong>
                          </span>
                        </div>
                      </div>

                      <div className="outreach-message-quote">
                        <i className="fas fa-quote-left quote-mark"></i>
                        <p>
                          Hello. A campus counselor noticed your recent reflections and wanted to make sure you're doing okay. A private, confidential space has been opened if you'd like to talk.
                        </p>
                      </div>

                      <div className="outreach-privacy-box">
                        <i className="fas fa-user-shield"></i>
                        <div>
                          <strong>Completely Anonymous &amp; Safe</strong>
                          <p>You are completely anonymous and you are not in trouble. There is zero pressure to reply if you just wanted to vent.</p>
                        </div>
                      </div>

                      <div className="outreach-decision-actions">
                        <button type="button" className="btn-outreach-accept" id="btnOutreachAccept" onClick={handleAcceptInvite}>
                          <i className="fas fa-check"></i> Accept &amp; Join Confidential Chat
                        </button>
                        <button type="button" className="btn-outreach-decline" id="btnOutreachDecline" onClick={handleDeclineInvite}>
                          <i className="fas fa-times"></i> Decline (I just wanted to vent)
                        </button>
                        <button
                          type="button"
                          className="btn-outreach-delete"
                          id="btnOutreachDelete"
                          onClick={() => handleOpenDeleteModal(activeSessionId)}
                        >
                          <i className="fas fa-trash-alt"></i> Delete Request
                        </button>
                      </div>

                      <div className="outreach-footer-reassurance">
                        <i className="fas fa-clock"></i>
                        <div>
                          <strong>Take your time:</strong> If you cannot decide yet, there is no rush. This conversation space will stay right here in your chats so you can review this message again and decide whenever you feel ready.
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="pro-outreach-status-card" style={{ padding: '2rem', textAlign: 'center' }}>
                    <i className="fas fa-envelope-open-text main-icon" style={{ fontSize: '2.5rem', color: '#D97706', marginBottom: '1rem' }}></i>
                    <h3>Outreach Invitation Sent</h3>
                    <p style={{ color: '#64748B', fontSize: '0.88rem' }}>You initiated a check-in with this student. A private, confidential space has been opened and the student has been invited.</p>
                    <div style={{ display: 'inline-flex', padding: '0.4rem 1rem', background: '#FEF3C7', color: '#92400E', borderRadius: '999px', fontSize: '0.8rem', fontWeight: 700, marginTop: '0.75rem' }}>
                      <i className="fas fa-hourglass-half" style={{ marginRight: '6px' }}></i> Awaiting Student Consent
                    </div>
                  </div>
                )
              )}

              {/* Clinical Intake Summary (Counselor view) */}
              {isProfessional && activeSession && (activeSession.topic || activeSession.emotionTag) && (
                <div className="session-intake-card">
                  <div className="intake-header">
                    <i className="fas fa-clipboard-user"></i> Student Intake Summary
                  </div>
                  {activeSession.topic && (
                    <div className="intake-row">
                      <strong>Reported Concern:</strong> <span>{activeSession.topic}</span>
                    </div>
                  )}
                  <div className="intake-tags">
                    {activeSession.emotionTag && (
                      <span className="intake-tag"><i className="fas fa-heart"></i> Mood: {activeSession.emotionTag}</span>
                    )}
                    {activeSession.energyScore && (
                      <span className="intake-tag"><i className="fas fa-bolt"></i> Energy: {activeSession.energyScore}/10</span>
                    )}
                    {activeSession.crisisFlag && (
                      <span className="intake-tag crisis"><i className="fas fa-exclamation-triangle"></i> Crisis Alert Triggered</span>
                    )}
                  </div>
                </div>
              )}

              {/* Message Bubbles */}
              {messages.map((m, idx) => {
                const isMine = isProfessional ? m.senderType === 'professional' : m.senderType === 'student';
                const isSystem = m.senderType === 'system';
                const initials = m.senderType === 'student'
                  ? (activeSession?.studentPseudonym?.split('-').slice(1, 2).join('').substring(0, 2).toUpperCase() || 'AN')
                  : 'DR';

                if (isSystem) {
                  return (
                    <div key={idx} className="message system">
                      <div className="message-avatar"><i className="fas fa-robot"></i></div>
                      <div className="message-content">
                        <div className="message-bubble">{m.content}</div>
                        <div className="message-meta">
                          <span>{m.senderName}</span>
                          <span>•</span>
                          <span>{formatTime(m.sentAt || m.timestamp)}</span>
                        </div>
                      </div>
                    </div>
                  );
                }

                return (
                  <div
                    key={idx}
                    className={`message ${isMine ? 'student' : 'professional'}`}
                    onContextMenu={(e) => {
                      e.preventDefault();
                      handleOpenOptionsModal(activeSession, m.content || m.text);
                    }}
                  >
                    <div className="message-avatar">{initials}</div>
                    <div className="message-content">
                      <div className="message-bubble">{m.content || m.text}</div>
                      <div className="message-meta">
                        <span>{m.senderName || m.sender}</span>
                        <span>•</span>
                        <span>{formatTime(m.sentAt || m.timestamp)}</span>
                        {m.read && <i className="fas fa-check-double message-read-icon"></i>}
                      </div>
                    </div>
                  </div>
                );
              })}
              <div ref={messagesEndRef} />
            </div>

            {/* Counselor Canned Responses Chips */}
            {isProfessional && activeSession?.status === 'ACTIVE' && (
              <div style={{ padding: '0.5rem 1.25rem', background: '#F8FAFC', borderTop: '1px solid #E2E8F0', display: 'flex', gap: '0.4rem', overflowX: 'auto' }}>
                {CANNED_RESPONSES.map((res, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => handleSendMessage(res)}
                    style={{ whiteSpace: 'nowrap', padding: '0.35rem 0.75rem', borderRadius: '999px', border: '1px solid #CBD5E1', background: '#fff', fontSize: '0.76rem', color: '#475569', cursor: 'pointer', fontWeight: 600 }}
                  >
                    💬 {res}
                  </button>
                ))}
              </div>
            )}

            {/* Input Composer (Active Sessions) */}
            {activeSession?.status === 'ACTIVE' || (activeSession?.status === 'WAITING' && !isProfessional) ? (
              <div className="chat-input-area" id="chatInputArea">
                <div className="chat-input-container">
                  <textarea
                    id="messageInput"
                    placeholder="Type your message..."
                    rows={1}
                    value={messageText}
                    onChange={(e) => setMessageText(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        handleSendMessage();
                      }
                    }}
                  />
                  <button
                    type="button"
                    className="send-btn"
                    id="sendBtn"
                    onClick={() => handleSendMessage()}
                    title="Send"
                    disabled={isSending || !messageText.trim()}
                  >
                    <i className="fas fa-paper-plane"></i>
                  </button>
                </div>
                <div className="chat-input-note">
                  <i className="fas fa-shield-halved"></i>
                  Your identity is anonymous — only your pseudonym is visible.
                </div>
              </div>
            ) : null}

            {/* Closed Session Bar */}
            {(activeSession?.status === 'CLOSED' || activeSession?.status === 'DECLINED') && (
              <div className="chat-closed-bar" id="chatClosedBar" style={{ display: 'flex' }}>
                <i className="fas fa-lock"></i> This session has been closed.
              </div>
            )}
          </div>
        )}
      </main>

      {/* ── New Chat Modal (Student) ── */}
      {newChatModalOpen && (
        <div className="modal-overlay" id="newSessionModal" style={{ display: 'flex' }}>
          <div className="chat-modal">
            <div className="chat-modal-header">
              <h3><i className="fas fa-plus-circle"></i> New Conversation</h3>
              <button type="button" className="chat-modal-close" onClick={() => setNewChatModalOpen(false)}>
                <i className="fas fa-xmark"></i>
              </button>
            </div>
            <div className="chat-modal-body">
              <div className="form-group">
                <label className="form-label">Pseudonym (optional)</label>
                <input
                  className="form-input"
                  id="modalPseudonym"
                  placeholder="e.g. Anon-Cloud or leave blank for auto"
                  value={modalPseudonym}
                  onChange={(e) => setModalPseudonym(e.target.value)}
                />
              </div>

              <div className="form-group">
                <label className="form-label">What would you like to talk about?</label>
                <textarea
                  className="form-input"
                  id="modalTopic"
                  placeholder="e.g. I've been feeling overwhelmed with school lately..."
                  rows={3}
                  value={modalTopic}
                  onChange={(e) => setModalTopic(e.target.value)}
                />
              </div>

              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">How are you feeling?</label>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                  <select
                    className="form-input"
                    id="modalEmotion"
                    style={{ padding: '0.6rem 0.8rem' }}
                    value={modalEmotion}
                    onChange={(e) => setModalEmotion(e.target.value)}
                  >
                    <option value="Anxious">😟 Anxious</option>
                    <option value="Sad">😢 Sad</option>
                    <option value="Angry">😠 Angry</option>
                    <option value="Lonely">😔 Lonely</option>
                    <option value="Frustrated">😤 Frustrated</option>
                    <option value="Neutral">😐 Neutral</option>
                    <option value="Relieved">😌 Relieved</option>
                    <option value="Happy">😊 Happy</option>
                  </select>
                  <select
                    className="form-input"
                    id="modalEnergy"
                    style={{ padding: '0.6rem 0.8rem' }}
                    value={modalEnergy}
                    onChange={(e) => setModalEnergy(e.target.value)}
                  >
                    <option value="1">Energy: 1 (Very Low)</option>
                    <option value="2">Energy: 2</option>
                    <option value="3">Energy: 3</option>
                    <option value="4">Energy: 4</option>
                    <option value="5">Energy: 5 (Moderate)</option>
                    <option value="6">Energy: 6</option>
                    <option value="7">Energy: 7</option>
                    <option value="8">Energy: 8</option>
                    <option value="9">Energy: 9</option>
                    <option value="10">Energy: 10 (Very High)</option>
                  </select>
                </div>
              </div>

              <div className="privacy-note" style={{ marginTop: '1rem' }}>
                <i className="fas fa-shield-halved"></i>
                <span>Your real identity is <strong>never stored</strong>. Only your chosen pseudonym is visible to the counselor. All conversations are confidential.</span>
              </div>
            </div>

            <div className="chat-modal-footer">
              <button type="button" className="btn btn-ghost" onClick={() => setNewChatModalOpen(false)}>
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-primary"
                id="modalCreateBtn"
                onClick={handleCreateSession}
                disabled={isCreatingSession}
              >
                {isCreatingSession ? (
                  <>
                    <i className="fas fa-spinner fa-spin"></i> Connecting...
                  </>
                ) : (
                  <>
                    <i className="fas fa-paper-plane"></i> Start Chat
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── End Session Modal ── */}
      {endSessionModalOpen && (
        <div className="modal-overlay" id="endSessionConfirmModal" style={{ display: 'flex' }}>
          <div className="chat-modal" style={{ maxWidth: '480px' }}>
            <div
              className="chat-modal-header"
              style={{
                borderBottom: 'none',
                padding: '1.5rem 1.5rem 0',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                position: 'relative'
              }}
            >
              <button
                type="button"
                className="chat-modal-close"
                onClick={() => setEndSessionModalOpen(false)}
                style={{ position: 'absolute', top: '1.25rem', right: '1.25rem' }}
              >
                <i className="fas fa-xmark"></i>
              </button>
              <div
                style={{
                  width: '56px',
                  height: '56px',
                  borderRadius: '50%',
                  background: '#FEF3C7',
                  color: '#D97706',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '1.5rem',
                  margin: '0 auto 0.75rem',
                  boxShadow: '0 4px 14px rgba(217,119,6,0.15)'
                }}
              >
                <i className="fas fa-hand-holding-heart"></i>
              </div>
              <h3 style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', textAlign: 'center', width: '100%', fontSize: '1.2rem', color: '#161F36', margin: 0, fontWeight: 700 }}>
                End This Conversation?
              </h3>
            </div>
            <div className="chat-modal-body" style={{ textAlign: 'center', paddingTop: '0.35rem' }}>
              <p style={{ fontSize: '0.92rem', color: '#334155', lineHeight: 1.6, marginBottom: '0.75rem' }}>
                Are you ready to conclude your counseling session? This will complete the room and archive it.
              </p>
              <div style={{ background: '#F0FDF4', border: '1px solid #BBF7D0', borderRadius: '10px', padding: '0.75rem 1rem', fontSize: '0.82rem', color: '#166534', lineHeight: 1.45, textAlign: 'left', display: 'flex', alignItems: 'flex-start', gap: '0.5rem' }}>
                <i className="fas fa-shield-halved" style={{ color: '#16A34A', marginTop: '0.15rem', flexShrink: 0 }}></i>
                <span><strong>Need a break?</strong> You don't have to end the chat. You can click <strong>Leave for Now</strong> to keep your room open and return anytime.</span>
              </div>
            </div>
            <div className="chat-modal-footer" style={{ flexDirection: 'column', gap: '0.6rem', padding: '1.25rem 1.5rem' }}>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => {
                  setEndSessionModalOpen(false);
                  setActiveSessionId(null);
                  setActiveSession(null);
                }}
                style={{ width: '100%', justifyContent: 'center', padding: '0.75rem', border: '1.5px solid #CBD5E1', color: '#1E293B', fontWeight: 700 }}
              >
                <i className="fas fa-house"></i> Leave for Now (Keep Open)
              </button>
              <div style={{ display: 'flex', gap: '0.6rem', width: '100%' }}>
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={() => setEndSessionModalOpen(false)}
                  style={{
                    flex: 1,
                    justifyContent: 'center',
                    background: '#FFFFFF',
                    border: '1.5px solid #CBD5E1',
                    color: '#161F36',
                    borderRadius: '0.75rem',
                    fontWeight: 600,
                    display: 'flex',
                    alignItems: 'center'
                  }}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="btn"
                  id="btnExecuteEndSession"
                  onClick={handleExecuteEndSession}
                  style={{ flex: 1, justifyContent: 'center', background: '#EF4444', borderColor: '#DC2626', color: '#FFFFFF', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.4rem', borderRadius: '0.75rem' }}
                >
                  <i className="fas fa-power-off"></i> End Conversation
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Active Session Choice Modal (Student) ── */}
      {choiceModalOpen && pendingChoiceSession && (
        <div className="modal-overlay" id="activeSessionChoiceModal" style={{ display: 'flex' }}>
          <div className="chat-modal" style={{ maxWidth: '480px' }}>
            <div className="chat-modal-header" style={{ borderBottom: 'none', paddingBottom: 0 }}>
              <div style={{ width: '48px', height: '48px', borderRadius: '50%', background: '#e0e7ff', color: '#4f46e5', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.3rem', margin: '0 auto 0.5rem' }}>
                <i className="fas fa-comments"></i>
              </div>
              <h3 style={{ textAlign: 'center', width: '100%' }}>
                <i className="fas fa-circle-exclamation" style={{ color: '#6366f1' }}></i> Ongoing Conversation in Progress
              </h3>
              <button type="button" className="chat-modal-close" onClick={() => setChoiceModalOpen(false)}>
                <i className="fas fa-xmark"></i>
              </button>
            </div>
            <div className="chat-modal-body" style={{ textAlign: 'center', paddingTop: '0.5rem' }}>
              <p style={{ fontSize: '0.9rem', color: '#475569', lineHeight: 1.6 }} id="choiceModalMessage">
                {pendingChoiceSession.status === 'ACTIVE' ? (
                  <>You currently have an active conversation session. To provide you with focused guidance, you can have one active session at a time.</>
                ) : pendingChoiceSession.status === 'INVITED' ? (
                  <>You have a pending outreach invitation from <strong>{pendingChoiceSession.professionalName || 'a counselor'}</strong>.<br /><br />Would you like to review that invitation, or close it to start a fresh chat?</>
                ) : (
                  <>You already have a conversation waiting in the queue.<br /><br />Would you like to resume your waiting session, or close it to start a fresh one?</>
                )}
              </p>
            </div>
            <div className="chat-modal-footer" style={{ flexDirection: 'column', gap: '0.6rem', padding: '1.25rem 1.5rem' }}>
              <button
                type="button"
                className="btn btn-primary"
                onClick={handleResumeCurrentSession}
                style={{ width: '100%', justifyContent: 'center', padding: '0.75rem' }}
              >
                <i className="fas fa-arrow-left"></i> Resume Current Conversation
              </button>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={handleEndOldAndStartNew}
                style={{ width: '100%', justifyContent: 'center', color: '#ef4444', border: '1px solid #fecaca' }}
              >
                <i className="fas fa-rotate"></i> End Old &amp; Start New Conversation
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Student Gentle Outreach Invitation Modal ── */}
      {inviteModalOpen && (
        <div className="modal-overlay" id="studentInviteModal" style={{ display: 'flex' }}>
          <div className="chat-modal" style={{ maxWidth: '500px' }}>
            <div className="chat-modal-header" style={{ borderBottom: 'none', paddingBottom: 0 }}>
              <div style={{ width: '54px', height: '54px', borderRadius: '50%', background: '#fef3c7', color: '#d97706', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.5rem', margin: '0 auto 0.5rem' }}>
                <i className="fas fa-heart"></i>
              </div>
              <h3 style={{ textAlign: 'center', width: '100%', fontSize: '1.2rem' }}>💌 Guidance Counselor Check-in</h3>
              <button type="button" className="chat-modal-close" onClick={() => setInviteModalOpen(false)}>
                <i className="fas fa-xmark"></i>
              </button>
            </div>
            <div className="chat-modal-body" style={{ paddingTop: '0.5rem' }}>
              <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '0.9rem 1rem', marginBottom: '1rem', fontSize: '0.86rem', color: '#334155', lineHeight: 1.55 }}>
                <p id="inviteModalMessage">
                  Hello! A school guidance counselor noticed you might be going through a tough time and opened a private, confidential space if you'd like someone to talk to.
                </p>
              </div>
              <div className="privacy-note" style={{ marginTop: 0, background: '#f0fdf4', borderColor: '#bbf7d0', color: '#166534' }}>
                <i className="fas fa-user-shield" style={{ color: '#16a34a' }}></i>
                <span>You are completely <strong>anonymous</strong> and you are <strong>not in trouble</strong>. There is zero pressure to reply if you just wanted to vent.</span>
              </div>
            </div>
            <div className="chat-modal-footer" style={{ flexDirection: 'column', gap: '0.6rem', padding: '1.25rem 1.5rem' }}>
              <button
                type="button"
                className="btn btn-primary"
                style={{ width: '100%', justifyContent: 'center', background: '#10b981', borderColor: '#10b981', padding: '0.75rem' }}
                id="acceptInviteBtn"
                onClick={async () => {
                  setInviteModalOpen(false);
                  const targetInvite = inviteModalSession || sessions.find((s) => s.status === 'INVITED');
                  if (targetInvite) {
                    await handleAcceptInvite(targetInvite.sessionId);
                  }
                }}
              >
                <i className="fas fa-check"></i> Accept &amp; Join Confidential Chat
              </button>
              <button
                type="button"
                className="btn btn-ghost"
                style={{ width: '100%', justifyContent: 'center', color: '#64748b' }}
                onClick={async () => {
                  setInviteModalOpen(false);
                  const targetInvite = inviteModalSession || sessions.find((s) => s.status === 'INVITED');
                  if (targetInvite) {
                    await handleDeclineInvite(targetInvite.sessionId);
                  }
                }}
              >
                <i className="fas fa-times"></i> Decline (I just wanted to vent)
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Mobile Session Options Bottom Sheet ── */}
      <div
        className={`mobile-options-overlay ${optionsModalOpen ? 'active' : ''}`}
        id="mobileSessionOptionsModal"
        style={{ display: optionsModalOpen ? 'flex' : 'none' }}
        onClick={() => setOptionsModalOpen(false)}
      >
        <div className="mobile-options-sheet" id="mobileOptionsSheet" onClick={(e) => e.stopPropagation()}>
          <div className="options-sheet-pill"></div>
          <div className="options-sheet-header">
            <div className={`options-sheet-avatar ${optionsModalSession?.crisisFlag ? 'crisis' : ''}`} id="sheetAvatar">
              {optionsModalSession ? (optionsModalSession.studentPseudonym || 'AN').split('-').slice(1, 2).join('').substring(0, 2).toUpperCase() || 'AN' : 'AN'}
            </div>
            <div className="options-sheet-info">
              <div className="options-sheet-title" id="sheetTitle">
                {optionsModalSession?.studentPseudonym || 'Anonymous Conversation'}
              </div>
              <div className="options-sheet-subtitle" id="sheetSubtitle">
                {optionsModalSession?.topic ? `Topic: ${optionsModalSession.topic.length > 40 ? optionsModalSession.topic.substring(0, 37) + '...' : optionsModalSession.topic}` : 'Safe Space Conversation'}
              </div>
            </div>
          </div>
          <div className="options-sheet-actions">
            {activeSessionId !== optionsModalSession?.sessionId && (
              <button
                type="button"
                className="options-action-btn"
                id="sheetOpenBtn"
                onClick={() => {
                  setOptionsModalOpen(false);
                  if (optionsModalSession) setActiveSessionId(optionsModalSession.sessionId);
                }}
              >
                <i className="fas fa-comments"></i> Open Conversation
              </button>
            )}
            {activeSessionId === optionsModalSession?.sessionId && (optionsModalSession?.status === 'ACTIVE' || optionsModalSession?.status === 'WAITING') && (
              <button
                type="button"
                className="options-action-btn"
                id="sheetLeaveBtn"
                onClick={() => {
                  setOptionsModalOpen(false);
                  setActiveSessionId(null);
                  setActiveSession(null);
                }}
              >
                <i className="fas fa-house"></i> Leave Chat (Keep Open)
              </button>
            )}
            {(optionsModalSession?.status === 'ACTIVE' || optionsModalSession?.status === 'WAITING') && (
              <button
                type="button"
                className="options-action-btn"
                id="sheetCloseBtn"
                onClick={() => {
                  setOptionsModalOpen(false);
                  setEndSessionModalOpen(true);
                }}
              >
                <i className="fas fa-power-off"></i> End Conversation
              </button>
            )}
            {optionsModalMsg && (
              <button
                type="button"
                className="options-action-btn"
                id="sheetCopyMsgBtn"
                onClick={() => {
                  navigator.clipboard.writeText(optionsModalMsg);
                  setOptionsModalOpen(false);
                  showToast('Message copied to clipboard!');
                }}
              >
                <i className="fas fa-copy"></i> Copy Message Text
              </button>
            )}
            <button
              type="button"
              className="options-action-btn danger"
              id="sheetDeleteBtn"
              onClick={() => {
                const sid = optionsModalSession?.sessionId;
                setOptionsModalOpen(false);
                if (sid) handleOpenDeleteModal(sid);
              }}
            >
              <i className="fas fa-trash-alt"></i> Delete Conversation
            </button>
            <button
              type="button"
              className="options-action-btn cancel"
              onClick={() => setOptionsModalOpen(false)}
            >
              <i className="fas fa-times"></i> Cancel
            </button>
          </div>
        </div>
      </div>
      {/* ── Delete Conversation Confirmation Modal ── */}
      {deleteModalOpen && (
        <div className="modal-overlay" id="deleteConfirmModal" style={{ display: 'flex' }}>
          <div className="chat-modal" style={{ maxWidth: '440px' }}>
            <div
              className="chat-modal-header"
              style={{
                borderBottom: 'none',
                padding: '1.5rem 1.5rem 0',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                position: 'relative'
              }}
            >
              <button
                type="button"
                className="chat-modal-close"
                onClick={closeDeleteConfirmModal}
                style={{ position: 'absolute', top: '1.25rem', right: '1.25rem' }}
              >
                <i className="fas fa-xmark"></i>
              </button>
              <div className="delete-confirm-icon-wrap">
                <i className="fas fa-trash-alt"></i>
              </div>
              <h3 style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', textAlign: 'center', width: '100%', fontSize: '1.15rem', color: '#161F36', margin: 0, fontWeight: 700 }}>
                {isProfessional ? 'Remove Conversation?' : 'Delete Conversation?'}
              </h3>
            </div>
            <div className="chat-modal-body" style={{ textAlign: 'center', paddingTop: '0.4rem', paddingBottom: '1.25rem' }}>
              <p style={{ fontSize: '0.9rem', color: '#475569', lineHeight: 1.55, margin: 0 }} id="deleteConfirmMsg">
                {(() => {
                  const target = sessions.find((s) => s.sessionId === deleteModalSessionId);
                  let targetDesc = 'this conversation';
                  if (target) {
                    if (target.status === 'INVITED') {
                      targetDesc = isProfessional
                        ? `your outreach check-in to ${target.studentPseudonym || 'Student'}`
                        : `the check-in request from ${target.professionalName || 'Counselor'}`;
                    } else if (isProfessional) {
                      targetDesc = `conversation with ${target.studentPseudonym || 'Student'}`;
                    } else {
                      targetDesc = `this conversation with ${target.professionalName || target.studentPseudonym || 'Counselor'}`;
                    }
                  }
                  if (isProfessional) {
                    return `Are you sure you want to remove ${targetDesc} from your queue? It will be removed from your view while remaining accessible to the student.`;
                  }
                  return `Are you sure you want to remove ${targetDesc} from your conversations? This will clear it from your view.`;
                })()}
              </p>
            </div>
            <div className="chat-modal-footer" style={{ gap: '0.75rem', padding: '0 1.5rem 1.5rem', display: 'flex' }}>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={closeDeleteConfirmModal}
                style={{
                  flex: 1,
                  background: '#FFFFFF',
                  border: '1.5px solid #CBD5E1',
                  color: '#161F36',
                  borderRadius: '0.75rem',
                  padding: '0.75rem 1rem',
                  fontSize: '0.875rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  transition: 'all 0.2s ease'
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-delete-confirm"
                id="btnConfirmDeleteSession"
                disabled={deleteModalLoading}
                onClick={handleExecuteDeleteSession}
                style={{
                  flex: 1,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '0.45rem',
                  padding: '0.75rem 1rem',
                  fontSize: '0.875rem',
                  borderRadius: '0.75rem',
                  fontWeight: 600,
                  cursor: 'pointer'
                }}
              >
                {deleteModalLoading ? (
                  <>
                    <i className="fas fa-spinner fa-spin"></i> Removing...
                  </>
                ) : (
                  <>
                    <i className="fas fa-trash-alt"></i> {isProfessional ? 'Remove' : 'Delete'}
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Decline Reassurance & Hotline Info Modal ── */}
      {declineHotlineModalOpen && (
        <div className="modal-overlay" id="declineHotlineModal" style={{ display: 'flex' }}>
          <div className="chat-modal" style={{ maxWidth: '460px' }}>
            <div className="chat-modal-header">
              <h3 style={{ fontSize: '1.05rem' }}>
                <i className="fas fa-hand-holding-heart" style={{ color: '#10B981' }}></i> We Respect Your Space
              </h3>
              <button type="button" className="chat-modal-close" onClick={() => setDeclineHotlineModalOpen(false)}>
                <i className="fas fa-xmark"></i>
              </button>
            </div>
            <div className="chat-modal-body">
              <p style={{ fontSize: '0.88rem', color: '#475569', lineHeight: 1.6, marginBottom: '1rem' }}>
                Your feelings and thoughts are always safe and welcome on SafeSpace. If you ever feel ready to talk to someone, our Anonymous Chat is always here for you.
              </p>
              <div style={{ background: '#FFFBEB', border: '1px solid #FEF3C7', borderRadius: '8px', padding: '0.85rem 1rem', fontSize: '0.82rem', color: '#92400E' }}>
                <strong>24/7 Emergency Support Hotlines:</strong><br />
                📞 <strong>NCMH Crisis Hotline:</strong> 1553 (Toll-free landline) / 0917-899-8727<br />
                📞 <strong>Hopeline Philippines:</strong> (02) 804-4635 / 0917-558-4673
              </div>
            </div>
            <div className="chat-modal-footer">
              <button
                type="button"
                className="btn btn-primary"
                style={{ width: '100%', justifyContent: 'center' }}
                onClick={() => setDeclineHotlineModalOpen(false)}
              >
                Got It
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Notification Toast ── */}
      {toastMessage && (
        <div
          id="safeSpaceToast"
          style={{
            position: 'fixed',
            bottom: '2rem',
            left: '50%',
            transform: 'translateX(-50%) translateY(0)',
            background: '#161F36',
            color: '#FAF7F2',
            padding: '0.75rem 1.4rem',
            borderRadius: '999px',
            fontSize: '0.88rem',
            fontWeight: 600,
            boxShadow: '0 8px 24px rgba(22,31,54,0.25)',
            zIndex: 9999,
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            pointerEvents: 'none'
          }}
        >
          <i className="fas fa-circle-check" style={{ color: '#10B981' }}></i> {toastMessage}
        </div>
      )}
    </div>
  );
}
