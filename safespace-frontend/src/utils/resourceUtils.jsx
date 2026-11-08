import React from 'react';

/**
 * Resolves a raw resource link into an actionable, safe URI:
 * - Phone numbers & hotlines -> tel:1553 (no blank tab)
 * - SMS shortcodes -> sms:741741 (no blank tab)
 * - Web URLs -> https://... (opens with target="_blank" rel="noopener noreferrer")
 *
 * Prevents relative route resolution errors (e.g. localhost:5173/1553 -> 404).
 */
export function resolveResourceLink(link, category = '') {
  if (!link) return '#';
  const trimmed = String(link).trim();
  if (!trimmed || trimmed === '#') return '#';

  // Already prefixed with recognized protocols
  if (/^(tel:|sms:|mailto:|https?:\/\/)/i.test(trimmed)) {
    return trimmed;
  }

  const upperCat = (category || '').toUpperCase();
  const digitsOnly = trimmed.replace(/[\s\-\(\)\.]/g, '');

  // 1. Hotline category or phone-like digits
  const isLikelyPhone = upperCat === 'HOTLINE' || /^\+?[0-9]{3,15}$/.test(digitsOnly);
  if (isLikelyPhone && digitsOnly.length >= 3) {
    return `tel:${digitsOnly}`;
  }

  // 2. Chat service with SMS shortcode (e.g. 741741)
  if (upperCat === 'CHAT_SERVICE' && /^[0-9]{4,8}$/.test(digitsOnly)) {
    return `sms:${digitsOnly}`;
  }

  // 3. Web domain without protocol (e.g. www.ustp.edu.ph or ustp.edu.ph/guidance)
  if (/^([a-z0-9-]+\.)+[a-z]{2,}(\/.*)?$/i.test(trimmed)) {
    return `https://${trimmed}`;
  }

  return trimmed;
}

/**
 * Check whether a resolved href is a web URL.
 * Strictly avoids applying target="_blank" to tel:, sms:, and mailto: protocols,
 * preventing blank about:blank tabs or popup blockers on mobile and desktop.
 */
export function isWebExternalUrl(href) {
  if (!href || href === '#') return false;
  return /^https?:\/\//i.test(href);
}

/**
 * Generates clean, accessible HTML anchor attributes.
 */
export function getLinkAttributes(rawLink, category = '') {
  const href = resolveResourceLink(rawLink, category);
  const isWeb = isWebExternalUrl(href);

  return {
    href,
    target: isWeb ? '_blank' : undefined,
    rel: isWeb ? 'noopener noreferrer' : undefined,
    isExternalWeb: isWeb,
    isTel: href.startsWith('tel:'),
    isSms: href.startsWith('sms:')
  };
}

/**
 * Automatically detects emergency hotline numbers and URLs within text
 * and returns React elements with interactive clickable links.
 */
export function renderTextWithClickableHotlines(text) {
  if (!text) return null;
  const str = String(text);

  // Combined regex pattern for:
  // 1. Hotlines & crisis numbers: 1553, 911, 741741, 09\d{2}-\d{3}-\d{4}, \+?\d{7,15}, (02)\s*804-4635
  // 2. URLs: https?://\S+
  const pattern = /(https?:\/\/[^\s<]+|\b1553\b|\b911\b|\b741741\b|\b09\d{2}[-\s]?\d{3}[-\s]?\d{4}\b|\(?02\)?\s*804[-\s]?(?:4635|0673|HOPE)|\+?63\s?\d{2,3}[-\s]?\d{3}[-\s]?\d{4})/gi;

  const parts = [];
  let lastIndex = 0;
  let match;

  while ((match = pattern.exec(str)) !== null) {
    const matchedText = match[0];
    const matchStart = match.index;

    // Push preceding text
    if (matchStart > lastIndex) {
      parts.push(str.substring(lastIndex, matchStart));
    }

    const trimmed = matchedText.trim();
    if (/^https?:\/\//i.test(trimmed)) {
      parts.push(
        <a
          key={`url-${matchStart}`}
          href={trimmed}
          target="_blank"
          rel="noopener noreferrer"
          className="chat-interactive-link"
        >
          {trimmed}
        </a>
      );
    } else if (trimmed === '741741') {
      parts.push(
        <a
          key={`sms-${matchStart}`}
          href="sms:741741"
          className="chat-hotline-link"
          title="Tap to text Crisis Text Line (741741)"
        >
          {trimmed}
        </a>
      );
    } else {
      const cleanDigits = trimmed.replace(/[^\d+]/g, '');
      parts.push(
        <a
          key={`tel-${matchStart}`}
          href={`tel:${cleanDigits}`}
          className="chat-hotline-link"
          title={`Tap to call ${trimmed}`}
        >
          {trimmed}
        </a>
      );
    }

    lastIndex = pattern.lastIndex;
  }

  if (lastIndex < str.length) {
    parts.push(str.substring(lastIndex));
  }

  return parts;
}

