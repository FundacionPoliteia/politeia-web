'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { marked } from 'marked';
import RichTextEditor from './RichTextEditor';
import AuthorCard from './AuthorCard';
import AuthorEnd from './AuthorEnd';
import BlogIndex from './BlogIndex';
import NewsletterAdminPanel from './NewsletterAdminPanel';
import AdminOperationsPanel from './AdminOperationsPanel';
import { parseTagsText, sanitizeCategory, sanitizeTags, taxonomyKey } from '../lib/taxonomy';

const API_BASE = process.env.NEXT_PUBLIC_BLOG_API_BASE_URL || '';
const GOOGLE_CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || '';
const PUBLIC_SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || 'https://www.politeia.ar').replace(/\/$/, '');
const APP_VERSION = process.env.NEXT_PUBLIC_APP_VERSION || '1.0.0';
const ALLOWED_EMAIL_DOMAIN = 'politeia.ar';
const ASSIGNED_EMAIL_DOMAIN = 'gmail.com';
const SHOW_EMAIL_SETTINGS_UI = process.env.NEXT_PUBLIC_EMAIL_SETTINGS_ENABLED !== 'false';
const NOTIFICATION_REFRESH_MS = 60 * 1000;
const DEFAULT_NOTIFICATION_POLICY = { recentDays: 3, retentionDays: 7 };


const EMPTY_FORM = {
  id: '',
  title: '',
  slug: '',
  excerpt: '',
  contentMarkdown: '',
  coverImage: '',
  authorName: '',
  authorNote: '',
  showAuthorNote: false,
  category: '',
  tagsText: '',
  status: '',
  editRequestedAt: '',
  editRequestedBy: '',
  showCoverInPost: true,
};

const FORM_STRING_FIELDS = Object.keys(EMPTY_FORM).filter((field) => !['showCoverInPost', 'showAuthorNote'].includes(field));

const STATUS_LABELS = {
  draft: 'Borrador',
  review: 'En revisión',
  published: 'Publicado',
  'published-edition': 'Publicado en edición',
  archived: 'Archivado',
};

const REVIEW_STATUS_FILTERS = [
  { value: 'review', label: 'En revisión' },
  { value: 'archived', label: 'Archivados' },
  { value: 'published', label: 'Publicados' },
];

const BLOG_STATUS_FILTERS = [
  { value: '', label: 'Todos' },
  { value: 'review', label: 'En revisión' },
  { value: 'published', label: 'Publicados' },
];

const ASSIGNABLE_ROLES = [
  { value: 'admin', label: 'Admin' },
  { value: 'reviewer', label: 'Reviewer' },
  { value: 'blog', label: 'Blog' },
  { value: 'newsletter', label: 'Newsletter' },
];
const ROLE_LABELS = Object.fromEntries(ASSIGNABLE_ROLES.map((role) => [role.value, role.label]));

const NOTIFICATION_EVENT_LABELS = [
  { value: 'roleChanged', label: 'Cambios en mis permisos', roles: [], always: true },
  { value: 'postSubmittedReview', label: 'Posts enviados a revision', roles: ['admin', 'reviewer'] },
  { value: 'commentCreated', label: 'Comentarios nuevos en mis posts', roles: ['blog'] },
  { value: 'commentResolved', label: 'Comentarios resueltos', roles: ['blog'] },
  { value: 'commentReopened', label: 'Comentarios reabiertos', roles: ['blog'] },
  { value: 'postPublished', label: 'Mis posts publicados', roles: ['blog'] },
  { value: 'postEditRequested', label: 'Solicitudes de edición', roles: ['admin', 'reviewer'] },
  { value: 'postEditEnabled', label: 'Edición habilitada en mis posts', roles: ['blog'] },
];

const DEFAULT_NOTIFICATION_EVENTS = Object.fromEntries(
  NOTIFICATION_EVENT_LABELS.map((event) => [event.value, false])
);

const CLAIM_NOTIFICATION_EVENT_LABELS = [
  { value: 'profileClaimRequested', label: 'Solicitudes de vinculacion de perfiles', roles: ['admin'] },
  { value: 'profileClaimApproved', label: 'Vinculaciones de perfil aprobadas', roles: ['blog'] },
  { value: 'profileClaimBlocked', label: 'Vinculaciones de perfil bloqueadas', roles: ['blog'] },
  { value: 'profileClaimReleased', label: 'Vinculaciones de perfil desbloqueadas', roles: ['blog'] },
  { value: 'profileClaimSuperseded', label: 'Perfiles reclamados por otra cuenta', roles: ['blog'] },
];
NOTIFICATION_EVENT_LABELS.push(...CLAIM_NOTIFICATION_EVENT_LABELS);
Object.assign(DEFAULT_NOTIFICATION_EVENTS, Object.fromEntries(
  CLAIM_NOTIFICATION_EVENT_LABELS.map((event) => [event.value, false])
));

const PROFILE_CLAIM_STATUS_LABELS = {
  pending: 'Pendiente',
  processing: 'Procesando',
  approved: 'Aprobada',
  blocked: 'Bloqueada',
  released: 'Desbloqueada',
  withdrawn: 'Cancelada',
  superseded: 'Perfil no disponible',
};

const DEFAULT_PROFILE_PHOTO = '/default_profile.png';

const EMPTY_PROFILE = {
  firstName: '',
  lastName: '',
  description: '',
  focusArea: '',
  closingPhrase: '',
  photoUrl: '',
  publicProfileEnabled: true,
  canSharePublicProfile: false,
  authorSlug: '',
  fullName: '',
  createdAt: '',
  updatedAt: '',
};

const EMPTY_MANAGED_AUTHOR_PROFILE = {
  firstName: '',
  lastName: '',
  description: '',
  focusArea: '',
  closingPhrase: '',
  photoUrl: '',
  publicProfileEnabled: true,
};

const PROFILE_PREVIEW_AUTHORS = [
  {
    fullName: 'Autora de ejemplo',
    description: 'Investiga como las instituciones transforman la vida cotidiana y las formas de participacion.',
    focusArea: 'Instituciones y ciudadania',
    postCount: 6,
    latestPostTitle: 'Nuevas formas de participar',
    categories: ['Democracia', 'Ciudadania'],
  },
  {
    fullName: 'Autor de ejemplo',
    description: 'Escribe sobre los debates publicos que conectan tecnologia, derechos y democracia.',
    focusArea: 'Tecnologia y derechos',
    postCount: 4,
    latestPostTitle: 'Tecnologia para lo publico',
    categories: ['Innovacion', 'Derechos'],
  },
];

function ActionSpinner({ active }) {
  return active ? <span className="admin-button-spinner" aria-hidden="true" /> : null;
}

function NotificationDayGroups({ groups = [], onOpen }) {
  return groups.map((group) => (
    <section className="admin-inbox-day" key={group.key}>
      <div className="admin-inbox-day-label">
        <span>{group.label}</span>
      </div>
      {group.items.map((notification) => (
        <button
          className={`admin-inbox-item ${notification.readAt ? '' : 'unread'} ${notificationToneClass(notification)}`}
          key={notification.id}
          onClick={() => onOpen(notification)}
          type="button"
        >
          <span className={`admin-inbox-icon ${notification.readAt ? '' : 'unread'}`}>
            <span aria-hidden="true" className="material-symbols-outlined">{notificationIcon(notification.type)}</span>
          </span>
          <span>
            <strong>{notificationTitle(notification)}</strong>
            <small>{notification.actorName ? `${notification.actorName} - ` : ''}{formatAdminDate(notification.createdAt)}</small>
            {notification.commentSelectedText && <q>{notification.commentSelectedText}</q>}
          </span>
        </button>
      ))}
    </section>
  ));
}

export default function AdminConsole() {
  const [checkingSession, setCheckingSession] = useState(true);
  const [user, setUser] = useState(null);
  const [posts, setPosts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [form, setForm] = useState(EMPTY_FORM);
  const [savedForm, setSavedForm] = useState(EMPTY_FORM);
  const [statusFilter, setStatusFilter] = useState('');
  const [postSearch, setPostSearch] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [actionBusy, setActionBusy] = useState({});
  const [uploading, setUploading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [googleButtonStatus, setGoogleButtonStatus] = useState(GOOGLE_CLIENT_ID ? 'loading' : 'disabled');
  const [isLocalPanelHost, setIsLocalPanelHost] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [profilePreviewOpen, setProfilePreviewOpen] = useState(false);
  const [profileConsentOpen, setProfileConsentOpen] = useState(false);
  const [previewCardOpen, setPreviewCardOpen] = useState(true);
  const [pendingAction, setPendingAction] = useState(null);
  const [editRequestConfirmOpen, setEditRequestConfirmOpen] = useState(false);
  const [categoryDeleteTarget, setCategoryDeleteTarget] = useState(null);
  const [categoryDropdownOpen, setCategoryDropdownOpen] = useState(false);
  const [categorySearchTerm, setCategorySearchTerm] = useState('');
  const [coverMode, setCoverMode] = useState('url');
  const [coverImageError, setCoverImageError] = useState('');
  const [adminUsersOpen, setAdminUsersOpen] = useState(false);
  const [adminUsers, setAdminUsers] = useState([]);
  const [adminUserDrafts, setAdminUserDrafts] = useState({});
  const [adminUserEmail, setAdminUserEmail] = useState('');
  const [adminUserNewRoles, setAdminUserNewRoles] = useState(['blog']);
  const [adminUserSearch, setAdminUserSearch] = useState('');
  const [adminManagerOpen, setAdminManagerOpen] = useState(false);
  const [selectedAdminPostIds, setSelectedAdminPostIds] = useState([]);
  const [notificationPreferences, setNotificationPreferences] = useState(null);
  const [notificationPreferencesOpen, setNotificationPreferencesOpen] = useState(false);
  const [savingNotificationPreferences, setSavingNotificationPreferences] = useState(false);
  const [inAppNotifications, setInAppNotifications] = useState([]);
  const [unreadNotificationCount, setUnreadNotificationCount] = useState(0);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [loadingNotifications, setLoadingNotifications] = useState(false);
  const [showPreviousNotifications, setShowPreviousNotifications] = useState(false);
  const [notificationPolicy, setNotificationPolicy] = useState(DEFAULT_NOTIFICATION_POLICY);
  const [notificationActionDialog, setNotificationActionDialog] = useState(null);
  const [notificationHighlight, setNotificationHighlight] = useState({ target: '', nonce: 0 });
  const [mobilePostsOpen, setMobilePostsOpen] = useState(false);
  const [activePanelTab, setActivePanelTab] = useState('blogs');
  const [userProfile, setUserProfile] = useState(EMPTY_PROFILE);
  const [profileDraft, setProfileDraft] = useState(EMPTY_PROFILE);
  const [adminProfiles, setAdminProfiles] = useState([]);
  const [adminProfileDraft, setAdminProfileDraft] = useState(EMPTY_MANAGED_AUTHOR_PROFILE);
  const [adminProfileEditingId, setAdminProfileEditingId] = useState('');
  const [adminProfilePhotoMode, setAdminProfilePhotoMode] = useState('url');
  const [adminProfileDeleteTarget, setAdminProfileDeleteTarget] = useState(null);
  const [profileClaimMatch, setProfileClaimMatch] = useState({ candidate: null, claim: null, nameLocked: false });
  const [profileClaimConfirmOpen, setProfileClaimConfirmOpen] = useState(false);
  const [adminProfileClaims, setAdminProfileClaims] = useState([]);
  const [adminProfileClaimFilter, setAdminProfileClaimFilter] = useState('pending');
  const [adminProfileClaimsOpen, setAdminProfileClaimsOpen] = useState(false);
  const [adminProfileEditorOpen, setAdminProfileEditorOpen] = useState(true);
  const [adminProfileClaimDialog, setAdminProfileClaimDialog] = useState(null);
  const [adminProfileClaimReason, setAdminProfileClaimReason] = useState('');
  const [savingProfile, setSavingProfile] = useState(false);
  const [profilePhotoUploading, setProfilePhotoUploading] = useState(false);
  const [reviewComments, setReviewComments] = useState([]);
  const [reviewCommentFilter, setReviewCommentFilter] = useState('open');
  const [activeReviewCommentId, setActiveReviewCommentId] = useState('');
  const [activeReviewCommentNonce, setActiveReviewCommentNonce] = useState(0);
  const [editingReviewComment, setEditingReviewComment] = useState(null);
  const [reviewCommentDialog, setReviewCommentDialog] = useState(null);
  const [useManualAuthorNote, setUseManualAuthorNote] = useState(false);
  const signInRef = useRef(null);
  const googlePromptAttemptedRef = useRef(false);
  const userRef = useRef(null);
  const docxInputRef = useRef(null);
  const profilePhotoInputRef = useRef(null);
  const adminProfilePhotoInputRef = useRef(null);
  const profilePermissionsRef = useRef(null);
  const coverValidationRef = useRef(0);

  const roles = user?.roles || [];
  const isAdmin = roles.includes('admin');
  const isPrimaryDomainUser = isPrimaryDomainEmail(user?.email);
  const isReviewer = roles.includes('reviewer');
  const isNewsletterManager = roles.includes('newsletter');
  const isBlogAuthor = roles.includes('blog') || isReviewer || isAdmin;
  const canAccessEditorialPanel = isBlogAuthor;
  const canAccessProfilePanel = Boolean(user) && (canAccessEditorialPanel || isNewsletterManager || isPrimaryDomainUser);
  const canAccessPanel = canAccessEditorialPanel || isNewsletterManager || canAccessProfilePanel;
  const canCreatePosts = isBlogAuthor;
  const canEditPosts = canAccessEditorialPanel;
  const canChooseSlug = isAdmin || isReviewer;
  const canManageCategories = isAdmin || isReviewer;
  const canSubmitReview = isBlogAuthor;
  const canPublishPosts = isAdmin || isReviewer;
  const canDeletePosts = isAdmin;
  const canUseReviewFilters = isAdmin || isReviewer;
  const canManageUsers = isAdmin && isPrimaryDomainUser;
  const canReviewProfiles = isAdmin;
  const canAccessRolesMailPanel = canManageUsers;
  const canAccessNewsletterPanel = isNewsletterManager;
  const defaultPanelTab = canAccessEditorialPanel ? 'blogs' : canAccessNewsletterPanel ? 'newsletter' : 'profile';
  const accountAuthorName = user?.name || user?.email || '';
  const profileAuthorName = profileDraft.fullName || userProfile.fullName || accountAuthorName;
  const profileClosingPhrase = profileDraft.closingPhrase || userProfile.closingPhrase || '';
  const profileNavPhoto = profileDraft.photoUrl || userProfile.photoUrl || DEFAULT_PROFILE_PHOTO;
  const hasAuthorProfile = Boolean(profileDraft.fullName || userProfile.fullName);
  const profileNameMatchesLoadedAuthor = useMemo(() => {
    const key = taxonomyKey(profileDraft.fullName);
    if (!key) return false;
    return posts.some((post) => taxonomyKey(post.authorName) === key);
  }, [posts, profileDraft.fullName]);
  const canShowProfileOptIn = Boolean(profileDraft.canSharePublicProfile || profileNameMatchesLoadedAuthor);
  const adminProfileBeingEdited = useMemo(
    () => adminProfiles.find((profile) => profile.id === adminProfileEditingId) || null,
    [adminProfiles, adminProfileEditingId]
  );
  const pendingAdminProfileClaimCount = useMemo(
    () => adminProfileClaims.filter((claim) => ['pending', 'processing'].includes(claim.status)).length,
    [adminProfileClaims]
  );
  const activeStatusFilter = statusFilter;
  const publishedAuthorLocked = Boolean(form.id && !canPublishPosts && ['published', 'archived'].includes(form.status));
  const editingLivePost = form.status === 'published-edition';
  const editRequestPending = Boolean(form.editRequestedAt);
  const editorBusy = busy || publishedAuthorLocked;
  const roleLabel = isAdmin ? 'Panel' : isReviewer ? 'Panel de revision' : isNewsletterManager && !isBlogAuthor ? 'Panel de newsletter' : isBlogAuthor ? 'Panel de blog' : 'Perfil';
  const isLocalApiBase = isLocalApiUrl(API_BASE);
  const hasUnsavedChanges = useMemo(
    () => serializeForm(form) !== serializeForm(savedForm),
    [form, savedForm]
  );
  const notificationBuckets = useMemo(
    () => partitionNotifications(inAppNotifications, notificationPolicy.recentDays),
    [inAppNotifications, notificationPolicy.recentDays]
  );
  const notificationDayGroups = useMemo(
    () => groupNotificationsByDay(notificationBuckets.visible),
    [notificationBuckets.visible]
  );
  const previousNotificationDayGroups = useMemo(
    () => groupNotificationsByDay(notificationBuckets.previous),
    [notificationBuckets.previous]
  );

  useEffect(() => {
    setIsLocalPanelHost(isLocalHostname(window.location.hostname));
  }, []);

  useEffect(() => {
    userRef.current = user;
  }, [user]);

  useEffect(() => {
    if (!GOOGLE_CLIENT_ID) return;

    const existing = document.querySelector('script[data-google-identity]');
    if (existing) {
      if (!user) initializeGoogle();
      return;
    }

    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    script.dataset.googleIdentity = 'true';
    script.onload = initializeGoogle;
    script.onerror = () => setGoogleButtonStatus('failed');
    document.head.appendChild(script);
  }, [user]);

  useEffect(() => {
    if (!GOOGLE_CLIENT_ID || checkingSession || user) return;

    const timeoutId = window.setTimeout(() => {
      initializeGoogle();
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, [checkingSession, user]);

  useEffect(() => {
    if (user) clearGoogleSignIn();
  }, [user]);

  useEffect(() => {
    if (notificationHighlight.target !== 'profile-permissions' || activePanelTab !== 'profile') return undefined;

    const scrollTimer = window.setTimeout(() => {
      profilePermissionsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 80);
    const clearTimer = window.setTimeout(() => {
      setNotificationHighlight((current) => (
        current.nonce === notificationHighlight.nonce ? { target: '', nonce: current.nonce } : current
      ));
    }, 4200);

    return () => {
      window.clearTimeout(scrollTimer);
      window.clearTimeout(clearTimer);
    };
  }, [activePanelTab, notificationHighlight]);

  useEffect(() => {
    loadMe({ silent: true });
  }, []);

  useEffect(() => {
    if (!user?.email) return undefined;

    const intervalId = window.setInterval(() => {
      loadMe({ silent: true });
    }, NOTIFICATION_REFRESH_MS);
    const refreshSessionWhenVisible = () => {
      if (document.visibilityState === 'visible') loadMe({ silent: true });
    };

    document.addEventListener('visibilitychange', refreshSessionWhenVisible);
    return () => {
      window.clearInterval(intervalId);
      document.removeEventListener('visibilitychange', refreshSessionWhenVisible);
    };
  }, [user?.email]);

  useEffect(() => {
    if (canAccessEditorialPanel) {
      loadPosts();
      loadCategories();
    } else {
      setPosts([]);
      setCategories([]);
    }
  }, [canAccessEditorialPanel, activeStatusFilter]);

  useEffect(() => {
    if (canManageUsers) loadAdminUsers();
  }, [canManageUsers]);

  useEffect(() => {
    if (canReviewProfiles && activePanelTab === 'profiles') {
      loadAdminProfiles();
      loadAdminProfileClaims();
    } else if (!canReviewProfiles) {
      setAdminProfiles([]);
      setAdminProfileClaims([]);
    }
  }, [activePanelTab, canReviewProfiles]);

  useEffect(() => {
    if (canAccessPanel) {
      loadNotificationPreferences();
      loadUserProfile();
      loadInAppNotifications({ silent: true });
      const intervalId = window.setInterval(() => {
        loadInAppNotifications({ silent: true });
      }, NOTIFICATION_REFRESH_MS);
      const refreshWhenVisible = () => {
        if (document.visibilityState === 'visible') loadInAppNotifications({ silent: true });
      };
      document.addEventListener('visibilitychange', refreshWhenVisible);
      return () => {
        window.clearInterval(intervalId);
        document.removeEventListener('visibilitychange', refreshWhenVisible);
      };
    } else {
      setNotificationPreferences(null);
      setUserProfile(EMPTY_PROFILE);
      setProfileDraft(EMPTY_PROFILE);
      setInAppNotifications([]);
      setUnreadNotificationCount(0);
      setNotificationsOpen(false);
      setShowPreviousNotifications(false);
      setNotificationPolicy(DEFAULT_NOTIFICATION_POLICY);
    }
  }, [canAccessPanel]);

  useEffect(() => {
    setSelectedAdminPostIds((current) => current.filter((id) => posts.some((post) => post.id === id)));
  }, [posts]);

  useEffect(() => {
    if (form.id && canAccessEditorialPanel) {
      setEditingReviewComment(null);
      loadReviewComments(form.id);
    } else {
      setReviewComments([]);
      setActiveReviewCommentId('');
      setActiveReviewCommentNonce(0);
      setEditingReviewComment(null);
      setReviewCommentDialog(null);
      setReviewCommentDialog(null);
    }
  }, [form.id, canAccessEditorialPanel]);

  useEffect(() => {
    const canUseProfileAuthor = !form.id && profileAuthorName && (!form.authorName || form.authorName === accountAuthorName);
    if (canUseProfileAuthor) {
      setForm((current) => normalizeForm({
        ...current,
        authorName: profileAuthorName,
        showAuthorNote: current.showAuthorNote || hasAuthorProfile,
      }));
      setSavedForm((current) => normalizeForm({
        ...current,
        authorName: profileAuthorName,
        showAuthorNote: current.showAuthorNote || hasAuthorProfile,
      }));
    }
  }, [accountAuthorName, form.authorName, form.id, hasAuthorProfile, profileAuthorName]);

  useEffect(() => {
    if (!canAccessEditorialPanel && activePanelTab === 'blogs') {
      setActivePanelTab(defaultPanelTab);
    }
    if (!canAccessRolesMailPanel && activePanelTab === 'access') {
      setActivePanelTab(defaultPanelTab);
    }
    if (!canAccessNewsletterPanel && activePanelTab === 'newsletter') {
      setActivePanelTab(defaultPanelTab);
    }
    if (!canAccessProfilePanel && activePanelTab === 'profile') {
      setActivePanelTab(defaultPanelTab);
    }
    if (!canReviewProfiles && activePanelTab === 'profiles') {
      setActivePanelTab(defaultPanelTab);
    }
  }, [activePanelTab, canAccessEditorialPanel, canAccessNewsletterPanel, canAccessProfilePanel, canAccessRolesMailPanel, canReviewProfiles, defaultPanelTab]);

  useEffect(() => {
    const hasOpenModal = previewOpen
      || profilePreviewOpen
      || profileConsentOpen
      || pendingAction
      || editRequestConfirmOpen
      || categoryDeleteTarget
      || adminProfileDeleteTarget
      || profileClaimConfirmOpen
      || adminProfileClaimDialog
      || notificationActionDialog
      || reviewCommentDialog
      || editingReviewComment;
    if (!hasOpenModal) return undefined;

    function handleModalEscape(event) {
      if (event.key !== 'Escape' || busy || savingProfile) return;
      if (reviewCommentDialog) {
        setReviewCommentDialog(null);
        return;
      }
      if (editingReviewComment) {
        setEditingReviewComment(null);
        return;
      }
      if (adminProfileDeleteTarget) {
        setAdminProfileDeleteTarget(null);
        return;
      }
      if (notificationActionDialog) {
        setNotificationActionDialog(null);
        return;
      }
      if (adminProfileClaimDialog) {
        setAdminProfileClaimDialog(null);
        setAdminProfileClaimReason('');
        return;
      }
      if (profileClaimConfirmOpen) {
        setProfileClaimConfirmOpen(false);
        return;
      }
      if (categoryDeleteTarget) {
        setCategoryDeleteTarget(null);
        return;
      }
      if (editRequestConfirmOpen) {
        setEditRequestConfirmOpen(false);
        return;
      }
      if (pendingAction) {
        setPendingAction(null);
        return;
      }
      if (profileConsentOpen) {
        setProfileConsentOpen(false);
        return;
      }
      if (profilePreviewOpen) {
        setProfilePreviewOpen(false);
        return;
      }
      if (previewOpen) setPreviewOpen(false);
    }

    window.addEventListener('keydown', handleModalEscape);
    return () => window.removeEventListener('keydown', handleModalEscape);
  }, [adminProfileClaimDialog, adminProfileDeleteTarget, busy, categoryDeleteTarget, editRequestConfirmOpen, editingReviewComment, notificationActionDialog, pendingAction, previewOpen, profileClaimConfirmOpen, profileConsentOpen, profilePreviewOpen, reviewCommentDialog, savingProfile]);

  function initializeGoogle() {
    if (userRef.current) {
      clearGoogleSignIn();
      return;
    }
    if (!window.google || !signInRef.current || !GOOGLE_CLIENT_ID) {
      setGoogleButtonStatus(GOOGLE_CLIENT_ID ? 'failed' : 'disabled');
      return;
    }

    try {
      signInRef.current.innerHTML = '';
      setGoogleButtonStatus('loading');
      window.google.accounts.id.initialize({
        client_id: GOOGLE_CLIENT_ID,
        callback: ({ credential }) => loginWithGoogle(credential),
      });
      window.google.accounts.id.renderButton(signInRef.current, {
        theme: 'outline',
        size: 'large',
        text: 'signin_with',
        shape: 'pill',
        width: 260,
      });
      if (!googlePromptAttemptedRef.current) {
        googlePromptAttemptedRef.current = true;
        window.google.accounts.id.prompt();
      }
      window.setTimeout(() => {
        setGoogleButtonStatus(signInRef.current?.childElementCount ? 'ready' : 'failed');
      }, 1200);
    } catch (_err) {
      setGoogleButtonStatus('failed');
    }
  }

  function clearGoogleSignIn() {
    if (signInRef.current) signInRef.current.innerHTML = '';
    setGoogleButtonStatus(GOOGLE_CLIENT_ID ? 'loading' : 'disabled');
    try {
      window.google?.accounts?.id?.cancel();
    } catch (_err) {
      // Google Identity can throw if the prompt was not initialized yet.
    }
  }

  async function api(path, options = {}) {
    if (!API_BASE) throw new Error('Falta NEXT_PUBLIC_BLOG_API_BASE_URL');
    const res = await fetch(`${API_BASE}${path}`, {
      ...options,
      credentials: 'include',
      headers: {
        ...(options.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }),
        ...(options.headers || {}),
      },
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      if (res.status === 401 || res.status === 403) {
        void loadMe({ silent: true });
      }
      throw new Error(data?.error?.message || `Error ${res.status}`);
    }
    return data;
  }

  function setActionLoading(key, value) {
    if (!key) return;
    setActionBusy((current) => {
      if (value) return { ...current, [key]: true };
      const next = { ...current };
      delete next[key];
      return next;
    });
  }

  function isActionLoading(key) {
    if (!key) return false;
    if (actionBusy[key]) return true;
    return Object.keys(actionBusy).some((activeKey) => activeKey.startsWith(`${key}:`));
  }

  async function withActionLoading(key, task) {
    setActionLoading(key, true);
    try {
      return await task();
    } finally {
      setActionLoading(key, false);
    }
  }

  async function loadMe({ silent = false } = {}) {
    if (!API_BASE) {
      setCheckingSession(false);
      return;
    }

    try {
      if (!silent) setMessage('');
      const res = await fetch(`${API_BASE}/v1/me`, {
        credentials: 'include',
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error?.message || 'No pudimos validar tu perfil');
      if (!isAllowedEmail(data.user?.email)) {
        throw new Error(`Solo pueden ingresar cuentas habilitadas.`);
      }
      setUser(data.user);
    } catch (err) {
      setUser(null);
      if (!silent) setMessage(authErrorMessage(err));
    } finally {
      setCheckingSession(false);
    }
  }

  async function loginWithGoogle(credential) {
    try {
      setMessage('');
      const res = await fetch(`${API_BASE}/v1/auth/google`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ credential }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error?.message || 'No pudimos iniciar sesion');
      if (!isAllowedEmail(data.user?.email)) {
        throw new Error(`Solo pueden ingresar cuentas habilitadas.`);
      }
      setUser(data.user);
    } catch (_err) {
      setUser(null);
      setMessage('No pudimos autorizar esta cuenta. Verifica que este habilitada e intenta nuevamente.');
    }
  }

  async function logout() {
    try {
      await fetch(`${API_BASE}/v1/auth/logout`, {
        method: 'POST',
        credentials: 'include',
      });
    } finally {
      googlePromptAttemptedRef.current = false;
      setUser(null);
      setPosts([]);
      setCategories([]);
      setActionBusy({});
      setPostSearch('');
      setForm(EMPTY_FORM);
      setSavedForm(EMPTY_FORM);
      setUseManualAuthorNote(false);
      setCoverImageError('');
      setPendingAction(null);
      setCategoryDeleteTarget(null);
      setCategoryDropdownOpen(false);
      setCategorySearchTerm('');
      setAdminUsersOpen(false);
      setAdminUsers([]);
      setAdminUserDrafts({});
      setAdminUserEmail('');
      setProfileClaimMatch({ candidate: null, claim: null, nameLocked: false });
      setProfileClaimConfirmOpen(false);
      setAdminProfileClaims([]);
      setAdminProfileClaimDialog(null);
      setAdminProfileClaimReason('');
      setAdminUserNewRoles(['blog']);
      setAdminUserSearch('');
      setAdminManagerOpen(false);
      setSelectedAdminPostIds([]);
      setNotificationPreferences(null);
      setNotificationPreferencesOpen(false);
      setInAppNotifications([]);
      setUnreadNotificationCount(0);
      setNotificationsOpen(false);
      setNotificationActionDialog(null);
      setNotificationHighlight({ target: '', nonce: 0 });
      setLoadingNotifications(false);
      setUserProfile(EMPTY_PROFILE);
      setProfileDraft(EMPTY_PROFILE);
      setSavingProfile(false);
      setProfilePhotoUploading(false);
      setActivePanelTab('blogs');
      setReviewComments([]);
      setActiveReviewCommentId('');
      setActiveReviewCommentNonce(0);
      setEditingReviewComment(null);
      setReviewCommentDialog(null);
      setMessage('');
    }
  }

  async function loadPosts() {
    try {
      setBusy(true);
      const query = activeStatusFilter ? `?status=${activeStatusFilter}` : '';
      const data = await api(`/v1/posts/manage${query}`);
      const items = data.items || [];
      setPosts(items);
      return items;
    } catch (err) {
      setMessage(err.message);
      return [];
    } finally {
      setBusy(false);
    }
  }

  async function loadCategories() {
    try {
      const data = await api('/v1/categories');
      setCategories(data.items || []);
    } catch (err) {
      setMessage(err.message);
    }
  }

  async function loadAdminUsers() {
    try {
      const data = await api('/v1/users');
      const items = data.items || [];
      setAdminUsers(items);
      setAdminUserDrafts((current) => {
        const next = { ...current };
        items.forEach((item) => {
          if (!next[item.email]) next[item.email] = item.roles || [];
        });
        return next;
      });
    } catch (err) {
      setMessage(err.message);
    }
  }

  async function loadReviewComments(postId) {
    try {
      const data = await api(`/v1/posts/${postId}/comments`);
      const items = (data.items || []).map(normalizeReviewComment);
      setReviewComments(items);
      return items;
    } catch (err) {
      setMessage(err.message);
      return [];
    }
  }

  async function loadNotificationPreferences() {
    try {
      const data = await api('/v1/notifications/preferences');
      setNotificationPreferences(normalizeNotificationPreferences(data.item));
    } catch (err) {
      setMessage(err.message);
    }
  }

  async function loadInAppNotifications({ silent = false } = {}) {
    try {
      if (!silent) setLoadingNotifications(true);
      const data = await api('/v1/notifications/inbox?limit=100');
      setInAppNotifications((data.items || []).map(normalizeInAppNotification));
      setUnreadNotificationCount(Number(data.unreadCount) || 0);
      setNotificationPolicy(normalizeNotificationPolicy(data));
    } catch (err) {
      if (!silent) setMessage(err.message);
    } finally {
      if (!silent) setLoadingNotifications(false);
    }
  }

  async function markNotificationRead(notification) {
    if (!notification?.id) return null;
    const data = await api(`/v1/notifications/${encodeURIComponent(notification.id)}/read`, {
      method: 'PATCH',
    });
    if (data.item) {
      const nextItem = normalizeInAppNotification(data.item);
      setInAppNotifications((current) => current.map((item) => item.id === nextItem.id ? nextItem : item));
      setUnreadNotificationCount((current) => Math.max(0, current - (notification.readAt ? 0 : 1)));
      return nextItem;
    }
    return null;
  }

  async function markAllNotificationsRead() {
    try {
      setLoadingNotifications(true);
      const data = await api('/v1/notifications/read-all', { method: 'POST' });
      setInAppNotifications((data.items || []).map(normalizeInAppNotification));
      setUnreadNotificationCount(Number(data.unreadCount) || 0);
      setNotificationPolicy(normalizeNotificationPolicy(data));
    } catch (err) {
      setMessage(err.message);
    } finally {
      setLoadingNotifications(false);
    }
  }

  async function openInAppNotification(notification) {
    try {
      setMessage('');
      await markNotificationRead(notification);
      setNotificationsOpen(false);
      if (notification.type === 'user.roles.changed') {
        setActivePanelTab('profile');
        await Promise.all([loadMe({ silent: true }), loadUserProfile()]);
        setNotificationHighlight({ target: 'profile-permissions', nonce: Date.now() });
        setMessage('Estos son los permisos vigentes de tu cuenta.');
        return;
      }
      if (notification.profileClaimId) {
        if (isAdmin && notification.type === 'profile.claim.requested') {
          setActivePanelTab('profiles');
          const claims = await loadAdminProfileClaims();
          const claim = claims.map(normalizeProfileClaim).find((item) => item.id === notification.profileClaimId);
          if (claim) setAdminProfileClaimDialog({ claim, action: 'review' });
          else setMessage('La solicitud asociada ya no esta disponible.');
        } else {
          setActivePanelTab('profile');
          await Promise.all([loadMe({ silent: true }), loadUserProfile()]);
          setMessage(notification.subject || 'Abrimos el estado de tu vinculacion de perfil.');
          if (notification.type === 'profile.claim.approved') {
            setStatusFilter('');
            await loadPosts();
          }
        }
        return;
      }
      if (!notification.postId) return;
      setActivePanelTab('blogs');
      setStatusFilter('');
      const data = await api('/v1/posts/manage');
      const items = data.items || [];
      setPosts(items);
      const post = items.find((item) => item.id === notification.postId);
      if (!post) {
        setMessage('No pudimos encontrar el post asociado a la notificacion.');
        return;
      }
      selectPostForEdit(post);
      if (notification.commentId) {
        setReviewCommentFilter('all');
        focusReviewComment(notification.commentId);
        const comments = await loadReviewComments(post.id);
        const comment = comments.find((item) => item.id === notification.commentId);
        if (comment) {
          openReviewCommentDialog(comment, 'reply');
        } else {
          setMessage('El comentario asociado ya no esta disponible.');
        }
        return;
      }
      openPostNotificationContext(notification, post);
    } catch (err) {
      setMessage(err.message);
    }
  }

  function openPostNotificationContext(notification, post) {
    const postTitle = post?.title || notification.postTitle || 'la nota';
    const postSlug = post?.slug || notification.postSlug;

    if (notification.type === 'post.published') {
      setNotificationActionDialog({
        title: 'Post publicado',
        message: `“${postTitle}” ya esta disponible en el blog publico.`,
        actionLabel: 'Ir al blog publicado',
        href: postSlug ? `${PUBLIC_SITE_URL}/blog/${encodeURIComponent(postSlug)}` : `${PUBLIC_SITE_URL}/blog`,
      });
      return;
    }

    const contexts = {
      'post.submittedReview': {
        title: 'Post enviado a revision',
        message: `Abrimos “${postTitle}” para que puedas continuar con la revision.`,
        actionLabel: 'Continuar revisando',
      },
      'post.editRequested': {
        title: 'Solicitud de edicion',
        message: `Abrimos “${postTitle}” y su solicitud de edicion para que puedas evaluarla.`,
        actionLabel: 'Revisar solicitud',
      },
      'post.editEnabled': {
        title: 'Edicion habilitada',
        message: `“${postTitle}” ya esta abierto para realizar cambios.`,
        actionLabel: 'Continuar editando',
      },
    };
    const context = contexts[notification.type];
    if (context) {
      setNotificationActionDialog(context);
      return;
    }

    setMessage(`Abrimos “${postTitle}” en el gestor.`);
  }

  async function saveNotificationPreferences() {
    if (!notificationPreferences) return;
    try {
      setSavingNotificationPreferences(true);
      setMessage('');
      const data = await withActionLoading('notification-save', () => api('/v1/notifications/preferences', {
          method: 'PATCH',
          body: JSON.stringify({
            enabled: notificationPreferences.enabled,
            events: notificationPreferences.events,
          }),
        }));
      setNotificationPreferences(normalizeNotificationPreferences(data.item));
      setMessage('Preferencias de email actualizadas.');
    } catch (err) {
      setMessage(err.message);
    } finally {
      setSavingNotificationPreferences(false);
    }
  }

  function updateNotificationPreference(field, value) {
    setNotificationPreferences((current) => {
      const next = normalizeNotificationPreferences(current);
      const isEnablingEmail = field === 'enabled' && value === true && !next.enabled;
      return normalizeNotificationPreferences({
        ...next,
        [field]: value,
        events: isEnablingEmail
          ? Object.fromEntries(Object.keys(DEFAULT_NOTIFICATION_EVENTS).map((eventKey) => [eventKey, false]))
          : next.events,
      });
    });
  }

  function toggleNotificationEvent(eventKey) {
    setNotificationPreferences((current) => {
      const next = normalizeNotificationPreferences(current);
      return {
        ...next,
        events: {
          ...next.events,
          [eventKey]: !next.events[eventKey],
        },
      };
    });
  }

  async function loadUserProfile() {
    try {
      const data = await api('/v1/profile');
      const nextProfile = normalizeProfile(data.item);
      setUserProfile(nextProfile);
      setProfileDraft({
        ...nextProfile,
        publicProfileEnabled: nextProfile.updatedAt ? nextProfile.publicProfileEnabled : true,
      });
      if (profileNeedsSetup(nextProfile)) {
        setActivePanelTab('profile');
      }
      await loadProfileClaimMatch();
    } catch (err) {
      setMessage(err.message);
    }
  }

  async function loadProfileClaimMatch() {
    try {
      const data = await api('/v1/profile/claim-match');
      setProfileClaimMatch(normalizeProfileClaimMatch(data));
      return data;
    } catch (err) {
      setMessage(err.message);
      return null;
    }
  }

  async function loadAdminProfiles() {
    try {
      const data = await api('/v1/profile/manage');
      setAdminProfiles((data.items || []).map(normalizeAdminProfile));
    } catch (err) {
      setMessage(err.message);
    }
  }

  async function loadAdminProfileClaims() {
    try {
      const data = await api('/v1/profile/manage/claims');
      setAdminProfileClaims((data.items || []).map(normalizeProfileClaim));
      return data.items || [];
    } catch (err) {
      setMessage(err.message);
      return [];
    }
  }

  async function requestProfileClaim() {
    const candidate = profileClaimMatch.candidate;
    if (!candidate?.id) return;
    try {
      setMessage('');
      await withActionLoading('profile-claim-request', () => api('/v1/profile/claims', {
        method: 'POST',
        body: JSON.stringify({ managedProfileId: candidate.id }),
      }));
      setProfileClaimConfirmOpen(false);
      await loadProfileClaimMatch();
      await loadInAppNotifications({ silent: true });
      setMessage('Solicitud de vinculacion enviada. Te avisaremos cuando un administrador la revise.');
    } catch (err) {
      setMessage(err.message);
    }
  }

  async function withdrawOwnProfileClaim() {
    const claim = profileClaimMatch.claim;
    if (!claim?.id) return;
    try {
      setMessage('');
      await withActionLoading('profile-claim-withdraw', () => api(`/v1/profile/claims/${encodeURIComponent(claim.id)}/withdraw`, {
        method: 'POST',
      }));
      await loadProfileClaimMatch();
      setMessage('Solicitud cancelada.');
    } catch (err) {
      setMessage(err.message);
    }
  }

  async function runAdminProfileClaimAction() {
    const dialog = adminProfileClaimDialog;
    if (!dialog?.claim?.id || !dialog.action) return;
    const key = `profile-claim-${dialog.action}:${dialog.claim.id}`;
    try {
      setMessage('');
      await withActionLoading(key, () => api(`/v1/profile/manage/claims/${encodeURIComponent(dialog.claim.id)}/${dialog.action}`, {
        method: 'POST',
        body: dialog.action === 'block' ? JSON.stringify({ reason: adminProfileClaimReason }) : undefined,
      }));
      setAdminProfileClaimDialog(null);
      setAdminProfileClaimReason('');
      await Promise.all([loadAdminProfileClaims(), loadAdminProfiles(), loadInAppNotifications({ silent: true })]);
      setMessage(dialog.action === 'approve'
        ? 'Perfil vinculado, rol concedido y notas transferidas.'
        : dialog.action === 'block'
          ? 'Solicitud bloqueada.'
          : 'Solicitud desbloqueada.');
    } catch (err) {
      setMessage(err.message);
    }
  }

  function updateAdminProfileDraft(field, value) {
    setAdminProfileDraft((current) => ({
      ...current,
      [field]: value,
    }));
  }

  function resetAdminAuthorProfileForm() {
    setAdminProfileDraft(EMPTY_MANAGED_AUTHOR_PROFILE);
    setAdminProfileEditingId('');
    setAdminProfilePhotoMode('url');
    if (adminProfilePhotoInputRef.current) {
      adminProfilePhotoInputRef.current.value = '';
    }
  }

  function editAdminAuthorProfile(profile) {
    if (!profile?.id) return;
    setAdminProfileEditorOpen(true);
    setAdminProfileEditingId(profile.id);
    setAdminProfileDraft({
      firstName: profile.firstName,
      lastName: profile.lastName,
      description: profile.description,
      focusArea: profile.focusArea,
      closingPhrase: profile.closingPhrase,
      photoUrl: profile.photoUrl,
      publicProfileEnabled: profile.publicProfileEnabled,
    });
    setAdminProfilePhotoMode(profile.photoUrl ? 'url' : 'upload');
    if (adminProfilePhotoInputRef.current) {
      adminProfilePhotoInputRef.current.value = '';
    }
  }

  async function saveAdminAuthorProfile(event) {
    event.preventDefault();
    try {
      setMessage('');
      const payload = {
        firstName: adminProfileDraft.firstName,
        lastName: adminProfileDraft.lastName,
        description: adminProfileDraft.description,
        focusArea: adminProfileDraft.focusArea,
        closingPhrase: adminProfileDraft.closingPhrase,
        photoUrl: adminProfileDraft.photoUrl,
        publicProfileEnabled: adminProfileDraft.publicProfileEnabled,
      };
      const isEditing = Boolean(adminProfileEditingId);
      const path = isEditing ? `/v1/profile/manage/${encodeURIComponent(adminProfileEditingId)}` : '/v1/profile/manage';
      await withActionLoading(isEditing ? 'admin-profile-update' : 'admin-profile-create', () => api(path, {
        method: isEditing ? 'PATCH' : 'POST',
        body: JSON.stringify(payload),
      }));
      resetAdminAuthorProfileForm();
      await loadAdminProfiles();
      setMessage(isEditing ? 'Perfil de autor actualizado.' : 'Perfil de autor creado.');
    } catch (err) {
      setMessage(err.message);
    }
  }

  async function uploadAdminProfilePhoto(file) {
    if (!file) return;
    try {
      setMessage('');
      const media = await withActionLoading('admin-profile-photo', () => uploadMedia(file));
      updateAdminProfileDraft('photoUrl', media?.url || '');
      setMessage('Foto de autor cargada. Guarda el perfil para conservar el cambio.');
    } catch (err) {
      setMessage(imageLoadErrorMessage(err));
    } finally {
      if (adminProfilePhotoInputRef.current) {
        adminProfilePhotoInputRef.current.value = '';
      }
    }
  }

  async function deleteAdminAuthorProfile(target) {
    if (!target?.id) return;
    try {
      setMessage('');
      await withActionLoading(`admin-profile-delete:${target.id}`, () => api(`/v1/profile/manage/${encodeURIComponent(target.id)}`, {
        method: 'DELETE',
      }));
      setAdminProfileDeleteTarget(null);
      await loadAdminProfiles();
      setMessage('Perfil de autor eliminado.');
    } catch (err) {
      setMessage(err.message);
    }
  }

  async function saveUserProfile() {
    try {
      setSavingProfile(true);
      setMessage('');
      const payload = {
        firstName: profileDraft.firstName,
        lastName: profileDraft.lastName,
        description: profileDraft.description,
        focusArea: profileDraft.focusArea,
        closingPhrase: profileDraft.closingPhrase,
        photoUrl: profileDraft.photoUrl,
        publicProfileEnabled: profileDraft.publicProfileEnabled,
      };
      const data = await withActionLoading('profile-save', () => api('/v1/profile', {
        method: 'PATCH',
        body: JSON.stringify(payload),
      }));
      const nextProfile = normalizeProfile({
        ...payload,
        ...(data.item || {}),
        publicProfileEnabled: data.item?.publicProfileEnabled ?? payload.publicProfileEnabled,
      });
      setUserProfile(nextProfile);
      setProfileDraft(nextProfile);
      setProfileConsentOpen(false);
      if (!form.id && !form.authorName && nextProfile.fullName) {
        setForm((current) => normalizeForm({
          ...current,
          authorName: nextProfile.fullName,
          showAuthorNote: current.showAuthorNote || Boolean(nextProfile.fullName),
        }));
      }
      await loadProfileClaimMatch();
      setMessage('Perfil actualizado.');
    } catch (err) {
      setMessage(err.message);
    } finally {
      setSavingProfile(false);
    }
  }

  function requestUserProfileSave() {
    if (profileDraft.publicProfileEnabled) {
      setProfileConsentOpen(true);
      return;
    }
    saveUserProfile();
  }

  function updateProfileDraft(field, value) {
    setProfileDraft((current) => normalizeProfile({
      ...current,
      [field]: value,
    }));
  }

  async function uploadProfilePhoto(file) {
    if (!file) return;
    try {
      setProfilePhotoUploading(true);
      setMessage('');
      const media = await withActionLoading('profile-photo', () => uploadMedia(file));
      updateProfileDraft('photoUrl', media?.url || '');
      setMessage('Foto de perfil cargada. Guarda el perfil para conservar el cambio.');
    } catch (err) {
      setMessage(imageLoadErrorMessage(err));
    } finally {
      setProfilePhotoUploading(false);
    }
  }

  async function savePost(e) {
    e.preventDefault();
    const isEditing = Boolean(form.id);

    try {
      setBusy(true);
      setMessage('');
      await withActionLoading('post-save', () => persistCurrentPost());
      setMessage(isEditing ? 'Post actualizado.' : 'Borrador creado.');
    } catch (err) {
      setMessage(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function persistCurrentPost({ refresh = true } = {}) {
    if (!canEditPosts || (!form.id && !canCreatePosts)) {
      throw new Error('Tu rol no permite crear nuevos posts.');
    }
    if (publishedAuthorLocked) {
      throw new Error('Solicita edicion para modificar un post publicado.');
    }

    const payload = buildPayload(form, canChooseSlug);
    const isEditing = Boolean(form.id);
    const data = await api(isEditing ? `/v1/posts/${form.id}` : '/v1/posts', {
      method: isEditing ? 'PATCH' : 'POST',
      body: JSON.stringify(payload),
    });
    const nextForm = postToForm(data.item);
    setForm(nextForm);
    setSavedForm(nextForm);
    setUseManualAuthorNote(Boolean(nextForm.authorNote));
    if (refresh) {
      await Promise.all([loadPosts(), loadCategories()]);
    }
    return data.item;
  }

  async function uploadMedia(file) {
    if (!file) return null;
    const body = new FormData();
    body.append('file', file);
    const data = await api('/v1/media', { method: 'POST', body });
    return data.item;
  }

  async function uploadCoverImage(file) {
    if (!file) return;
    try {
      setUploading(true);
      setMessage('');
      setCoverImageError('');
      const media = await withActionLoading('cover-upload', () => uploadMedia(file));
      setForm((current) => normalizeForm({ ...current, coverImage: media?.url, showCoverInPost: true }));
      setCoverMode('upload');
      setMessage('Imagen cargada.');
    } catch (err) {
      const nextMessage = imageLoadErrorMessage(err);
      setCoverImageError(nextMessage);
      setMessage(nextMessage);
    } finally {
      setUploading(false);
    }
  }

  async function uploadInlineImage(file) {
    try {
      setMessage('');
      const media = await withActionLoading('inline-image', () => uploadMedia(file));
      setMessage('Imagen interna cargada.');
      return media.url;
    } catch (err) {
      setMessage(err.message);
      return '';
    }
  }

  function clearCoverImageError() {
    coverValidationRef.current += 1;
    setCoverImageError('');
  }

  function failCoverImageLoad(err) {
    const nextMessage = imageLoadErrorMessage(err);
    setCoverImageError((current) => current || nextMessage);
    setMessage(nextMessage);
  }

  function validateCoverImageUrl(url) {
    const coverImage = String(url || '').trim();
    coverValidationRef.current += 1;
    const validationId = coverValidationRef.current;
    if (!coverImage) {
      setCoverImageError('');
      return;
    }
    if (typeof window === 'undefined') return;
    const image = new window.Image();
    image.onload = () => {
      if (coverValidationRef.current === validationId) setCoverImageError('');
    };
    image.onerror = () => {
      if (coverValidationRef.current === validationId) failCoverImageLoad();
    };
    image.src = coverImage;
  }

  async function createReviewComment({ body, selectedText, commentId, contentMarkdown }) {
    if (!form.id) {
      setMessage('Guarda el post antes de agregar comentarios de revision.');
      return null;
    }
    if (!canPublishPosts) {
      setMessage('Solo los reviewer pueden crear comentarios de revision.');
      return null;
    }

    try {
      setMessage('');
      const data = await withActionLoading(`comment-create:${commentId}`, () => api(`/v1/posts/${form.id}/comments`, {
        method: 'POST',
        body: JSON.stringify({ body, selectedText, commentId, contentMarkdown }),
      }));
      if (data.post?.contentMarkdown) {
        setForm((current) => normalizeForm({ ...current, contentMarkdown: data.post.contentMarkdown }));
        setSavedForm((current) => normalizeForm({ ...current, contentMarkdown: data.post.contentMarkdown }));
      }
      setReviewComments((current) => [...current, normalizeReviewComment(data.item)]);
      focusReviewComment(data.item.id);
      setReviewCommentFilter('open');
      await loadPosts();
      await loadInAppNotifications({ silent: true });
      setMessage('Comentario de revision agregado.');
      return data.item;
    } catch (err) {
      setMessage(err.message);
      return null;
    }
  }

  function focusReviewComment(commentId) {
    setActiveReviewCommentId(commentId);
    setActiveReviewCommentNonce((current) => current + 1);
  }

  function openReviewCommentDialog(comment, mode = 'reply') {
    const nextComment = normalizeReviewComment(comment);
    focusReviewComment(nextComment.id);
    setReviewCommentDialog({
      mode,
      comment: nextComment,
      replyBody: '',
    });
  }

  async function updateReviewCommentStatus(commentId, status, options = {}) {
    if (!form.id) return;
    const selectedTextCurrent = extractReviewCommentTextById(form.contentMarkdown, commentId)
      || reviewComments.find((comment) => comment.id === commentId)?.selectedTextCurrent
      || reviewComments.find((comment) => comment.id === commentId)?.selectedText
      || '';
    const nextMarkdown = status === 'resolved'
      ? stripReviewCommentMarkupById(form.contentMarkdown, commentId)
      : form.contentMarkdown;
    try {
      setBusy(true);
      setMessage('');
      const data = await withActionLoading(`comment-status:${commentId}`, () => api(`/v1/posts/${form.id}/comments/${commentId}`, {
        method: 'PATCH',
        body: JSON.stringify({
          status,
          contentMarkdown: nextMarkdown,
          replyBody: options.replyBody || undefined,
          selectedTextCurrent,
        }),
      }));
      if (status === 'resolved') {
        setForm((current) => normalizeForm({ ...current, contentMarkdown: nextMarkdown }));
        setSavedForm((current) => normalizeForm({ ...current, contentMarkdown: nextMarkdown }));
        if (activeReviewCommentId === commentId) {
          setActiveReviewCommentId('');
          setActiveReviewCommentNonce((current) => current + 1);
        }
      }
      const nextComment = normalizeReviewComment(data.item);
      setReviewComments((current) => current.map((comment) => comment.id === commentId ? nextComment : comment));
      setReviewCommentDialog((current) => (current?.comment?.id === commentId ? null : current));
      await loadPosts();
      await loadInAppNotifications({ silent: true });
      setMessage(status === 'resolved' ? 'Comentario resuelto.' : 'Comentario reabierto.');
    } catch (err) {
      setMessage(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function replyToReviewComment(commentId, replyBody) {
    if (!form.id) return;
    const body = normalizeInlineInput(replyBody);
    if (!body) {
      setMessage('Escribi una respuesta para enviar.');
      return;
    }
    const selectedTextCurrent = extractReviewCommentTextById(form.contentMarkdown, commentId)
      || reviewComments.find((comment) => comment.id === commentId)?.selectedTextCurrent
      || reviewComments.find((comment) => comment.id === commentId)?.selectedText
      || '';
    try {
      setBusy(true);
      setMessage('');
      const data = await withActionLoading(`comment-reply:${commentId}`, () => api(`/v1/posts/${form.id}/comments/${commentId}`, {
        method: 'PATCH',
        body: JSON.stringify({ replyBody: body, selectedTextCurrent }),
      }));
      const nextComment = normalizeReviewComment(data.item);
      setReviewComments((current) => current.map((comment) => comment.id === commentId ? nextComment : comment));
      setReviewCommentDialog({
        mode: 'reply',
        comment: nextComment,
        replyBody: '',
      });
      await loadInAppNotifications({ silent: true });
      setMessage('Respuesta enviada.');
    } catch (err) {
      setMessage(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function saveEditedReviewComment() {
    if (!form.id || !editingReviewComment) return;
    const body = normalizeInlineInput(editingReviewComment.body);
    if (!body) {
      setMessage('Escribi un comentario para guardar.');
      return;
    }
    try {
      setBusy(true);
      setMessage('');
      const data = await withActionLoading(`comment-edit:${editingReviewComment.id}`, () => api(`/v1/posts/${form.id}/comments/${editingReviewComment.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ body }),
      }));
      const nextComment = normalizeReviewComment(data.item);
      setReviewComments((current) => current.map((comment) => comment.id === editingReviewComment.id ? nextComment : comment));
      setReviewCommentDialog((current) => (current?.comment?.id === nextComment.id
        ? { ...current, comment: nextComment }
        : current));
      setEditingReviewComment(null);
      setMessage('Comentario actualizado.');
    } catch (err) {
      setMessage(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function deleteReviewComment(commentId) {
    if (!form.id || !confirm('Eliminar este comentario de revision?')) return;
    const nextMarkdown = stripReviewCommentMarkupById(form.contentMarkdown, commentId);
    try {
      setBusy(true);
      setMessage('');
      await withActionLoading(`comment-delete:${commentId}`, () => api(`/v1/posts/${form.id}/comments/${commentId}`, {
        method: 'DELETE',
        body: JSON.stringify({ contentMarkdown: nextMarkdown }),
      }));
      setForm((current) => normalizeForm({ ...current, contentMarkdown: nextMarkdown }));
      setSavedForm((current) => normalizeForm({ ...current, contentMarkdown: nextMarkdown }));
      setReviewComments((current) => current.filter((comment) => comment.id !== commentId));
      if (activeReviewCommentId === commentId) {
        setActiveReviewCommentId('');
        setActiveReviewCommentNonce((current) => current + 1);
      }
      await loadPosts();
      setMessage('Comentario eliminado.');
    } catch (err) {
      setMessage(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function importDocx(file) {
    if (!file) return;
    if (form.contentMarkdown && !confirm('Importar el .docx va a reemplazar el contenido actual. Continuar?')) {
      if (docxInputRef.current) docxInputRef.current.value = '';
      return;
    }

    try {
      setImporting(true);
      setMessage('');
      const body = new FormData();
      body.append('file', file);
      const data = await withActionLoading('docx-import', () => api('/v1/import/docx', { method: 'POST', body }));
      updateForm('contentMarkdown', data.contentMarkdown || '');
      const warningText = data.warnings?.length ? ` Advertencias: ${data.warnings.join(' | ')}` : '';
      setMessage(`Documento importado. Revisalo antes de guardar.${warningText}`);
    } catch (err) {
      setMessage(err.message);
    } finally {
      setImporting(false);
      if (docxInputRef.current) docxInputRef.current.value = '';
    }
  }

  async function action(path, success, loadingKey = path) {
    try {
      setBusy(true);
      setMessage('');
      const data = await withActionLoading(loadingKey, () => api(path, { method: 'POST' }));
      if (data.item?.id && data.item.id === form.id) {
        const nextForm = postToForm(data.item);
        setForm(nextForm);
        setSavedForm(nextForm);
        setUseManualAuthorNote(Boolean(nextForm.authorNote));
      }
      setMessage(success);
      await loadPosts();
      await loadInAppNotifications({ silent: true });
      return true;
    } catch (err) {
      setMessage(err.message);
      return false;
    } finally {
      setBusy(false);
    }
  }

  function requestAction(path, success, label, loadingKey = workflowActionKey(path)) {
    const requiresArticlePreview = path.includes('/submit-review');
    if (hasUnsavedChanges || requiresArticlePreview) {
      setPendingAction({
        path,
        success,
        label,
        loadingKey,
        hasUnsavedChanges,
        requiresArticlePreview,
      });
      return;
    }
    action(path, success, loadingKey);
  }

  async function confirmEditRequest() {
    if (!form.id || editRequestPending) return;
    const postId = form.id;
    const loadingKey = `workflow:request-edit:${postId}`;
    try {
      setBusy(true);
      setMessage('');
      const data = await withActionLoading(loadingKey, () => api(`/v1/posts/${postId}/request-edit`, { method: 'POST' }));
      if (data.item?.id && data.item.id === form.id) {
        const nextForm = postToForm(data.item);
        setForm(nextForm);
        setSavedForm(nextForm);
        setUseManualAuthorNote(Boolean(nextForm.authorNote));
      }
      setMessage('Solicitud de edición enviada.');
      setEditRequestConfirmOpen(false);
      await loadPosts();
      await loadInAppNotifications({ silent: true });
    } catch (err) {
      setMessage(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function confirmPendingAction() {
    if (!pendingAction) return;
    const nextAction = pendingAction;
    const completed = await action(nextAction.path, nextAction.success, nextAction.loadingKey);
    if (completed) setPendingAction(null);
  }

  async function saveAndConfirmPendingAction() {
    if (!pendingAction) return;
    const nextAction = pendingAction;

    try {
      setBusy(true);
      setMessage('');
      await withActionLoading('post-save', () => persistCurrentPost({ refresh: false }));
      await withActionLoading(nextAction.loadingKey, () => api(nextAction.path, { method: 'POST' }));
      setPendingAction(null);
      setMessage(nextAction.success);
      await Promise.all([loadPosts(), loadCategories()]);
      await loadInAppNotifications({ silent: true });
    } catch (err) {
      setMessage(err.message);
    } finally {
      setBusy(false);
    }
  }

  function selectPostForEdit(post) {
    const nextForm = postToForm(post);
    setForm(nextForm);
    setSavedForm(nextForm);
    setUseManualAuthorNote(Boolean(nextForm.authorNote));
    setCategorySearchTerm('');
    setCoverImageError('');
  }

  function toggleAdminPostSelection(id) {
    setSelectedAdminPostIds((current) => (
      current.includes(id) ? current.filter((postId) => postId !== id) : [...current, id]
    ));
  }

  function toggleAllAdminPosts() {
    setSelectedAdminPostIds((current) => {
      const visibleIds = sortedPosts.map((post) => post.id);
      const visibleIdSet = new Set(visibleIds);
      const allVisibleSelected = visibleIds.length > 0 && visibleIds.every((id) => current.includes(id));
      if (allVisibleSelected) return current.filter((id) => !visibleIdSet.has(id));
      return [...new Set([...current, ...visibleIds])];
    });
  }

  async function runBatchPostAction(kind) {
    const config = {
      publish: {
        verb: 'publicar',
        success: 'Posts publicados.',
        skip: (post) => post.status === 'published',
        run: (post) => api(`/v1/posts/${post.id}/publish`, { method: 'POST' }),
      },
      archive: {
        verb: 'archivar',
        success: 'Posts archivados.',
        skip: (post) => post.status === 'archived',
        run: (post) => api(`/v1/posts/${post.id}/archive`, { method: 'POST' }),
      },
      delete: {
        verb: 'eliminar',
        success: 'Posts eliminados.',
        skip: () => false,
        run: (post) => api(`/v1/posts/${post.id}`, { method: 'DELETE' }),
      },
    }[kind];

    if (!config) return;
    const targetPosts = selectedAdminPosts.filter((post) => !config.skip(post));
    if (!targetPosts.length) {
      setMessage('No hay posts seleccionados con cambios pendientes.');
      return;
    }
    if (!confirm(`Vas a ${config.verb} ${targetPosts.length} post(s). Continuar?`)) return;

    try {
      setBusy(true);
      setMessage('');
      await withActionLoading(`batch:${kind}`, async () => {
        for (const post of targetPosts) {
          await config.run(post);
        }
      });
      if (kind === 'delete' && targetPosts.some((post) => post.id === form.id)) {
        setForm(EMPTY_FORM);
        setSavedForm(EMPTY_FORM);
        setUseManualAuthorNote(false);
        setCategorySearchTerm('');
        setCoverImageError('');
      }
      setSelectedAdminPostIds([]);
      setMessage(config.success);
      await loadPosts();
      await loadInAppNotifications({ silent: true });
    } catch (err) {
      setMessage(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function deletePost(id) {
    if (!confirm('¿Eliminar este post?')) return;
    try {
      setBusy(true);
      setMessage('');
      await withActionLoading(`post-delete:${id}`, () => api(`/v1/posts/${id}`, { method: 'DELETE' }));
      setMessage('Post eliminado.');
      if (form.id === id) {
        setForm(EMPTY_FORM);
        setSavedForm(EMPTY_FORM);
        setUseManualAuthorNote(false);
        setCategorySearchTerm('');
        setCoverImageError('');
      }
      await loadPosts();
    } catch (err) {
      setMessage(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function createCategoryFromForm() {
    const name = sanitizeCategory(form.category);
    if (!name) {
      setMessage('La categoria no existe, presiona ENTER para agregarla a la lista.');
      return;
    }

    try {
      setBusy(true);
      setMessage('');
      const data = await withActionLoading('category-create', () => api('/v1/categories', {
        method: 'POST',
        body: JSON.stringify({ name }),
      }));
      updateForm('category', data.item?.name || name);
      setCategoryDropdownOpen(false);
      setCategorySearchTerm('');
      setMessage('Categoria agregada a la lista.');
      await loadCategories();
    } catch (err) {
      setMessage(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function deleteCategory(target) {
    if (!target) return;
    try {
      setBusy(true);
      setMessage('');
      await withActionLoading(`category-delete:${target.id}`, () => api(`/v1/categories/${encodeURIComponent(target.id)}`, { method: 'DELETE' }));
      setMessage('Categoria eliminada de la lista.');
      setCategoryDeleteTarget(null);
      await loadCategories();
    } catch (err) {
      setMessage(err.message);
    } finally {
      setBusy(false);
    }
  }

  function addAdminUserDraft() {
    const email = normalizeRoleEmail(adminUserEmail);
    if (!isAllowedRoleEmail(email)) {
      setMessage(`Usa un email @${ALLOWED_EMAIL_DOMAIN} o @${ASSIGNED_EMAIL_DOMAIN}.`);
      return;
    }
    if (!adminUserNewRoles.length) {
      setMessage('Elegí al menos un rol para aplicar.');
      return;
    }

    setAdminUsers((current) => (
      current.some((item) => item.email === email)
        ? current
        : [{ email, roles: [], active: true, isDraft: true }, ...current]
    ));
    setAdminUserDrafts((current) => ({ ...current, [email]: current[email] || adminUserNewRoles }));
    setAdminUserEmail('');
    setAdminUsersOpen(true);
  }

  function toggleNewAdminUserRole(role) {
    setAdminUserNewRoles((current) => {
      const nextRoles = current.includes(role)
        ? current.filter((item) => item !== role)
        : [...current, role];
      return ASSIGNABLE_ROLES.map((item) => item.value).filter((item) => nextRoles.includes(item));
    });
  }

  function toggleAdminUserRole(email, role) {
    setAdminUserDrafts((current) => {
      const roles = current[email] || [];
      const nextRoles = roles.includes(role)
        ? roles.filter((item) => item !== role)
        : [...roles, role];
      return { ...current, [email]: ASSIGNABLE_ROLES.map((item) => item.value).filter((item) => nextRoles.includes(item)) };
    });
  }

  async function saveAdminUserRoles(email) {
    try {
      setBusy(true);
      setMessage('');
      const data = await withActionLoading(`user-save:${email}`, () => api(`/v1/users/${encodeURIComponent(email)}/roles`, {
        method: 'PUT',
        body: JSON.stringify({ roles: adminUserDrafts[email] || [] }),
      }));
      setMessage(`Roles actualizados para ${email}.`);
      setAdminUsers((current) => upsertAdminUserItem(current, data.item));
      setAdminUserDrafts((current) => ({ ...current, [email]: data.item?.roles || [] }));
    } catch (err) {
      setMessage(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function deleteAdminUserRoles(email) {
    if (!confirm(`Quitar todos los roles asignados a ${email}?`)) return;
    try {
      setBusy(true);
      setMessage('');
      await withActionLoading(`user-delete:${email}`, () => api(`/v1/users/${encodeURIComponent(email)}`, { method: 'DELETE' }));
      setMessage(`Roles eliminados para ${email}.`);
      setAdminUsers((current) => current.filter((item) => item.email !== email));
      setAdminUserDrafts((current) => {
        const next = { ...current };
        delete next[email];
        return next;
      });
    } catch (err) {
      setMessage(err.message);
    } finally {
      setBusy(false);
    }
  }

  const sortedPosts = useMemo(() => {
    const query = taxonomyKey(postSearch);
    if (!query) return posts;

    return posts.filter((post) => {
      const haystack = [
        post.title,
        post.category,
        ...(Array.isArray(post.tags) ? post.tags : []),
      ].map((value) => taxonomyKey(value)).join(' ');

      return haystack.includes(query);
    });
  }, [posts, postSearch]);
  const selectedAdminPostIdsSet = useMemo(() => new Set(selectedAdminPostIds), [selectedAdminPostIds]);
  const selectedAdminPosts = useMemo(
    () => posts.filter((post) => selectedAdminPostIdsSet.has(post.id)),
    [posts, selectedAdminPostIdsSet]
  );
  const allAdminVisibleSelected = sortedPosts.length > 0 && sortedPosts.every((post) => selectedAdminPostIdsSet.has(post.id));
  const filteredAdminUsers = useMemo(() => {
    const query = taxonomyKey(adminUserSearch);
    const items = [...adminUsers].sort((a, b) => a.email.localeCompare(b.email));
    if (!query) return items;
    return items.filter((item) => {
      const haystack = [item.email, ...(adminUserDrafts[item.email] || item.roles || [])]
        .map((value) => taxonomyKey(value))
        .join(' ');
      return haystack.includes(query);
    });
  }, [adminUsers, adminUserDrafts, adminUserSearch]);
  const categoryOptions = useMemo(() => {
    const values = new Map();
    categories.forEach((category) => {
      if (category.name) {
        const key = taxonomyKey(category.name);
        if (key && !values.has(key)) values.set(key, category.name.trim());
      }
    });
    posts.forEach((post) => {
      if (post.category) {
        const key = taxonomyKey(post.category);
        if (key && !values.has(key)) values.set(key, post.category.trim());
      }
    });
    return [...values.values()].sort((a, b) => a.localeCompare(b, 'es'));
  }, [categories, posts]);
  const tagOptions = useMemo(() => {
    const values = new Map();
    posts.forEach((post) => {
      sanitizeTags(post.tags || []).forEach((tag) => {
        const key = taxonomyKey(tag);
        if (key && !values.has(key)) values.set(key, tag);
      });
    });
    return [...values.values()].sort((a, b) => a.localeCompare(b, 'es'));
  }, [posts]);
  const selectedSharedCategory = useMemo(() => {
    const key = taxonomyKey(form.category);
    return categories.find((category) => taxonomyKey(category.name) === key) || null;
  }, [categories, form.category]);
  const filteredCategoryOptions = useMemo(() => {
    const key = taxonomyKey(categorySearchTerm);
    if (!key) return categoryOptions;
    return categoryOptions.filter((option) => taxonomyKey(option).includes(key));
  }, [categoryOptions, categorySearchTerm]);
  const canAddCurrentCategory = useMemo(() => {
    const name = sanitizeCategory(form.category);
    if (!name || publishedAuthorLocked) return false;
    return !selectedSharedCategory;
  }, [form.category, publishedAuthorLocked, selectedSharedCategory]);
  const previewHtml = useMemo(
    () => marked.parse(stripReviewCommentMarkup(form.contentMarkdown || ''), { async: false, gfm: true }),
    [form.contentMarkdown]
  );
  const previewDate = useMemo(
    () => new Intl.DateTimeFormat('es-AR', { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date()),
    []
  );
  const previewTags = useMemo(() => {
    const tags = parseTagsText(form.tagsText);
    return tags.length ? tags : ['Nota'];
  }, [form.tagsText]);
  const previewUsesCurrentProfile = taxonomyKey(form.authorName) === taxonomyKey(profileAuthorName);
  const previewAuthorPhoto = previewUsesCurrentProfile
    ? profileDraft.photoUrl || userProfile.photoUrl || ''
    : '';
  const previewAuthorNote = form.showAuthorNote
    ? useManualAuthorNote
      ? form.authorNote
      : (previewUsesCurrentProfile ? profileClosingPhrase : '')
    : '';
  const usingProfileClosingPhrase = form.showAuthorNote && !useManualAuthorNote && previewUsesCurrentProfile && Boolean(profileClosingPhrase);
  const profilePreviewName = profileDraft.fullName || user?.name || user?.email || 'Tu nombre';
  const profilePreviewPosts = posts.filter((post) => taxonomyKey(post.authorName) === taxonomyKey(profilePreviewName));
  const profilePreviewAuthor = {
    fullName: profilePreviewName,
    description: profileDraft.description || 'Tu presentacion personal aparecera aca para que los lectores conozcan tu recorrido y tu mirada.',
    focusArea: profileDraft.focusArea || 'Tus temas y areas de interes',
    closingPhrase: profileDraft.closingPhrase || '',
    photoUrl: profileDraft.photoUrl || DEFAULT_PROFILE_PHOTO,
    postCount: profilePreviewPosts.length || 3,
    latestPostTitle: profilePreviewPosts[0]?.title || 'Una mirada sobre los debates de nuestro tiempo',
    categories: [...new Set(profilePreviewPosts.map((post) => post.category).filter(Boolean))].slice(0, 3),
  };
  const profilePreviewBlogPosts = profilePreviewPosts.length
    ? profilePreviewPosts.slice(0, 4).map((post) => ({
        id: post.id,
        slug: post.slug,
        titulo: post.title,
        extracto: post.excerpt,
        fecha: post.publishedAt || post.updatedAt || post.createdAt,
        imagen: post.coverImage || null,
        autor: profilePreviewName,
        categoria: post.category || 'Notas',
        tags: sanitizeTags(post.tags || []),
      }))
    : [
        {
          id: 'profile-preview-post-1',
          slug: 'una-mirada-sobre-los-debates',
          titulo: profilePreviewAuthor.latestPostTitle,
          extracto: 'Una introduccion breve que ayuda a comprender el enfoque y las preguntas principales de la nota.',
          fecha: new Date().toISOString(),
          imagen: null,
          autor: profilePreviewName,
          categoria: profilePreviewAuthor.categories[0] || 'Analisis',
          tags: [profilePreviewAuthor.categories[0] || 'Analisis'],
        },
        {
          id: 'profile-preview-post-2',
          slug: 'ideas-para-comprender-una-conversacion',
          titulo: 'Ideas para comprender una conversacion publica en movimiento',
          extracto: 'Otra nota de ejemplo para mostrar como se organiza la produccion del autor.',
          fecha: new Date().toISOString(),
          imagen: null,
          autor: profilePreviewName,
          categoria: profilePreviewAuthor.categories[1] || 'Democracia',
          tags: [profilePreviewAuthor.categories[1] || 'Democracia'],
        },
      ];
  const openReviewCommentCount = reviewComments.filter((comment) => comment.status !== 'resolved').length;
  const filteredReviewComments = useMemo(() => {
    if (reviewCommentFilter === 'all') return reviewComments;
    return reviewComments.filter((comment) => comment.status === reviewCommentFilter || (reviewCommentFilter === 'open' && comment.status !== 'resolved'));
  }, [reviewComments, reviewCommentFilter]);
  const filteredAdminProfileClaims = useMemo(() => {
    if (adminProfileClaimFilter === 'all') return adminProfileClaims;
    if (adminProfileClaimFilter === 'pending') {
      return adminProfileClaims.filter((claim) => ['pending', 'processing'].includes(claim.status));
    }
    return adminProfileClaims.filter((claim) => claim.status === adminProfileClaimFilter);
  }, [adminProfileClaimFilter, adminProfileClaims]);
  const messageKind = message ? adminMessageKind(message) : 'info';

  return (
    <main className="admin-page">
      {message && (
        <div className={`admin-toast ${messageKind}`} role="alert" aria-live="polite">
          <span aria-hidden="true" className="material-symbols-outlined">
            {messageKind === 'error' ? 'error' : 'check_circle'}
          </span>
          <p>{message}</p>
          <button aria-label="Cerrar mensaje" onClick={() => setMessage('')} type="button">
            <span aria-hidden="true" className="material-symbols-outlined">close</span>
          </button>
        </div>
      )}
      {user && canAccessPanel && (
        <section className="admin-hero">
          <div className="wrap admin-hero-in">
            <div>
              <span className="eyebrow admin-version-label">
                Panel interno
                <small>v{APP_VERSION}</small>
              </span>
              <h1>Gestor de contenido</h1>
              <p>Crea borradores, prepara notas para revision y publica contenido editorial. Ante cambios de acceso o dudas del flujo, contacta al equipo responsable del panel.</p>
            </div>
            <Link
              href="https://www.politeia.ar/blog"
              className="btn btn-ghost"
              target="_blank"
              rel="noopener noreferrer"
            >
              Ver blog publico
            </Link>
          </div>
        </section>
      )}

      {user && canAccessPanel && notificationsOpen && (
        <div className="admin-notification-overlay" role="presentation" onMouseDown={() => {
          setNotificationsOpen(false);
          setShowPreviousNotifications(false);
        }}>
          <aside
            aria-label="Notificaciones internas"
            aria-modal="true"
            className="admin-inbox admin-notification-tray"
            onMouseDown={(event) => event.stopPropagation()}
            role="dialog"
          >
            <div className="admin-inbox-head">
              <div>
                <span>Notificaciones</span>
                <h2>Actividad editorial</h2>
                <p>
                  {unreadNotificationCount ? `${unreadNotificationCount} sin leer` : 'Todo al dia'}
                  {' · '}Historial de {notificationPolicy.retentionDays} dias
                </p>
              </div>
              <button aria-label="Cerrar notificaciones" className="admin-icon-button" onClick={() => {
                setNotificationsOpen(false);
                setShowPreviousNotifications(false);
              }} type="button">
                <span aria-hidden="true" className="material-symbols-outlined">close</span>
              </button>
            </div>
            <div className="admin-inbox-actions">
              <button className="btn btn-ghost" disabled={loadingNotifications} onClick={() => loadInAppNotifications()} type="button">
                Actualizar
              </button>
              <button className="btn btn-ghost" disabled={loadingNotifications || unreadNotificationCount === 0} onClick={markAllNotificationsRead} type="button">
                Marcar todas como leidas
              </button>
            </div>
            <div className="admin-inbox-policy">
              <span aria-hidden="true" className="material-symbols-outlined">schedule</span>
              <p>Las notificaciones leidas se agrupan en Anteriores despues de {notificationPolicy.recentDays} dias.</p>
            </div>
            {loadingNotifications ? (
              <p className="admin-muted">Cargando notificaciones...</p>
            ) : inAppNotifications.length === 0 ? (
              <p className="admin-muted">No hay notificaciones en los ultimos {notificationPolicy.retentionDays} dias.</p>
            ) : (
              <div className="admin-inbox-list">
                {notificationDayGroups.length ? (
                  <NotificationDayGroups groups={notificationDayGroups} onOpen={openInAppNotification} />
                ) : (
                  <p className="admin-inbox-empty-recent">No hay actividad reciente pendiente.</p>
                )}
                {notificationBuckets.previous.length > 0 && (
                  <div className="admin-inbox-previous-wrap">
                    <button
                      aria-expanded={showPreviousNotifications}
                      className="admin-inbox-previous-toggle"
                      onClick={() => setShowPreviousNotifications((current) => !current)}
                      type="button"
                    >
                      <span aria-hidden="true" className="material-symbols-outlined">history</span>
                      <span>
                        <strong>{showPreviousNotifications ? 'Ocultar anteriores' : 'Ver anteriores'}</strong>
                        <small>{notificationBuckets.previous.length} {notificationBuckets.previous.length === 1 ? 'notificacion leida' : 'notificaciones leidas'}</small>
                      </span>
                      <span aria-hidden="true" className="material-symbols-outlined admin-inbox-previous-chevron">
                        {showPreviousNotifications ? 'expand_less' : 'expand_more'}
                      </span>
                    </button>
                    {showPreviousNotifications && (
                      <div className="admin-inbox-previous">
                        <NotificationDayGroups groups={previousNotificationDayGroups} onOpen={openInAppNotification} />
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </aside>
        </div>
      )}

      {user && canAccessPanel && notificationActionDialog && (
        <div
          className="admin-modal-backdrop"
          onMouseDown={() => setNotificationActionDialog(null)}
          role="presentation"
        >
          <div
            aria-labelledby="notification-action-title"
            aria-modal="true"
            className="admin-modal admin-notification-action-modal"
            onMouseDown={(event) => event.stopPropagation()}
            role="dialog"
          >
            <span aria-hidden="true" className="material-symbols-outlined admin-notification-action-icon">
              {notificationActionDialog.href ? 'open_in_new' : 'info'}
            </span>
            <h3 id="notification-action-title">{notificationActionDialog.title}</h3>
            <p>{notificationActionDialog.message}</p>
            <div className="admin-modal-actions">
              <button className="btn btn-ghost" onClick={() => setNotificationActionDialog(null)} type="button">
                Cerrar
              </button>
              {notificationActionDialog.href ? (
                <a
                  className="btn btn-primary"
                  href={notificationActionDialog.href}
                  onClick={() => setNotificationActionDialog(null)}
                  rel="noopener noreferrer"
                  target="_blank"
                >
                  {notificationActionDialog.actionLabel}
                  <span aria-hidden="true" className="material-symbols-outlined">open_in_new</span>
                </a>
              ) : (
                <button className="btn btn-primary" onClick={() => setNotificationActionDialog(null)} type="button">
                  {notificationActionDialog.actionLabel || 'Entendido'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      <section className={user && canAccessPanel ? 'sec' : 'admin-access-section'}>
        <div className={user && canAccessPanel ? 'wrap' : 'admin-access-wrap'}>
          {!API_BASE || !GOOGLE_CLIENT_ID ? (
            <div className="admin-access-error" role="alert">
              <h1>No pudimos iniciar sesion</h1>
              <p>El acceso no esta disponible en este momento. Intenta nuevamente mas tarde.</p>
            </div>
          ) : checkingSession ? (
            <div className="admin-access-loading" aria-label="Comprobando sesion" role="status">
              <span className="admin-spinner" aria-hidden="true" />
            </div>
          ) : !user ? (
            <div className="admin-access-login" aria-label="Iniciar sesion con Google">
              <div className="admin-google-signin" ref={signInRef}></div>
              {googleButtonStatus === 'failed' && (
                <p className="admin-access-message" role="alert">No pudimos iniciar sesion. Intenta nuevamente.</p>
              )}
              {isLocalPanelHost && isLocalApiBase && (
                <div className="admin-login-actions">
                  <button className="btn btn-primary" onClick={() => loadMe()} type="button">
                    Usar sesion local
                  </button>
                </div>
              )}
            </div>
          ) : !canAccessPanel ? (
            <div className="admin-access-error">
              <h1>Acceso no autorizado</h1>
              <p>No tenes permisos para ingresar. Si crees que se trata de un error, escribi a dev@politeia.ar.</p>
              <div className="admin-login-actions">
                <button className="btn btn-ghost" onClick={logout} type="button">
                  Salir
                </button>
              </div>
            </div>
          ) : (
            <>
              <div className="admin-panel-tabsbar">
                <nav className="admin-tabs" aria-label="Secciones del panel">
                  {canAccessEditorialPanel && (
                    <button
                      aria-pressed={activePanelTab === 'blogs'}
                      className={activePanelTab === 'blogs' ? 'selected' : ''}
                      onClick={() => setActivePanelTab('blogs')}
                      type="button"
                    >
                      Gestor de blogs
                    </button>
                  )}
                  {canAccessNewsletterPanel && (
                    <button
                      aria-pressed={activePanelTab === 'newsletter'}
                      className={activePanelTab === 'newsletter' ? 'selected' : ''}
                      onClick={() => setActivePanelTab('newsletter')}
                      type="button"
                    >
                      Newsletter
                    </button>
                  )}
                  {canAccessRolesMailPanel && (
                    <button
                      aria-pressed={activePanelTab === 'access'}
                      className={activePanelTab === 'access' ? 'selected' : ''}
                      onClick={() => setActivePanelTab('access')}
                      type="button"
                  >
                    Roles
                  </button>
                  )}
                  {canReviewProfiles && (
                    <button
                      aria-pressed={activePanelTab === 'profiles'}
                      className={activePanelTab === 'profiles' ? 'selected' : ''}
                      onClick={() => setActivePanelTab('profiles')}
                      type="button"
                    >
                      Perfiles
                    </button>
                  )}
                </nav>
                <div className="admin-tabs-secondary">
                  {canAccessProfilePanel && (
                    <button
                      aria-label="Abrir mi perfil"
                      aria-pressed={activePanelTab === 'profile'}
                      className={`admin-profile-nav-button ${activePanelTab === 'profile' ? 'selected' : ''}`}
                      onClick={() => setActivePanelTab('profile')}
                      type="button"
                    >
                      <span>Mi perfil</span>
                      <img alt="" onError={handleProfilePhotoError} src={profileNavPhoto} />
                    </button>
                  )}
                  <div className="admin-session-actions">
                    <button
                      aria-expanded={notificationsOpen}
                      aria-label={`Notificaciones${unreadNotificationCount ? `, ${unreadNotificationCount} sin leer` : ''}`}
                      className={`admin-notification-button ${notificationsOpen ? 'active' : ''} ${unreadNotificationCount ? 'has-unread' : ''}`}
                      onClick={() => {
                        setNotificationsOpen((open) => !open);
                        if (!notificationsOpen) loadInAppNotifications({ silent: true });
                      }}
                      type="button"
                    >
                      <span aria-hidden="true" className="material-symbols-outlined">notifications</span>
                      {unreadNotificationCount > 0 && (
                        <strong>{unreadNotificationCount > 9 ? '9+' : unreadNotificationCount}</strong>
                      )}
                    </button>
                  </div>
                </div>
              </div>
              {activePanelTab === 'profile' && (
                <>
                  <div
                    className={`admin-panel-navbar admin-profile-session-card ${notificationHighlight.target === 'profile-permissions' ? 'admin-notification-highlight' : ''}`}
                    ref={profilePermissionsRef}
                  >
                    <div className="admin-panel-user">
                      <strong>{user.name || user.email}</strong>
                      <span>{user.email} - {roleLabel}</span>
                      <div className="admin-current-roles" aria-label="Permisos actuales de la cuenta">
                        <small>Permisos actuales</small>
                        <span>
                          {roles.length ? roles.map((role) => (
                            <strong key={role}>{ROLE_LABELS[role] || role}</strong>
                          )) : <strong>Sin roles activos</strong>}
                        </span>
                      </div>
                    </div>
                    <button className="btn btn-ghost" onClick={logout}>
                      Salir
                    </button>
                  </div>
                  <section className="admin-manager admin-profile">
                    <div className="admin-manager-head">
                      <div>
                        <span>Perfil</span>
                        <h2>Usuario y perfil</h2>
                        <p>Estos datos se guardan separados de los roles. Se usan para firmar comentarios y prellenar el autor de nuevos blogs.</p>
                      </div>
                      <button className="btn btn-ghost" onClick={() => setProfilePreviewOpen(true)} type="button">
                        <span aria-hidden="true" className="material-symbols-outlined">visibility</span>
                        Previsualizar perfil
                      </button>
                    </div>
                    <div className="admin-profile-body">
                      {profileNeedsSetup(profileDraft) && (
                        <div className="admin-profile-notice">
                          Completa tu nombre y apellido para seguir con el gestor de blogs.
                        </div>
                      )}
                      <div className="admin-profile-photo">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img alt="" src={profileDraft.photoUrl || DEFAULT_PROFILE_PHOTO} />
                        <input
                          accept="image/jpeg,image/png,image/webp"
                          hidden
                          onChange={(event) => {
                            const file = event.target.files?.[0];
                            event.target.value = '';
                            uploadProfilePhoto(file);
                          }}
                          ref={profilePhotoInputRef}
                          type="file"
                        />
                        <button
                          className="btn btn-ghost"
                          disabled={!canAccessEditorialPanel && !canAccessNewsletterPanel || profilePhotoUploading || isActionLoading('profile-photo')}
                          onClick={() => profilePhotoInputRef.current?.click()}
                          type="button"
                        >
                          {isActionLoading('profile-photo') ? 'Subiendo foto...' : 'Subir foto'}
                          <ActionSpinner active={isActionLoading('profile-photo')} />
                        </button>
                        {profileDraft.photoUrl && (
                          <button className="btn btn-ghost danger" onClick={() => updateProfileDraft('photoUrl', '')} type="button">
                            Quitar foto
                          </button>
                        )}
                      </div>
                      <div className="admin-profile-fields">
                        <div className="admin-two">
                          <label>
                            Nombre
                            <input disabled={profileClaimMatch.nameLocked} value={profileDraft.firstName} onChange={(e) => updateProfileDraft('firstName', e.target.value)} />
                          </label>
                          <label>
                            Apellido
                            <input disabled={profileClaimMatch.nameLocked} value={profileDraft.lastName} onChange={(e) => updateProfileDraft('lastName', e.target.value)} />
                          </label>
                        </div>
                        <label>
                          Descripcion breve de Perfil
                          <textarea
                            maxLength="500"
                            onChange={(e) => updateProfileDraft('description', e.target.value)}
                            placeholder="Una bio corta para el perfiles de autor."
                            rows="4"
                            value={profileDraft.description}
                          />
                        </label>
                        <label>
                          Sobre mi
                          <textarea
                            maxLength="180"
                            onChange={(e) => updateProfileDraft('focusArea', e.target.value)}
                            placeholder="Conta brevemente quien sos, que mirada aportas y que te interesa compartir con los lectores. Este texto protagoniza tu card en 'Conoce a los autores'."
                            rows="3"
                            value={profileDraft.focusArea}
                          />
                        </label>
                        <label>
                          Frase de cierre de Nota
                          <textarea
                            maxLength="220"
                            onChange={(e) => updateProfileDraft('closingPhrase', e.target.value)}
                            placeholder="Una frase corta para cerrar tus notas, por ejemplo una linea de presentacion o criterio editorial."
                            rows="2"
                            value={profileDraft.closingPhrase}
                          />
                        </label>
                        {canShowProfileOptIn ? (
                          <label className="admin-profile-share">
                            <input
                              checked={profileDraft.publicProfileEnabled}
                              onChange={(e) => updateProfileDraft('publicProfileEnabled', e.target.checked)}
                              type="checkbox"
                            />
                            <span>
                              <strong>Publicar mi perfil de autor</strong>
                              <small>Permito que mis datos de autor se muestren en el blog cuando mi nombre coincida con una nota.</small>
                            </span>
                          </label>
                        ) : (
                          <div className="admin-profile-warning">
                            <strong>Perfil publico no disponible todavia</strong>
                            <span>Para mostrarlo en el blog, el nombre y apellido deben coincidir con el autor usado en alguna nota existente.</span>
                          </div>
                        )}
                        <div className="admin-manager-actions">
                          <span>{profileDraft.fullName ? `Nombre visible: ${profileDraft.fullName}` : 'Si no cargas nombre, se usa tu cuenta.'}</span>
                          <button className="btn btn-primary" disabled={savingProfile || profilePhotoUploading || isActionLoading('profile-save')} onClick={requestUserProfileSave} type="button">
                            {isActionLoading('profile-save') ? 'Guardando perfil...' : 'Guardar perfil'}
                            <ActionSpinner active={isActionLoading('profile-save')} />
                          </button>
                        </div>
                      </div>
                    </div>
                    {(profileClaimMatch.candidate || profileClaimMatch.claim) && (
                      <section className={`admin-profile-claim-card ${profileClaimMatch.claim?.status || 'available'}`}>
                        <div>
                          <span>Identidad editorial</span>
                          {profileClaimMatch.claim ? (
                            <>
                              <h3>{PROFILE_CLAIM_STATUS_LABELS[profileClaimMatch.claim.status] || 'Solicitud de vinculacion'}</h3>
                              <p>
                                Perfil: <strong>{profileClaimMatch.claim.fullName}</strong>.{' '}
                                {profileClaimMatch.claim.status === 'pending' && 'Un administrador debe revisar la solicitud.'}
                                {profileClaimMatch.claim.status === 'processing' && 'Estamos transfiriendo el perfil y sus notas.'}
                                {profileClaimMatch.claim.status === 'approved' && `Tu cuenta heredo ${profileClaimMatch.claim.affectedPostCount} notas.`}
                                {profileClaimMatch.claim.status === 'blocked' && (profileClaimMatch.claim.blockReason || 'Contacta a un administrador para revisar el bloqueo.')}
                                {profileClaimMatch.claim.status === 'superseded' && 'El perfil fue vinculado con otra cuenta.'}
                                {profileClaimMatch.claim.status === 'released' && 'Podes volver a solicitar la vinculacion.'}
                              </p>
                            </>
                          ) : (
                            <>
                              <h3>Encontramos un perfil de autor con este nombre</h3>
                              <p><strong>{profileClaimMatch.candidate.fullName}</strong> tiene {profileClaimMatch.candidate.postCount} {profileClaimMatch.candidate.postCount === 1 ? 'nota asociada' : 'notas asociadas'}.</p>
                            </>
                          )}
                        </div>
                        <div className="admin-row-actions">
                          {profileClaimMatch.claim?.status === 'pending' && (
                            <button className="btn btn-ghost danger" disabled={isActionLoading('profile-claim-withdraw')} onClick={withdrawOwnProfileClaim} type="button">
                              {isActionLoading('profile-claim-withdraw') ? 'Cancelando...' : 'Cancelar solicitud'}
                              <ActionSpinner active={isActionLoading('profile-claim-withdraw')} />
                            </button>
                          )}
                          {profileClaimMatch.candidate && !['pending', 'processing', 'blocked', 'approved'].includes(profileClaimMatch.claim?.status || '') && (
                            <button className="btn btn-primary" onClick={() => setProfileClaimConfirmOpen(true)} type="button">
                              Solicitar vinculacion
                            </button>
                          )}
                        </div>
                      </section>
                    )}
                  </section>
                  {SHOW_EMAIL_SETTINGS_UI && notificationPreferences && (
                    <section className="admin-manager admin-notifications admin-profile-email-settings">
                      <div className="admin-manager-head">
                        <div>
                          <span>Email</span>
                          <h2>Avisos del flujo editorial</h2>
                          <p>Elegis si queres recibir por email los movimientos internos que tambien aparecen en notificaciones.</p>
                        </div>
                        <button aria-expanded={notificationPreferencesOpen} className="btn btn-ghost" onClick={() => setNotificationPreferencesOpen((open) => !open)} type="button">
                          {notificationPreferencesOpen ? 'Ocultar opciones' : 'Configurar avisos'}
                        </button>
                      </div>
                      {notificationPreferencesOpen && (
                        <div className="admin-notification-body">
                          <label className="admin-switch-row">
                            <input checked={notificationPreferences.enabled} onChange={(event) => updateNotificationPreference('enabled', event.target.checked)} type="checkbox" />
                            <span><strong>Recibir emails del panel</strong><small>El opt-in se guarda para {notificationPreferences.email || user.email}.</small></span>
                          </label>
                          <div className="admin-notification-options">
                            {NOTIFICATION_EVENT_LABELS.filter((event) => event.always || event.roles.some((role) => roles.includes(role))).map((event) => (
                              <label key={event.value}>
                                <input checked={notificationPreferences.events[event.value] === true} disabled={!notificationPreferences.enabled} onChange={() => toggleNotificationEvent(event.value)} type="checkbox" />
                                {event.label}
                              </label>
                            ))}
                          </div>
                          <div className="admin-manager-actions">
                            <span>{notificationPreferences.enabled ? 'Emails activos para eventos seleccionados.' : 'Emails desactivados.'}</span>
                            <button className="btn btn-primary" disabled={savingNotificationPreferences || isActionLoading('notification-save')} onClick={saveNotificationPreferences} type="button">
                              {isActionLoading('notification-save') ? 'Guardando preferencias...' : 'Guardar preferencias'}
                              <ActionSpinner active={isActionLoading('notification-save')} />
                            </button>
                          </div>
                        </div>
                      )}
                    </section>
                  )}
                  {isAdmin && (
                    <AdminOperationsPanel apiBase={API_BASE} currentEmail={user.email} />
                  )}
                </>
              )}

              {activePanelTab === 'profiles' && canReviewProfiles && (
                <section className="admin-manager">
                  <div className="admin-manager-head">
                    <div>
                      <span>Perfiles</span>
                      <h2>Revision de perfiles publicos</h2>
                      <p>Revisa los datos que los usuarios cargan para las paginas de autor.</p>
                    </div>
                    <button className="btn btn-ghost" onClick={loadAdminProfiles} type="button">
                      Actualizar
                    </button>
                  </div>
                  <div className="admin-profile-notice">
                    Si el nombre visible no coincide con el autor usado en una nota, el perfil no se va a mostrar correctamente y el usuario no podra activar la publicacion del perfil.
                  </div>
                  <section className={`admin-profile-claims admin-collapsible-section ${adminProfileClaimsOpen ? 'is-open' : 'is-collapsed'} ${pendingAdminProfileClaimCount > 0 ? 'has-pending' : ''}`}>
                    <div className="admin-manager-head compact">
                      <div>
                        <span>Solicitudes</span>
                        <h3>Vinculacion de perfiles</h3>
                        <p>Revisa quien solicita heredar un perfil gestionado y sus notas.</p>
                      </div>
                      <div className="admin-collapsible-head-actions">
                        <span className="admin-claim-count">
                          {pendingAdminProfileClaimCount} pendientes
                        </span>
                        <button
                          aria-expanded={adminProfileClaimsOpen}
                          aria-label={adminProfileClaimsOpen ? 'Cerrar vinculacion de perfiles' : 'Abrir vinculacion de perfiles'}
                          className="admin-icon-button admin-collapse-button"
                          onClick={() => setAdminProfileClaimsOpen((open) => !open)}
                          type="button"
                        >
                          <span aria-hidden="true" className="material-symbols-outlined">{adminProfileClaimsOpen ? 'expand_less' : 'expand_more'}</span>
                        </button>
                      </div>
                    </div>
                    {adminProfileClaimsOpen && (
                      <div className="admin-collapsible-content">
                        <div className="admin-filter-chips admin-claim-filters" aria-label="Filtrar solicitudes">
                          {[
                            ['pending', 'Pendientes'],
                            ['approved', 'Aprobadas'],
                            ['blocked', 'Bloqueadas'],
                            ['all', 'Todas'],
                          ].map(([value, label]) => (
                            <button
                              aria-pressed={adminProfileClaimFilter === value}
                              className={adminProfileClaimFilter === value ? 'selected' : ''}
                              key={value}
                              onClick={() => setAdminProfileClaimFilter(value)}
                              type="button"
                            >
                              {label}
                            </button>
                          ))}
                        </div>
                        <div className="admin-claim-list">
                          {filteredAdminProfileClaims.length === 0 ? (
                            <p className="admin-empty-copy">No hay solicitudes en esta vista.</p>
                          ) : filteredAdminProfileClaims.map((claim) => (
                            <button className="admin-claim-row" key={claim.id} onClick={() => setAdminProfileClaimDialog({ claim, action: 'review' })} type="button">
                              <span className={`status ${profileClaimStatusClass(claim.status)}`}>{PROFILE_CLAIM_STATUS_LABELS[claim.status] || claim.status}</span>
                              <span><strong>{claim.fullName}</strong><small>{claim.requesterEmail}</small></span>
                              <span><strong>{claim.affectedPostCount}</strong><small>{claim.affectedPostCount === 1 ? 'nota afectada' : 'notas afectadas'}</small></span>
                              <span><small>{formatAdminDate(claim.requestedAt)}</small><span className="material-symbols-outlined" aria-hidden="true">chevron_right</span></span>
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </section>
                  <form className={`admin-managed-profile-form admin-collapsible-section ${adminProfileEditorOpen ? 'is-open' : 'is-collapsed'}`} onSubmit={saveAdminAuthorProfile}>
                    <div className="admin-manager-head compact">
                      <div>
                        <span>{adminProfileEditingId ? (adminProfileBeingEdited?.managedAuthor ? 'Autor gestionado' : 'Cuenta de usuario') : 'Nuevo autor'}</span>
                        <h3>{adminProfileEditingId ? 'Editar perfil' : 'Crear perfil sin cuenta'}</h3>
                        <p>{adminProfileEditingId
                          ? adminProfileBeingEdited?.managedAuthor
                            ? 'Actualiza los datos publicos del perfil gestionado.'
                            : `Corrige los datos del perfil de ${adminProfileBeingEdited?.email || 'esta cuenta'}. El email y sus permisos no se modifican.`
                          : 'Usalo para autores que no ingresan al panel, pero necesitan tener perfil en el blog.'}</p>
                      </div>
                      <button
                        aria-expanded={adminProfileEditorOpen}
                        aria-label={adminProfileEditorOpen ? 'Cerrar editor de perfiles' : 'Abrir editor de perfiles'}
                        className="admin-icon-button admin-collapse-button"
                        onClick={() => setAdminProfileEditorOpen((open) => !open)}
                        type="button"
                      >
                        <span aria-hidden="true" className="material-symbols-outlined">{adminProfileEditorOpen ? 'expand_less' : 'expand_more'}</span>
                      </button>
                    </div>
                    {adminProfileEditorOpen && (
                      <div className="admin-collapsible-content admin-profile-editor-content">
                    <div className="admin-two">
                      <label>
                        Nombre
                        <input
                          value={adminProfileDraft.firstName}
                          onChange={(event) => updateAdminProfileDraft('firstName', event.target.value)}
                          required
                        />
                      </label>
                      <label>
                        Apellido
                        <input
                          value={adminProfileDraft.lastName}
                          onChange={(event) => updateAdminProfileDraft('lastName', event.target.value)}
                          required
                        />
                      </label>
                    </div>
                    <label>
                      Descripcion breve para Perfil
                      <textarea
                        maxLength="500"
                        onChange={(event) => updateAdminProfileDraft('description', event.target.value)}
                        placeholder="Una descripción breve sobre vos, para mostrar en tu perfil público."
                        rows="3"
                        value={adminProfileDraft.description}
                      />
                    </label>
                    <label>
                      Sobre mi
                      <textarea
                        maxLength="180"
                        onChange={(event) => updateAdminProfileDraft('focusArea', event.target.value)}
                        placeholder="Presentacion personal que protagoniza la card del autor en 'Conoce a los autores'."
                        rows="3"
                        value={adminProfileDraft.focusArea}
                      />
                    </label>
                    <label>
                      Frase de cierre de Nota
                      <textarea
                        maxLength="220"
                        onChange={(event) => updateAdminProfileDraft('closingPhrase', event.target.value)}
                        placeholder="Texto corto para el cierre de sus notas."
                        rows="2"
                        value={adminProfileDraft.closingPhrase}
                      />
                    </label>
                    <label>
                      Foto
                      <div className="admin-radio-group">
                        <label>
                          <input
                            checked={adminProfilePhotoMode === 'url'}
                            disabled={isActionLoading('admin-profile-photo')}
                            name="adminProfilePhotoMode"
                            onChange={() => setAdminProfilePhotoMode('url')}
                            type="radio"
                            value="url"
                          />
                          URL
                        </label>
                        <label>
                          <input
                            checked={adminProfilePhotoMode === 'upload'}
                            disabled={isActionLoading('admin-profile-photo')}
                            name="adminProfilePhotoMode"
                            onChange={() => setAdminProfilePhotoMode('upload')}
                            type="radio"
                            value="upload"
                          />
                          Subir foto
                        </label>
                      </div>
                      {adminProfilePhotoMode === 'url' ? (
                        <input
                          disabled={isActionLoading('admin-profile-photo')}
                          onChange={(event) => updateAdminProfileDraft('photoUrl', event.target.value)}
                          placeholder="https://..."
                          value={adminProfileDraft.photoUrl}
                        />
                      ) : (
                        <input
                          accept="image/jpeg,image/png,image/webp"
                          disabled={isActionLoading('admin-profile-photo')}
                          onChange={(event) => uploadAdminProfilePhoto(event.target.files?.[0])}
                          ref={adminProfilePhotoInputRef}
                          type="file"
                        />
                      )}
                      {isActionLoading('admin-profile-photo') && (
                        <p className="admin-field-info">
                          Subiendo foto...
                          <ActionSpinner active />
                        </p>
                      )}
                      {adminProfileDraft.photoUrl && (
                        <div className="admin-managed-photo-preview">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img alt="" src={adminProfileDraft.photoUrl} />
                          <button
                            className="btn btn-ghost"
                            disabled={isActionLoading('admin-profile-photo')}
                            onClick={() => updateAdminProfileDraft('photoUrl', '')}
                            type="button"
                          >
                            Quitar foto
                          </button>
                        </div>
                      )}
                    </label>
                    <label className="admin-profile-share">
                      <input
                        checked={adminProfileDraft.publicProfileEnabled}
                        onChange={(event) => updateAdminProfileDraft('publicProfileEnabled', event.target.checked)}
                        type="checkbox"
                      />
                      <span>
                        <strong>Publicar perfil si coincide con un autor existente</strong>
                        <small>Si todavia no hay una nota con este autor exacto, el perfil se crea pero queda sin publicar.</small>
                      </span>
                    </label>
                    <div className="admin-manager-actions">
                      {adminProfileEditingId && (
                        <button
                          className="btn btn-ghost"
                          disabled={isActionLoading('admin-profile-update') || isActionLoading('admin-profile-photo')}
                          onClick={resetAdminAuthorProfileForm}
                          type="button"
                        >
                          Cancelar edicion
                        </button>
                      )}
                      <button
                        className="btn btn-primary"
                        disabled={isActionLoading('admin-profile-create') || isActionLoading('admin-profile-update') || isActionLoading('admin-profile-photo')}
                        type="submit"
                      >
                        {isActionLoading('admin-profile-update') ? 'Guardando perfil...' : isActionLoading('admin-profile-create') ? 'Creando perfil...' : adminProfileEditingId ? 'Guardar perfil' : 'Crear perfil de autor'}
                        <ActionSpinner active={isActionLoading('admin-profile-create') || isActionLoading('admin-profile-update')} />
                      </button>
                    </div>
                      </div>
                    )}
                  </form>
                  <div className="admin-table-wrap">
                    <table className="admin-table">
                      <thead>
                        <tr>
                          <th>Perfil</th>
                          <th>Estado</th>
                          <th>Descripcion</th>
                          <th>Sobre mi</th>
                          <th>Slug</th>
                          <th>Actualizado</th>
                          <th>Acciones</th>
                        </tr>
                      </thead>
                      <tbody>
                        {adminProfiles.length === 0 ? (
                          <tr>
                            <td colSpan="7">Todavia no hay perfiles cargados.</td>
                          </tr>
                        ) : adminProfiles.map((profile) => {
                          const profileIsPublic = profile.publicProfileEnabled && profile.canSharePublicProfile;
                          const profileStatus = profileIsPublic
                            ? 'Publico'
                            : profile.publicProfileEnabled
                              ? 'Esperando coincidencia'
                              : 'Publicacion desactivada';
                          const profileStatusClass = profileIsPublic
                            ? 'published'
                            : profile.publicProfileEnabled
                              ? 'draft'
                              : 'archived';

                          return (
                          <tr key={profile.email || profile.id}>
                            <td>
                              <div className="admin-profile-row">
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img alt="" src={profile.photoUrl || DEFAULT_PROFILE_PHOTO} />
                                <div>
                                  <strong>{profile.fullName || 'Sin nombre'}</strong>
                                  <small>{profile.email}</small>
                                </div>
                              </div>
                            </td>
                            <td>
                              <span className={`status ${profileStatusClass}`}>
                                {profileStatus}
                              </span>
                            </td>
                            <td>{profile.description || 'Sin descripcion'}</td>
                            <td>{profile.focusArea || 'Sin area definida'}</td>
                            <td>
                              {profile.authorSlug || 'Sin slug'}
                              {profileIsPublic && profile.fullName && (
                                <small>
                                  <Link href={`/blog?autor=${encodeURIComponent(profile.fullName)}`} target="_blank">Ver pagina</Link>
                                </small>
                              )}
                            </td>
                            <td>{formatAdminDate(profile.updatedAt)}</td>
                            <td>
                              <div className="admin-row-actions">
                                <button
                                  className="btn btn-ghost"
                                  disabled={isActionLoading(`admin-profile-delete:${profile.id}`)}
                                  onClick={() => editAdminAuthorProfile(profile)}
                                  type="button"
                                >
                                  Editar
                                </button>
                                {profile.managedAuthor && (
                                  <button
                                    className="btn btn-ghost danger"
                                    disabled={isActionLoading(`admin-profile-delete:${profile.id}`)}
                                    onClick={() => setAdminProfileDeleteTarget(profile)}
                                    type="button"
                                  >
                                    {isActionLoading(`admin-profile-delete:${profile.id}`) ? 'Eliminando...' : 'Eliminar'}
                                    <ActionSpinner active={isActionLoading(`admin-profile-delete:${profile.id}`)} />
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </section>
              )}

              {activePanelTab === 'newsletter' && canAccessNewsletterPanel && (
                <NewsletterAdminPanel apiBase={API_BASE} currentEmail={user.email} />
              )}

              {activePanelTab === 'access' && (
                <>
              {SHOW_EMAIL_SETTINGS_UI && notificationPreferences && (
                <section className="admin-manager admin-notifications">
                  <div className="admin-manager-head">
                    <div>
                      <span>Email</span>
                      <h2>Notificaciones</h2>
                      <p>Activa avisos transaccionales del flujo editorial. Nadie recibe emails si no habilita esta opcion.</p>
                    </div>
                    <button
                      aria-expanded={notificationPreferencesOpen}
                      className="btn btn-ghost"
                      onClick={() => setNotificationPreferencesOpen((open) => !open)}
                      type="button"
                    >
                      {notificationPreferencesOpen ? 'Ocultar email' : 'Configurar email'}
                    </button>
                  </div>
                  {notificationPreferencesOpen && (
                    <div className="admin-notification-body">
                      <label className="admin-switch-row">
                        <input
                          checked={notificationPreferences.enabled}
                          onChange={(event) => updateNotificationPreference('enabled', event.target.checked)}
                          type="checkbox"
                        />
                        <span>
                          <strong>Recibir emails del panel</strong>
                          <small>El opt-in se guarda para {notificationPreferences.email || user.email}.</small>
                        </span>
                      </label>
                      <div className="admin-notification-options">
                        {NOTIFICATION_EVENT_LABELS
                          .filter((event) => event.always || event.roles.some((role) => roles.includes(role)))
                          .map((event) => (
                            <label key={event.value}>
                              <input
                                checked={notificationPreferences.events[event.value] === true}
                                disabled={!notificationPreferences.enabled}
                                onChange={() => toggleNotificationEvent(event.value)}
                                type="checkbox"
                              />
                              {event.label}
                            </label>
                          ))}
                      </div>
                      <div className="admin-manager-actions">
                        <span>{notificationPreferences.enabled ? 'Emails activos para eventos seleccionados.' : 'Emails desactivados.'}</span>
                        <button
                          className="btn btn-primary"
                          disabled={savingNotificationPreferences || isActionLoading('notification-save')}
                          onClick={saveNotificationPreferences}
                          type="button"
                        >
                          {isActionLoading('notification-save') ? 'Guardando preferencias...' : 'Guardar preferencias'}
                          <ActionSpinner active={isActionLoading('notification-save')} />
                        </button>
                      </div>
                    </div>
                  )}
                </section>
              )}
              {canManageUsers && (
                <section className="admin-manager admin-users">
                  <div className="admin-manager-head">
                    <div>
                      <span>Usuarios</span>
                      <h2>Roles y accesos</h2>
                      <p>Agrega emails @{ALLOWED_EMAIL_DOMAIN} o @{ASSIGNED_EMAIL_DOMAIN}, asigna roles y guarda los cambios. Solo admins @{ALLOWED_EMAIL_DOMAIN} pueden habilitar usuarios.</p>
                    </div>
                    <button
                      aria-expanded={adminUsersOpen}
                      className="btn btn-ghost"
                      onClick={() => setAdminUsersOpen((open) => !open)}
                      type="button"
                    >
                      {adminUsersOpen ? 'Ocultar usuarios' : 'Mostrar usuarios'}
                    </button>
                  </div>

                  {adminUsersOpen && (
                    <div className="admin-manager-body">
                      <div className="admin-user-tools">
                        <label>
                          Buscar usuario
                          <input
                            onChange={(e) => setAdminUserSearch(e.target.value)}
                            placeholder="email o rol"
                            type="search"
                            value={adminUserSearch}
                          />
                        </label>
                        <label>
                          Agregar email
                          <div className="admin-user-add">
                            <input
                              onChange={(e) => setAdminUserEmail(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  e.preventDefault();
                                  addAdminUserDraft();
                                }
                              }}
                              placeholder={`persona@${ALLOWED_EMAIL_DOMAIN} o persona@${ASSIGNED_EMAIL_DOMAIN}`}
                              type="email"
                              value={adminUserEmail}
                            />
                            <button className="btn btn-primary" disabled={busy || !adminUserNewRoles.length} onClick={addAdminUserDraft} type="button">
                              Agregar
                            </button>
                          </div>
                        </label>
                        <div className="admin-user-role-tool">
                          <span>Rol inicial</span>
                          <div className="admin-role-checks admin-role-checks-inline">
                            {ASSIGNABLE_ROLES.map((role) => (
                              <label key={role.value}>
                                <input
                                  checked={adminUserNewRoles.includes(role.value)}
                                  disabled={busy}
                                  onChange={() => toggleNewAdminUserRole(role.value)}
                                  type="checkbox"
                                />
                                {role.label}
                              </label>
                            ))}
                          </div>
                        </div>
                      </div>

                      <div className="admin-table-wrap">
                        <table className="admin-table admin-users-table">
                          <thead>
                            <tr>
                              <th>Usuario</th>
                              <th>Roles asignados</th>
                              <th>Actualizado</th>
                              <th>Acciones</th>
                            </tr>
                          </thead>
                          <tbody>
                            {filteredAdminUsers.length === 0 ? (
                              <tr>
                                <td colSpan="4">No hay usuarios para esta busqueda.</td>
                              </tr>
                            ) : filteredAdminUsers.map((item) => {
                              const draftRoles = adminUserDrafts[item.email] || item.roles || [];
                              const changed = !sameRoleSet(draftRoles, item.roles || []);
                              return (
                                <tr className={changed ? 'selected' : ''} key={item.email}>
                                  <td>
                                    <strong>{item.email}</strong>
                                    {item.isDraft && <small>Nuevo usuario sin guardar</small>}
                                    {!item.isDraft && item.updatedBy && <small>Ultimo cambio: {item.updatedBy}</small>}
                                  </td>
                                  <td>
                                    <div className="admin-role-checks">
                                      {ASSIGNABLE_ROLES.map((role) => (
                                        <label key={role.value}>
                                          <input
                                            checked={draftRoles.includes(role.value)}
                                            disabled={busy}
                                            onChange={() => toggleAdminUserRole(item.email, role.value)}
                                            type="checkbox"
                                          />
                                          {role.label}
                                        </label>
                                      ))}
                                    </div>
                                  </td>
                                  <td>{formatAdminDate(item.updatedAt || item.createdAt)}</td>
                                  <td>
                                    <div className="admin-table-actions">
                                      <button
                                        className="btn btn-ghost"
                                        disabled={busy || isActionLoading(`user-save:${item.email}`) || (!changed && !item.isDraft)}
                                        onClick={() => saveAdminUserRoles(item.email)}
                                        type="button"
                                      >
                                        {isActionLoading(`user-save:${item.email}`) ? 'Guardando...' : 'Guardar'}
                                        <ActionSpinner active={isActionLoading(`user-save:${item.email}`)} />
                                      </button>
                                      <button
                                        className="btn btn-ghost danger"
                                        disabled={busy || isActionLoading(`user-delete:${item.email}`) || item.isDraft}
                                        onClick={() => deleteAdminUserRoles(item.email)}
                                        type="button"
                                      >
                                        {isActionLoading(`user-delete:${item.email}`) ? 'Quitando...' : 'Quitar roles'}
                                        <ActionSpinner active={isActionLoading(`user-delete:${item.email}`)} />
                                      </button>
                                    </div>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </section>
              )}
              {SHOW_EMAIL_SETTINGS_UI && !notificationPreferences && !canManageUsers && (
                <div className="admin-empty">
                  Cargando configuracion de mails.
                </div>
              )}
                </>
              )}

              {activePanelTab === 'blogs' && canAccessEditorialPanel && (
                <>
              {isAdmin && (
                <section className="admin-manager">
                  <div className="admin-manager-head">
                    <div>
                      <span>Gestion admin</span>
                      <h2>Tabla de blogs y acciones masivas</h2>
                      <p>Usa los filtros de posts para acotar la vista antes de seleccionar publicaciones.</p>
                    </div>
                    <button
                      aria-expanded={adminManagerOpen}
                      className="btn btn-ghost"
                      onClick={() => setAdminManagerOpen((open) => !open)}
                      type="button"
                    >
                      {adminManagerOpen ? 'Ocultar tabla' : 'Mostrar tabla'}
                    </button>
                  </div>

                  {adminManagerOpen && (
                    <div className="admin-manager-body">
                      <div className="admin-manager-actions">
                        <span>{selectedAdminPosts.length} seleccionados</span>
                        <button
                          className="btn btn-ghost"
                          disabled={busy || isActionLoading('batch:publish') || selectedAdminPosts.length === 0}
                          onClick={() => runBatchPostAction('publish')}
                          type="button"
                        >
                          {isActionLoading('batch:publish') ? 'Publicando...' : 'Publicar seleccionados'}
                          <ActionSpinner active={isActionLoading('batch:publish')} />
                        </button>
                        <button
                          className="btn btn-ghost"
                          disabled={busy || isActionLoading('batch:archive') || selectedAdminPosts.length === 0}
                          onClick={() => runBatchPostAction('archive')}
                          type="button"
                        >
                          {isActionLoading('batch:archive') ? 'Archivando...' : 'Archivar seleccionados'}
                          <ActionSpinner active={isActionLoading('batch:archive')} />
                        </button>
                        <button
                          className="btn btn-ghost danger"
                          disabled={busy || isActionLoading('batch:delete') || selectedAdminPosts.length === 0}
                          onClick={() => runBatchPostAction('delete')}
                          type="button"
                        >
                          {isActionLoading('batch:delete') ? 'Eliminando...' : 'Eliminar seleccionados'}
                          <ActionSpinner active={isActionLoading('batch:delete')} />
                        </button>
                        <button
                          className="btn btn-ghost"
                          disabled={busy || selectedAdminPosts.length === 0}
                          onClick={() => setSelectedAdminPostIds([])}
                          type="button"
                        >
                          Limpiar seleccion
                        </button>
                      </div>

                      <div className="admin-table-wrap">
                        <table className="admin-table">
                          <thead>
                            <tr>
                              <th>
                                <input
                                  aria-label="Seleccionar todos los posts visibles"
                                  checked={allAdminVisibleSelected}
                                  disabled={sortedPosts.length === 0}
                                  onChange={toggleAllAdminPosts}
                                  type="checkbox"
                                />
                              </th>
                              <th>Estado</th>
                              <th>Titulo</th>
                              <th>Autor</th>
                              <th>Categoria y tags</th>
                              <th>Fecha</th>
                              <th>Acciones</th>
                            </tr>
                          </thead>
                          <tbody>
                            {sortedPosts.length === 0 ? (
                              <tr>
                                <td colSpan="7">No hay posts para esta vista.</td>
                              </tr>
                            ) : sortedPosts.map((post) => (
                              <tr className={selectedAdminPostIdsSet.has(post.id) ? 'selected' : ''} key={post.id}>
                                <td>
                                  <input
                                    aria-label={`Seleccionar ${post.title || post.id}`}
                                    checked={selectedAdminPostIdsSet.has(post.id)}
                                    onChange={() => toggleAdminPostSelection(post.id)}
                                    type="checkbox"
                                  />
                                </td>
                                <td>
                                  <span className={`admin-status status-${post.status || 'draft'}`}>
                                    {STATUS_LABELS[post.status] || post.status || 'Borrador'}
                                  </span>
                                  {post.editRequestedAt && <small>Solicitud de edicion</small>}
                                </td>
                                <td>
                                  <button className="admin-table-title" onClick={() => selectPostForEdit(post)} type="button">
                                    {post.title || 'Sin titulo'}
                                  </button>
                                  <small>{post.excerpt || 'Sin extracto'}</small>
                                </td>
                                <td>
                                  {post.authorName || post.authorEmail || 'Sin autor'}
                                  {post.authorName && post.authorEmail && <small>{post.authorEmail}</small>}
                                </td>
                                <td>
                                  {post.category || 'Sin categoria'}
                                  {Array.isArray(post.tags) && post.tags.length > 0 && <small>{post.tags.join(', ')}</small>}
                                </td>
                                <td>{formatAdminDate(post.updatedAt || post.publishedAt || post.createdAt)}</td>
                                <td>
                                  <div className="admin-table-actions">
                                    <button className="btn btn-ghost" onClick={() => selectPostForEdit(post)} type="button">
                                      Editar
                                    </button>
                                    <button
                                      className="btn btn-ghost"
                                      disabled={busy || isActionLoading(`workflow:publish:${post.id}`) || post.status === 'published'}
                                      onClick={() => requestAction(`/v1/posts/${post.id}/publish`, 'Post publicado.', 'publicar', `workflow:publish:${post.id}`)}
                                      type="button"
                                    >
                                      {isActionLoading(`workflow:publish:${post.id}`) ? 'Publicando...' : 'Publicar'}
                                      <ActionSpinner active={isActionLoading(`workflow:publish:${post.id}`)} />
                                    </button>
                                    <button
                                      className="btn btn-ghost"
                                      disabled={busy || isActionLoading(`workflow:archive:${post.id}`) || post.status === 'archived'}
                                      onClick={() => requestAction(`/v1/posts/${post.id}/archive`, 'Post archivado.', 'archivar', `workflow:archive:${post.id}`)}
                                      type="button"
                                    >
                                      {isActionLoading(`workflow:archive:${post.id}`) ? 'Archivando...' : 'Archivar'}
                                      <ActionSpinner active={isActionLoading(`workflow:archive:${post.id}`)} />
                                    </button>
                                    {post.editRequestedAt && (
                                      <button
                                        className="btn btn-workflow"
                                        disabled={busy || isActionLoading(`workflow:enable-edit:${post.id}`)}
                                        onClick={() => requestAction(`/v1/posts/${post.id}/enable-edit`, 'Edicion habilitada sobre el post publicado.', 'habilitar edicion', `workflow:enable-edit:${post.id}`)}
                                        type="button"
                                      >
                                        {isActionLoading(`workflow:enable-edit:${post.id}`) ? 'Habilitando...' : 'Habilitar edicion'}
                                        <ActionSpinner active={isActionLoading(`workflow:enable-edit:${post.id}`)} />
                                      </button>
                                    )}
                                    <button className="btn btn-ghost danger" disabled={busy || isActionLoading(`post-delete:${post.id}`)} onClick={() => deletePost(post.id)} type="button">
                                      {isActionLoading(`post-delete:${post.id}`) ? 'Eliminando...' : 'Eliminar'}
                                      <ActionSpinner active={isActionLoading(`post-delete:${post.id}`)} />
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </section>
              )}

              <div className="admin-grid">
                <aside className="admin-list">
                  <div className="admin-list-head">
                    <button
                      aria-expanded={mobilePostsOpen}
                      className="admin-list-toggle"
                      onClick={() => setMobilePostsOpen((open) => !open)}
                      type="button"
                    >
                      <span>Posts</span>
                      <span aria-hidden="true" className="material-symbols-outlined">
                        {mobilePostsOpen ? 'expand_less' : 'expand_more'}
                      </span>
                    </button>
                    <h2>Posts</h2>
                    {!canUseReviewFilters && (
                      <select className="admin-list-status-desktop" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
                        {BLOG_STATUS_FILTERS.map((filter) => (
                          <option key={filter.value || 'all'} value={filter.value}>{filter.label}</option>
                        ))}
                      </select>
                    )}
                  </div>
                  <div className={`admin-list-body ${mobilePostsOpen ? 'open' : ''}`}>
                  {!canUseReviewFilters && (
                    <select className="admin-list-status-mobile" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
                      {BLOG_STATUS_FILTERS.map((filter) => (
                        <option key={filter.value || 'all'} value={filter.value}>{filter.label}</option>
                      ))}
                    </select>
                  )}
                  {canUseReviewFilters && (
                    <div className="admin-post-filters">
                      <div className="admin-filter-chips" aria-label="Filtrar por estado">
                        {REVIEW_STATUS_FILTERS.map((filter) => (
                          <button
                            aria-pressed={activeStatusFilter === filter.value}
                            className={activeStatusFilter === filter.value ? 'selected' : ''}
                            key={filter.value}
                            onClick={() => {
                              setStatusFilter((current) => current === filter.value ? '' : filter.value);
                            }}
                            type="button"
                          >
                            {filter.label}
                          </button>
                        ))}
                      </div>
                      <input
                        aria-label="Filtrar posts por título, categoría o tag"
                        onChange={(e) => setPostSearch(e.target.value)}
                        placeholder="Buscar por título, categoría o tag"
                        type="search"
                        value={postSearch}
                      />
                    </div>
                  )}
                  {canCreatePosts && (
                    <button
                      className="btn btn-primary admin-new"
                      onClick={() => {
                        const nextForm = normalizeForm({
                          ...EMPTY_FORM,
                          authorName: profileAuthorName,
                          showAuthorNote: hasAuthorProfile,
                        });
                        setForm(nextForm);
                        setSavedForm(nextForm);
                        setUseManualAuthorNote(false);
                        setCategorySearchTerm('');
                        setCoverImageError('');
                      }}
                    >
                      Nuevo post
                    </button>
                  )}
                  {busy && <p className="admin-muted">Cargando...</p>}
                  {sortedPosts.length === 0 && !busy && <p className="admin-muted">Todavía no hay posts.</p>}
                  {sortedPosts.map((post) => (
                    <article
                      className={`admin-post ${form.id === post.id ? 'selected' : ''}`}
                      key={post.id}
                      onClick={() => {
                        selectPostForEdit(post);
                        setMobilePostsOpen(false);
                      }}
                    >
                      {visibleStatusLabel(post, canUseReviewFilters) && (
                        <span className={`admin-status status-${visibleStatusValue(post, canUseReviewFilters)}`}>
                          {visibleStatusLabel(post, canUseReviewFilters)}
                        </span>
                      )}
                      <h3>{post.title}</h3>
                      <p>{post.excerpt || 'Sin extracto'}</p>
                    </article>
                  ))}
                  </div>
                </aside>

                <form className="admin-editor" onSubmit={savePost}>
                  {publishedAuthorLocked && (
                    editRequestPending ? (
                      <div className="admin-editor-lock is-pending">
                        <span aria-hidden="true" className="material-symbols-outlined">hourglass_top</span>
                        <div>
                          <strong>Solicitud de ediciín pendiente</strong>
                          <span>Un reviewer o admin debe habilitar una nueva versiín antes de que puedas modificar este post.</span>
                        </div>
                      </div>
                    ) : (
                      <button
                        className="admin-editor-lock admin-editor-lock-action"
                        disabled={busy || isActionLoading(`workflow:request-edit:${form.id}`)}
                        onClick={() => setEditRequestConfirmOpen(true)}
                        type="button"
                      >
                        <span aria-hidden="true" className="material-symbols-outlined">
                          {isActionLoading(`workflow:request-edit:${form.id}`) ? 'hourglass_top' : 'edit_note'}
                        </span>
                        <div>
                          <strong>Solicitar edicion</strong>
                          <span>Este post esta publicado. Pedile a revisión que lo habilite como nueva versión editable.</span>
                        </div>
                        <em>{isActionLoading(`workflow:request-edit:${form.id}`) ? 'Enviando...' : 'Pedir acceso'}</em>
                      </button>
                    )
                  )}
                  <div className="admin-editor-head">
                    <h2>{publishedAuthorLocked ? 'Vista previa' : form.id ? 'Editar post' : canCreatePosts ? 'Nuevo post' : 'Selecciona un post'}</h2>
                    {form.id && <span className="admin-id">{form.id}</span>}
                  </div>
                  {editingLivePost && (
                    <div className="admin-editor-lock">
                      <strong>Edicion sobre publicado</strong>
                      <span>El articulo sigue publicado afuera. Estos cambios quedan como nueva version hasta que los envies a revision y se vuelvan a publicar.</span>
                    </div>
                  )}

                  <label>
                    Título
                    <input disabled={publishedAuthorLocked} value={form.title} onChange={(e) => updateForm('title', e.target.value)} required />
                  </label>

                  <div className="admin-two">
                    <label>
                      Autor
                      <input disabled={publishedAuthorLocked} value={form.authorName} onChange={(e) => updateForm('authorName', e.target.value)} placeholder={user?.name || user?.email || 'Nombre visible'} />
                    </label>
                    <label>
                      Categoría
                      <div className="admin-category-combobox">
                        <input
                          aria-autocomplete="list"
                          disabled={publishedAuthorLocked}
                          aria-expanded={categoryDropdownOpen}
                          aria-label="Categoría"
                          onBlur={() => {
                            updateForm('category', sanitizeCategory(form.category));
                            setCategorySearchTerm('');
                            window.setTimeout(() => setCategoryDropdownOpen(false), 120);
                          }}
                          onChange={(e) => {
                            updateForm('category', e.target.value);
                            setCategorySearchTerm(e.target.value);
                            setCategoryDropdownOpen(true);
                          }}
                          onFocus={() => {
                            setCategorySearchTerm('');
                            setCategoryDropdownOpen(true);
                          }}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' && canAddCurrentCategory) {
                              e.preventDefault();
                              createCategoryFromForm();
                            }
                            if (e.key === 'Escape') {
                              setCategorySearchTerm('');
                              setCategoryDropdownOpen(false);
                            }
                          }}
                          placeholder="Buscar o crear categoría"
                          role="combobox"
                          value={form.category}
                        />
                        <button
                          aria-label="Abrir categorías"
                          className="admin-category-toggle"
                          disabled={publishedAuthorLocked}
                          onMouseDown={(e) => {
                            e.preventDefault();
                            setCategorySearchTerm('');
                            setCategoryDropdownOpen((open) => !open);
                          }}
                          type="button"
                        >
                          <span aria-hidden="true" className="material-symbols-outlined">arrow_drop_down</span>
                        </button>
                        {categoryDropdownOpen && (
                          <div className="admin-category-menu" role="listbox">
                            {filteredCategoryOptions.length > 0 ? (
                              filteredCategoryOptions.map((option) => (
                                <button
                                  key={option}
                                  onMouseDown={(e) => {
                                    e.preventDefault();
                                    updateForm('category', option);
                                    setCategorySearchTerm('');
                                    setCategoryDropdownOpen(false);
                                  }}
                                  role="option"
                                  type="button"
                                >
                                  {option}
                                </button>
                              ))
                            ) : (
                              <span>No hay categorías con ese texto.</span>
                            )}
                            {canAddCurrentCategory && (
                              <button
                                className="admin-category-add"
                                disabled={busy || publishedAuthorLocked || isActionLoading('category-create')}
                                onMouseDown={(e) => {
                                  e.preventDefault();
                                  createCategoryFromForm();
                                }}
                                type="button"
                              >
                                {isActionLoading('category-create') ? 'Agregando categoria...' : `Agregar "${sanitizeCategory(form.category)}"`}
                                <ActionSpinner active={isActionLoading('category-create')} />
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                      <div className="admin-category-actions">
                        {canManageCategories && selectedSharedCategory && (
                          <button
                            className="btn btn-ghost danger"
                            disabled={busy}
                            onClick={() => setCategoryDeleteTarget(selectedSharedCategory)}
                            type="button"
                          >
                            Eliminar de la lista
                          </button>
                        )}
                      </div>
                    </label>
                  </div>
                  <datalist id="admin-tag-options">
                    {tagOptions.map((option) => (
                      <option key={option} value={option} />
                    ))}
                  </datalist>

                  <label>
                    Extracto
                    <textarea
                      placeholder="El extracto se genera automaticamente si lo dejas vacio."
                      disabled={publishedAuthorLocked}
                      value={form.excerpt}
                      onChange={(e) => updateForm('excerpt', e.target.value)}
                      rows="3"
                    />
                  </label>

                  <label>
                    Portada
                    <div className="admin-radio-group">
                      <label>
                        <input
                          checked={coverMode === 'url'}
                          disabled={publishedAuthorLocked || isActionLoading('cover-upload')}
                          name="coverMode"
                          onChange={() => setCoverMode('url')}
                          type="radio"
                          value="url"
                        />
                        URL
                      </label>
                      <label>
                        <input
                          checked={coverMode === 'upload'}
                          disabled={publishedAuthorLocked || isActionLoading('cover-upload')}
                          name="coverMode"
                          onChange={() => setCoverMode('upload')}
                          type="radio"
                          value="upload"
                        />
                        Subir foto
                      </label>
                    </div>
                    {coverMode === 'url' ? (
                      <input
                        disabled={publishedAuthorLocked || isActionLoading('cover-upload')}
                        aria-invalid={coverImageError ? 'true' : 'false'}
                        aria-describedby={coverImageError ? 'cover-image-error' : undefined}
                        className={coverImageError ? 'is-invalid' : ''}
                        value={form.coverImage}
                        onBlur={(e) => validateCoverImageUrl(e.target.value)}
                        onChange={(e) => {
                          const coverImage = e.target.value;
                          clearCoverImageError();
                          setForm((current) => normalizeForm({
                            ...current,
                            coverImage,
                            showCoverInPost: current.coverImage ? current.showCoverInPost : true,
                          }));
                        }}
                        placeholder="https://..."
                      />
                    ) : (
                      <input
                        aria-invalid={coverImageError ? 'true' : 'false'}
                        aria-describedby={coverImageError ? 'cover-image-error' : undefined}
                        className={coverImageError ? 'is-invalid' : ''}
                        type="file"
                        accept="image/jpeg,image/png,image/webp"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          clearCoverImageError();
                          e.target.value = '';
                          uploadCoverImage(file);
                        }}
                        disabled={uploading || isActionLoading('cover-upload') || publishedAuthorLocked}
                      />
                    )}
                    {coverImageError && (
                      <p className="admin-field-error" id="cover-image-error">
                        {coverImageError}
                      </p>
                    )}
                    {isActionLoading('cover-upload') && (
                      <p className="admin-field-info">
                        Subiendo imagen de portada...
                        <ActionSpinner active />
                      </p>
                    )}
                    {form.coverImage && (
                      <label className="admin-cover-toggle">
                        <input
                          checked={form.showCoverInPost !== false}
                          disabled={publishedAuthorLocked || isActionLoading('cover-upload')}
                          onChange={(e) => updateForm('showCoverInPost', e.target.checked)}
                          type="checkbox"
                        />
                        Mostrar portada al inicio de la nota
                      </label>
                    )}
                  </label>

                  <label>
                    Tags
                    <input
                      list="admin-tag-options"
                      disabled={publishedAuthorLocked}
                      value={form.tagsText}
                      onBlur={() => updateForm('tagsText', parseTagsText(form.tagsText).join(', '))}
                      onChange={(e) => updateForm('tagsText', e.target.value)}
                      placeholder="política, democracia, análisis"
                    />
                  </label>
                  {tagOptions.length > 0 && (
                    <div className="admin-taxonomy-suggestions">
                      {tagOptions.slice(0, 14).map((option) => (
                        <button disabled={publishedAuthorLocked} key={option} onClick={() => addTagSuggestion(option)} type="button">
                          {option}
                        </button>
                      ))}
                    </div>
                  )}

                  <div className="admin-content-head">
                    <div>
                      <span>Contenido</span>
                      <p>Redacta y da formato a la nota antes de guardarla.</p>
                    </div>
                    <div className="admin-content-actions">
                      <button
                        className="btn btn-ghost"
                        disabled={!form.title && !form.contentMarkdown && !form.coverImage}
                        onClick={() => setPreviewOpen((open) => !open)}
                        type="button"
                      >
                        Previsualizar
                      </button>
                      <button
                        className="btn btn-ghost"
                        disabled={busy || importing || isActionLoading('docx-import') || publishedAuthorLocked}
                        onClick={() => docxInputRef.current?.click()}
                        type="button"
                      >
                        {isActionLoading('docx-import') ? 'Importando...' : 'Importar .docx'}
                        <ActionSpinner active={isActionLoading('docx-import')} />
                      </button>
                    </div>
                    <input
                      accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                      hidden
                      onChange={(e) => importDocx(e.target.files?.[0])}
                      ref={docxInputRef}
                      type="file"
                    />
                  </div>

                  <RichTextEditor
                    activeCommentId={activeReviewCommentId}
                    activeCommentNonce={activeReviewCommentNonce}
                    disabled={editorBusy}
                    onChange={(markdown) => updateForm('contentMarkdown', markdown)}
                    onCreateComment={canPublishPosts && form.id ? createReviewComment : null}
                    onUploadImage={uploadInlineImage}
                    value={form.contentMarkdown}
                  />

                  <section className="admin-author-ending">
                    <div>
                      <span>Final de nota</span>
                      <p>Opcionalmente muestra el cierre de autor con foto, nombre y una frase breve al final.</p>
                    </div>
                    <label className="admin-cover-toggle">
                      <input
                        checked={form.showAuthorNote}
                        disabled={publishedAuthorLocked}
                        onChange={(e) => {
                          const checked = e.target.checked;
                          setForm((current) => normalizeForm({
                            ...current,
                            showAuthorNote: checked,
                            authorNote: checked ? current.authorNote : '',
                          }));
                          if (!checked) setUseManualAuthorNote(false);
                        }}
                        type="checkbox"
                      />
                      Mostrar cierre de autor
                    </label>
                    {form.showAuthorNote && previewUsesCurrentProfile && profileClosingPhrase && !useManualAuthorNote && (
                      <label className="admin-cover-toggle">
                        <input
                          checked={usingProfileClosingPhrase}
                          disabled={publishedAuthorLocked}
                          onChange={(e) => {
                            if (!e.target.checked) {
                              setUseManualAuthorNote(true);
                              updateForm('authorNote', profileClosingPhrase);
                            }
                          }}
                          type="checkbox"
                        />
                        Usar mi frase de cierre guardada en el perfil
                      </label>
                    )}
                    {form.showAuthorNote && (
                      <label className="admin-cover-toggle">
                        <input
                          checked={useManualAuthorNote}
                          disabled={publishedAuthorLocked}
                          onChange={(e) => {
                            setUseManualAuthorNote(e.target.checked);
                            if (!e.target.checked) updateForm('authorNote', '');
                          }}
                          type="checkbox"
                        />
                        Escribir un cierre manual para esta nota
                      </label>
                    )}
                    {form.showAuthorNote && useManualAuthorNote && (
                      <label>
                        Texto de cierre manual
                        <textarea
                          disabled={publishedAuthorLocked}
                          maxLength="500"
                          onChange={(e) => updateForm('authorNote', e.target.value)}
                          placeholder="Escribe una frase breve para el final de esta nota."
                          rows="3"
                          value={form.authorNote}
                        />
                      </label>
                    )}
                  </section>


                  <details className="admin-advanced-options">
                    <summary>
                      <span>Opciones avanzadas</span>
                      <span aria-hidden="true" className="material-symbols-outlined">expand_more</span>
                    </summary>
                    <label>
                      Slug
                      <input
                        disabled={!canChooseSlug || publishedAuthorLocked}
                        value={form.slug}
                        onChange={(e) => updateForm('slug', e.target.value)}
                        placeholder={canChooseSlug ? 'se-genera-si-lo-dejas-vacio' : 'lo genera el sistema'}
                      />
                    </label>
                  </details>

                  {!publishedAuthorLocked && (
                  <div className="admin-actions">
                    <button className="btn btn-primary admin-action-save" disabled={busy || uploading || importing || isActionLoading('post-save') || publishedAuthorLocked || (!form.id && !canCreatePosts)} type="submit">
                      {isActionLoading('post-save') ? 'Guardando...' : form.id ? 'Guardar cambios' : 'Crear borrador'}
                      <ActionSpinner active={isActionLoading('post-save')} />
                    </button>
                    {form.id && (
                      <>
                        {canSubmitReview && !publishedAuthorLocked && (
                          <button className="btn btn-review-action" disabled={busy || isActionLoading('workflow:submit-review')} type="button" onClick={() => requestAction(`/v1/posts/${form.id}/submit-review`, 'Post enviado a revisión.', 'enviar a revisión')}>
                            {isActionLoading('workflow:submit-review') ? 'Enviando...' : 'Enviar a revisión'}
                            <ActionSpinner active={isActionLoading('workflow:submit-review')} />
                          </button>
                        )}
                        {canPublishPosts && (
                          <>
                            {form.editRequestedAt && (
                              <button className="btn btn-workflow" disabled={busy || isActionLoading('workflow:enable-edit')} type="button" onClick={() => requestAction(`/v1/posts/${form.id}/enable-edit`, 'Edicion habilitada sobre el post publicado.', 'habilitar edicion')}>
                                {isActionLoading('workflow:enable-edit') ? 'Habilitando...' : 'Habilitar edicion'}
                                <ActionSpinner active={isActionLoading('workflow:enable-edit')} />
                              </button>
                            )}
                            <button className="btn btn-publish-action" disabled={busy || isActionLoading('workflow:publish')} type="button" onClick={() => requestAction(`/v1/posts/${form.id}/publish`, 'Post publicado.', 'publicar')}>
                              {isActionLoading('workflow:publish') ? 'Publicando...' : 'Publicar'}
                              <ActionSpinner active={isActionLoading('workflow:publish')} />
                            </button>
                            <button className="btn btn-archive-action" disabled={busy || isActionLoading('workflow:archive')} type="button" onClick={() => requestAction(`/v1/posts/${form.id}/archive`, 'Post archivado.', 'archivar')}>
                              {isActionLoading('workflow:archive') ? 'Archivando...' : 'Archivar'}
                              <ActionSpinner active={isActionLoading('workflow:archive')} />
                            </button>
                          </>
                        )}
                        {canDeletePosts && (
                          <button className="btn btn-ghost danger" disabled={busy || isActionLoading(`post-delete:${form.id}`)} type="button" onClick={() => deletePost(form.id)}>
                            {isActionLoading(`post-delete:${form.id}`) ? 'Eliminando...' : 'Eliminar'}
                            <ActionSpinner active={isActionLoading(`post-delete:${form.id}`)} />
                          </button>
                        )}
                      </>
                    )}
                  </div>
                  )}
                </form>
                <aside className="admin-preview-sidebar">
                  <section className="admin-preview-card-panel">
                    <button
                      aria-expanded={previewCardOpen}
                      className="admin-preview-toggle"
                      onClick={() => setPreviewCardOpen((open) => !open)}
                      type="button"
                    >
                      <span>
                        <strong>Previsualización</strong>
                        <small>Hero-card del blog.</small>
                      </span>
                      <span aria-hidden="true" className="material-symbols-outlined">
                        {previewCardOpen ? 'expand_less' : 'expand_more'}
                      </span>
                    </button>
                    {previewCardOpen && (
                      <article className="post admin-card-preview">
                        <div
                          className="post-img"
                          style={form.coverImage ? { backgroundImage: `url('${form.coverImage}')` } : {}}
                        >
                          {form.coverImage && (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              alt=""
                              className="admin-cover-probe"
                              onError={() => failCoverImageLoad()}
                              onLoad={() => setCoverImageError('')}
                              src={form.coverImage}
                            />
                          )}
                        </div>
                        <div className="post-body">
                          <div className="post-tags" aria-label="Tags">
                            {previewTags.slice(0, 3).map((tag) => (
                              <span className="post-cat" key={tag}>{tag}</span>
                            ))}
                          </div>
                          <h4>{form.title || 'Titulo del blog'}</h4>
                          <p>{form.excerpt || 'El extracto de la nota se vera aqui.'}</p>
                          <div className="meta">{form.authorName ? `${form.authorName} - ` : ''}{previewDate}</div>
                        </div>
                      </article>
                    )}
                  </section>

                  {reviewComments.length > 0 && (
                    <section className="admin-review-panel">
                      <div className="admin-preview-head">
                        <span>Comentarios</span>
                        <p>{openReviewCommentCount} abiertos</p>
                      </div>
                      <div className="admin-review-filters" aria-label="Filtrar comentarios">
                        {[
                          { value: 'open', label: 'Abiertos' },
                          { value: 'resolved', label: 'Resueltos' },
                          { value: 'all', label: 'Todos' },
                        ].map((filter) => (
                          <button
                            className={reviewCommentFilter === filter.value ? 'selected' : ''}
                            key={filter.value}
                            onClick={() => setReviewCommentFilter(filter.value)}
                            type="button"
                          >
                            {filter.label}
                          </button>
                        ))}
                      </div>
                      {filteredReviewComments.length === 0 ? (
                        <p className="admin-muted">No hay comentarios en esta vista.</p>
                      ) : (
                        <div className="admin-review-list">
                          {filteredReviewComments.map((comment) => (
                            <article
                              className={`admin-review-comment ${activeReviewCommentId === comment.id ? 'selected' : ''}`}
                              key={comment.id}
                            >
                              <button
                                className="admin-review-comment-main"
                                onClick={() => openReviewCommentDialog(comment, 'reply')}
                                type="button"
                              >
                                <span className={`admin-status status-${comment.status === 'resolved' ? 'published' : 'review'}`}>
                                  {comment.status === 'resolved' ? 'Resuelto' : 'Abierto'}
                                </span>
                                {(comment.selectedTextCurrent || comment.selectedText) && <q>{comment.selectedTextCurrent || comment.selectedText}</q>}
                                <strong>{comment.body}</strong>
                                <small>
                                  {comment.authorName || comment.authorEmail} - {formatAdminDate(comment.createdAt)}
                                </small>
                                {comment.replies.length > 0 && (
                                  <small>{comment.replies.length} respuesta{comment.replies.length === 1 ? '' : 's'}</small>
                                )}
                              </button>
                              <div className="admin-review-actions">
                                {canPublishPosts && comment.status !== 'resolved' && (
                                  <button className="btn btn-ghost" disabled={busy} onClick={() => setEditingReviewComment({ ...comment })} type="button">
                                    Editar
                                  </button>
                                )}
                                {comment.status !== 'resolved' && (
                                  <button className="btn btn-ghost" disabled={busy || isActionLoading(`comment-status:${comment.id}`)} onClick={() => openReviewCommentDialog(comment, 'resolve')} type="button">
                                    {isActionLoading(`comment-status:${comment.id}`) ? 'Resolviendo...' : 'Resolver'}
                                    <ActionSpinner active={isActionLoading(`comment-status:${comment.id}`)} />
                                  </button>
                                )}
                                {comment.status === 'resolved' && (
                                  <button className="btn btn-ghost" disabled={busy || isActionLoading(`comment-status:${comment.id}`)} onClick={() => openReviewCommentDialog(comment, 'reopen')} type="button">
                                    {isActionLoading(`comment-status:${comment.id}`) ? 'Reabriendo...' : 'Reabrir'}
                                    <ActionSpinner active={isActionLoading(`comment-status:${comment.id}`)} />
                                  </button>
                                )}
                                {canPublishPosts && (
                                  <button className="btn btn-ghost danger" disabled={busy || isActionLoading(`comment-delete:${comment.id}`)} onClick={() => deleteReviewComment(comment.id)} type="button">
                                    {isActionLoading(`comment-delete:${comment.id}`) ? 'Eliminando...' : 'Eliminar'}
                                    <ActionSpinner active={isActionLoading(`comment-delete:${comment.id}`)} />
                                  </button>
                                )}
                              </div>
                            </article>
                          ))}
                        </div>
                      )}
                    </section>
                  )}
                </aside>
              </div>
                </>
              )}
              {profileClaimConfirmOpen && profileClaimMatch.candidate && (
                <div className="admin-modal-backdrop" onMouseDown={() => !isActionLoading('profile-claim-request') && setProfileClaimConfirmOpen(false)} role="presentation">
                  <div aria-labelledby="profile-claim-confirm-title" aria-modal="true" className="admin-modal admin-profile-claim-modal" onMouseDown={(event) => event.stopPropagation()} role="dialog">
                    <span className="eyebrow">Vincular identidad editorial</span>
                    <h3 id="profile-claim-confirm-title">Solicitar el perfil de {profileClaimMatch.candidate.fullName}</h3>
                    <p>Un administrador revisara que esta cuenta corresponda al autor. Si se aprueba, vas a heredar los datos del perfil y el acceso a {profileClaimMatch.candidate.postCount} {profileClaimMatch.candidate.postCount === 1 ? 'nota' : 'notas'}.</p>
                    <p>La solicitud no modifica nada hasta ser aprobada.</p>
                    <div className="admin-modal-actions">
                      <button className="btn btn-ghost" disabled={isActionLoading('profile-claim-request')} onClick={() => setProfileClaimConfirmOpen(false)} type="button">Cancelar</button>
                      <button className="btn btn-primary" disabled={isActionLoading('profile-claim-request')} onClick={requestProfileClaim} type="button">
                        {isActionLoading('profile-claim-request') ? 'Enviando solicitud...' : 'Solicitar vinculacion'}
                        <ActionSpinner active={isActionLoading('profile-claim-request')} />
                      </button>
                    </div>
                  </div>
                </div>
              )}
              {adminProfileClaimDialog && (
                <div className="admin-modal-backdrop" onMouseDown={() => !isActionLoading('profile-claim-approve') && !isActionLoading('profile-claim-block') && !isActionLoading('profile-claim-release') && setAdminProfileClaimDialog(null)} role="presentation">
                  <div aria-labelledby="admin-profile-claim-title" aria-modal="true" className="admin-modal admin-profile-claim-modal" onMouseDown={(event) => event.stopPropagation()} role="dialog">
                    <span className="eyebrow">Solicitud de vinculacion</span>
                    <h3 id="admin-profile-claim-title">{adminProfileClaimDialog.claim.fullName}</h3>
                    <dl className="admin-claim-details">
                      <div><dt>Cuenta solicitante</dt><dd>{adminProfileClaimDialog.claim.requesterEmail}</dd></div>
                      <div><dt>Estado</dt><dd>{PROFILE_CLAIM_STATUS_LABELS[adminProfileClaimDialog.claim.status] || adminProfileClaimDialog.claim.status}</dd></div>
                      <div><dt>Transferencia</dt><dd>{adminProfileClaimDialog.claim.affectedPostCount} {adminProfileClaimDialog.claim.affectedPostCount === 1 ? 'nota' : 'notas'}</dd></div>
                      <div><dt>Solicitud</dt><dd>{formatAdminDate(adminProfileClaimDialog.claim.requestedAt)}</dd></div>
                    </dl>
                    {adminProfileClaimDialog.claim.blockReason && <p className="admin-profile-warning"><strong>Motivo del bloqueo</strong><span>{adminProfileClaimDialog.claim.blockReason}</span></p>}
                    {adminProfileClaimDialog.action === 'approve' && (
                      <div className="admin-profile-notice">Al aprobar, se copiara el perfil gestionado, se concedera el rol blog y se transferira la propiedad de las notas sin cambiar comentarios historicos.</div>
                    )}
                    {adminProfileClaimDialog.action === 'block' && (
                      <label className="admin-claim-reason">
                        Motivo opcional
                        <textarea maxLength="300" onChange={(event) => setAdminProfileClaimReason(event.target.value)} placeholder="Explica por que se bloquea la solicitud." rows="3" value={adminProfileClaimReason} />
                      </label>
                    )}
                    <div className="admin-modal-actions admin-claim-actions">
                      <button className="btn btn-ghost" onClick={() => { setAdminProfileClaimDialog(null); setAdminProfileClaimReason(''); }} type="button">Cerrar</button>
                      {adminProfileClaimDialog.action === 'review' && ['pending', 'processing'].includes(adminProfileClaimDialog.claim.status) && (
                        <>
                          {adminProfileClaimDialog.claim.status === 'pending' && <button className="btn btn-ghost danger" onClick={() => setAdminProfileClaimDialog((current) => ({ ...current, action: 'block' }))} type="button">Bloquear</button>}
                          <button className="btn btn-primary" onClick={() => setAdminProfileClaimDialog((current) => ({ ...current, action: 'approve' }))} type="button">Aprobar vinculacion</button>
                        </>
                      )}
                      {adminProfileClaimDialog.action === 'review' && adminProfileClaimDialog.claim.status === 'blocked' && (
                        <button className="btn btn-primary" onClick={() => setAdminProfileClaimDialog((current) => ({ ...current, action: 'release' }))} type="button">Desbloquear</button>
                      )}
                      {['approve', 'block', 'release'].includes(adminProfileClaimDialog.action) && (
                        <button className={`btn ${adminProfileClaimDialog.action === 'block' ? 'btn-ghost danger' : 'btn-primary'}`} disabled={isActionLoading(`profile-claim-${adminProfileClaimDialog.action}:${adminProfileClaimDialog.claim.id}`)} onClick={runAdminProfileClaimAction} type="button">
                          {isActionLoading(`profile-claim-${adminProfileClaimDialog.action}:${adminProfileClaimDialog.claim.id}`)
                            ? 'Procesando...'
                            : adminProfileClaimDialog.action === 'approve'
                              ? 'Confirmar aprobacion'
                              : adminProfileClaimDialog.action === 'block'
                                ? 'Confirmar bloqueo'
                                : 'Confirmar desbloqueo'}
                          <ActionSpinner active={isActionLoading(`profile-claim-${adminProfileClaimDialog.action}:${adminProfileClaimDialog.claim.id}`)} />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              )}
              {profilePreviewOpen && (
                <div
                  className="admin-preview-modal-backdrop profile-preview-backdrop"
                  onMouseDown={() => setProfilePreviewOpen(false)}
                  role="presentation"
                >
                  <div
                    aria-labelledby="profile-preview-title"
                    aria-modal="true"
                    className="admin-preview-modal profile-preview-modal"
                    onMouseDown={(event) => event.stopPropagation()}
                    role="dialog"
                  >
                    <div className="admin-preview-modal-bar">
                      <div>
                        <span>Vista previa</span>
                        <p id="profile-preview-title">Asi se presenta tu perfil en las distintas partes del blog.</p>
                      </div>
                      <button className="btn btn-ghost" onClick={() => setProfilePreviewOpen(false)} type="button">
                        Cerrar
                      </button>
                    </div>

                    <div className="profile-preview-content">
                      <header className="profile-preview-intro">
                        <span>Perfil publico</span>
                        <h2>Tu voz, dentro del universo editorial de Politeia.</h2>
                        <p>Esta simulacion usa los datos que estas editando. Los otros perfiles y notas son ejemplos para mostrar el contexto final.</p>
                      </header>

                      <section className="profile-preview-section" aria-labelledby="profile-preview-card-title">
                        <div className="profile-preview-section-head">
                          <div>
                            <span>Directorio de autores</span>
                            <h3 id="profile-preview-card-title">Tu card junto a otros autores</h3>
                          </div>
                          <small>Tu perfil aparece destacado en esta vista previa.</small>
                        </div>
                        <div className="authors-grid profile-preview-authors-grid">
                          <AuthorCard author={profilePreviewAuthor} featured preview />
                          {PROFILE_PREVIEW_AUTHORS.map((author) => (
                            <AuthorCard author={author} key={author.fullName} preview />
                          ))}
                        </div>
                      </section>

                      <section className="profile-preview-section" aria-labelledby="profile-preview-ending-title">
                        <div className="profile-preview-section-head">
                          <div>
                            <span>Cierre de nota</span>
                            <h3 id="profile-preview-ending-title">Tu firma al terminar un articulo</h3>
                          </div>
                          <small>La frase solo aparece cuando existe en el perfil o fue escrita manualmente en la nota.</small>
                        </div>
                        <article className="profile-preview-article-tail">
                          <h4>Una democracia que tambien se construye en lo cotidiano</h4>
                          <p>
                            Comprender lo publico exige mirar mas alla de las instituciones y reconocer las decisiones, conversaciones y acuerdos que sostienen la vida en comun.
                          </p>
                          <p>
                            Esa tarea no termina con una respuesta definitiva: abre nuevas preguntas y nos invita a participar con informacion, criterio y responsabilidad.
                          </p>
                          <AuthorEnd
                            fullName={profilePreviewAuthor.fullName}
                            photoUrl={profilePreviewAuthor.photoUrl}
                            closingPhrase={profilePreviewAuthor.closingPhrase}
                            preview
                          />
                        </article>
                      </section>

                      <section className="profile-preview-section" aria-labelledby="profile-preview-page-title">
                        <div className="profile-preview-section-head">
                          <div>
                            <span>Blog por autor</span>
                            <h3 id="profile-preview-page-title">Tu pagina de notas filtradas</h3>
                          </div>
                          <small>Es la vista que abre el lector al elegir tu nombre.</small>
                        </div>
                        <div className="profile-preview-author-page">
                          <BlogIndex
                            posts={profilePreviewBlogPosts}
                            autorFiltro={profilePreviewAuthor.fullName}
                            authorProfile={profilePreviewAuthor}
                            preview
                          />
                        </div>
                      </section>
                    </div>
                  </div>
                </div>
              )}
              {previewOpen && (
                <div className="admin-preview-modal-backdrop" role="presentation">
                  <div aria-modal="true" className="admin-preview-modal" role="dialog">
                    <div className="admin-preview-modal-bar">
                      <div>
                        <span>Previsualizacion</span>
                        <p>Simulacion de pagina publica.</p>
                      </div>
                      <button className="btn btn-ghost" onClick={() => setPreviewOpen(false)} type="button">
                        Cerrar
                      </button>
                    </div>
                    <AdminArticlePreview
                      form={form}
                      previewAuthorNote={previewAuthorNote}
                      previewAuthorPhoto={previewAuthorPhoto}
                      previewDate={previewDate}
                      previewHtml={previewHtml}
                      previewTags={previewTags}
                      onCoverError={failCoverImageLoad}
                      onCoverLoad={() => setCoverImageError('')}
                    />
                  </div>
                </div>
              )}
              {profileConsentOpen && (
                <div
                  className="admin-modal-backdrop"
                  onMouseDown={() => !savingProfile && setProfileConsentOpen(false)}
                  role="presentation"
                >
                  <div
                    aria-labelledby="profile-consent-title"
                    aria-modal="true"
                    className="admin-modal"
                    onMouseDown={(event) => event.stopPropagation()}
                    role="dialog"
                  >
                    <h3 id="profile-consent-title">Publicar perfil de autor</h3>
                    <p>
                      Al aceptar, tu nombre, foto, descripcion breve, texto "Sobre mi" y frase de cierre podran ser accesibles publicamente en el blog. Tu email no se publica.
                    </p>
                    <p>
                      Podes retirar este consentimiento cuando quieras desmarcando "Publicar mi perfil de autor" y guardando nuevamente.
                    </p>
                    <div className="admin-modal-actions">
                      <button className="btn btn-ghost" disabled={savingProfile || isActionLoading('profile-save')} onClick={() => setProfileConsentOpen(false)} type="button">
                        Cancelar
                      </button>
                      <button className="btn btn-primary" disabled={savingProfile || isActionLoading('profile-save')} onClick={saveUserProfile} type="button">
                        {isActionLoading('profile-save') ? 'Guardando perfil...' : 'Aceptar y guardar'}
                        <ActionSpinner active={isActionLoading('profile-save')} />
                      </button>
                    </div>
                  </div>
                </div>
              )}
              {categoryDeleteTarget && (
                <div className="admin-modal-backdrop" role="presentation">
                  <div aria-modal="true" className="admin-modal" role="dialog">
                    <h3>Eliminar categoría</h3>
                    <p>
                      Vas a quitar "{categoryDeleteTarget.name}" de la lista compartida. Los posts que ya la usan no se modifican.
                    </p>
                    <div className="admin-modal-actions">
                      <button className="btn btn-ghost" onClick={() => setCategoryDeleteTarget(null)} type="button">
                        Cancelar
                      </button>
                      <button className="btn btn-primary" disabled={busy || isActionLoading(`category-delete:${categoryDeleteTarget.id}`)} onClick={() => deleteCategory(categoryDeleteTarget)} type="button">
                        {isActionLoading(`category-delete:${categoryDeleteTarget.id}`) ? 'Eliminando...' : 'Eliminar categoría'}
                        <ActionSpinner active={isActionLoading(`category-delete:${categoryDeleteTarget.id}`)} />
                      </button>
                    </div>
                  </div>
                </div>
              )}
              {adminProfileDeleteTarget && (
                <div className="admin-modal-backdrop" role="presentation">
                  <div aria-modal="true" className="admin-modal" role="dialog">
                    <h3>Eliminar perfil de autor</h3>
                    <p>
                      Vas a eliminar el perfil gestionado de "{adminProfileDeleteTarget.fullName || 'este autor'}". Esta accion no borra posts ni cambia sus autores.
                    </p>
                    <div className="admin-modal-actions">
                      <button className="btn btn-ghost" onClick={() => setAdminProfileDeleteTarget(null)} type="button">
                        Cancelar
                      </button>
                      <button
                        className="btn btn-primary"
                        disabled={isActionLoading(`admin-profile-delete:${adminProfileDeleteTarget.id}`)}
                        onClick={() => deleteAdminAuthorProfile(adminProfileDeleteTarget)}
                        type="button"
                      >
                        {isActionLoading(`admin-profile-delete:${adminProfileDeleteTarget.id}`) ? 'Eliminando...' : 'Eliminar perfil'}
                        <ActionSpinner active={isActionLoading(`admin-profile-delete:${adminProfileDeleteTarget.id}`)} />
                      </button>
                    </div>
                  </div>
                </div>
              )}
              {editRequestConfirmOpen && (
                <div className="admin-modal-backdrop" role="presentation">
                  <div aria-modal="true" className="admin-modal" role="dialog">
                    <h3>Solicitar edicion</h3>
                    <p>
                      Vas a pedir que este post publicado se habilite como nueva versión editable. El articulo seguira publicado hasta que revision apruebe y vuelva a publicar los cambios.
                    </p>
                    <div className="admin-modal-actions">
                      <button
                        className="btn btn-ghost"
                        disabled={busy || isActionLoading(`workflow:request-edit:${form.id}`)}
                        onClick={() => setEditRequestConfirmOpen(false)}
                        type="button"
                      >
                        Cancelar
                      </button>
                      <button
                        className="btn btn-primary"
                        disabled={busy || isActionLoading(`workflow:request-edit:${form.id}`)}
                        onClick={confirmEditRequest}
                        type="button"
                      >
                        {isActionLoading(`workflow:request-edit:${form.id}`) ? 'Enviando solicitud...' : 'Confirmar solicitud'}
                        <ActionSpinner active={isActionLoading(`workflow:request-edit:${form.id}`)} />
                      </button>
                    </div>
                  </div>
                </div>
              )}
              {pendingAction && (
                <div className="admin-modal-backdrop" role="presentation">
                  <div
                    aria-labelledby="pending-action-title"
                    aria-modal="true"
                    className={`admin-modal ${pendingAction.requiresArticlePreview ? 'admin-submit-review-preview-modal' : ''}`}
                    role="dialog"
                  >
                    {pendingAction.requiresArticlePreview ? (
                      <>
                        <div className="admin-preview-modal-bar admin-submit-review-preview-head">
                          <div>
                            <span>Revision editorial</span>
                            <p id="pending-action-title">Revisa la nota completa antes de enviarla.</p>
                          </div>
                        </div>
                        <div className="admin-submit-review-preview-body">
                          <AdminArticlePreview
                            form={form}
                            previewAuthorNote={previewAuthorNote}
                            previewAuthorPhoto={previewAuthorPhoto}
                            previewDate={previewDate}
                            previewHtml={previewHtml}
                            previewTags={previewTags}
                            onCoverError={failCoverImageLoad}
                            onCoverLoad={() => setCoverImageError('')}
                          />
                        </div>
                      </>
                    ) : (
                      <>
                        <h3 id="pending-action-title">Cambios sin guardar</h3>
                        <p>
                          Tenes cambios sin guardar. Podes cancelar, {pendingAction.label} sin guardar esos cambios, o guardar primero y despues {pendingAction.label}.
                        </p>
                      </>
                    )}
                    <div className={pendingAction.requiresArticlePreview ? 'admin-submit-review-preview-footer' : ''}>
                      {pendingAction.requiresArticlePreview && (
                        <div>
                          <strong>Confirmar envio a revision</strong>
                          <p>
                            {pendingAction.hasUnsavedChanges
                              ? 'Hay cambios sin guardar. Elegi si queres enviarlos o conservar la ultima version guardada.'
                              : 'La nota quedara disponible para el equipo de revision.'}
                          </p>
                        </div>
                      )}
                      <div className="admin-modal-actions">
                        <button className="btn btn-ghost" disabled={busy} onClick={() => setPendingAction(null)} type="button">
                          Cancelar
                        </button>
                        {pendingAction.hasUnsavedChanges ? (
                          <>
                            <button className="btn btn-ghost" disabled={busy || isActionLoading(pendingAction.loadingKey)} onClick={confirmPendingAction} type="button">
                              {actionButtonLabel(pendingAction.label)} sin guardar
                              <ActionSpinner active={isActionLoading(pendingAction.loadingKey)} />
                            </button>
                            <button className="btn btn-primary" disabled={busy || isActionLoading('post-save') || isActionLoading(pendingAction.loadingKey)} onClick={saveAndConfirmPendingAction} type="button">
                              Guardar y {pendingAction.label}
                              <ActionSpinner active={isActionLoading('post-save') || isActionLoading(pendingAction.loadingKey)} />
                            </button>
                          </>
                        ) : (
                          <button className="btn btn-primary" disabled={busy || isActionLoading(pendingAction.loadingKey)} onClick={confirmPendingAction} type="button">
                            {isActionLoading(pendingAction.loadingKey) ? 'Enviando...' : 'Confirmar envio'}
                            <ActionSpinner active={isActionLoading(pendingAction.loadingKey)} />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )}
              {reviewCommentDialog && (
                <div className="admin-modal-backdrop" role="presentation">
                  <div aria-modal="true" className="admin-modal rich-comment-modal admin-comment-thread-modal" role="dialog">
                    <div className="admin-comment-thread-head">
                      <div>
                        <span>Comentario de revision</span>
                        <h3>{reviewCommentDialog.comment.status === 'resolved' ? 'Comentario resuelto' : 'Comentario abierto'}</h3>
                      </div>
                      <span className={`admin-status status-${reviewCommentDialog.comment.status === 'resolved' ? 'published' : 'review'}`}>
                        {reviewCommentDialog.comment.status === 'resolved' ? 'Resuelto' : 'Abierto'}
                      </span>
                    </div>
                    {(reviewCommentDialog.comment.selectedTextCurrent || reviewCommentDialog.comment.selectedText) && (
                      <q>{reviewCommentDialog.comment.selectedTextCurrent || reviewCommentDialog.comment.selectedText}</q>
                    )}
                    <div className="admin-comment-thread">
                      <article className={isOwnThreadMessage(reviewCommentDialog.comment.authorEmail, user) ? 'own' : 'other'}>
                        <img alt="" className="admin-comment-thread-avatar" onError={handleProfilePhotoError} src={reviewCommentDialog.comment.authorPhotoUrl || DEFAULT_PROFILE_PHOTO} />
                        <div>
                          <strong>{reviewCommentDialog.comment.body}</strong>
                          <small>
                            {reviewCommentDialog.comment.authorName || reviewCommentDialog.comment.authorEmail} - {formatAdminDate(reviewCommentDialog.comment.createdAt)}
                          </small>
                        </div>
                      </article>
                      {reviewCommentDialog.comment.replies.map((reply) => (
                        <article className={`reply ${isOwnThreadMessage(reply.authorEmail, user) ? 'own' : 'other'}`} key={reply.id}>
                          <img alt="" className="admin-comment-thread-avatar" onError={handleProfilePhotoError} src={reply.authorPhotoUrl || DEFAULT_PROFILE_PHOTO} />
                          <div>
                            <strong>{reply.body}</strong>
                            <small>
                              {reply.authorName || reply.authorEmail} - {commentReplyActionLabel(reply.action)} - {formatAdminDate(reply.createdAt)}
                            </small>
                          </div>
                        </article>
                      ))}
                    </div>
                    <label>
                      {reviewCommentDialog.mode === 'resolve'
                        ? 'Texto para acompanar la resolucion'
                        : reviewCommentDialog.mode === 'reopen'
                          ? 'Texto para acompanar la reapertura'
                          : 'Respuesta'}
                      <textarea
                        autoFocus
                        onChange={(event) => setReviewCommentDialog((current) => ({ ...current, replyBody: event.target.value }))}
                        placeholder="Escribi una respuesta breve para dejar contexto."
                        rows="5"
                        value={reviewCommentDialog.replyBody || ''}
                      />
                    </label>
                    <div className="admin-modal-actions">
                      <button className="btn btn-ghost" disabled={busy} onClick={() => setReviewCommentDialog(null)} type="button">
                        Cerrar
                      </button>
                      {reviewCommentDialog.mode === 'reply' && (
                        <button
                          className="btn btn-primary"
                          disabled={busy || isActionLoading(`comment-reply:${reviewCommentDialog.comment.id}`) || !normalizeInlineInput(reviewCommentDialog.replyBody)}
                          onClick={() => replyToReviewComment(reviewCommentDialog.comment.id, reviewCommentDialog.replyBody)}
                          type="button"
                        >
                          {isActionLoading(`comment-reply:${reviewCommentDialog.comment.id}`) ? 'Enviando...' : 'Responder'}
                          <ActionSpinner active={isActionLoading(`comment-reply:${reviewCommentDialog.comment.id}`)} />
                        </button>
                      )}
                      {reviewCommentDialog.mode === 'resolve' && (
                        <button
                          className="btn btn-primary"
                          disabled={busy || isActionLoading(`comment-status:${reviewCommentDialog.comment.id}`)}
                          onClick={() => updateReviewCommentStatus(reviewCommentDialog.comment.id, 'resolved', { replyBody: reviewCommentDialog.replyBody })}
                          type="button"
                        >
                          {isActionLoading(`comment-status:${reviewCommentDialog.comment.id}`) ? 'Resolviendo...' : 'Resolver'}
                          <ActionSpinner active={isActionLoading(`comment-status:${reviewCommentDialog.comment.id}`)} />
                        </button>
                      )}
                      {reviewCommentDialog.mode === 'reopen' && (
                        <button
                          className="btn btn-primary"
                          disabled={busy || isActionLoading(`comment-status:${reviewCommentDialog.comment.id}`)}
                          onClick={() => updateReviewCommentStatus(reviewCommentDialog.comment.id, 'open', { replyBody: reviewCommentDialog.replyBody })}
                          type="button"
                        >
                          {isActionLoading(`comment-status:${reviewCommentDialog.comment.id}`) ? 'Reabriendo...' : 'Reabrir'}
                          <ActionSpinner active={isActionLoading(`comment-status:${reviewCommentDialog.comment.id}`)} />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              )}
              {editingReviewComment && (
                <div className="admin-modal-backdrop" role="presentation">
                  <div aria-modal="true" className="admin-modal rich-comment-modal" role="dialog">
                    <h3>Editar comentario</h3>
                    {editingReviewComment.selectedText && <q>{editingReviewComment.selectedText}</q>}
                    <label>
                      Comentario
                      <textarea
                        autoFocus
                        onChange={(event) => setEditingReviewComment((current) => ({ ...current, body: event.target.value }))}
                        rows="5"
                        value={editingReviewComment.body || ''}
                      />
                    </label>
                    <div className="admin-modal-actions">
                      <button className="btn btn-ghost" disabled={busy} onClick={() => setEditingReviewComment(null)} type="button">
                        Cancelar
                      </button>
                      <button className="btn btn-primary" disabled={busy || isActionLoading(`comment-edit:${editingReviewComment.id}`) || !normalizeInlineInput(editingReviewComment.body)} onClick={saveEditedReviewComment} type="button">
                        {isActionLoading(`comment-edit:${editingReviewComment.id}`) ? 'Guardando...' : 'Guardar comentario'}
                        <ActionSpinner active={isActionLoading(`comment-edit:${editingReviewComment.id}`)} />
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </section>
    </main>
  );

  function updateForm(field, value) {
    setForm((current) => normalizeForm({ ...current, [field]: value }));
  }

  function addTagSuggestion(tag) {
    setForm((current) => {
      const tags = parseTagsText(current.tagsText);
      const nextTag = sanitizeTags([tag])[0];
      if (nextTag && !tags.some((item) => taxonomyKey(item) === taxonomyKey(nextTag))) tags.push(nextTag);
      return normalizeForm({ ...current, tagsText: tags.join(', ') });
    });
  }
}

function AdminArticlePreview({
  form,
  previewAuthorNote,
  previewAuthorPhoto,
  previewDate,
  previewHtml,
  previewTags,
  onCoverError,
  onCoverLoad,
}) {
  return (
    <article className="article admin-article-preview">
      <div className="art-tags" aria-label="Tags">
        {previewTags.slice(0, 4).map((tag) => (
          <span className="art-cat" key={tag}>{tag}</span>
        ))}
      </div>
      <h1>{form.title || 'Titulo del blog'}</h1>
      <div className="art-meta">{form.authorName ? `Por ${form.authorName} - ` : ''}{previewDate}</div>
      {form.coverImage && form.showCoverInPost !== false && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          className="art-hero"
          src={form.coverImage}
          alt={form.title || 'Portada'}
          onError={onCoverError}
          onLoad={onCoverLoad}
        />
      )}
      <div className="art-body" dangerouslySetInnerHTML={{ __html: previewHtml }} />
      {form.showAuthorNote && (
        <AuthorEnd
          fullName={form.authorName}
          photoUrl={previewAuthorPhoto}
          closingPhrase={previewAuthorNote}
          preview
        />
      )}
    </article>
  );
}

function buildPayload(form, canChooseSlug = false) {
  return {
    title: form.title,
    ...(canChooseSlug ? { slug: form.slug || undefined } : {}),
    excerpt: form.excerpt || undefined,
    contentMarkdown: form.contentMarkdown,
    coverImage: form.coverImage || undefined,
    showCoverInPost: form.coverImage ? form.showCoverInPost !== false : true,
    authorName: form.authorName || undefined,
    authorNote: form.showAuthorNote === true ? form.authorNote || '' : '',
    showAuthorNote: form.showAuthorNote === true,
    category: sanitizeCategory(form.category) || undefined,
    tags: parseTagsText(form.tagsText),
  };
}

function imageLoadErrorMessage() {
  return 'No pudimos cargar la imagen. Intenta nuevamente la carga.';
}

function stripReviewCommentMarkup(markdown = '') {
  return markdown.replace(/<span\b[^>]*data-review-comment-id=["'][^"']+["'][^>]*>([\s\S]*?)<\/span>/gi, '$1');
}

function stripReviewCommentMarkupById(markdown = '', commentId = '') {
  const escapedId = escapeRegExp(commentId);
  if (!escapedId) return markdown;
  const pattern = new RegExp(`<span\\b[^>]*data-review-comment-id=["']${escapedId}["'][^>]*>([\\s\\S]*?)<\\/span>`, 'gi');
  return markdown.replace(pattern, '$1');
}

function extractReviewCommentTextById(markdown = '', commentId = '') {
  const escapedId = escapeRegExp(commentId);
  if (!escapedId) return '';
  const pattern = new RegExp(`<span\\b[^>]*data-review-comment-id=["']${escapedId}["'][^>]*>([\\s\\S]*?)<\\/span>`, 'i');
  const match = markdown.match(pattern);
  return normalizeInlineInput(stripHtmlTags(match?.[1] || '')).slice(0, 500);
}

function stripHtmlTags(value = '') {
  return String(value).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
}

function escapeRegExp(value = '') {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function normalizeRoleEmail(email) {
  return typeof email === 'string' ? email.trim().toLowerCase() : '';
}

function isAllowedRoleEmail(email) {
  const cleanEmail = normalizeRoleEmail(email);
  return isPrimaryDomainEmail(cleanEmail) || cleanEmail.endsWith(`@${ASSIGNED_EMAIL_DOMAIN}`);
}

function isPrimaryDomainEmail(email) {
  return typeof email === 'string' && email.toLowerCase().endsWith(`@${ALLOWED_EMAIL_DOMAIN}`);
}

function sameRoleSet(left = [], right = []) {
  const cleanLeft = ASSIGNABLE_ROLES.map((role) => role.value).filter((role) => left.includes(role));
  const cleanRight = ASSIGNABLE_ROLES.map((role) => role.value).filter((role) => right.includes(role));
  return cleanLeft.length === cleanRight.length && cleanLeft.every((role) => cleanRight.includes(role));
}

function upsertAdminUserItem(items, nextItem) {
  if (!nextItem?.email) return items;
  const next = items.map((item) => (item.email === nextItem.email ? nextItem : item));
  if (!items.some((item) => item.email === nextItem.email)) next.unshift(nextItem);
  return next;
}

function normalizeNotificationPreferences(value = {}) {
  return {
    email: value?.email || '',
    enabled: value?.enabled === true,
    events: {
      ...DEFAULT_NOTIFICATION_EVENTS,
      ...(value?.events || {}),
    },
  };
}

function normalizeInAppNotification(value = {}) {
  return {
    id: normalizeInputValue(value.id),
    type: normalizeInputValue(value.type),
    eventKey: normalizeInputValue(value.eventKey),
    subject: normalizeInputValue(value.subject),
    text: normalizeInputValue(value.text),
    actorEmail: normalizeInputValue(value.actorEmail),
    actorName: normalizeInputValue(value.actorName),
    postId: normalizeInputValue(value.postId),
    postTitle: normalizeInputValue(value.postTitle),
    postSlug: normalizeInputValue(value.postSlug),
    commentId: normalizeInputValue(value.commentId),
    commentBody: normalizeInputValue(value.commentBody),
    commentSelectedText: normalizeInputValue(value.commentSelectedText),
    profileClaimId: normalizeInputValue(value.profileClaimId),
    managedProfileId: normalizeInputValue(value.managedProfileId),
    profileName: normalizeInputValue(value.profileName),
    requesterEmail: normalizeInputValue(value.requesterEmail),
    createdAt: value.createdAt || '',
    readAt: value.readAt || '',
  };
}

function normalizeProfileClaimMatch(value = {}) {
  return {
    candidate: value?.candidate ? {
      id: normalizeInputValue(value.candidate.id),
      fullName: normalizeInputValue(value.candidate.fullName),
      postCount: Number(value.candidate.postCount) || 0,
      description: normalizeInputValue(value.candidate.description),
      focusArea: normalizeInputValue(value.candidate.focusArea),
      photoUrl: normalizeInputValue(value.candidate.photoUrl),
    } : null,
    claim: value?.claim ? normalizeProfileClaim(value.claim) : null,
    nameLocked: normalizeBoolean(value?.nameLocked),
  };
}

function normalizeProfileClaim(value = {}) {
  return {
    id: normalizeInputValue(value.id),
    managedProfileId: normalizeInputValue(value.managedProfileId),
    requesterEmail: normalizeInputValue(value.requesterEmail),
    requesterName: normalizeInputValue(value.requesterName),
    fullName: normalizeInputValue(value.fullName),
    status: normalizeInputValue(value.status),
    affectedPostCount: Number(value.affectedPostCount ?? value.transferredPostCount) || 0,
    transferredPostCount: Number(value.transferredPostCount) || 0,
    blockReason: normalizeInputValue(value.blockReason),
    requestedAt: value.requestedAt || '',
    updatedAt: value.updatedAt || '',
    approvedAt: value.approvedAt || '',
    reviewedAt: value.reviewedAt || '',
    reviewedBy: normalizeInputValue(value.reviewedBy),
  };
}

function normalizeNotificationPolicy(value = {}) {
  const recentDays = Number(value.recentDays);
  const retentionDays = Number(value.retentionDays);
  return {
    recentDays: Number.isFinite(recentDays) && recentDays > 0 ? recentDays : DEFAULT_NOTIFICATION_POLICY.recentDays,
    retentionDays: Number.isFinite(retentionDays) && retentionDays > 0 ? retentionDays : DEFAULT_NOTIFICATION_POLICY.retentionDays,
  };
}

function partitionNotifications(notifications = [], recentDays = DEFAULT_NOTIFICATION_POLICY.recentDays) {
  const cutoff = Date.now() - recentDays * 24 * 60 * 60 * 1000;
  return notifications.reduce((buckets, notification) => {
    const createdAt = parseNotificationDate(notification.createdAt)?.getTime() || 0;
    const isPrevious = Boolean(notification.readAt && createdAt && createdAt < cutoff);
    buckets[isPrevious ? 'previous' : 'visible'].push(notification);
    return buckets;
  }, { visible: [], previous: [] });
}

function normalizeReviewComment(value = {}) {
  return {
    ...value,
    id: normalizeInputValue(value.id),
    body: normalizeInputValue(value.body),
    selectedText: normalizeInputValue(value.selectedText),
    selectedTextCurrent: normalizeInputValue(value.selectedTextCurrent || value.selectedText),
    status: normalizeInputValue(value.status || 'open'),
    authorEmail: normalizeInputValue(value.authorEmail),
    authorName: normalizeInputValue(value.authorName),
    authorPhotoUrl: normalizeInputValue(value.authorPhotoUrl),
    createdAt: value.createdAt || '',
    replies: Array.isArray(value.replies)
      ? value.replies.map(normalizeReviewCommentReply).filter((reply) => reply.body)
      : [],
  };
}

function normalizeReviewCommentReply(value = {}) {
  return {
    id: normalizeInputValue(value.id),
    body: normalizeInputValue(value.body),
    action: normalizeInputValue(value.action || 'reply'),
    selectedText: normalizeInputValue(value.selectedText),
    authorEmail: normalizeInputValue(value.authorEmail),
    authorName: normalizeInputValue(value.authorName),
    authorPhotoUrl: normalizeInputValue(value.authorPhotoUrl),
    createdAt: value.createdAt || '',
  };
}

function handleProfilePhotoError(event) {
  if (!event.currentTarget.src.endsWith(DEFAULT_PROFILE_PHOTO)) {
    event.currentTarget.src = DEFAULT_PROFILE_PHOTO;
  }
}

function isOwnThreadMessage(authorEmail = '', user = null) {
  return normalizeEmailKey(authorEmail) && normalizeEmailKey(authorEmail) === normalizeEmailKey(user?.email);
}

function normalizeEmailKey(value = '') {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

function groupNotificationsByDay(notifications = []) {
  const groups = [];
  const todayKey = dayKey(new Date());
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayKey = dayKey(yesterday);

  for (const notification of notifications) {
    const date = parseNotificationDate(notification.createdAt);
    const key = date ? dayKey(date) : 'sin-fecha';
    let group = groups.find((item) => item.key === key);
    if (!group) {
      group = {
        key,
        label: key === todayKey ? 'Hoy' : key === yesterdayKey ? 'Ayer' : date ? formatNotificationDay(date) : 'Sin fecha',
        items: [],
      };
      groups.push(group);
    }
    group.items.push(notification);
  }

  return groups;
}

function parseNotificationDate(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function dayKey(date) {
  return new Intl.DateTimeFormat('en-CA', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

function formatNotificationDay(date) {
  return new Intl.DateTimeFormat('es-AR', {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  }).format(date);
}

function commentReplyActionLabel(action = '') {
  if (action === 'resolved') return 'resolvio';
  if (action === 'open') return 'reabrio';
  return 'respondio';
}

function notificationTitle(notification = {}) {
  if (notification.type === 'post.submittedReview') return `Post enviado a revision: ${notification.postTitle || 'Sin titulo'}`;
  if (notification.type === 'comment.created') return `Nuevo comentario: ${notification.postTitle || 'Sin titulo'}`;
  if (notification.type === 'comment.reply') return `Nueva respuesta: ${notification.postTitle || 'Sin titulo'}`;
  if (notification.type === 'comment.resolved') return `Comentario resuelto: ${notification.postTitle || 'Sin titulo'}`;
  if (notification.type === 'comment.reopened') return `Comentario reabierto: ${notification.postTitle || 'Sin titulo'}`;
  if (notification.type === 'post.published') return `Post publicado: ${notification.postTitle || 'Sin titulo'}`;
  if (notification.type === 'post.editRequested') return `Solicitud de edición: ${notification.postTitle || 'Sin titulo'}`;
  if (notification.type === 'post.editEnabled') return `Edición habilitada: ${notification.postTitle || 'Sin titulo'}`;
  if (notification.type === 'user.roles.changed') return 'Tus permisos fueron actualizados';
  if (notification.type === 'profile.claim.requested') return `Nueva vinculacion solicitada: ${notification.profileName || 'Perfil de autor'}`;
  if (notification.type === 'profile.claim.approved') return `Perfil vinculado: ${notification.profileName || 'Perfil de autor'}`;
  if (notification.type === 'profile.claim.blocked') return `Vinculacion bloqueada: ${notification.profileName || 'Perfil de autor'}`;
  if (notification.type === 'profile.claim.released') return `Vinculacion desbloqueada: ${notification.profileName || 'Perfil de autor'}`;
  if (notification.type === 'profile.claim.superseded') return `Perfil no disponible: ${notification.profileName || 'Perfil de autor'}`;
  return notification.subject || 'Actividad editorial';
}

function notificationIcon(type = '') {
  if (type.startsWith('comment.')) return 'mode_comment';
  if (type === 'post.published') return 'task_alt';
  if (type === 'post.editRequested') return 'pending_actions';
  if (type === 'post.editEnabled') return 'edit_note';
  if (type === 'post.submittedReview') return 'rate_review';
  if (type === 'user.roles.changed') return 'manage_accounts';
  if (type.startsWith('profile.claim.')) return 'person_search';
  return 'notifications';
}

function notificationToneClass(notification = {}) {
  return ['post.submittedReview', 'post.editRequested', 'post.editEnabled', 'profile.claim.requested', 'profile.claim.blocked'].includes(notification.type)
    ? 'attention'
    : '';
}

function profileClaimStatusClass(status = '') {
  if (status === 'approved') return 'published';
  if (status === 'blocked' || status === 'superseded') return 'archived';
  return 'draft';
}

function normalizeInlineInput(value = '') {
  return typeof value === 'string' ? value.trim() : '';
}

function actionButtonLabel(label = '') {
  const normalized = label.trim().toLowerCase();
  const labels = {
    archivar: 'Archivar',
    publicar: 'Publicar',
    'enviar a revision': 'Enviar a revision',
    'enviar a revisión': 'Enviar a revision',
  };
  return labels[normalized] || `${normalized.charAt(0).toUpperCase()}${normalized.slice(1)}`;
}

function workflowActionKey(path = '') {
  const cleanPath = String(path || '');
  const postActionMatch = cleanPath.match(/\/v1\/posts\/([^/]+)\/([^/]+)/);
  const postId = postActionMatch?.[1];
  const postAction = postActionMatch?.[2];
  if (postAction === 'submit-review') return postId ? `workflow:submit-review:${postId}` : 'workflow:submit-review';
  if (postAction === 'request-edit') return postId ? `workflow:request-edit:${postId}` : 'workflow:request-edit';
  if (postAction === 'enable-edit') return postId ? `workflow:enable-edit:${postId}` : 'workflow:enable-edit';
  if (postAction === 'publish') return postId ? `workflow:publish:${postId}` : 'workflow:publish';
  if (postAction === 'archive') return postId ? `workflow:archive:${postId}` : 'workflow:archive';
  if (cleanPath.includes('/submit-review')) return 'workflow:submit-review';
  if (cleanPath.includes('/request-edit')) return 'workflow:request-edit';
  if (cleanPath.includes('/enable-edit')) return 'workflow:enable-edit';
  if (cleanPath.includes('/publish')) return 'workflow:publish';
  if (cleanPath.includes('/archive')) return 'workflow:archive';
  return `workflow:${cleanPath}`;
}

function adminMessageKind(message = '') {
  return /error|no se pudo|no pudimos|falta|missing|solo|usa un email|elegi|sin permisos|invalid|denied|rechaz|failed|credenciales/i.test(message)
    ? 'error'
    : 'success';
}

function visibleStatusValue(post, canUseReviewFilters) {
  const status = post?.status || '';
  if (canUseReviewFilters) return status;
  if (status === 'archived') return 'published';
  if (status === 'published-edition') return post?.editionSubmittedAt ? 'review' : 'published-edition';
  if (status === 'review' || status === 'published') return status;
  return '';
}

function visibleStatusLabel(post, canUseReviewFilters) {
  const status = visibleStatusValue(post, canUseReviewFilters);
  return status ? STATUS_LABELS[status] || status : '';
}

function normalizeInputValue(value) {
  if (value === null || value === undefined) return '';
  return typeof value === 'string' ? value : String(value);
}

function normalizeForm(value = {}) {
  const next = { ...EMPTY_FORM, ...value };
  FORM_STRING_FIELDS.forEach((field) => {
    next[field] = normalizeInputValue(next[field]);
  });
  next.showCoverInPost = next.showCoverInPost !== false;
  next.showAuthorNote = next.showAuthorNote === true;
  return next;
}

function normalizeProfile(value = {}) {
  const firstName = normalizeInputValue(value.firstName).trimStart();
  const lastName = normalizeInputValue(value.lastName).trimStart();
  const fullName = [firstName.trim(), lastName.trim()].filter(Boolean).join(' ');
  return {
    firstName,
    lastName,
    description: normalizeInputValue(value.description),
    focusArea: normalizeInputValue(value.focusArea),
    closingPhrase: normalizeInputValue(value.closingPhrase),
    photoUrl: normalizeInputValue(value.photoUrl),
    publicProfileEnabled: normalizeBoolean(value.publicProfileEnabled),
    canSharePublicProfile: normalizeBoolean(value.canSharePublicProfile),
    authorSlug: normalizeInputValue(value.authorSlug),
    fullName,
    createdAt: normalizeInputValue(value.createdAt),
    updatedAt: normalizeInputValue(value.updatedAt),
  };
}

function normalizeAdminProfile(value = {}) {
  const profile = normalizeProfile(value);
  return {
    ...profile,
    id: normalizeInputValue(value.id),
    email: normalizeInputValue(value.email),
    managedAuthor: normalizeBoolean(value.managedAuthor),
  };
}

function profileNeedsSetup(profile = {}) {
  const nextProfile = normalizeProfile(profile);
  return !nextProfile.updatedAt || !nextProfile.fullName;
}

function normalizeBoolean(value) {
  return value === true || value === 'true' || value === 1 || value === '1';
}

function postToForm(post = {}) {
  return normalizeForm({
    id: post.id,
    title: post.title,
    slug: post.slug,
    excerpt: post.excerpt,
    contentMarkdown: post.contentMarkdown,
    coverImage: post.coverImage,
    authorName: post.authorName,
    authorNote: post.authorNote,
    showAuthorNote: post.showAuthorNote === true,
    category: sanitizeCategory(post.category),
    tagsText: sanitizeTags(post.tags || []).join(', '),
    status: post.status,
    editRequestedAt: post.editRequestedAt,
    editRequestedBy: post.editRequestedBy,
    showCoverInPost: post.showCoverInPost !== false,
  });
}

function serializeForm(form) {
  return JSON.stringify({
    id: form.id || '',
    title: form.title || '',
    slug: form.slug || '',
    excerpt: form.excerpt || '',
    contentMarkdown: form.contentMarkdown || '',
    coverImage: form.coverImage || '',
    authorName: form.authorName || '',
    authorNote: form.authorNote || '',
    showAuthorNote: form.showAuthorNote === true,
    category: form.category || '',
    tagsText: form.tagsText || '',
    status: form.status || '',
    editRequestedAt: form.editRequestedAt || '',
    editRequestedBy: form.editRequestedBy || '',
    showCoverInPost: form.showCoverInPost !== false,
  });
}

function formatAdminDate(value) {
  if (!value) return 'Sin fecha';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Sin fecha';
  return new Intl.DateTimeFormat('es-AR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(date);
}

function isAllowedEmail(email) {
  const cleanEmail = typeof email === 'string' ? email.toLowerCase() : '';
  return isPrimaryDomainEmail(cleanEmail) || cleanEmail.endsWith(`@${ASSIGNED_EMAIL_DOMAIN}`);
}

function isLocalHostname(hostname) {
  return ['localhost', '127.0.0.1', 'admin.localhost'].includes(hostname);
}

function isLocalApiUrl(url) {
  try {
    return isLocalHostname(new URL(url).hostname);
  } catch (_err) {
    return false;
  }
}

function authErrorMessage(err) {
  const message = err?.message || '';
  const networkError = /networkerror|failed to fetch|load failed/i.test(message);

  if (networkError && isLocalApiUrl(API_BASE)) {
    return `El backend local no responde en ${API_BASE}. Levantalo con npm.cmd run blog-api:dev y despues volve a tocar "Usar sesion local".`;
  }

  if (networkError) {
    return `No se pudo conectar con ${API_BASE}. Si estas en admin.localhost, usa backend local o habilita ese origen en CORS.`;
  }

  return message || 'No pudimos validar tu perfil';
}
