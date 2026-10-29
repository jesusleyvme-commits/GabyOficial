const CONFIG = {
  profile: {
    name: "Gaby 🌸",
    handle: "@gaby_vetlisboa",
    tagline: "Estudante brasileira de Med Vet em Lisboa 🇧🇷🐾",
    bio: "Morar sozinha num país novo dá uma carência às vezes... Criei esse cantinho em segredo para fugir da rotina da faculdade, me soltar um pouco e ter alguém especial para me mimar. 🥺 Vem ser meu segredinho...",
    avatar: "assets/avatar.jpg",
    avatarPosition: "center 22%",
    verified: true,
    verifiedLabel: "Conta verificada",
    officialLabel: "",
  },
  socials: [],
  links: [
    {
      id: "btn-previews",
      icon: "telegram-logo",
      title: "O que eu gravo no meu quarto 🙈",
      subtitle: "Entra no meu canal (grátis)",
      url: "https://t.me/+wBUYZRygSlgxMThh",
      trackingEvent: "Previews_Channel",
      featured: true,
    },
    {
      id: "btn-vip",
      icon: "heart",
      title: "Quer ser meu namoradinho VIP? ❤️",
      subtitle: "Acesso ao meu privado (MBWay / IBAN)",
      url: "https://t.me/sou_gaby",
      trackingEvent: "VIP_Private",
      featured: false,
    },
  ],
  footer: {
    note: "Nosso segredinho... 🤫🐾 (Apenas +18)",
    ageNote: "",
  },
};

const THEMES = {
  "telegram-logo": { color: "#7fb8e6", bg: "#eaf4fd" },
  heart: { color: "#e88aa6", bg: "#fdeef3" },
  send: { color: "#7fb8e6", bg: "#eaf4fd" },
  "chevron-right": { color: "#c9b8bf", bg: "transparent" },
  default: { color: "#e88aa6", bg: "#fdeef3" },
};

const ICONS = {
  "telegram-logo":
    '<circle cx="12" cy="12" r="12" fill="#7fb8e6" stroke="none"/><path fill="#fff" fill-rule="evenodd" stroke="none" d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/>',
  heart:
    '<path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/>',
  "chevron-right": '<path d="m9 18 6-6-6-6"/>',
  link: '<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>',
};

const getTheme = (name) => THEMES[name] || THEMES.default;

const escapeHTML = (value) =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const safeUrl = (value) => {
  if (!value) return "";
  try {
    const url = new URL(value, window.location.href);
    if (["http:", "https:", "mailto:", "tel:"].includes(url.protocol)) return url.href;
  } catch (error) {
    return "";
  }
  return "";
};

const CAMPAIGN_KEYS = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"];

const getCampaign = () => {
  const params = new URLSearchParams(window.location.search);
  return CAMPAIGN_KEYS.reduce((campaign, key) => {
    const value = params.get(key);
    if (value) campaign[key] = value;
    return campaign;
  }, {});
};

const getReferrerHost = () => {
  if (!document.referrer) return "";
  try {
    return new URL(document.referrer).hostname;
  } catch (error) {
    return "";
  }
};

const track = (event, detail = {}) => {
  const campaign = getCampaign();
  const payload = { event, page_path: window.location.pathname, ...detail };
  if (Object.keys(campaign).length) payload.campaign = campaign;
  (window.dataLayer = window.dataLayer || []).push(payload);
  if (typeof window.gabyTrack === "function") {
    try {
      window.gabyTrack(payload);
    } catch (error) {}
  }
  window.dispatchEvent(new CustomEvent("gaby:track", { detail: payload }));
};

// Fires conversion events on the marketing pixels when a CTA is clicked.
// Placeholder IDs live in index.html; these calls are safe no-ops if the
// pixels are not configured.
const trackClick = (eventName) => {
  if (!eventName) return;

  // Google Analytics 4 (generate_lead / click)
  if (typeof window.gtag === "function") {
    window.gtag("event", "generate_lead", { event_category: "cta", event_label: eventName });
    window.gtag("event", "click", { event_category: "cta", event_label: eventName });
  }

  // Meta Pixel (Facebook/Instagram)
  if (typeof window.fbq === "function") {
    window.fbq("track", "Lead", { content_name: eventName });
    window.fbq("trackCustom", "CTAClick", { content_name: eventName });
  }

  // TikTok Pixel
  if (window.ttq && typeof window.ttq.track === "function") {
    window.ttq.track("ClickButton", { content_name: eventName });
    window.ttq.track("Lead", { content_name: eventName });
  }

  // Internal dataLayer for GTM
  (window.dataLayer = window.dataLayer || []).push({
    event: "cta_conversion",
    cta_name: eventName,
  });
};

const icon = (name) =>
  `<svg${name === "telegram-logo" ? ' class="brand-icon"' : ""} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${
    ICONS[name] || ICONS.link
  }</svg>`;

const monogram = (name) =>
  `<span class="monogram">${escapeHTML((name || "G").trim().charAt(0).toUpperCase())}</span>`;

const verifiedBadge = (label) => `
  <span class="verified" tabindex="0" role="img" aria-label="${escapeHTML(label)}" title="${escapeHTML(label)}">
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path fill="#3b9af5" d="M3.85 8.62a4 4 0 0 1 4.78-4.77 4 4 0 0 1 6.74 0 4 4 0 0 1 4.78 4.78 4 4 0 0 1 0 6.74 4 4 0 0 1-4.77 4.78 4 4 0 0 1-6.75 0 4 4 0 0 1-4.78-4.77 4 4 0 0 1 0-6.76Z"/>
      <path d="m9 12 2 2 4-4" fill="none" stroke="#fff" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>
  </span>
`;

const cozyAvatar = () => `
  <svg class="cozy-avatar" viewBox="0 0 120 120" role="img" aria-label="Ilustração fofa de uma estudante de moletom">
    <circle cx="60" cy="60" r="60" fill="#ffe4ef"/>
    <circle cx="60" cy="48" r="20" fill="#f7c9b6"/>
    <path d="M40 40c0-14 9-22 20-22s20 8 20 22c0 6-3 10-3 10H43s-3-4-3-10z" fill="#e6b98a"/>
    <path d="M38 76c4-14 12-20 22-20s18 6 22 20c2 8 2 14 2 14H36s0-6 2-14z" fill="#f3d7e3"/>
    <path d="M50 74c2 3 6 5 10 5s8-2 10-5" fill="none" stroke="#e0a9bd" stroke-width="3" stroke-linecap="round"/>
    <circle cx="53" cy="47" r="2.4" fill="#5a4650"/>
    <circle cx="67" cy="47" r="2.4" fill="#5a4650"/>
    <path d="M55 56c2 2 8 2 10 0" fill="none" stroke="#c9708a" stroke-width="2.2" stroke-linecap="round"/>
    <path d="M92 30c-2-3-6-3-8 0-2-3-6-3-8 0-2 4 8 10 8 10s10-6 8-10z" fill="#f2a3bd"/>
  </svg>
`;

const socialMarkup = (social, index) => {
  const href = safeUrl(social.url);
  if (!href) return "";
  const theme = getTheme(social.icon);
  const name = social.name || social.icon || "Link";
  return `
    <a class="social" href="${escapeHTML(href)}" target="_blank" rel="noopener noreferrer"
      aria-label="${escapeHTML(name)}" title="${escapeHTML(name)}"
      style="--i-color:${theme.color};--i-bg:${theme.bg};--delay:${120 + index * 45}ms">
      ${icon(social.icon)}
    </a>
  `;
};

const linkMarkup = (link, index) => {
  const href = safeUrl(link.url);
  if (!href) return "";
  const theme = getTheme(link.icon);
  const subtitle = link.subtitle ? `<span class="link-subtitle">${escapeHTML(link.subtitle)}</span>` : "";
  return `
    <a class="link-card ${link.featured ? "is-featured" : ""}" href="${escapeHTML(href)}"
      target="_blank" rel="noopener noreferrer"
      data-cta="${escapeHTML(link.id || `link-${index + 1}`)}"
      data-track="${escapeHTML(link.trackingEvent || "")}"
      data-featured="${link.featured ? "true" : "false"}"
      style="--i-color:${theme.color};--i-bg:${theme.bg};--delay:${260 + index * 70}ms">
      <span class="link-icon">${icon(link.icon)}</span>
      <span class="link-text">
        <span class="link-title">
          <span class="link-name">${escapeHTML(link.title || "Link")}</span>
        </span>
        ${subtitle}
      </span>
      <span class="link-arrow">${icon("chevron-right")}</span>
    </a>
  `;
};

const render = () => {
  const { profile } = CONFIG;
  const footer = CONFIG.footer || {};
  const socials = (CONFIG.socials || []).map(socialMarkup).join("");
  const links = (CONFIG.links || []).map(linkMarkup).join("");
  const avatar = profile.avatar
    ? `<img id="avatarImg" src="${escapeHTML(profile.avatar)}" alt="Foto de ${escapeHTML(profile.name)}" style="object-position:${escapeHTML(profile.avatarPosition || "center")}">`
    : cozyAvatar();

  document.title = `${profile.name} (${profile.handle}) • Links`;
  const description = `${profile.name} — ${profile.tagline}. ${profile.bio}`;
  const metaDescription = document.querySelector('meta[name="description"]');
  const ogTitle = document.querySelector('meta[property="og:title"]');
  const ogDescription = document.querySelector('meta[property="og:description"]');
  if (metaDescription) metaDescription.setAttribute("content", description);
  if (ogTitle) ogTitle.setAttribute("content", document.title);
  if (ogDescription) ogDescription.setAttribute("content", description);

  document.getElementById("app").innerHTML = `
    <section class="profile">
      <div class="avatar-wrap">
        <div class="avatar">${avatar}</div>
      </div>
      <h1 class="name"><span>${escapeHTML(profile.name)}</span>${
        profile.verified ? verifiedBadge(profile.verifiedLabel || "Conta verificada") : ""
      }</h1>
      <div class="handle-row">
        ${profile.handle ? `<p class="handle">${escapeHTML(profile.handle)}</p>` : ""}
      </div>
      ${profile.tagline ? `<p class="tagline">${escapeHTML(profile.tagline)}</p>` : ""}
      <p class="bio">${escapeHTML(profile.bio)}</p>
      ${socials ? `<nav class="socials" aria-label="Redes sociais">${socials}</nav>` : ""}
    </section>

    <section class="links" aria-label="Meus links">${links}</section>

    <footer class="footer">
      <p>${escapeHTML(footer.note || "")}</p>
    </footer>
  `;

  const avatarImg = document.getElementById("avatarImg");
  if (avatarImg) {
    avatarImg.addEventListener(
      "error",
      () => {
        const container = avatarImg.closest(".avatar");
        if (container) container.innerHTML = cozyAvatar();
      },
      { once: true }
    );
  }

  document.querySelectorAll(".link-card").forEach((card) => {
    card.addEventListener("click", () => {
      let destination = "";
      try {
        destination = new URL(card.href).hostname;
      } catch (error) {}
      track("cta_click", {
        cta_id: card.dataset.cta || "",
        cta_label: card.querySelector(".link-name")?.textContent || "",
        cta_featured: card.dataset.featured === "true",
        destination,
      });
      trackClick(card.dataset.track || card.dataset.cta || "");
    });
  });
};

render();
window.trackClick = trackClick;
const referrerHost = getReferrerHost();
track("landing_view", referrerHost ? { referrer_host: referrerHost } : {});
