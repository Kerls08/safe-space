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


function formatTime(timestamp) {
  if (!timestamp) return '';
  const d = new Date(timestamp);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function getStudentInitials(pseudonym) {
  if (!pseudonym) return 'AN';
  // Strip trailing numeric ID, e.g. "SoftSky-2342" -> "SoftSky", "Anon-River-9123" -> "Anon-River"
  const clean = pseudonym.replace(/[-_]?\d+$/, '');
  const parts = clean.split(/[-_\s]+/).filter(Boolean);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  } else if (parts.length === 1) {
    const camel = parts[0].replace(/([a-z])([A-Z])/g, '$1 $2').split(' ');
    if (camel.length >= 2) {
      return (camel[0][0] + camel[1][0]).toUpperCase();
    }
    return parts[0].substring(0, 2).toUpperCase();
  }
  return 'AN';
}

function getProfessionalInitials(name) {
  if (!name) return 'GC';
  const clean = name.replace(/^(Dr\.|Atty\.|Prof\.|Mr\.|Ms\.|Mrs\.)\s+/i, '').trim();
  const parts = clean.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  return clean.substring(0, 2).toUpperCase() || 'GC';
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
  const previousSessionsRef = useRef(null);
  useEffect(() => {
    activeSessionIdRef.current = activeSessionId;
  }, [activeSessionId]);

  const handleSelectSession = useCallback((sid) => {
    setActiveSessionId(sid);
    setSessions((prevSessions) => {
      const match = prevSessions.find((s) => s.sessionId === sid);
      if (match) {
        setActiveSession({ ...match, unreadCount: 0 });
      }
      const seenInvites = new Set(JSON.parse(localStorage.getItem('safespace_seen_invites') || '[]'));
      if (sid && !seenInvites.has(sid)) {
        seenInvites.add(sid);
        localStorage.setItem('safespace_seen_invites', JSON.stringify(Array.from(seenInvites)));
      }

      const updated = prevSessions.map((s) => {
        if (s.sessionId === sid) {
          return { ...s, unreadCount: 0 };
        }
        return s;
      });

      if (!isProfessional && sid) {
        let remaining = 0;
        updated.forEach((s) => {
          if (s.sessionId === sid) return;
          if (s.status === 'CLOSED' || s.status === 'DECLINED') return;
          if (s.status === 'INVITED') {
            if (!seenInvites.has(s.sessionId)) remaining++;
          } else if ((s.unreadCount || 0) > 0) {
            remaining += s.unreadCount;
          }
        });
        updateBadge('anon-chat', remaining);
      }
      return updated;
    });
  }, [isProfessional, updateBadge]);
  const [messages, setMessages] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterTab, setFilterTab] = useState('all'); // 'all' | 'unread' | 'checkin' | 'waiting'
  const [counselorOnline, setCounselorOnline] = useState(false);

  // Composer
  const [messageText, setMessageText] = useState('');
  const [isSending, setIsSending] = useState(false);
  const messagesEndRef = useRef(null);
  const chatMessagesRef = useRef(null);
  const isNearBottomRef = useRef(true);
  const [showScrollBottomBtn, setShowScrollBottomBtn] = useState(false);
  const prevMessagesCountRef = useRef(0);

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

  // Header Actions Overflow Menu
  const [headerMenuOpen, setHeaderMenuOpen] = useState(false);
  const [isRefreshingMessages, setIsRefreshingMessages] = useState(false);
  const headerMenuRef = useRef(null);

  useEffect(() => {
    const handleOutsideClick = (e) => {
      if (headerMenuRef.current && !headerMenuRef.current.contains(e.target)) {
        setHeaderMenuOpen(false);
      }
    };
    if (headerMenuOpen) {
      document.addEventListener('mousedown', handleOutsideClick);
    }
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
    };
  }, [headerMenuOpen]);

  const showToast = (msg) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(''), 3000);
  };

  // Smart auto-scroll messages
  const scrollToBottom = useCallback((behavior = 'smooth') => {
    if (chatMessagesRef.current) {
      chatMessagesRef.current.scrollTo({
        top: chatMessagesRef.current.scrollHeight,
        behavior
      });
    } else if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior });
    }
    isNearBottomRef.current = true;
    setShowScrollBottomBtn(false);
  }, []);

  const handleMessagesScroll = useCallback(() => {
    const el = chatMessagesRef.current;
    if (!el) return;
    const { scrollTop, scrollHeight, clientHeight } = el;
    const distanceFromBottom = scrollHeight - scrollTop - clientHeight;
    // Considered near bottom if within 120px
    const nearBottom = distanceFromBottom <= 120;
    isNearBottomRef.current = nearBottom;
    setShowScrollBottomBtn(!nearBottom);
  }, []);

  // When switching to a different chat session, always scroll to bottom
  useEffect(() => {
    if (activeSessionId) {
      isNearBottomRef.current = true;
      setShowScrollBottomBtn(false);
      prevMessagesCountRef.current = 0;
      const timer = setTimeout(() => {
        scrollToBottom('auto');
      }, 70);
      return () => clearTimeout(timer);
    }
  }, [activeSessionId, scrollToBottom]);

  // When message list grows (new message arrived or sent)
  useEffect(() => {
    const prevCount = prevMessagesCountRef.current;
    prevMessagesCountRef.current = messages.length;

    // Only scroll if message count increased
    if (messages.length > prevCount) {
      if (isNearBottomRef.current) {
        // User was already at or near bottom -> follow the conversation smoothly
        const timer = setTimeout(() => {
          scrollToBottom('smooth');
        }, 50);
        return () => clearTimeout(timer);
      } else {
        // User is scrolled up reading earlier messages -> DO NOT force scroll down!
        setShowScrollBottomBtn(true);
      }
    }
  }, [messages.length, scrollToBottom]);

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

        const [pseudoResults, userSessions] = await Promise.all([
          Promise.all(pseudonyms.map((p) => chatApi.getStudentSessions(p).catch(() => []))),
          username ? chatApi.getUserSessions(username).catch(() => []) : Promise.resolve([])
        ]);

        pseudoResults.flat().forEach((s) => {
          if (s && s.sessionId) map.set(s.sessionId, s);
        });

        (userSessions || []).forEach((s) => {
          if (s && s.sessionId) {
            map.set(s.sessionId, s);
            if (s.studentPseudonym && !pseudonyms.includes(s.studentPseudonym)) {
              pseudonyms.unshift(s.studentPseudonym);
              localStorage.setItem('safespace_pseudonyms', JSON.stringify(pseudonyms));
            }
          }
        });

        const sessionList = Array.from(map.values()).sort(
          (a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0)
        );

        const currentActiveId = activeSessionIdRef.current;
        const seenInvites = new Set(JSON.parse(localStorage.getItem('safespace_seen_invites') || '[]'));
        if (currentActiveId && !seenInvites.has(currentActiveId)) {
          seenInvites.add(currentActiveId);
          localStorage.setItem('safespace_seen_invites', JSON.stringify(Array.from(seenInvites)));
        }

        const normalizedList = sessionList.map((s) => {
          if (s.sessionId === currentActiveId || s.status === 'CLOSED' || s.status === 'DECLINED') {
            return { ...s, unreadCount: 0 };
          }
          if (s.status === 'INVITED' && seenInvites.has(s.sessionId)) {
            return { ...s, unreadCount: 0 };
          }
          return s;
        });

        setSessions(normalizedList);

        // Notify student if a waiting session was accepted by a counselor while browsing elsewhere
        if (!isProfessional && previousSessionsRef.current) {
          normalizedList.forEach((s) => {
            const prev = previousSessionsRef.current.find((p) => p.sessionId === s.sessionId);
            if (prev && prev.status === 'WAITING' && s.status === 'ACTIVE' && s.sessionId !== currentActiveId) {
              showToast(`${s.professionalName || 'A guidance counselor'} has joined your conversation. Ready to chat.`);
            }
          });
        }
        previousSessionsRef.current = normalizedList;

        let studentUnviewed = 0;
        normalizedList.forEach((s) => {
          if (s.sessionId === currentActiveId) return;
          if (s.status === 'CLOSED' || s.status === 'DECLINED') return;
          if (s.status === 'INVITED') {
            if (!seenInvites.has(s.sessionId)) studentUnviewed++;
          } else if ((s.unreadCount || 0) > 0) {
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
      }, 6000);

      const handleBeforeUnload = () => {
        if (username) {
          chatApi.recordOffline(username);
        }
      };
      window.addEventListener('beforeunload', handleBeforeUnload);

      return () => {
        clearInterval(sessionPollTimer);
        if (heartbeatTimer) clearInterval(heartbeatTimer);
        window.removeEventListener('beforeunload', handleBeforeUnload);
        if (username) {
          chatApi.recordOffline(username);
        }
      };
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
            showToast(`Student ${sessionData.studentPseudonym || 'Anonymous'} accepted the outreach invitation. Active counseling session is ready.`);
            loadSessions();
          }
          if (!isProfessional && activeSession && activeSession.status === 'WAITING' && sessionData.status === 'ACTIVE') {
            showToast(`${sessionData.professionalName || 'A guidance counselor'} has joined your conversation. Your session is now live.`);
            loadSessions();
          }
          setActiveSession(sessionData);
          setSessions((prev) => {
            let changed = false;
            const updated = prev.map((s) => {
              if (s.sessionId === activeSessionId && (s.unreadCount || 0) > 0) {
                changed = true;
                return { ...s, unreadCount: 0 };
              }
              return s;
            });
            return changed ? updated : prev;
          });
          setMessages((prev) => {
            const list = msgList || [];
            const pending = prev.filter((m) => m.isSending || (m.messageId && String(m.messageId).startsWith('temp-')));
            let nextMessages;
            if (pending.length === 0) {
              nextMessages = list;
            } else {
              const serverIds = new Set(list.map((m) => m.messageId));
              const stillPending = pending.filter((p) => !serverIds.has(p.messageId));
              nextMessages = [...list, ...stillPending];
            }

            if (prev.length === nextMessages.length) {
              const unchanged = prev.every((m, idx) => {
                const n = nextMessages[idx];
                return (
                  m.messageId === n.messageId &&
                  m.read === n.read &&
                  m.delivered === n.delivered &&
                  m.isSending === n.isSending &&
                  m.content === n.content
                );
              });
              if (unchanged) return prev;
            }

            return nextMessages;
          });
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

  // Seamless manual refresh of messages and session state
  const handleRefreshMessages = useCallback(async () => {
    if (isRefreshingMessages || !activeSessionId) return;
    setIsRefreshingMessages(true);
    const startTime = Date.now();

    try {
      const viewerType = isProfessional ? 'professional' : 'student';
      const [sessionData, msgList] = await Promise.all([
        chatApi.getSession(activeSessionId).catch((err) => {
          console.warn('Session info refresh error:', err);
          return null;
        }),
        chatApi.getMessages(activeSessionId, viewerType)
      ]);

      if (sessionData) {
        if (isProfessional && activeSession && activeSession.status === 'INVITED' && sessionData.status === 'ACTIVE') {
          showToast(`Student ${sessionData.studentPseudonym || 'Anonymous'} accepted the outreach invitation.`);
        }
        if (!isProfessional && activeSession && activeSession.status === 'WAITING' && sessionData.status === 'ACTIVE') {
          showToast(`${sessionData.professionalName || 'A guidance counselor'} has joined your conversation.`);
        }
        setActiveSession(sessionData);
      }

      let newCount = 0;
      if (Array.isArray(msgList)) {
        setMessages((prev) => {
          const pending = prev.filter((m) => m.isSending || (m.messageId && String(m.messageId).startsWith('temp-')));
          let nextMessages;
          if (pending.length === 0) {
            nextMessages = msgList;
          } else {
            const serverIds = new Set(msgList.map((m) => m.messageId));
            const stillPending = pending.filter((p) => !serverIds.has(p.messageId));
            nextMessages = [...msgList, ...stillPending];
          }

          if (msgList.length > prev.length) {
            newCount = msgList.length - prev.length;
          }
          return nextMessages;
        });
      }

      // Sync sidebar sessions list
      loadSessions();

      // Ensure smooth perceptible feedback duration (min 450ms)
      const elapsed = Date.now() - startTime;
      if (elapsed < 450) {
        await new Promise((r) => setTimeout(r, 450 - elapsed));
      }

      setHeaderMenuOpen(false);

      if (newCount > 0 && isNearBottomRef.current) {
        setTimeout(() => scrollToBottom('smooth'), 50);
      }
    } catch (err) {
      console.error('Error refreshing messages:', err);
      setHeaderMenuOpen(false);
      showToast('Could not refresh messages. Please check your connection.');
    } finally {
      setIsRefreshingMessages(false);
    }
  }, [activeSessionId, isProfessional, activeSession, isRefreshingMessages, loadSessions, scrollToBottom]);

  // Check counselor availability continuously
  useEffect(() => {
    if (isProfessional) return;

    let isMounted = true;
    const checkAvailability = async () => {
      try {
        const targetCounselor = activeSession?.professionalId;
        const res = await chatApi.checkCounselorAvailable(targetCounselor);
        if (isMounted) {
          setCounselorOnline(Boolean(res && res.available));
        }
      } catch (e) {
        if (isMounted) setCounselorOnline(false);
      }
    };

    checkAvailability();
    const availTimer = setInterval(checkAvailability, 3000);

    return () => {
      isMounted = false;
      clearInterval(availTimer);
    };
  }, [isProfessional, activeSession?.professionalId]);

  // Student presence heartbeat (for student active session)
  useEffect(() => {
    if (isProfessional || !activeSessionId) return;

    chatApi.studentHeartbeat(activeSessionId);
    const studentHeartbeatTimer = setInterval(() => {
      chatApi.studentHeartbeat(activeSessionId);
    }, 6000);

    const handleStudentBeforeUnload = () => {
      chatApi.recordStudentOffline(activeSessionId);
    };
    window.addEventListener('beforeunload', handleStudentBeforeUnload);

    return () => {
      clearInterval(studentHeartbeatTimer);
      window.removeEventListener('beforeunload', handleStudentBeforeUnload);
      chatApi.recordStudentOffline(activeSessionId);
    };
  }, [isProfessional, activeSessionId]);

  // Send message
  const handleSendMessage = async (textToSend) => {
    const text = (textToSend || messageText).trim();
    if (!text || !activeSessionId || isSending) return;

    setIsSending(true);
    const sender = isProfessional
      ? fullName || username || 'Lead Psychometrician, RPM'
      : activeSession?.studentPseudonym || 'Student';

    const tempId = 'temp-' + Date.now();
    const optimisticMsg = {
      messageId: tempId,
      sessionId: activeSessionId,
      content: text,
      senderType: isProfessional ? 'professional' : 'student',
      senderName: sender,
      sentAt: new Date().toISOString(),
      isSending: true,
      read: false,
      delivered: false
    };

    setMessages((prev) => [...prev, optimisticMsg]);
    setMessageText('');
    isNearBottomRef.current = true;
    setShowScrollBottomBtn(false);
    setTimeout(() => scrollToBottom('smooth'), 40);

    try {
      const sentMsg = await chatApi.sendMessage(activeSessionId, {
        content: text,
        senderType: isProfessional ? 'professional' : 'student',
        senderName: sender
      });

      setMessages((prev) => prev.map((m) => (m.messageId === tempId ? { ...sentMsg, isSending: false } : m)));
    } catch (err) {
      setMessages((prev) => prev.filter((m) => m.messageId !== tempId));
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
    const stored = JSON.parse(localStorage.getItem('safespace_pseudonyms') || '[]');
    setModalPseudonym(stored[0] || generateRandomPseudonym());
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
      } catch (e) {
        console.warn('Error closing old session:', e);
      }
    }
    setChoiceModalOpen(false);
    setPendingChoiceSession(null);
    setModalPseudonym(generateRandomPseudonym());
    setNewChatModalOpen(true);
    loadSessions();
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
      localStorage.setItem('safespace_pseudonym', chosenPseudo);

      const newSession = await chatApi.createSession({
        pseudonym: chosenPseudo,
        studentPseudonym: chosenPseudo,
        studentUserId: username,
        userId: username,
        topic,
        emotionTag: modalEmotion,
        energyScore: parseInt(modalEnergy, 10),
        forceNew: true
      });

      // 1. Immediately close modal & reset input fields
      setNewChatModalOpen(false);
      setModalTopic('');

      // 2. Seamless transition: immediately set active session and reset messages
      setActiveSessionId(newSession.sessionId);
      setActiveSession(newSession);
      setMessages([]);

      // 3. Immediately reflect in sessions list so it shows active in sidebar
      setSessions((prev) => {
        const remaining = prev.filter((s) => s.sessionId !== newSession.sessionId);
        return [newSession, ...remaining];
      });

      // 4. Mark active in local seen invites
      const seenInvites = new Set(JSON.parse(localStorage.getItem('safespace_seen_invites') || '[]'));
      seenInvites.add(newSession.sessionId);
      localStorage.setItem('safespace_seen_invites', JSON.stringify(Array.from(seenInvites)));

      // 5. Asynchronously refresh full sessions from backend
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
      if (s.status === 'CLOSED' || s.status === 'DECLINED') return false;
      const seenInvites = new Set(JSON.parse(localStorage.getItem('safespace_seen_invites') || '[]'));
      if (!isProfessional && s.status === 'INVITED') {
        return !seenInvites.has(s.sessionId);
      }
      return (s.unreadCount || 0) > 0;
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
      {/* Sidebar */}
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
                className={`filter-tab-pill ${filterTab === 'checkin' ? 'active' : ''} ${sessions.some((s) => s.status === 'INVITED' && !new Set(JSON.parse(localStorage.getItem('safespace_seen_invites') || '[]')).has(s.sessionId)) && filterTab !== 'checkin' ? 'highlighted' : ''}`}
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
                {isProfessional ? (
                  <>No sessions in queue.<br />Waiting for students...</>
                ) : (
                  <>No conversations yet.<br />Start one to talk anonymously.</>
                )}
              </p>
            </div>
          ) : (
            filteredSessions.map((s) => {
              const seenInvites = new Set(JSON.parse(localStorage.getItem('safespace_seen_invites') || '[]'));
              const isSelected = s.sessionId === activeSessionId;
              const isClosedOrDeclined = s.status === 'CLOSED' || s.status === 'DECLINED';
              const isInvite = s.status === 'INVITED';
              const isSeenInvite = isInvite && (seenInvites.has(s.sessionId) || isSelected);

              let hasUnread = false;
              let displayCount = 0;

              if (!isSelected && !isClosedOrDeclined) {
                if (!isProfessional && isInvite) {
                  if (!isSeenInvite) {
                    hasUnread = true;
                    displayCount = 1;
                  }
                } else if (!isInvite || isProfessional) {
                  if ((s.unreadCount || 0) > 0) {
                    hasUnread = true;
                    displayCount = s.unreadCount;
                  }
                }
              }
              const time = formatTime(s.lastMessageAt || s.createdAt);
              const statusClass = s.status ? s.status.toLowerCase() : 'waiting';
              const statusLabel = s.status === 'CLOSED' ? 'CONCLUDED' : (s.status === 'INVITED' ? 'CHECK-IN' : s.status);
              let avatarClass = isProfessional
                ? (s.crisisFlag ? 'crisis' : (s.status === 'INVITED' ? 'invited' : (s.status === 'WAITING' ? 'waiting' : (s.status === 'ACTIVE' ? 'active' : ''))))
                : '';

              // Dual-Perspective Title, Avatar, & Preview Resolution
              let displayTitle = '';
              let displayInitials = null;
              let displayIcon = null;
              let displayPreview = s.topic || 'Support session';

              if (isProfessional) {
                // Counselor view: Shows student pseudonym and letter initials
                displayTitle = s.studentPseudonym || 'Anonymous Student';
                displayInitials = getStudentInitials(s.studentPseudonym);
              } else {
                // Student view: Shows who the student is talking with
                if (s.status === 'INVITED') {
                  displayTitle = s.professionalName || 'Guidance Counselor Check-in';
                  displayInitials = s.professionalName ? getProfessionalInitials(s.professionalName) : 'GC';
                  displayIcon = null;
                  displayPreview = 'Supportive check-in from campus counseling';
                } else if (s.professionalName) {
                  displayTitle = s.professionalName;
                  displayInitials = getProfessionalInitials(s.professionalName);
                } else if (s.status === 'WAITING') {
                  displayTitle = 'Counselor Consultation';
                  displayIcon = 'fa-user-doctor';
                  displayPreview = s.topic ? `Concern: ${s.topic}` : 'Queued for next available counselor';
                } else {
                  displayTitle = s.professionalName || 'Campus Counselor';
                  displayInitials = 'CC';
                }

                // Sanitize internal diagnostic scoring from student preview
                if (displayPreview && (displayPreview.includes('[Crisis Outreach]') || displayPreview.includes('score:') || displayPreview.includes('High energy'))) {
                  displayPreview = 'Supportive check-in from counseling staff';
                }
              }

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
                  <div className={`session-avatar ${avatarClass}`}>
                    {displayIcon ? <i className={`fas ${displayIcon}`}></i> : (displayInitials || 'AN')}
                  </div>
                  <div className="session-info">
                    <div className="session-info-top">
                      <span className="session-name" title={displayTitle}>{displayTitle}</span>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
                        {hasUnread && displayCount > 0 && (
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
                    <div className="session-preview session-topic" title={displayPreview}>{displayPreview}</div>
                    <div className="session-meta">
                      {isProfessional ? (
                        <>
                          <span className={`session-status-badge ${statusClass}`}>
                            <i className={`fas fa-${s.status === 'ACTIVE' ? 'circle' : s.status === 'WAITING' ? 'clock' : s.status === 'INVITED' ? 'envelope-open-text' : 'lock'}`}></i>{' '}
                            {statusLabel}
                          </span>
                          <span
                            className={`availability-indicator ${s.studentOnline ? 'online' : 'offline'}`}
                            style={{ marginLeft: 0 }}
                            title={`Student is ${s.studentOnline ? 'Online' : 'Offline'}`}
                          >
                            <span className="avail-dot"></span>
                            <span>{s.studentOnline ? 'Online' : 'Offline'}</span>
                          </span>
                          {s.emotionTag && (
                            <span className="session-emotion-badge">{s.emotionTag}</span>
                          )}
                        </>
                      ) : (
                        s.status === 'CLOSED' ? (
                          <span className="session-status-badge closed">Concluded</span>
                        ) : null
                      )}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </aside>

      {/* Main Chat Area */}
      <main className="chat-main" id="chatMain">

        {/* 1. Welcome State: Sanctuary Lounge */}
        {!activeSessionId && (
          isProfessional ? (
            <div className="chat-welcome pro-welcome" id="proWelcome" style={{ display: 'flex' }}>
              <h2>Counseling &amp; Triage Desk</h2>
              <p>
                Active responder mode is enabled. Select a student conversation from the waiting queue to review intake details and provide confidential support.
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
                  <i className="fas fa-id-badge"></i>
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

              <div className="pro-queue-hint" style={{ marginTop: '1.25rem', fontSize: '0.85rem', color: '#51646E' }}>
                <i className="fas fa-arrow-left"></i> Select a conversation from the sidebar to review and respond
              </div>
            </div>
          ) : (
            <div className="chat-welcome" id="chatWelcome" style={{ display: 'flex' }}>
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
                    Academic Overwhelm
                  </button>
                  <button
                    type="button"
                    className="quick-topic-chip"
                    onClick={() => triggerOpenNewChat('Struggling with persistent anxiety and racing thoughts')}
                  >
                    Anxiety &amp; Stress
                  </button>
                  <button
                    type="button"
                    className="quick-topic-chip"
                    onClick={() => triggerOpenNewChat('Feeling isolated and needing a supportive listener')}
                  >
                    Need to Talk
                  </button>
                </div>
              </div>

              <button
                type="button"
                className="welcome-cta-btn"
                id="welcomeStartBtn"
                onClick={() => triggerOpenNewChat()}
              >
                Begin Anonymous Session
              </button>

              <div className="welcome-privacy-notice">
                All conversations are confidential, end-to-end encrypted, and completely decoupled from university records.
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
                {/* Header Avatar */}
                <div className="chat-avatar-wrapper">
                  <div className="chat-header-avatar" id="headerAvatar">
                    {isProfessional ? (
                      getStudentInitials(activeSession?.studentPseudonym)
                    ) : activeSession?.professionalName ? (
                      getProfessionalInitials(activeSession.professionalName)
                    ) : (
                      'GC'
                    )}
                  </div>
                </div>
                <div className="chat-header-info">
                  <h4 id="headerName">
                    {isProfessional
                      ? (activeSession?.studentPseudonym || 'Anonymous Student')
                      : (activeSession?.professionalName || (activeSession?.status === 'WAITING' ? 'Counselor Consultation' : 'Guidance Counselor'))}
                  </h4>
                  <div className="chat-header-meta" id="headerStatus">
                    <span className={`status-indicator-dot ${isProfessional ? (activeSession?.studentOnline ? 'online' : 'offline') : (counselorOnline ? 'online' : 'offline')}`}></span>
                    <span className="status-indicator-text">
                      {isProfessional ? (
                        activeSession?.studentOnline ? 'Active now' : 'Away'
                      ) : activeSession?.status === 'WAITING' ? (
                        'Waiting for counselor to join'
                      ) : counselorOnline ? (
                        'Available now'
                      ) : (
                        'Away'
                      )}
                    </span>
                    {activeSession?.status === 'CLOSED' && (
                      <span className="session-status-badge closed" id="headerBadge">
                        CONCLUDED
                      </span>
                    )}
                  </div>
                </div>
              </div>

              <div className="chat-header-actions">
                {activeSession?.status === 'ACTIVE' && (
                  <button
                    type="button"
                    title="Conclude and close this counseling session"
                    className="end-session-btn"
                    id="endSessionBtn"
                    onClick={() => setEndSessionModalOpen(true)}
                  >
                    <i className="fas fa-arrow-right-from-bracket"></i> <span className="end-btn-text">End Session</span>
                  </button>
                )}

                <div className="header-menu-container" ref={headerMenuRef}>
                  <button
                    type="button"
                    title={isRefreshingMessages ? "Refreshing chat..." : "More options"}
                    className="header-icon-btn menu-toggle-btn"
                    id="chatMenuBtn"
                    onClick={() => setHeaderMenuOpen((prev) => !prev)}
                    aria-expanded={headerMenuOpen}
                  >
                    <i className={isRefreshingMessages ? "fas fa-rotate-right fa-spin" : "fas fa-ellipsis-vertical"}></i>
                  </button>

                  {headerMenuOpen && (
                    <div className="header-dropdown-menu" id="headerDropdownMenu">
                      <button
                        type="button"
                        className="dropdown-item"
                        id="refreshMessagesBtn"
                        disabled={isRefreshingMessages}
                        onClick={handleRefreshMessages}
                      >
                        <i className={`fas fa-rotate-right ${isRefreshingMessages ? 'fa-spin' : ''}`}></i>{' '}
                        <span>{isRefreshingMessages ? 'Refreshing...' : 'Refresh messages'}</span>
                      </button>
                      <button
                        type="button"
                        className="dropdown-item"
                        onClick={() => {
                          setHeaderMenuOpen(false);
                          setActiveSessionId(null);
                          setActiveSession(null);
                        }}
                      >
                        <i className="fas fa-arrow-left"></i> Return to Lounge
                      </button>
                      <button
                        type="button"
                        className="dropdown-item danger"
                        onClick={() => {
                          setHeaderMenuOpen(false);
                          handleOpenDeleteModal(activeSessionId);
                        }}
                      >
                        <i className="fas fa-trash-alt"></i> Delete conversation
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Accept Session Banner (Professional only, for WAITING) */}
            {isProfessional && activeSession?.status === 'WAITING' && (
              <div id="acceptSessionBanner" style={{ display: 'block', padding: '0.85rem 1.5rem', background: '#F4F7F7', borderBottom: '1.5px solid #E1E8EB', textAlign: 'center' }}>
                <span style={{ fontSize: '0.85rem', color: '#182A34', fontWeight: 600, marginRight: '1rem' }}>
                  This session is waiting to be accepted.
                </span>
                <button
                  type="button"
                  id="acceptSessionBtn"
                  onClick={() => handleAcceptSession(activeSessionId)}
                  style={{ background: '#243E4C', color: '#F9FBFA', border: 'none', padding: '0.6rem 1.5rem', borderRadius: '0.5rem', fontSize: '0.88rem', fontWeight: 700, cursor: 'pointer', boxShadow: '0 2px 8px rgba(24,42,52,0.15)' }}
                >
                  <i className="fas fa-check"></i> Accept Session
                </button>
              </div>
            )}

            {/* Counselor Away Ambient Banner (Student view when counselor is offline in ACTIVE session) */}
            {!isProfessional && activeSession?.status === 'ACTIVE' && !counselorOnline && (
              <div className="counselor-away-banner" id="counselorAwayBanner">
                <div className="away-banner-info">
                  <span className="away-status-indicator"></span>
                  <span className="away-banner-text">
                    <strong>{activeSession.professionalName || 'Counselor'} is currently away.</strong>{' '}
                    Your messages are delivered securely and will be reviewed upon return.
                  </span>
                </div>
                <button
                  type="button"
                  className="away-hotline-btn"
                  onClick={() => setDeclineHotlineModalOpen(true)}
                  title="View 24/7 Crisis Support Resources"
                >
                  <i className="fas fa-phone-volume"></i> 24/7 Hotlines
                </button>
              </div>
            )}

            {/* Messages Scroll Area */}
            <div className="chat-messages" id="chatMessages" ref={chatMessagesRef} onScroll={handleMessagesScroll}>
              {/* Outreach Dedicated Card (for INVITED sessions) */}
              {activeSession?.status === 'INVITED' && (
                !isProfessional ? (
                  <div className="chat-outreach-container">
                    <div className="chat-outreach-card">
                      <div className="outreach-header">
                        <div className="outreach-title-block">
                          <h3>Guidance Counselor Check-in</h3>
                          <p className="outreach-sender">From {activeSession.professionalName || 'Lead Psychometrician, RPM'}</p>
                        </div>
                      </div>

                      <div className="outreach-message-body">
                        <p>
                          Hello. A campus counselor noticed your recent reflections and wanted to make sure you're doing okay. A private, confidential space has been opened if you'd like to talk.
                        </p>
                      </div>

                      <div className="outreach-privacy-note">
                        This conversation is private, confidential, and decoupled from university records. You remain completely anonymous, and there is zero pressure to reply if you only wished to vent.
                      </div>

                      <div className="outreach-decision-actions">
                        <button type="button" className="btn-outreach-accept" id="btnOutreachAccept" onClick={handleAcceptInvite}>
                          Accept &amp; Begin Chat
                        </button>
                        <button type="button" className="btn-outreach-decline" id="btnOutreachDecline" onClick={handleDeclineInvite}>
                          Decline
                        </button>
                      </div>

                      <div className="outreach-footer-reassurance">
                        Take your time — this conversation space will stay right here if you wish to review and reply later.
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="pro-outreach-status-card">
                    <h3>Outreach Invitation Sent</h3>
                    <p>You initiated a check-in with this student. A private, confidential space has been opened and the student has been invited.</p>
                    <div className="pro-outreach-badge">
                      Awaiting Student Consent
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
                      <span className="intake-tag"><i className="fas fa-face-smile"></i> Mood: {activeSession.emotionTag}</span>
                    )}
                    {activeSession.energyScore && (
                      <span className="intake-tag"><i className="fas fa-gauge-high"></i> Energy: {activeSession.energyScore}/10</span>
                    )}
                    {activeSession.crisisFlag && (
                      <span className="intake-tag crisis"><i className="fas fa-circle-exclamation"></i> Crisis Alert Triggered</span>
                    )}
                  </div>
                </div>
              )}

              {/* Message Bubbles */}
              {!(activeSession?.status === 'INVITED' && !isProfessional) && messages.map((m, idx) => {
                const isMine = isProfessional ? m.senderType === 'professional' : m.senderType === 'student';
                const isSystem = m.senderType === 'system';
                const initials = m.senderType === 'student'
                  ? getStudentInitials(activeSession?.studentPseudonym)
                  : (activeSession?.professionalName ? getProfessionalInitials(activeSession.professionalName) : 'GC');

                if (isSystem) {
                  const isCrisisFallback = m.content && (m.content.includes('1553') || m.content.includes('Crisis') || m.content.includes('distress'));
                  const isJoinNotice = m.content && (m.content.includes('joined the conversation') || m.content.includes('joined the chat'));
                  return (
                    <div key={idx} className={`system-notice-wrapper ${isCrisisFallback ? 'crisis-notice' : isJoinNotice ? 'join-notice' : ''}`}>
                      <div className="system-notice-card">
                        <div className="system-notice-header">
                          <i className={isCrisisFallback ? "fas fa-shield-heart" : isJoinNotice ? "fas fa-user-check" : "fas fa-circle-info"}></i>
                          <span className="system-notice-title">
                            {isCrisisFallback ? 'Crisis Support Notice' : isJoinNotice ? 'Counselor Connected' : 'System Notice'}
                          </span>
                          <span className="system-notice-time">{formatTime(m.sentAt || m.timestamp)}</span>
                        </div>
                        <div className="system-notice-body">
                          {m.content}
                        </div>
                      </div>
                    </div>
                  );
                }

                // Recipient details for Messenger seen status badge
                const recipientName = isProfessional
                  ? (activeSession?.studentPseudonym || 'Student')
                  : (activeSession?.professionalName || activeSession?.counselorName || 'Counselor');
                const recipientInitials = isProfessional
                  ? getStudentInitials(activeSession?.studentPseudonym)
                  : (activeSession?.professionalName ? getProfessionalInitials(activeSession.professionalName) : 'GC');

                let msgStatus = 'sent';
                let statusLabel = 'Sent';
                let statusTooltip = 'Sent: Stored on server';

                if (m.isSending) {
                  msgStatus = 'sending';
                  statusLabel = 'Sending...';
                  statusTooltip = 'Sending message...';
                } else if (m.read) {
                  msgStatus = 'seen';
                  statusLabel = 'Seen';
                  statusTooltip = `Seen by ${recipientName}`;
                } else if (m.delivered) {
                  msgStatus = 'delivered';
                  statusLabel = 'Delivered';
                  statusTooltip = `Delivered to ${recipientName}`;
                } else {
                  msgStatus = 'sent';
                  statusLabel = 'Sent';
                  statusTooltip = 'Sent to server • Waiting for recipient to connect';
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
                        {isMine && (
                          <>
                            <span>•</span>
                            <span className={`msg-status-indicator ${msgStatus}`} title={statusTooltip} aria-label={statusTooltip}>
                              {msgStatus === 'sending' && (
                                <>
                                  <i className="far fa-clock msg-status-icon sending"></i>
                                  <span className="status-label">{statusLabel}</span>
                                </>
                              )}
                              {msgStatus === 'sent' && (
                                <i className="fas fa-check msg-status-icon sent" title="Sent"></i>
                              )}
                              {msgStatus === 'delivered' && (
                                <i className="fas fa-check-double msg-status-icon delivered" title="Delivered"></i>
                              )}
                              {msgStatus === 'seen' && (
                                <>
                                  <i className="fas fa-check-double msg-status-icon seen" title={`Seen by ${recipientName}`}></i>
                                  <span className="status-label seen">Seen</span>
                                </>
                              )}
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
              <div ref={messagesEndRef} />
            </div>

            {/* Jump to Recent Messages floating pill */}
            {!(activeSession?.status === 'INVITED' && !isProfessional) && showScrollBottomBtn && (
              <button
                type="button"
                className="chat-jump-latest-btn"
                id="jumpToLatestBtn"
                onClick={() => scrollToBottom('smooth')}
                title="Scroll down to latest messages"
              >
                <i className="fas fa-chevron-down"></i>
                <span>Recent messages</span>
              </button>
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
                  <i className="fas fa-lock"></i>
                  Confidential session • Your student credentials remain decoupled and anonymous.
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

      {/* New Chat Modal (Student) */}
      {newChatModalOpen && (
        <div className="modal-overlay" id="newSessionModal" style={{ display: 'flex' }}>
          <div className="chat-modal">
            <div className="chat-modal-header">
              <h3>New Conversation</h3>
              <button
                type="button"
                className="chat-modal-close"
                onClick={() => setNewChatModalOpen(false)}
                title="Close"
                aria-label="Close"
              >
                <i className="fas fa-xmark"></i>
              </button>
            </div>
            <div className="chat-modal-body">
              <div className="form-group">
                <label className="form-label">Pseudonym (optional)</label>
                <input
                  className="form-input"
                  id="modalPseudonym"
                  placeholder="e.g. SoftSky-2342 or leave blank for auto"
                  value={modalPseudonym}
                  onChange={(e) => setModalPseudonym(e.target.value)}
                />
              </div>

              <div className="form-group">
                <label className="form-label">What would you like to talk about?</label>
                <textarea
                  className="form-input"
                  id="modalTopic"
                  placeholder="Describe what's on your mind or what you'd like to vent about..."
                  rows={3}
                  value={modalTopic}
                  onChange={(e) => setModalTopic(e.target.value)}
                />
              </div>

              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">How are you feeling?</label>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.6rem' }}>
                  <select
                    className="form-input"
                    id="modalEmotion"
                    value={modalEmotion}
                    onChange={(e) => setModalEmotion(e.target.value)}
                  >
                    <option value="Neutral">Neutral</option>
                    <option value="Anxious">Anxious</option>
                    <option value="Sad">Sad</option>
                    <option value="Angry">Angry</option>
                    <option value="Lonely">Lonely</option>
                    <option value="Frustrated">Frustrated</option>
                    <option value="Relieved">Relieved</option>
                    <option value="Happy">Happy</option>
                  </select>
                  <select
                    className="form-input"
                    id="modalEnergy"
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

              <div className="privacy-note">
                <i className="fas fa-lock"></i>
                <span>Your real identity is never stored. Only your chosen pseudonym is visible to the counselor, and conversations remain completely confidential.</span>
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

      {/* End Session Modal */}
      {endSessionModalOpen && (
        <div className="modal-overlay" id="endSessionConfirmModal" style={{ display: 'flex' }}>
          <div className="chat-modal" style={{ maxWidth: '440px' }}>
            <div
              className="chat-modal-header"
              style={{
                borderBottom: 'none',
                padding: '1.75rem 1.5rem 0.5rem',
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
                aria-label="Close"
              >
                <i className="fas fa-xmark"></i>
              </button>
              <h3 style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', textAlign: 'center', width: '100%', fontSize: '1.25rem', color: '#182A34', margin: 0, fontWeight: 700 }}>
                End This Conversation?
              </h3>
            </div>
            <div className="chat-modal-body" style={{ textAlign: 'center', paddingTop: '0.25rem' }}>
              <p style={{ fontSize: '0.92rem', color: '#51646E', lineHeight: 1.6, marginBottom: '0.85rem' }}>
                Are you ready to conclude your counseling session? This will complete the room and archive it.
              </p>
              <div style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '10px', padding: '0.85rem 1rem', fontSize: '0.84rem', color: '#475569', lineHeight: 1.5, textAlign: 'left' }}>
                <span><strong style={{ color: '#1E293B' }}>Need a break?</strong> You don't have to end the chat. You can click <strong style={{ color: '#1E293B' }}>Leave for Now</strong> to keep your room open and return anytime.</span>
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
                style={{ width: '100%', justifyContent: 'center', padding: '0.75rem', border: '1.5px solid #E1E8EB', color: '#243E4C', fontWeight: 600 }}
              >
                Leave for Now (Keep Open)
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
                    border: '1.5px solid #E1E8EB',
                    color: '#51646E',
                    borderRadius: '0.75rem',
                    fontWeight: 600,
                    padding: '0.75rem'
                  }}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="btn btn-end-session-confirm"
                  id="btnExecuteEndSession"
                  onClick={handleExecuteEndSession}
                  style={{ flex: 1, justifyContent: 'center', padding: '0.75rem', fontWeight: 600 }}
                >
                  End Conversation
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Active Session Choice Modal (Student) */}
      {choiceModalOpen && pendingChoiceSession && (
        <div className="modal-overlay" id="activeSessionChoiceModal" style={{ display: 'flex' }}>
          <div className="chat-modal" style={{ maxWidth: '480px' }}>
            <div className="chat-modal-header">
              <h3 style={{ fontSize: '1.15rem', color: '#182A34', fontWeight: 700 }}>
                Ongoing Conversation in Progress
              </h3>
              <button type="button" className="chat-modal-close" onClick={() => setChoiceModalOpen(false)}>
                <i className="fas fa-xmark"></i>
              </button>
            </div>
            <div className="chat-modal-body" style={{ textAlign: 'center', paddingTop: '0.25rem' }}>
              <p style={{ fontSize: '0.9rem', color: '#51646E', lineHeight: 1.6 }} id="choiceModalMessage">
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
                style={{ width: '100%', justifyContent: 'center', padding: '0.75rem', background: '#182A34', borderColor: '#182A34' }}
              >
                Resume Current Conversation
              </button>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={handleEndOldAndStartNew}
                style={{ width: '100%', justifyContent: 'center', color: '#DC2626', border: '1px solid #FECACA' }}
              >
                End Old &amp; Start New Conversation
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Student Gentle Outreach Invitation Modal */}
      {inviteModalOpen && (
        <div className="modal-overlay" id="studentInviteModal" style={{ display: 'flex' }}>
          <div className="chat-modal" style={{ maxWidth: '480px' }}>
            <div className="chat-modal-header">
              <h3 style={{ fontSize: '1.15rem', color: '#182A34', fontWeight: 700 }}>Guidance Counselor Check-in</h3>
              <button type="button" className="chat-modal-close" onClick={() => setInviteModalOpen(false)}>
                <i className="fas fa-xmark"></i>
              </button>
            </div>
            <div className="chat-modal-body">
              <div style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '10px', padding: '0.9rem 1rem', marginBottom: '1rem', fontSize: '0.88rem', color: '#243E4C', lineHeight: 1.6 }}>
                <p id="inviteModalMessage" style={{ margin: 0 }}>
                  Hello! A school guidance counselor noticed you might be going through a tough time and opened a private, confidential space if you'd like someone to talk to.
                </p>
              </div>
              <div className="privacy-note" style={{ marginTop: 0 }}>
                <span>You are completely <strong>anonymous</strong> and you are <strong>not in trouble</strong>. There is zero pressure to reply if you just wanted to vent.</span>
              </div>
            </div>
            <div className="chat-modal-footer" style={{ flexDirection: 'column', gap: '0.6rem', padding: '1.25rem 1.5rem' }}>
              <button
                type="button"
                className="btn btn-primary"
                style={{ width: '100%', justifyContent: 'center', background: '#182A34', borderColor: '#182A34', padding: '0.75rem' }}
                id="acceptInviteBtn"
                onClick={async () => {
                  setInviteModalOpen(false);
                  const targetInvite = inviteModalSession || sessions.find((s) => s.status === 'INVITED');
                  if (targetInvite) {
                    await handleAcceptInvite(targetInvite.sessionId);
                  }
                }}
              >
                Accept &amp; Begin Chat
              </button>
              <button
                type="button"
                className="btn btn-ghost"
                style={{ width: '100%', justifyContent: 'center', color: '#51646E', border: '1px solid #E2E8F0' }}
                onClick={async () => {
                  setInviteModalOpen(false);
                  const targetInvite = inviteModalSession || sessions.find((s) => s.status === 'INVITED');
                  if (targetInvite) {
                    await handleDeclineInvite(targetInvite.sessionId);
                  }
                }}
              >
                Decline
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Mobile Session Options Bottom Sheet */}
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
      {/* Delete Conversation Confirmation Modal */}
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
              <h3 style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', textAlign: 'center', width: '100%', fontSize: '1.15rem', color: '#182A34', margin: 0, fontWeight: 700 }}>
                {isProfessional ? 'Remove Conversation?' : 'Delete Conversation?'}
              </h3>
            </div>
            <div className="chat-modal-body" style={{ textAlign: 'center', paddingTop: '0.4rem', paddingBottom: '1.25rem' }}>
              <p style={{ fontSize: '0.9rem', color: '#51646E', lineHeight: 1.55, margin: 0 }} id="deleteConfirmMsg">
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
                  border: '1.5px solid #E1E8EB',
                  color: '#243E4C',
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

      {/* Decline Reassurance & Hotline Info Modal */}
      {declineHotlineModalOpen && (
        <div className="modal-overlay" id="declineHotlineModal" style={{ display: 'flex' }}>
          <div className="chat-modal" style={{ maxWidth: '460px' }}>
            <div className="chat-modal-header">
              <h3 style={{ fontSize: '1.05rem', color: '#182A34', fontWeight: 700 }}>
                We Respect Your Space
              </h3>
              <button type="button" className="chat-modal-close" onClick={() => setDeclineHotlineModalOpen(false)}>
                <i className="fas fa-xmark"></i>
              </button>
            </div>
            <div className="chat-modal-body">
              <p style={{ fontSize: '0.88rem', color: '#51646E', lineHeight: 1.6, marginBottom: '1rem' }}>
                Your feelings and thoughts are always safe and welcome on SafeSpace. If you ever feel ready to talk to someone, our Anonymous Chat is always here for you.
              </p>
              <div style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '8px', padding: '0.85rem 1rem', fontSize: '0.82rem', color: '#182A34' }}>
                <div style={{ fontWeight: 700, marginBottom: '0.4rem', color: '#182A34' }}>24/7 Emergency Support Hotlines:</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', lineHeight: 1.5, color: '#51646E' }}>
                  <div><strong style={{ color: '#182A34' }}>NCMH Crisis Hotline:</strong> 1553 (Toll-free landline) / 0917-899-8727</div>
                  <div><strong style={{ color: '#182A34' }}>Hopeline Philippines:</strong> (02) 804-4635 / 0917-558-4673</div>
                </div>
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

      {/* Notification Toast */}
      {toastMessage && (
        <div
          id="safeSpaceToast"
          style={{
            position: 'fixed',
            top: '4.5rem',
            left: '50%',
            transform: 'translateX(-50%)',
            background: '#1E293B',
            color: '#F8FAFC',
            padding: '0.65rem 1.25rem',
            borderRadius: '0.65rem',
            fontSize: '0.85rem',
            fontWeight: 600,
            boxShadow: '0 10px 25px -5px rgba(15, 23, 42, 0.25)',
            border: '1px solid #334155',
            zIndex: 9999,
            display: 'flex',
            alignItems: 'center',
            gap: '0.55rem',
            pointerEvents: 'none'
          }}
        >
          <i className="fas fa-circle-check" style={{ color: '#10B981' }}></i> {toastMessage}
        </div>
      )}
    </div>
  );
}
