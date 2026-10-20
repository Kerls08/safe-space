import React, { useState, useEffect, useCallback, useRef } from 'react';
import { resourceManagerApi } from '../services/api';
import '../styles/resources.css';

const CAT_LABELS = {
  HOTLINE: 'Hotline',
  CAMPUS: 'Campus Support',
  EXTERNAL_LINK: 'External Link',
  CHAT_SERVICE: 'Chat Service'
};

export default function ResourceManager() {
  const [allResources, setAllResources] = useState([]);
  const [stats, setStats] = useState({ total: 0, hotlines: 0, campus: 0, crisisOnly: 0 });
  const [selectedCategory, setSelectedCategory] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState('all'); // 'all' | 'active' | 'inactive'
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
        showToast('Resource updated successfully');
      } else {
        await resourceManagerApi.create(payload);
        showToast('Resource created successfully');
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
        showToast('Resource reactivated');
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
    if (!window.confirm('Permanently delete this resource? This action cannot be undone.')) return;
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
    const isTel = (r.link || '').startsWith('tel:');
    const isSms = (r.link || '').startsWith('sms:');
    const linkIcon = isTel
      ? 'fa-phone'
      : isSms
      ? 'fa-comment'
      : 'fa-arrow-up-right-from-square';

    const linkDisplay =
      (r.link || '').length > 42 ? (r.link || '').substring(0, 42) + '...' : r.link;

    const defaultIcon = isTel
      ? 'fas fa-phone'
      : isSms
      ? 'fas fa-comment'
      : r.category === 'CAMPUS'
      ? 'fas fa-building-columns'
      : 'fas fa-link';
    const iconClass = r.icon || defaultIcon;

    return (
      <div key={r.id} className={`res-card ${r.active ? '' : 'inactive'}`} data-id={r.id}>
        <div className="res-card-top">
          <div className="res-icon">
            <i className={iconClass}></i>
          </div>
          <div className="res-card-info">
            <div className="res-card-title-row">
              <h3 className="res-card-title">{r.title}</h3>
              <div className="res-card-badges">
                {r.crisisOnly && <span className="crisis-badge">Crisis</span>}
                {!r.active && <span className="inactive-badge">Inactive</span>}
              </div>
            </div>
            <p className="res-card-desc">{r.description || 'No description provided.'}</p>
          </div>
        </div>

        <div className="res-card-meta">
          <a className="res-card-link" href={r.link} target="_blank" rel="noopener noreferrer" title={r.link}>
            <i className={`fas ${linkIcon}`}></i>
            <span>{linkDisplay}</span>
          </a>
          <span className="res-cat-badge">{CAT_LABELS[r.category] || r.category}</span>
        </div>

        <div className="res-card-actions">
          <button type="button" className="btn-res btn-edit" onClick={() => openEditModal(r)}>
            <i className="fas fa-pen"></i> <span>Edit</span>
          </button>
          {r.active ? (
            <button type="button" className="btn-res btn-deactivate" onClick={() => handleToggleActive(r.id, false)}>
              <i className="fas fa-eye-slash"></i> <span>Deactivate</span>
            </button>
          ) : (
            <button type="button" className="btn-res btn-activate" onClick={() => handleToggleActive(r.id, true)}>
              <i className="fas fa-eye"></i> <span>Reactivate</span>
            </button>
          )}
          <button
            type="button"
            className="btn-res btn-delete"
            onClick={() => handleDeleteResource(r.id)}
            title="Delete permanently"
          >
            <i className="fas fa-trash-alt"></i>
          </button>
        </div>
      </div>
    );
  };

  // Filter & sort resources (Crisis resources like Crisis Text Line prioritized at the top)
  const filteredResources = allResources
    .filter((r) => {
      if (selectedCategory !== 'ALL' && r.category !== selectedCategory) {
        return false;
      }
      if (statusFilter === 'active' && !r.active) {
        return false;
      }
      if (statusFilter === 'inactive' && r.active) {
        return false;
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchTitle = (r.title || '').toLowerCase().includes(q);
        const matchDesc = (r.description || '').toLowerCase().includes(q);
        const matchLink = (r.link || '').toLowerCase().includes(q);
        const matchCategory = (CAT_LABELS[r.category] || r.category || '').toLowerCase().includes(q);
        if (!matchTitle && !matchDesc && !matchLink && !matchCategory) {
          return false;
        }
      }
      return true;
    })
    .sort((a, b) => {
      // 1. Crisis resources prioritized at the top (Emergency Hotlines, Crisis Text Line)
      const aIsCrisis = Boolean(a.crisisOnly || (a.title && a.title.toLowerCase().includes('crisis text line')));
      const bIsCrisis = Boolean(b.crisisOnly || (b.title && b.title.toLowerCase().includes('crisis text line')));
      if (aIsCrisis && !bIsCrisis) return -1;
      if (!aIsCrisis && bIsCrisis) return 1;

      // 2. Sort by priority ascending (1, 2, 3...)
      const pA = a.priority !== undefined && a.priority !== null ? a.priority : 999;
      const pB = b.priority !== undefined && b.priority !== null ? b.priority : 999;
      if (pA !== pB) return pA - pB;

      return (a.title || '').localeCompare(b.title || '');
    });

  const categoryTabs = [
    { id: 'ALL', label: 'All Resources', icon: 'fa-layer-group', count: allResources.length },
    { id: 'HOTLINE', label: 'Hotlines', icon: 'fa-phone-volume', count: allResources.filter((r) => r.category === 'HOTLINE').length },
    { id: 'CAMPUS', label: 'Campus Support', icon: 'fa-building-columns', count: allResources.filter((r) => r.category === 'CAMPUS').length },
    { id: 'EXTERNAL_LINK', label: 'External Links', icon: 'fa-arrow-up-right-from-square', count: allResources.filter((r) => r.category === 'EXTERNAL_LINK').length },
    { id: 'CHAT_SERVICE', label: 'Chat Services', icon: 'fa-comment-dots', count: allResources.filter((r) => r.category === 'CHAT_SERVICE').length }
  ];

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
            <div className="res-stat" title="Total resources registered">
              <span className="stat-num" id="statTotal">{stats.total || 0}</span>
              <span>Total</span>
            </div>
            <div className="res-stat" title="Emergency crisis hotlines">
              <span className="stat-num" id="statHotlines">{stats.hotlines || 0}</span>
              <span>Hotlines</span>
            </div>
            <div className="res-stat" title="Campus departments & guidance offices">
              <span className="stat-num" id="statCampus">{stats.campus || 0}</span>
              <span>Campus</span>
            </div>
            <div className="res-stat" title="Critical crisis response resources">
              <span className="stat-num" id="statCrisis">{stats.crisisOnly || 0}</span>
              <span>Crisis</span>
            </div>
          </div>
        </div>
      </header>

      {/* Primary Category Navigation */}
      <div className="res-tabs" id="resTabs" role="tablist">
        {categoryTabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={selectedCategory === tab.id}
            className={`res-tab ${selectedCategory === tab.id ? 'active' : ''}`}
            onClick={() => setSelectedCategory(tab.id)}
          >
            <i className={`fas ${tab.icon}`}></i>
            <span>{tab.label}</span>
            {tab.count > 0 && <span className="tab-badge">{tab.count}</span>}
          </button>
        ))}
      </div>

      {/* Main Content Area */}
      <div className="res-content">
        <div className="res-toolbar">
          <div className="res-toolbar-left">
            <div className="res-search">
              <i className="fas fa-search"></i>
              <input
                type="text"
                id="searchInput"
                placeholder="Search resources by title, description, or link..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            <select
              className="status-filter-select"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              title="Filter by status"
            >
              <option value="all">All Statuses</option>
              <option value="active">Active Only</option>
              <option value="inactive">Inactive Only</option>
            </select>
          </div>

          <button
            type="button"
            className="btn-add-resource"
            id="btnAddResource"
            onClick={openCreateModal}
          >
            <i className="fas fa-plus"></i> Add Resource
          </button>
        </div>

        {/* Resources Grid */}
        <div className="res-grid" id="resourceGrid">
          {filteredResources.length === 0 ? (
            <div className="res-empty">
              <i className="fas fa-folder-open"></i>
              <h3>No resources found</h3>
              <p>
                {searchQuery
                  ? 'No matching resources for your search query. Try clearing your search or switching categories.'
                  : 'No resources currently in this category. Click "+ Add Resource" above to create one.'}
              </p>
            </div>
          ) : (
            filteredResources.map((r) => renderCard(r))
          )}
        </div>
      </div>

      {/* Add / Edit Resource Modal */}
      {modalOpen && (
        <div className="res-modal-overlay" onClick={closeModal}>
          <div
            className="res-modal"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="modalTitle"
          >
            <div className="res-modal-header">
              <h3>
                <i className="fas fa-hand-holding-heart"></i>{' '}
                <span id="modalTitle">
                  {editingResource ? 'Edit Resource' : 'Add Resource'}
                </span>
              </h3>
              <button type="button" className="res-modal-close" onClick={closeModal} title="Close">
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
                    placeholder="Brief supportive description of this wellness service..."
                    rows="3"
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  ></textarea>
                </div>

                <div className="form-row">
                  <label htmlFor="fLink">Contact / Access Link *</label>
                  <input
                    type="text"
                    id="fLink"
                    placeholder="e.g., tel:1553, sms:741741, or https://..."
                    required
                    value={formData.link}
                    onChange={(e) => setFormData({ ...formData, link: e.target.value })}
                  />
                  <div className="hint">
                    Use <code>tel:</code> for hotlines, <code>sms:</code> for text services, or <code>https://</code> for websites.
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
                      <option value="HOTLINE">Hotline</option>
                      <option value="CAMPUS">Campus Support</option>
                      <option value="EXTERNAL_LINK">External Link</option>
                      <option value="CHAT_SERVICE">Chat Service</option>
                    </select>
                  </div>
                  <div className="form-row">
                    <label htmlFor="fIcon">FontAwesome Icon Class</label>
                    <input
                      type="text"
                      id="fIcon"
                      placeholder="e.g. fas fa-phone"
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
                    placeholder="e.g., Sad, Anxious, Lonely (comma-separated)"
                    value={formData.emotionTags}
                    onChange={(e) => setFormData({ ...formData, emotionTags: e.target.value })}
                  />
                  <div className="hint">Optional backend recommendation tags. Leave empty for all emotions.</div>
                </div>

                <div className="form-row-inline">
                  <div className="form-row">
                    <label htmlFor="fMinEnergy">Min Energy Score (0-10)</label>
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
                    <label htmlFor="fMaxEnergy">Max Energy Score (0-10)</label>
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
                    <div className="hint">Lower number = prioritized in recommendation queues</div>
                  </div>
                  <div className="form-row" style={{ display: 'flex', alignItems: 'center' }}>
                    <div className="checkbox-wrap" style={{ marginTop: '1.25rem' }}>
                      <input
                        type="checkbox"
                        id="fCrisisOnly"
                        checked={formData.crisisOnly}
                        onChange={(e) => setFormData({ ...formData, crisisOnly: e.target.checked })}
                      />
                      <label htmlFor="fCrisisOnly">Crisis intervention only</label>
                    </div>
                  </div>
                </div>
              </form>
            </div>
            <div className="res-modal-footer">
              <button type="button" className="btn-res" onClick={closeModal}>
                Cancel
              </button>
              <button
                type="button"
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

      {/* Notification Toast */}
      {toastMsg && <div className="res-toast">{toastMsg}</div>}
    </div>
  );
}
