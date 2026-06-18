"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.closeChat = exports.listPendingChats = exports.fetchChatMessages = exports.sendChatMessage = exports.createAnonymousChat = exports.scanPostTrigger = void 0;
exports.findKeywordMatches = findKeywordMatches;
exports.processPost = processPost;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const https = __importStar(require("https"));
const admin = __importStar(require("firebase-admin"));
const functions = __importStar(require("firebase-functions"));
const crypto = __importStar(require("crypto"));
// Use require for JSON and optional modules to keep compile-time simple
const KEYWORDS = require('../keywords.json');
let sgMail = null;
try {
    sgMail = require('@sendgrid/mail');
}
catch (e) {
    sgMail = null;
}
// Allow disabling Firestore writes in CI/local dry-run environments
const USE_FIRESTORE = process.env.USE_FIRESTORE === 'true';
// Support both process.env and firebase functions.config() settings
const FC = (functions && typeof functions.config === 'function') ? functions.config() : null;
const SENDGRID_API_KEY = process.env.SENDGRID_API_KEY || (FC && FC.sendgrid && FC.sendgrid.key) || null;
const EMAILJS_SERVICE_ID = process.env.EMAILJS_SERVICE_ID || (FC && FC.emailjs && FC.emailjs.service) || null;
const EMAILJS_TEMPLATE_ID = process.env.EMAILJS_TEMPLATE_ID || (FC && FC.emailjs && FC.emailjs.template) || null;
const EMAILJS_USER_ID = process.env.EMAILJS_USER_ID || (FC && FC.emailjs && FC.emailjs.user) || null;
const PSYCH_EMAIL = process.env.PSYCHOMETRICIAN_EMAIL || (FC && FC.psych && FC.psych.email) || 'psychometrician@ustp.edu.ph';
const FROM_EMAIL = process.env.FROM_EMAIL || (FC && FC.from && FC.from.email) || 'noreply@safespace.local';
if (sgMail && SENDGRID_API_KEY) {
    sgMail.setApiKey(SENDGRID_API_KEY);
}
// Initialize Firestore only when explicitly enabled. This prevents CI/test runs
// from attempting to access GCP credentials or a production project.
let firestore = null;
if (USE_FIRESTORE) {
    if (!admin.apps.length) {
        try {
            admin.initializeApp();
        }
        catch (e) {
            console.warn('admin init failed', e);
        }
    }
    try {
        firestore = admin.firestore ? admin.firestore() : null;
    }
    catch (e) {
        console.warn('admin.firestore() failed', e);
        firestore = null;
    }
}
else {
    firestore = null;
}
function normalizeText(s) {
    if (!s)
        return '';
    return String(s).toLowerCase().normalize('NFKC').replace(/[^a-z0-9\s']/g, ' ').replace(/\s+/g, ' ').trim();
}
function findKeywordMatches(text) {
    const out = [];
    const norm = normalizeText(text);
    if (!norm)
        return out;
    for (const lang of Object.keys(KEYWORDS)) {
        const cats = KEYWORDS[lang] || {};
        for (const cat of Object.keys(cats)) {
            const arr = cats[cat] || [];
            for (const phrase of arr) {
                const pnorm = normalizeText(phrase);
                if (!pnorm)
                    continue;
                if (norm.indexOf(pnorm) !== -1) {
                    out.push({ lang, category: cat, phrase });
                }
            }
        }
    }
    return out;
}
async function writeCrisisAlert(alert) {
    if (firestore) {
        const ref = await firestore.collection('crisis_alerts').add(alert);
        return { method: 'firestore', id: ref.id };
    }
    const file = path.join(__dirname, '..', 'crisis_alerts_local.json');
    let arr = [];
    try {
        arr = JSON.parse(fs.readFileSync(file, 'utf8'));
    }
    catch (e) {
        arr = [];
    }
    arr.push(alert);
    fs.writeFileSync(file, JSON.stringify(arr, null, 2), 'utf8');
    return { method: 'file', path: file };
}
async function sendEmailNotification(alert) {
    // Try SendGrid first
    if (sgMail && SENDGRID_API_KEY) {
        const msg = {
            to: PSYCH_EMAIL,
            from: FROM_EMAIL,
            subject: `[Safe Space] Crisis alert — severity ${alert.severity}`,
            text: `Crisis alert for post ${alert.post_id || '[unknown]'}\nSeverity: ${alert.severity}\nMatches:\n${alert.matched.map((m) => `${m.lang}/${m.category}: ${m.phrase}`).join('\n')}\n\nPost excerpt:\n${alert.post && alert.post.content}\n`
        };
        try {
            await sgMail.send(msg);
            return { sent: true, via: 'sendgrid' };
        }
        catch (e) {
            console.warn('SendGrid send failed:', e.message || e);
            // fallthrough to try EmailJS if configured
        }
    }
    // EmailJS fallback (server-side REST API)
    if (EMAILJS_SERVICE_ID && EMAILJS_TEMPLATE_ID && EMAILJS_USER_ID) {
        const postData = JSON.stringify({
            service_id: EMAILJS_SERVICE_ID,
            template_id: EMAILJS_TEMPLATE_ID,
            user_id: EMAILJS_USER_ID,
            template_params: {
                subject: `[Safe Space] Crisis alert — severity ${alert.severity}`,
                to_email: PSYCH_EMAIL,
                post_id: alert.post_id || '',
                severity: alert.severity,
                matches: alert.matched.map((m) => `${m.lang}/${m.category}: ${m.phrase}`).join('\n'),
                content: alert.post && alert.post.content ? alert.post.content : '',
                pseudonym: alert.post && alert.post.pseudonym ? alert.post.pseudonym : '',
                emotion_tag: alert.post && alert.post.emotion_tag ? alert.post.emotion_tag : '',
                energy_score: alert.post && alert.post.energy_score ? String(alert.post.energy_score) : ''
            }
        });
        const options = {
            hostname: 'api.emailjs.com',
            port: 443,
            path: '/api/v1.0/email/send',
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(postData)
            }
        };
        try {
            const result = await new Promise((resolve) => {
                const req = https.request(options, (res) => {
                    let data = '';
                    res.on('data', (chunk) => { data += chunk; });
                    res.on('end', () => {
                        if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
                            resolve({ sent: true, via: 'emailjs', statusCode: res.statusCode, body: data });
                        }
                        else {
                            resolve({ sent: false, via: 'emailjs', statusCode: res.statusCode, body: data });
                        }
                    });
                });
                req.on('error', (e) => { console.warn('EmailJS request error', e); resolve({ sent: false, error: String(e) }); });
                req.write(postData);
                req.end();
            });
            return result;
        }
        catch (e) {
            console.warn('EmailJS send failed', e);
        }
    }
    // dry-run
    console.log('DRY-RUN: would email alert to', PSYCH_EMAIL, 'alert=', JSON.stringify(alert, null, 2));
    return { sent: false, dryRun: true };
}
async function processPost(post) {
    const content = (post && post.content) || '';
    const matches = findKeywordMatches(content);
    if (!matches.length) {
        return { triggered: false, matches: [] };
    }
    let severity = 'medium';
    if (matches.some(m => m.category === 'explicit' || m.category === 'selfharm'))
        severity = 'high';
    const alert = {
        post_id: post.post_id || null,
        timestamp: new Date().toISOString(),
        severity,
        matched: matches,
        post: {
            pseudonym: post.pseudonym || null,
            emotion_tag: post.emotion_tag || null,
            energy_score: post.energy_score || null,
            content: (content && content.length > 1000) ? content.slice(0, 1000) + '…' : content
        },
        source: 'functions-scan'
    };
    const writeResult = await writeCrisisAlert(alert);
    const emailResult = await sendEmailNotification(alert);
    return { triggered: true, writeResult, emailResult, alert };
}
exports.scanPostTrigger = functions.firestore.document('posts/{id}').onCreate(async (snap, ctx) => {
    try {
        const post = snap.data() || {};
        post.post_id = post.post_id || snap.id || ctx.params.id;
        return await processPost(post);
    }
    catch (err) {
        console.error('scanPostTrigger error', err);
        return null;
    }
});
// -------------------------------
// Anonymized Chat Callable Functions
// -------------------------------
function generateToken(len = 24) {
    return crypto.randomBytes(len).toString('hex');
}
function hashToken(token) {
    return crypto.createHash('sha256').update(token).digest('hex');
}
function isProfessionalToken(tokenObj) {
    if (!tokenObj)
        return false;
    if (tokenObj.admin === true)
        return true;
    const role = tokenObj.role || tokenObj['roles'] || tokenObj['role_id'];
    if (role && (role === 'psychometrist' || role === 'professional' || role === 'pro'))
        return true;
    if (tokenObj.email && typeof tokenObj.email === 'string' && tokenObj.email.endsWith('@ustp.edu.ph'))
        return true;
    return false;
}
exports.createAnonymousChat = functions.https.onCall(async (data, context) => {
    const pseudonym = (data && data.pseudonym) ? String(data.pseudonym).slice(0, 100) : `Anon-${Math.floor(Math.random() * 9000 + 1000)}`;
    const token = generateToken(24);
    const tokenHash = hashToken(token);
    const chatId = 'chat-' + Date.now().toString(36) + '-' + crypto.randomBytes(6).toString('hex');
    const chatDoc = {
        pseudonym,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        tokenHash,
        status: 'open',
        proUid: null
    };
    await firestore.collection('private_chats').doc(chatId).set(chatDoc);
    return { chatId, token, pseudonym };
});
exports.sendChatMessage = functions.https.onCall(async (data, context) => {
    const chatId = (data && data.chatId) ? String(data.chatId) : null;
    const content = (data && data.content) ? String(data.content).slice(0, 2000) : null;
    const token = (data && data.token) ? String(data.token) : null;
    if (!chatId || !content)
        throw new functions.https.HttpsError('invalid-argument', 'Missing chatId or content');
    const chatRef = firestore.collection('private_chats').doc(chatId);
    const chatSnap = await chatRef.get();
    if (!chatSnap.exists)
        throw new functions.https.HttpsError('not-found', 'Chat not found');
    const chat = chatSnap.data() || {};
    let senderRole = 'unknown';
    let senderId = null;
    // Professional via authentication
    if (context && context.auth && isProfessionalToken(context.auth.token)) {
        senderRole = 'pro';
        senderId = context.auth.uid;
        // record pro on chat
        if (!chat.proUid)
            await chatRef.update({ proUid: senderId, status: 'in_progress' });
    }
    else if (token && hashToken(token) === chat.tokenHash) {
        senderRole = 'student';
        senderId = chat.pseudonym || 'Anon';
    }
    else {
        throw new functions.https.HttpsError('permission-denied', 'Not authorized to send message');
    }
    const msg = {
        senderRole,
        senderId,
        content,
        timestamp: admin.firestore.FieldValue.serverTimestamp()
    };
    const msgRef = await chatRef.collection('messages').add(msg);
    return { ok: true, id: msgRef.id };
});
exports.fetchChatMessages = functions.https.onCall(async (data, context) => {
    const chatId = (data && data.chatId) ? String(data.chatId) : null;
    const token = (data && data.token) ? String(data.token) : null;
    if (!chatId)
        throw new functions.https.HttpsError('invalid-argument', 'Missing chatId');
    const chatRef = firestore.collection('private_chats').doc(chatId);
    const chatSnap = await chatRef.get();
    if (!chatSnap.exists)
        throw new functions.https.HttpsError('not-found', 'Chat not found');
    const chat = chatSnap.data() || {};
    if (!(context && context.auth && isProfessionalToken(context.auth.token)) && !(token && hashToken(token) === chat.tokenHash)) {
        throw new functions.https.HttpsError('permission-denied', 'Not authorized to read messages');
    }
    const msgsSnap = await chatRef.collection('messages').orderBy('timestamp', 'asc').limit(1000).get();
    const messages = msgsSnap.docs.map(d => ({ id: d.id, ...(d.data() || {}) }));
    return { chatId, pseudonym: chat.pseudonym || null, messages };
});
exports.listPendingChats = functions.https.onCall(async (data, context) => {
    if (!(context && context.auth && isProfessionalToken(context.auth.token))) {
        throw new functions.https.HttpsError('permission-denied', 'Not authorized');
    }
    const snaps = await firestore.collection('private_chats').where('status', '==', 'open').orderBy('createdAt', 'desc').limit(50).get();
    const list = snaps.docs.map(d => ({ id: d.id, ...(d.data() || {}), tokenHash: undefined }));
    return { chats: list };
});
exports.closeChat = functions.https.onCall(async (data, context) => {
    if (!(context && context.auth && isProfessionalToken(context.auth.token))) {
        throw new functions.https.HttpsError('permission-denied', 'Not authorized');
    }
    const chatId = (data && data.chatId) ? String(data.chatId) : null;
    if (!chatId)
        throw new functions.https.HttpsError('invalid-argument', 'Missing chatId');
    await firestore.collection('private_chats').doc(chatId).update({ status: 'closed' });
    return { ok: true };
});
