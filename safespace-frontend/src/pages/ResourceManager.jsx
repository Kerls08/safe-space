import React, { useState, useEffect, useCallback, useRef } from 'react';
import { resourceManagerApi } from '../services/api';
import '../styles/resources.css';

const CAT_LABELS = {
  HOTLINE: 'Hotline',
  CAMPUS: 'Campus',
  EXTERNAL_LINK: 'External',
  CHAT_SERVICE: 'Chat'
};

export default function ResourceManager() {
  const [allResources, setAllResources] = useState([]);
  const [stats, setStats] = useState({ total: 0, hotlines: 0, campus: 0, crisisOnly: 0 });
  const [activeTab, setActiveTab] = useState('all');
  const [currentCatFilter, setCurrentCatFilter] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  // Modal
  const [modalOpen, setModalOpen] = useState(false);
  const [editingResource, setEditingResource] = useState(null);
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    link: '',
    category: 'HOTLINE',
    icon: '',
    emotionTags: '',
    minEnergy: 0,
    maxEnergy: 10,
    priority: 50,
    crisisOnly: false
  });

  // Toast
  const [toastMsg, setToastMsg] = useState('');

  const isMountedRef = useRef(true);

  const showToast = (msg) => {
    setToastMsg(msg);
    setTimeout(() => {
      setToastMsg((prev) => (prev === msg ? '' : prev));
    }, 3000);
  };

  const loadAll = useCallback(async () => {
    try {
      const [resList, resStats] = await Promise.all([
        resourceManagerApi.getAll(),
        resourceManagerApi.getStats()
      ]);
      if (!isMountedRef.current) return;
      setAllResources(Array.isArray(resList) ? resList : []);
      setStats(resStats || { total: 0, hotlines: 0, campus: 0, crisisOnly: 0 });
    } catch (e) {
      console.warn('Load error:', e);
    }
  }, []);

  useEffect(() => {
    isMountedRef.current = true;
    loadAll();
    return () => {
      isMountedRef.current = false;
    };
  }, [loadAll]);

  // Modal handlers
  const openCreateModal = () => {
    setEditingResource(null);
    setFormData({
      title: '',
      description: '',
      link: '',
      category: 'HOTLINE',
      icon: '',
      emotionTags: '',
      minEnergy: 0,
      maxEnergy: 10,
      priority: 50,
      crisisOnly: false
    });
    setModalOpen(true);
  };

  const openEditModal = (r) => {
    setEditingResource(r);
    setFormData({
      title: r.title || '',
      description: r.description || '',
      link: r.link || '',
      category: r.category || 'HOTLINE',
      icon: r.icon || '',
      emotionTags: r.emotionTags || '',
      minEnergy: r.minEnergy !== undefined ? r.minEnergy : 0,
      maxEnergy: r.maxEnergy !== undefined ? r.maxEnergy : 10,
      priority: r.priority !== undefined ? r.priority : 50,
      crisisOnly: Boolean(r.crisisOnly)
    });
    setModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
    setEditingResource(null);
  };

  const handleSaveResource = async () => {
    const title = formData.title.trim();
    const link = formData.link.trim();
    if (!title || !link) {
      showToast('Title and Link are required');
      return;
    }

    const payload = {
      title,
      description: formData.description.trim(),
      link,
      category: formData.category,
      icon: formData.icon.trim() || null,
      emotionTags: formData.emotionTags.trim() || null,
      minEnergy: parseInt(formData.minEnergy, 10) || 0,
      maxEnergy: parseInt(formData.maxEnergy, 10) || 10,
      priority: parseInt(formData.priority, 10) || 50,
      crisisOnly: formData.crisisOnly
    };

    try {
      if (editingResource && editingResource.id) {
        await resourceManagerApi.update(editingResource.id, payload);
        showToast('Resource updated ✓');
      } else {
        await resourceManagerApi.create(payload);
        showToast('Resource created ✓');
      }
      closeModal();
      loadAll();
    } catch (e) {
      showToast('Error: ' + e.message);
    }
  };

  const handleToggleActive = async (id, activate) => {
    try {
      if (activate) {
        await resourceManagerApi.reactivate(id);
        showToast('Resource reactivated ✓');
      } else {
        await resourceManagerApi.deactivate(id);
        showToast('Resource deactivated');
      }
      loadAll();
    } catch (e) {
      showToast('Action failed');
    }
  };

  const handleDeleteResource = async (id) => {
    if (!window.confirm('Permanently delete this resource? This cannot be undone.')) return;
    try {
      await resourceManagerApi.deletePermanent(id);
      showToast('Resource deleted permanently');
      loadAll();
    } catch (e) {
      showToast('Delete failed');
    }
  };

  // Card component
  const renderCard = (r) => {
    const emotionTags = r.emotionTags
      ? r.emotionTags.split(',').map((t, idx) => (
          <span key={idx} className="res-tag emotion">
            {t.trim()}
          </span>
        ))
      : (
        <span className="res-tag emotion">All emotions</span>
      );

    const energyRange = `${r.minEnergy || 0}-${r.maxEnergy || 10}`;
    const linkDisplay =
      (r.link || '').length > 45 ? (r.link || '').substring(0, 45) + '...' : r.link;
    const iconClass = r.icon || 'fas fa-link';

    const isTel = (r.link || '').startsWith('tel:');
    const isSms = (r.link || '').startsWith('sms:');
    const linkIcon = isTel
      ? 'fa-phone-volume'
      : isSms
      ? 'fa-comment-dots'
      : 'fa-arrow-up-right-from-square';

    return (
      <div key={r.id} className={`res-card ${r.active ? '' : 'inactive'}`} data-id={r.id}>
        <div className="res-card-top">
          <div className={`res-icon ${r.category}`}>
            <i className={iconClass}></i>
          </div>
          <div className="res-card-info">
            <div className="res-card-title">
              {r.title}
              {r.crisisOnly && <span className="crisis-badge">Crisis</span>}
              {!r.active && (
                <span className="crisis-badge" style={{ background: '#f1f5f9', color: '#9ca3af' }}>
                  Inactive
                </span>
              )}
            </div>
            <div className="res-card-desc">{r.description || 'No description'}</div>
          </div>
        </div>

        <a className="res-card-link" href={r.link} target="_blank" rel="noopener noreferrer">
          <i className={`fas ${linkIcon}`}></i> {linkDisplay}
        </a>

        <div className="res-tags">
          <span className={`res-tag cat ${r.category}`}>{CAT_LABELS[r.category] || r.category}</span>
          <span className="res-tag energy">⚡ {energyRange}</span>
          <span className="res-tag priority">↑ P{r.priority}</span>
          {emotionTags}
        </div>

        <div className="res-card-actions">
          <button className="btn-res btn-edit" onClick={() => openEditModal(r)}>
            <i className="fas fa-pen"></i> Edit
          </button>
          {r.active ? (
            <button className="btn-res btn-deactivate" onClick={() => handleToggleActive(r.id, false)}>
              <i className="fas fa-eye-slash"></i> Deactivate
            </button>
          ) : (
            <button className="btn-res btn-activate" onClick={() => handleToggleActive(r.id, true)}>
              <i className="fas fa-eye"></i> Reactivate
            </button>
          )}
          <button
            className="btn-res btn-delete"
            onClick={() => handleDeleteResource(r.id)}
            title="Delete"
          >
            <i className="fas fa-trash"></i>
          </button>
        </div>
      </div>
    );
  };

  // Filter main tab
  let filteredAll = allResources;
  if (currentCatFilter !== 'ALL') {
    filteredAll = filteredAll.filter((r) => r.category === currentCatFilter);
  }
  if (searchQuery) {
    const q = searchQuery.toLowerCase();
    filteredAll = filteredAll.filter(
      (r) =>
        (r.title || '').toLowerCase().includes(q) ||
        (r.description || '').toLowerCase().includes(q) ||
        (r.link || '').toLowerCase().includes(q) ||
        (r.emotionTags || '').toLowerCase().includes(q)
    );
  }

  // Filter category tabs (only active resources match vanilla logic)
  const hotlinesList = allResources.filter((r) => r.active && r.category === 'HOTLINE');
  const campusList = allResources.filter((r) => r.active && r.category === 'CAMPUS');
  const linksList = allResources.filter(
    (r) => r.active && (r.category === 'EXTERNAL_LINK' || r.category === 'CHAT_SERVICE')
  );

  return (
    <div className="res-layout">
      {/* Header */}
      <header className="res-header">
        <div className="res-header-inner">
          <div className="res-header-left">
            <div className="res-header-icon">
              <i className="fas fa-hand-holding-heart"></i>
            </div>
            <div>
              <h1>Campus Support &amp; Crisis Resources</h1>
              <p>Curated trauma-informed hotlines, campus offices, and mental wellness pathways</p>
            </div>
          </div>
          <div className="res-stats" id="resStats">
            <div className="res-stat green">
              <span className="stat-num" id="statTotal">{stats.total || 0}</span>Total
            </div>
            <div className="res-stat red">
              <span className="stat-num" id="statHotlines">{stats.hotlines || 0}</span>Hotlines
            </div>
            <div className="res-stat blue">
              <span className="stat-num" id="statCampus">{stats.campus || 0}</span>Campus
            </div>
            <div className="res-stat purple">
              <span className="stat-num" id="statCrisis">{stats.crisisOnly || 0}</span>Crisis
            </div>
          </div>
        </div>
      </header>

      {/* Tabs */}
      <div className="res-tabs" id="resTabs">
        <button
          className={`res-tab ${activeTab === 'all' ? 'active' : ''}`}
          id="tabAll"
          onClick={() => setActiveTab('all')}
        >
          <i className="fas fa-layer-group"></i> All Resources
          {allResources.length > 0 && (
            <span className="tab-badge" id="allCount">
              {allResources.length}
            </span>
          )}
        </button>
        <button
          className={`res-tab ${activeTab === 'hotlines' ? 'active' : ''}`}
          id="tabHotlines"
          onClick={() => setActiveTab('hotlines')}
        >
          <i className="fas fa-phone-volume"></i> Hotlines
        </button>
        <button
          className={`res-tab ${activeTab === 'campus' ? 'active' : ''}`}
          id="tabCampus"
          onClick={() => setActiveTab('campus')}
        >
          <i className="fas fa-building-columns"></i> Campus
        </button>
        <button
          className={`res-tab ${activeTab === 'links' ? 'active' : ''}`}
          id="tabLinks"
          onClick={() => setActiveTab('links')}
        >
          <i className="fas fa-globe"></i> Links &amp; Chat
        </button>
      </div>

      {/* Content */}
      <div className="res-content">
        {/* All Panel */}
        <div className={`res-panel ${activeTab === 'all' ? 'active' : ''}`} id="panelAll">
          <div className="res-toolbar">
            <div className="res-search">
              <i className="fas fa-search"></i>
              <input
                type="text"
                id="searchInput"
                placeholder="Search resources..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            <div className="cat-filter" id="catFilter">
              {[
                { id: 'ALL', label: 'All' },
                { id: 'HOTLINE', label: 'Hotlines' },
                { id: 'CAMPUS', label: 'Campus' },
                { id: 'EXTERNAL_LINK', label: 'Links' },
                { id: 'CHAT_SERVICE', label: 'Chat' }
              ].map((pill) => (
                <button
                  key={pill.id}
                  className={`cat-pill ${currentCatFilter === pill.id ? 'active' : ''}`}
                  onClick={() => setCurrentCatFilter(pill.id)}
                >
                  {pill.label}
                </button>
              ))}
            </div>
            <button
              className="btn-add-resource"
              id="btnAddResource"
              onClick={openCreateModal}
            >
              <i className="fas fa-plus"></i> Add Resource
            </button>
          </div>
          <div className="res-grid" id="resourceGrid">
            {filteredAll.length === 0 ? (
              <div className="res-empty">
                <i className="fas fa-box-open"></i>
                <p>
                  {searchQuery
                    ? 'No resources match your search'
                    : 'No resources found. Click "Add Resource" to create one.'}
                </p>
              </div>
            ) : (
              filteredAll.map((r) => renderCard(r))
            )}
          </div>
        </div>

        {/* Hotlines Panel */}
        <div
          className={`res-panel ${activeTab === 'hotlines' ? 'active' : ''}`}
          id="panelHotlines"
        >
          <div className="res-grid" id="hotlinesGrid">
            {hotlinesList.length === 0 ? (
              <div className="res-empty">
                <i className="fas fa-box-open"></i>
                <p>No resources in this category yet.</p>
              </div>
            ) : (
              hotlinesList.map((r) => renderCard(r))
            )}
          </div>
        </div>

        {/* Campus Panel */}
        <div className={`res-panel ${activeTab === 'campus' ? 'active' : ''}`} id="panelCampus">
          <div className="res-grid" id="campusGrid">
            {campusList.length === 0 ? (
              <div className="res-empty">
                <i className="fas fa-box-open"></i>
                <p>No resources in this category yet.</p>
              </div>
            ) : (
              campusList.map((r) => renderCard(r))
            )}
          </div>
        </div>

        {/* Links & Chat Panel */}
        <div className={`res-panel ${activeTab === 'links' ? 'active' : ''}`} id="panelLinks">
          <div className="res-grid" id="linksGrid">
            {linksList.length === 0 ? (
              <div className="res-empty">
                <i className="fas fa-box-open"></i>
                <p>No resources in this category yet.</p>
              </div>
            ) : (
              linksList.map((r) => renderCard(r))
            )}
          </div>
        </div>
      </div>

      {/* Create/Edit Modal */}
      {modalOpen && (
        <div className="res-modal-overlay active" id="resourceModal">
          <div className="res-modal">
            <div className="res-modal-header">
              <h3>
                <i className="fas fa-hand-holding-heart"></i>{' '}
                <span id="modalTitle">
                  {editingResource ? 'Edit Resource' : 'Add Resource'}
                </span>
              </h3>
              <button className="res-modal-close" onClick={closeModal}>
                <i className="fas fa-xmark"></i>
              </button>
            </div>
            <div className="res-modal-body">
              <form id="resourceForm" onSubmit={(e) => e.preventDefault()}>
                <div className="form-row">
                  <label htmlFor="fTitle">Title *</label>
                  <input
                    type="text"
                    id="fTitle"
                    placeholder="e.g., National Crisis Hotline"
                    required
                    value={formData.title}
                    onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  />
                </div>

                <div className="form-row">
                  <label htmlFor="fDescription">Description</label>
                  <textarea
                    id="fDescription"
                    placeholder="Brief description of the resource..."
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  ></textarea>
                </div>

                <div className="form-row">
                  <label htmlFor="fLink">Link / Phone / URL *</label>
                  <input
                    type="text"
                    id="fLink"
                    placeholder="e.g., tel:1553 or https://..."
                    required
                    value={formData.link}
                    onChange={(e) => setFormData({ ...formData, link: e.target.value })}
                  />
                  <div className="hint">
                    Use tel: for phone, mailto: for email, or https:// for web links
                  </div>
                </div>

                <div className="form-row-inline">
                  <div className="form-row">
                    <label htmlFor="fCategory">Category *</label>
                    <select
                      id="fCategory"
                      required
                      value={formData.category}
                      onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                    >
                      <option value="HOTLINE">🔴 Hotline</option>
                      <option value="CAMPUS">🏛️ Campus Service</option>
                      <option value="EXTERNAL_LINK">🔗 External Link</option>
                      <option value="CHAT_SERVICE">💬 Chat Service</option>
                    </select>
                  </div>
                  <div className="form-row">
                    <label htmlFor="fIcon">Icon (FontAwesome class)</label>
                    <input
                      type="text"
                      id="fIcon"
                      placeholder="fas fa-phone-volume"
                      value={formData.icon}
                      onChange={(e) => setFormData({ ...formData, icon: e.target.value })}
                    />
                  </div>
                </div>

                <div className="form-row">
                  <label htmlFor="fEmotionTags">Emotion Tags</label>
                  <input
                    type="text"
                    id="fEmotionTags"
                    placeholder="e.g., Sad,Anxious,Lonely"
                    value={formData.emotionTags}
                    onChange={(e) => setFormData({ ...formData, emotionTags: e.target.value })}
                  />
                  <div className="hint">Comma-separated. Leave empty for all emotions.</div>
                </div>

                <div className="form-row-inline">
                  <div className="form-row">
                    <label htmlFor="fMinEnergy">Min Energy Score</label>
                    <input
                      type="number"
                      id="fMinEnergy"
                      min="0"
                      max="10"
                      value={formData.minEnergy}
                      onChange={(e) => setFormData({ ...formData, minEnergy: e.target.value })}
                    />
                  </div>
                  <div className="form-row">
                    <label htmlFor="fMaxEnergy">Max Energy Score</label>
                    <input
                      type="number"
                      id="fMaxEnergy"
                      min="0"
                      max="10"
                      value={formData.maxEnergy}
                      onChange={(e) => setFormData({ ...formData, maxEnergy: e.target.value })}
                    />
                  </div>
                </div>

                <div className="form-row-inline">
                  <div className="form-row">
                    <label htmlFor="fPriority">Display Priority</label>
                    <input
                      type="number"
                      id="fPriority"
                      min="0"
                      max="999"
                      value={formData.priority}
                      onChange={(e) => setFormData({ ...formData, priority: e.target.value })}
                    />
                    <div className="hint">Lower = shown first</div>
                  </div>
                  <div className="form-row">
                    <label>&nbsp;</label>
                    <div className="checkbox-wrap">
                      <input
                        type="checkbox"
                        id="fCrisisOnly"
                        checked={formData.crisisOnly}
                        onChange={(e) => setFormData({ ...formData, crisisOnly: e.target.checked })}
                      />
                      <label htmlFor="fCrisisOnly">Crisis-only resource</label>
                    </div>
                  </div>
                </div>
              </form>
            </div>
            <div className="res-modal-footer">
              <button className="btn-res" onClick={closeModal}>
                Cancel
              </button>
              <button
                className="btn-res primary"
                id="btnSaveResource"
                onClick={handleSaveResource}
              >
                <i className="fas fa-check"></i> Save Resource
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast */}
      {toastMsg && <div className="res-toast">{toastMsg}</div>}
    </div>
  );
}
