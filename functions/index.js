/*
  Safe Space — Cloud Function scanner (local-friendly)
  - Exports `processPost(post)` for use by emulator/test runner.
  - Attempts Firestore writes if `firebase-admin` is available and initialized.
  - Attempts SendGrid email if `SENDGRID_API_KEY` is provided and `@sendgrid/mail` is installed.
  - Falls back to writing `crisis_alerts_local.json` and dry-run logging when services are unavailable.
*/

'use strict';
const fs = require('fs');
const path = require('path');

let admin = null;
try { admin = require('firebase-admin'); } catch (e) { admin = null; console.warn('firebase-admin not installed; using local fallback.'); }

let sgMail = null;
try { sgMail = require('@sendgrid/mail'); } catch (e) { sgMail = null; console.warn('@sendgrid/mail not installed; email sends will be dry-run.'); }

const KEYWORDS = require('./keywords.json');

// Support both process.env and firebase functions.config() settings
let FC = null;
try { const funcs = require('firebase-functions'); FC = (funcs && typeof funcs.config === 'function') ? funcs.config() : null; } catch (e) { FC = null; }
const SENDGRID_API_KEY = process.env.SENDGRID_API_KEY || (FC && FC.sendgrid && FC.sendgrid.key) || null;
const EMAILJS_SERVICE_ID = process.env.EMAILJS_SERVICE_ID || (FC && FC.emailjs && FC.emailjs.service) || null;
const EMAILJS_TEMPLATE_ID = process.env.EMAILJS_TEMPLATE_ID || (FC && FC.emailjs && FC.emailjs.template) || null;
const EMAILJS_USER_ID = process.env.EMAILJS_USER_ID || (FC && FC.emailjs && FC.emailjs.user) || null;
const PSYCH_EMAIL = process.env.PSYCHOMETRICIAN_EMAIL || (FC && FC.psych && FC.psych.email) || 'psychometrician@ustp.edu.ph';
const FROM_EMAIL = process.env.FROM_EMAIL || (FC && FC.from && FC.from.email) || 'noreply@safespace.local';

if (sgMail && SENDGRID_API_KEY) {
  try { sgMail.setApiKey(SENDGRID_API_KEY); } catch(e){ console.warn('sendgrid init failed', e.message); }
}

// Allow disabling Firestore writes in CI/local dry-run environments
const USE_FIRESTORE = process.env.USE_FIRESTORE === 'true';

let firestore = null;
if (USE_FIRESTORE && admin) {
  try {
    admin.initializeApp();
    firestore = admin.firestore();
  } catch (e) {
    console.warn('firebase-admin initializeApp failed, continuing with local fallback:', e.message);
    firestore = null;
  }
} else {
  if (!USE_FIRESTORE) console.log('USE_FIRESTORE not set; using local file fallback for alerts');
}

function normalizeText(s) {
  if (!s) return '';
  return String(s).toLowerCase().normalize('NFKC').replace(/[^a-z0-9\s']/g, ' ').replace(/\s+/g, ' ').trim();
}

function findKeywordMatches(text) {
  const out = [];
  const norm = normalizeText(text);
  if (!norm) return out;
  for (const lang of Object.keys(KEYWORDS)) {
    const cats = KEYWORDS[lang] || {};
    for (const cat of Object.keys(cats)) {
      const arr = cats[cat] || [];
      for (const phrase of arr) {
        const pnorm = normalizeText(phrase);
        if (!pnorm) continue;
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

  // local fallback file
  const file = path.join(__dirname, 'crisis_alerts_local.json');
  let arr = [];
  try { arr = JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) { arr = []; }
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
      text: `Crisis alert for post ${alert.post_id || '[unknown]'}\nSeverity: ${alert.severity}\nMatches:\n${alert.matched.map(m=>`${m.lang}/${m.category}: ${m.phrase}`).join('\n')}\n\nPost excerpt:\n${alert.post && alert.post.content}\n`
    };
    try {
      await sgMail.send(msg);
      return { sent: true, via: 'sendgrid' };
    } catch (e) {
      console.warn('SendGrid send failed:', e.message || e);
      // continue to EmailJS fallback
    }
  }

  // EmailJS fallback via REST API
  if (EMAILJS_SERVICE_ID && EMAILJS_TEMPLATE_ID && EMAILJS_USER_ID) {
    const https = require('https');
    const postData = JSON.stringify({
      service_id: EMAILJS_SERVICE_ID,
      template_id: EMAILJS_TEMPLATE_ID,
      user_id: EMAILJS_USER_ID,
      template_params: {
        subject: `[Safe Space] Crisis alert — severity ${alert.severity}`,
        to_email: PSYCH_EMAIL,
        post_id: alert.post_id || '',
        severity: alert.severity,
        matches: alert.matched.map(m=>`${m.lang}/${m.category}: ${m.phrase}`).join('\n'),
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
            } else {
              resolve({ sent: false, via: 'emailjs', statusCode: res.statusCode, body: data });
            }
          });
        });
        req.on('error', (e) => { console.warn('EmailJS request error', e); resolve({ sent: false, error: String(e) }); });
        req.write(postData);
        req.end();
      });
      return result;
    } catch (e) {
      console.warn('EmailJS send failed', e);
    }
  }

  // dry-run
  console.log('DRY-RUN: would email alert to', PSYCH_EMAIL, 'alert=', JSON.stringify(alert, null, 2));
  return { sent: false, dryRun: true };
}

/**
 * Process a post object. Returns an object describing whether an alert was created.
 * post: { post_id, content, pseudonym, emotion_tag, energy_score, timestamp }
 */
async function processPost(post) {
  const content = (post && post.content) || '';
  const matches = findKeywordMatches(content);
  if (!matches.length) {
    return { triggered: false, matches: [] };
  }

  // severity mapping: explicit/selfharm => high
  let severity = 'medium';
  if (matches.some(m => m.category === 'explicit' || m.category === 'selfharm')) severity = 'high';

  const alert = {
    post_id: post.post_id || null,
    timestamp: new Date().toISOString(),
    severity,
    matched: matches,
    post: {
      pseudonym: post.pseudonym || null,
      emotion_tag: post.emotion_tag || null,
      energy_score: post.energy_score || null,
      content: (content && content.length > 1000) ? content.slice(0,1000) + '…' : content
    },
    source: 'local-scan'
  };

  const writeResult = await writeCrisisAlert(alert);
  const emailResult = await sendEmailNotification(alert);
  return { triggered: true, writeResult, emailResult, alert };
}

module.exports = { processPost, findKeywordMatches };

// Firebase Functions export wrapper (if `firebase-functions` is available).
let functions = null;
try { functions = require('firebase-functions'); } catch (e) { functions = null; }
if (functions) {
  exports.scanPostTrigger = functions.firestore.document('posts/{id}').onCreate(async (snap, ctx) => {
    try {
      const post = snap.data() || {};
      post.post_id = post.post_id || snap.id || ctx.params.id;
      return await processPost(post);
    } catch (err) {
      console.error('scanPostTrigger error', err);
      return null;
    }
  });
}

// optional quick HTTP test when run via a small server (not required)
if (require.main === module) {
  console.log('safe-space functions module loaded. Use the test runner at `test/run_test.js`');
}
