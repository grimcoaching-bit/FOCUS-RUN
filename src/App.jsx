import { useState, useEffect, useRef } from "react";

const C = {
  black: "#0d0d0d", card: "#1a1a1a", border: "#2a2a2a", borderLight: "#ddd5c0",
  cream: "#f5f0e4", creamMid: "#d4c9b0", creamDim: "#8a7d65",
  cardLight: "#ede6d4", bg: "#f0ead6", yellow: "#d4ff00", yellowDim: "#aad000",
  danger: "#ff4444", success: "#44cc88", blue: "#4488ff",
};
const F = { title: "'Futura','Century Gothic','Trebuchet MS',sans-serif", body: "'Helvetica Neue',Arial,sans-serif" };
const mockDB = { users: {} };

const DISTANCES_ROUTE_CHIPS = ["5K", "10K", "Semi (21K)", "Marathon (42K)"];
const DENIVELES = ["Plat (0–50m D+)", "Vallonné (50–200m D+)", "Accidenté (200–500m D+)", "Montagneux (500m D+)"];
const JOURS_SEMAINE = ["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi", "Dimanche"];
const DUREES_DISPO = ["30 min", "45 min", "1h", "1h30", "2h", "2h+"];
const JOURS_FR = ["DIMANCHE", "LUNDI", "MARDI", "MERCREDI", "JEUDI", "VENDREDI", "SAMEDI"];

const STATUTS = [
  { label: "Démarrage", min: 0, color: "#8a7d65", next: 4, nextLabel: "En route" },
  { label: "En route", min: 4, color: "#44cc88", next: 10, nextLabel: "Régulier" },
  { label: "Régulier", min: 10, color: "#4488ff", next: 20, nextLabel: "Finisher" },
  { label: "Finisher", min: 20, color: "#d4ff00", next: null, nextLabel: null },
];

// ─── HELPERS ──────────────────────────────────────────────────────────────────
function getPhase(weekNum, totalWeeks) {
  if (!totalWeeks || totalWeeks <= 0 || weekNum === 0) return null;
  const remaining = totalWeeks - weekNum;
  if (remaining <= 1) return { phase: "Race Week", pct: 100, desc: "La semaine de ta course — repose-toi et fais confiance à ton travail.", color: C.yellow };
  if (remaining <= 3) return { phase: "Affûtage", pct: Math.round((weekNum / totalWeeks) * 100), desc: "Volume réduit, intensité maintenue. Tu vas arriver frais.", color: C.yellow };
  if (weekNum <= Math.floor(totalWeeks * 0.35)) return { phase: "Base", pct: Math.round((weekNum / totalWeeks) * 100), desc: "On construit ta fondation. C'est ici que tout se joue.", color: C.success };
  return { phase: "Développement", pct: Math.round((weekNum / totalWeeks) * 100), desc: "On monte en intensité. Tu vas sentir la progression.", color: C.blue };
}
function getWeeksToRace(dateCourse) {
  if (!dateCourse) return null;
  const d = new Date(dateCourse + "T00:00:00");
  const today = new Date(); today.setHours(0,0,0,0);
  return Math.ceil((d - today) / (7*24*60*60*1000)); // peut être négatif
}
function getDaysToRace(dateCourse) {
  if (!dateCourse) return null;
  const d = new Date(dateCourse + "T00:00:00");
  const today = new Date(); today.setHours(0,0,0,0);
  const diff = Math.round((d - today) / (24*60*60*1000));
  return diff; // peut être négatif si course passée
}
function getTodaySeance(days) {
  return days?.find(d => d.jour === JOURS_FR[new Date().getDay()]);
}
function isRecoveryWeek(weekNum) { return weekNum > 0 && weekNum % 4 === 0; }
function isRouteObjectif(obj) {
  if (!obj) return false;
  if (obj.isTrail === false) return true;
  if (obj.distanceCourse && DISTANCES_ROUTE_CHIPS.includes(obj.distanceCourse)) return true;
  return false;
}
function getJoursRestantsSemaine(joursDispo) {
  const today = new Date().getDay();
  const jr = {};
  Object.entries(joursDispo || {}).forEach(([jour, duree]) => {
    const idx = JOURS_SEMAINE.indexOf(jour);
    const ji = idx === 6 ? 0 : idx + 1;
    if (ji > today) jr[jour] = duree;
  });
  return jr;
}

// ─── PARSER ROBUSTE ───────────────────────────────────────────────────────────
function parseProgramme(text) {
  if (!text || typeof text !== "string") return { days: [], conseils: "", intro: "" };
  const lines = text.split("\n").map(l => l.trim()).filter(Boolean);
  const days = []; let cur = null, curLines = [], intro = "", introFound = false, conseilsStarted = false, conseilsLines = [];
  const clean = l => l.replace(/\*\*/g, "").replace(/\*/g, "").replace(/^#+\s/, "").replace(/^-\s+/, "").trim();
  const isJour = l => JOURS_FR.some(j => l.toUpperCase().startsWith(j));
  const isConseils = l => /^CONSEILS/i.test(l.trim());
  const flush = () => { if (cur) { days.push({ ...cur, content: curLines.map(clean).filter(Boolean).join("\n") }); curLines = []; cur = null; } };
  lines.forEach(line => {
    const cl = clean(line); if (!cl) return;
    if (isConseils(cl)) { flush(); conseilsStarted = true; return; }
    if (conseilsStarted) { conseilsLines.push(cl); return; }
    if (isJour(cl)) {
      flush(); introFound = true;
      const isRest = /repos/i.test(cl);
      const jourName = JOURS_FR.find(j => cl.toUpperCase().startsWith(j)) || "";
      const afterJour = cl.slice(jourName.length).replace(/^[\s\-—:]+/, "");
      const parts = afterJour.split(/\s*[—\-]\s*/);
      let type = "easy";
      if (isRest) type = "rest";
      else if (/FRACTIONN|VMA|INTERVAL/i.test(cl)) type = "interval";
      else if (/TEMPO|SEUIL/i.test(cl)) type = "tempo";
      else if (/LONGUE|LONG/i.test(cl)) type = "long";
      cur = { jour: jourName, titre: parts[0]?.trim() || (isRest ? "Repos" : "Séance"), duree: parts[1]?.trim() || "", type, isRest, done: null, restDesc: "" };
    } else if (!introFound) { intro += (intro ? " " : "") + cl; }
    else if (cur) { if (cur.isRest && !cur.restDesc) cur.restDesc = cl; else if (!cur.isRest) curLines.push(cl); }
  });
  flush();
  return { days, intro: clean(intro), conseils: conseilsLines.map(clean).filter(Boolean).join("\n") };
}

function renderContent(content, restDesc) {
  const text = content || restDesc || ""; if (!text.trim()) return null;
  const LABELS = ["Objectif", "Échauffement", "Corps", "Retour au calme", "Précaution"];
  return text.split("\n").map((line, i) => {
    const t = line.trim(); if (!t) return null;
    const label = LABELS.find(l => t.toLowerCase().startsWith(l.toLowerCase()));
    if (label) { const rest = t.slice(label.length).replace(/^[\s:—\-]+/, ""); return (<div key={i} style={{ marginBottom: 10, lineHeight: 1.7 }}><span style={{ fontWeight: 700, color: C.black, fontSize: 14 }}>{label}</span>{rest && <span style={{ color: C.creamDim, fontSize: 14 }}> {rest}</span>}</div>); }
    return <div key={i} style={{ color: C.creamDim, fontSize: 14, marginBottom: 6, lineHeight: 1.65 }}>{t}</div>;
  });
}

// ─── UI ───────────────────────────────────────────────────────────────────────
const Btn = ({ children, onClick, disabled, variant = "primary", full, small, style = {} }) => {
  const base = { borderRadius: 50, border: "none", cursor: disabled ? "not-allowed" : "pointer", fontFamily: F.body, fontWeight: 700, letterSpacing: "0.05em", transition: "all .2s", width: full ? "100%" : "auto", fontSize: small ? 14 : 16, padding: small ? "11px 22px" : "15px 36px", opacity: disabled ? .45 : 1, display: "inline-block", textAlign: "center", boxSizing: "border-box", WebkitTapHighlightColor: "transparent", minHeight: 44, ...style };
  if (variant === "primary") return <button onClick={onClick} disabled={disabled} style={{ ...base, background: C.yellow, color: C.black }}>{children}</button>;
  if (variant === "dark") return <button onClick={onClick} disabled={disabled} style={{ ...base, background: C.black, color: C.cream }}>{children}</button>;
  if (variant === "ghost") return <button onClick={onClick} disabled={disabled} style={{ ...base, background: "transparent", color: C.creamDim, border: "none", padding: small ? "8px 14px" : "15px 20px" }}>{children}</button>;
  if (variant === "outline") return <button onClick={onClick} disabled={disabled} style={{ ...base, background: "transparent", color: C.black, border: `2px solid ${C.black}` }}>{children}</button>;
  if (variant === "danger") return <button onClick={onClick} disabled={disabled} style={{ ...base, background: "transparent", color: C.danger, border: `1.5px solid ${C.danger}` }}>{children}</button>;
};

const Input = ({ label, type = "text", value, onChange, placeholder, error, hint, autoComplete }) => (
  <div style={{ marginBottom: 16 }}>
    {label && <div style={{ fontSize: 12, color: C.creamDim, letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: hint ? 4 : 8 }}>{label}</div>}
    {hint && <div style={{ fontSize: 13, color: C.creamDim, marginBottom: 8, lineHeight: 1.4, fontStyle: "italic" }}>{hint}</div>}
    <input type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} autoComplete={autoComplete}
      style={{ width: "100%", background: "#e4dcc8", border: `1.5px solid ${error ? C.danger : C.borderLight}`, borderRadius: 14, color: C.black, padding: "14px 18px", fontSize: 16, fontFamily: F.body, outline: "none", boxSizing: "border-box", WebkitAppearance: "none" }}
      onFocus={e => e.target.style.borderColor = C.black} onBlur={e => e.target.style.borderColor = error ? C.danger : C.borderLight} />
    {error && <div style={{ color: C.danger, fontSize: 13, marginTop: 6 }}>{error}</div>}
  </div>
);

const CL = ({ children, style = {} }) => <div style={{ background: C.cardLight, border: `1px solid ${C.borderLight}`, borderRadius: 20, padding: 20, ...style }}>{children}</div>;
const CD = ({ children, style = {} }) => <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 20, padding: 20, ...style }}>{children}</div>;
const Tag = ({ children, color, dark }) => <span style={{ background: color ? `${color}20` : dark ? `${C.yellow}20` : `${C.black}0c`, color: color || (dark ? C.yellow : C.black), border: `1px solid ${color ? color + "35" : dark ? C.yellow + "35" : C.black + "18"}`, borderRadius: 50, padding: "5px 14px", fontSize: 12, fontFamily: F.body, fontWeight: 700, whiteSpace: "nowrap" }}>{children}</span>;
const Chip = ({ label, selected, onClick }) => <div onClick={onClick} style={{ padding: "10px 18px", borderRadius: 50, border: `1.5px solid ${selected ? C.black : "#bbb"}`, background: selected ? C.yellow : "transparent", color: selected ? C.black : "#333", fontSize: 14, cursor: "pointer", fontWeight: selected ? 700 : 400, transition: "all .2s", WebkitTapHighlightColor: "transparent", userSelect: "none", minHeight: 44, display: "flex", alignItems: "center", transform: selected ? "scale(1.03)" : "scale(1)" }}>{label}</div>;

const Sheet = ({ children, onClose, title }) => (
  <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.6)", zIndex: 300, display: "flex", alignItems: "flex-end" }} onClick={e => e.target === e.currentTarget && onClose()}>
    <div style={{ background: C.bg, width: "100%", maxHeight: "92vh", overflowY: "auto", borderRadius: "24px 24px 0 0", animation: "slideUp .3s ease", paddingBottom: 40 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "20px 20px 16px", borderBottom: `1px solid ${C.borderLight}`, position: "sticky", top: 0, background: C.bg, zIndex: 1 }}>
        {title && <div style={{ fontFamily: F.title, fontSize: 15, fontWeight: 700, letterSpacing: "0.04em" }}>{title}</div>}
        <button onClick={onClose} style={{ background: "none", border: "none", fontSize: 28, cursor: "pointer", color: C.creamDim, marginLeft: "auto", lineHeight: 1, padding: "0 4px", minHeight: 44 }}>×</button>
      </div>
      <div style={{ padding: "16px 20px 0" }}>{children}</div>
    </div>
  </div>
);

function Toast({ message, type = "success", onDone }) {
  useEffect(() => { const t = setTimeout(onDone, 2800); return () => clearTimeout(t); }, []);
  return (
    <div style={{ position: "fixed", top: 64, left: "50%", transform: "translateX(-50%)", background: type === "celebrate" ? C.yellow : type === "success" ? C.success : C.danger, color: type === "celebrate" ? C.black : "#fff", padding: "12px 24px", borderRadius: 50, fontSize: 14, fontWeight: 700, zIndex: 500, whiteSpace: "nowrap", boxShadow: "0 4px 20px rgba(0,0,0,.2)", animation: "toastIn .3s ease" }}>
      {message}
    </div>
  );
}

function Skeleton({ height = 56, radius = 16 }) {
  return <div style={{ height, borderRadius: radius, background: "linear-gradient(90deg,#e4dcc8 25%,#d4ccb8 50%,#e4dcc8 75%)", backgroundSize: "200% 100%", animation: "shimmer 1.4s infinite", marginBottom: 10 }} />;
}

function LoadingProgramme() {
  const msgs = ["Analyse de ton profil…", "Calcul de la périodisation…", "Calibrage des allures…", "Préparation de tes séances…", "Finalisation du programme…"];
  const [idx, setIdx] = useState(0);
  useEffect(() => { const t = setInterval(() => setIdx(i => (i + 1) % msgs.length), 1800); return () => clearInterval(t); }, []);
  return (
    <div style={{ textAlign: "center", padding: "80px 20px" }}>
      <div style={{ width: 48, height: 48, border: `3px solid ${C.borderLight}`, borderTopColor: C.black, borderRadius: "50%", animation: "spin .9s linear infinite", margin: "0 auto 20px" }} />
      <div style={{ fontFamily: F.title, fontSize: 15, fontWeight: 700, letterSpacing: "0.04em", marginBottom: 8, minHeight: 24 }}>{msgs[idx]}</div>
      <div style={{ color: C.creamDim, fontSize: 13 }}>Ton programme est entre de bonnes mains.</div>
    </div>
  );
}

// ─── SHARE CARD ───────────────────────────────────────────────────────────────
function ShareCard({ type, data, onClose }) {
  const canvasRef = useRef(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current; if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const W = 1080, H = 1080;
    canvas.width = W; canvas.height = H;
    ctx.clearRect(0, 0, W, H);

    if (type === "sticker") {
      // PNG transparent — seulement le sticker
      const x = 60, y = H - 360, w = W - 120, h = 300;
      ctx.fillStyle = "rgba(8,8,8,0.92)";
      ctx.beginPath(); ctx.roundRect(x, y, w, h, 24); ctx.fill();
      // Barre jaune top
      const grad = ctx.createLinearGradient(x, y, x + w, y);
      grad.addColorStop(0, "#d4ff00"); grad.addColorStop(1, "#aad000");
      ctx.fillStyle = grad; ctx.beginPath(); ctx.roundRect(x, y, w, 5, [4, 4, 0, 0]); ctx.fill();
      // Logo
      ctx.fillStyle = "#f5f0e4"; ctx.font = `700 30px 'Trebuchet MS',sans-serif`; ctx.fillText("FOCUS", x + 26, y + 52);
      ctx.fillStyle = "#d4ff00"; ctx.beginPath(); ctx.roundRect(x + 120, y + 28, 78, 36, 4); ctx.fill();
      ctx.fillStyle = "#0d0d0d"; ctx.font = `700 24px 'Trebuchet MS',sans-serif`; ctx.fillText("RUN", x + 130, y + 52);
      // Becoming Finisher
      ctx.fillStyle = "rgba(212,255,0,0.7)"; ctx.font = `700 18px 'Trebuchet MS',sans-serif`;
      ctx.textAlign = "right"; ctx.fillText("BECOMING FINISHER", x + w - 26, y + 52); ctx.textAlign = "left";
      // Nom course
      ctx.fillStyle = "#ffffff"; ctx.font = `700 50px 'Trebuchet MS',sans-serif`;
      const name = (data.nom || "MA COURSE").toUpperCase();
      if (name.length > 18) {
        const words = name.split(" "); const mid = Math.ceil(words.length / 2);
        ctx.fillText(words.slice(0, mid).join(" "), x + 26, y + 125);
        ctx.fillText(words.slice(mid).join(" "), x + 26, y + 178);
      } else { ctx.fillText(name, x + 26, y + 150); }
      // Barre progression
      const barY = y + 222;
      ctx.fillStyle = "rgba(255,255,255,0.08)"; ctx.beginPath(); ctx.roundRect(x + 26, barY, w - 52, 5, 2); ctx.fill();
      ctx.fillStyle = "#d4ff00"; ctx.beginPath(); ctx.roundRect(x + 26, barY, (w - 52) * Math.min((data.pct || 0) / 100, 1), 5, 2); ctx.fill();
      ctx.fillStyle = "#d4ff00"; ctx.font = `700 22px 'Trebuchet MS',sans-serif`;
      ctx.textAlign = "right"; ctx.fillText(`${data.pct || 0}%`, x + w - 26, barY - 8); ctx.textAlign = "left";
      ctx.fillStyle = "rgba(255,255,255,0.28)"; ctx.font = `400 18px 'Trebuchet MS',sans-serif`;
      ctx.fillText(data.jours > 0 ? `J-${data.jours}` : "Jour J !", x + 26, barY + 30);
      ctx.fillStyle = "rgba(255,255,255,0.15)"; ctx.textAlign = "right"; ctx.fillText("focusrun.fr", x + w - 26, barY + 30); ctx.textAlign = "left";
    } else {
      // FINISHER — fond noir plein, premium
      ctx.fillStyle = "#0d0d0d"; ctx.fillRect(0, 0, W, H);
      // Grain
      for (let i = 0; i < 8000; i++) { ctx.fillStyle = `rgba(255,255,255,${Math.random() * 0.015})`; ctx.fillRect(Math.random() * W, Math.random() * H, 1, 1); }
      // Radial glow jaune top right
      const radGrad = ctx.createRadialGradient(W, 0, 0, W, 0, 500);
      radGrad.addColorStop(0, "rgba(212,255,0,0.08)"); radGrad.addColorStop(1, "transparent");
      ctx.fillStyle = radGrad; ctx.fillRect(0, 0, W, H);
      // Barre jaune top
      const topGrad = ctx.createLinearGradient(0, 0, W, 0);
      topGrad.addColorStop(0, "#d4ff00"); topGrad.addColorStop(1, "#aad000");
      ctx.fillStyle = topGrad; ctx.fillRect(0, 0, W, 6);
      // Logo
      ctx.fillStyle = "#f5f0e4"; ctx.font = `700 48px 'Trebuchet MS',sans-serif`; ctx.fillText("FOCUS", 60, 108);
      ctx.fillStyle = "#d4ff00"; ctx.beginPath(); ctx.roundRect(240, 66, 120, 56, 5); ctx.fill();
      ctx.fillStyle = "#0d0d0d"; ctx.font = `700 44px 'Trebuchet MS',sans-serif`; ctx.fillText("RUN", 252, 108);
      // Médaille
      ctx.font = `120px serif`; ctx.textAlign = "center";
      ctx.shadowColor = "rgba(212,255,0,0.4)"; ctx.shadowBlur = 40;
      ctx.fillText("🏅", W / 2, 360); ctx.shadowBlur = 0;
      // FINISHER
      ctx.fillStyle = "#d4ff00"; ctx.font = `700 148px 'Trebuchet MS',sans-serif`;
      ctx.shadowColor = "rgba(212,255,0,0.2)"; ctx.shadowBlur = 60;
      ctx.fillText("FINISHER", W / 2, 520); ctx.shadowBlur = 0;
      // Ligne décorative
      ctx.fillStyle = "rgba(212,255,0,0.3)"; ctx.fillRect(W / 2 - 60, 545, 120, 2);
      // Nom course
      ctx.fillStyle = "#f5f0e4"; ctx.font = `700 52px 'Trebuchet MS',sans-serif`;
      ctx.fillText((data.nom || "MA COURSE").toUpperCase(), W / 2, 618);
      // Stats
      const statsY = 720;
      const stats = [];
      if (data.distance) stats.push({ label: "Distance", value: data.distance });
      if (data.denivele) stats.push({ label: "D+", value: data.denivele });
      if (data.temps) stats.push({ label: "Temps", value: data.temps });
      if (data.semaines) stats.push({ label: "Semaines de prépa", value: `${data.semaines} sem` });
      const statW = (W - 120) / Math.max(stats.length, 1);
      stats.forEach((s, i) => {
        const sx = 60 + statW * i + statW / 2;
        if (i > 0) { ctx.fillStyle = "rgba(255,255,255,0.1)"; ctx.fillRect(60 + statW * i, statsY - 40, 1, 80); }
        ctx.fillStyle = "#d4ff00"; ctx.font = `700 36px 'Trebuchet MS',sans-serif`; ctx.fillText(s.value, sx, statsY);
        ctx.fillStyle = "#8a7d65"; ctx.font = `400 22px 'Trebuchet MS',sans-serif`; ctx.fillText(s.label.toUpperCase(), sx, statsY + 36);
      });
      // Tagline
      ctx.fillStyle = "rgba(212,255,0,0.5)"; ctx.font = `400 26px 'Trebuchet MS',sans-serif`;
      ctx.fillText("Ton objectif, notre plan. · focusrun.fr", W / 2, 960);
      ctx.textAlign = "left";
    }
    setReady(true);
  }, []);

  return (
    <Sheet onClose={onClose} title={type === "finisher" ? "🏅 Ta card Finisher" : "📤 Partager ma semaine"}>
      <p style={{ color: C.creamDim, fontSize: 13, marginBottom: 14 }}>
        {type === "sticker" ? "PNG transparent — pose-le sur ta photo dans Instagram ou Stories." : "Télécharge et partage — tu l'as mérité 🏅"}
      </p>
      <canvas ref={canvasRef} style={{ width: "100%", borderRadius: 16, display: "block", marginBottom: 16, background: type === "sticker" ? "repeating-conic-gradient(#ccc 0% 25%,#fff 0% 50%) 0 0/16px 16px" : "#0d0d0d" }} />
      {ready && <Btn full onClick={() => { const l = document.createElement("a"); l.download = type === "finisher" ? "focus-run-finisher.png" : "focus-run-becoming-finisher.png"; l.href = canvasRef.current.toDataURL("image/png"); l.click(); }}>Télécharger le PNG →</Btn>}
      <p style={{ color: C.creamDim, fontSize: 12, marginTop: 10, textAlign: "center" }}>Sur mobile : appuie longtemps sur l'image pour la sauvegarder</p>
    </Sheet>
  );
}

// ─── LEGAL ────────────────────────────────────────────────────────────────────
function LegalPage({ page, onClose }) {
  const date = new Date().toLocaleDateString("fr-FR");
  const content = {
    cgu: { title: "Conditions Générales d'Utilisation", text: `Dernière mise à jour : ${date}\n\nARTICLE 1 — ÉDITEUR\nFocus Run — [Forme juridique] — SIRET: [À compléter] — [Adresse] — support@focusrun.fr\n\nARTICLE 2 — NATURE DU SERVICE\nFocus Run génère des programmes d'entraînement running/trail par intelligence artificielle (AI Act UE 2024/1689). Les programmes sont des informations sportives générales, pas un avis médical. Consultez un médecin avant tout programme sportif.\n\nARTICLE 3 — ABONNEMENT\n19,00€ TTC/mois. Essai gratuit 7 jours — aucun prélèvement avant le 8ème jour. Email de rappel 3 jours avant le premier prélèvement. Renouvellement automatique mensuel. Facture émise pour chaque prélèvement.\n\nARTICLE 4 — DROIT DE RÉTRACTATION\n14 jours à compter de la souscription. Formulaire:\n"À Focus Run — support@focusrun.fr — Je notifie ma rétractation du contrat Focus Run souscrit le [date]. Nom: [nom] — Email: [email]"\nRemboursement sous 14 jours par le même moyen de paiement.\n\nARTICLE 5 — RÉSILIATION\nEn 1 clic depuis le profil. Accès maintenu jusqu'à fin de période. Données conservées 3 ans puis supprimées.\n\nARTICLE 6 — DONNÉES DE SANTÉ (RGPD ART. 9)\nBlessures, post-grossesse, poids, taille, FC = données de santé protégées. Traitement sur base du consentement explicite. Jamais cédées à des tiers commerciaux.\n\nARTICLE 7 — INTELLIGENCE ARTIFICIELLE\nProgrammes générés par IA (Anthropic Claude) — AI Act UE 2024/1689.\n\nARTICLE 8 — MÉDIATION\nCM2C — 14 rue Saint Jean, 75017 Paris — www.cm2c.net\n\nARTICLE 9 — DROIT APPLICABLE\nDroit français.` },
    privacy: { title: "Politique de Confidentialité", text: `RESPONSABLE: Focus Run — support@focusrun.fr\n\nDONNÉES: Email, prénom, âge, données de santé (poids, taille, blessures, FC), données sportives, feedbacks.\n\nBASE LÉGALE: Exécution du contrat + consentement explicite données de santé.\n\nDESTINATAIRES: Anthropic (IA), Stripe (paiement), Supabase (stockage), Vercel (hébergement). Jamais vendues.\n\nDURÉE: Abonnement + 3 ans. Données bancaires: 5 ans.\n\nDROITS: Accès, rectification, effacement, portabilité — support@focusrun.fr\nRéclamation: CNIL — www.cnil.fr` },
    legal: { title: "Mentions Légales", text: `ÉDITEUR: Focus Run — [Forme juridique] — SIRET: [À compléter] — support@focusrun.fr\n\nHÉBERGEMENT: Vercel Inc. — San Francisco, USA\n\nPAIEMENT: Stripe Payments Europe — Dublin, Irlande\n\nIA: Anthropic PBC — San Francisco, USA` },
    refund: { title: "Politique de Remboursement", text: `ESSAI GRATUIT: 7 jours. Aucun prélèvement. Annulation possible à tout moment.\n\nPREMIER PRÉLÈVEMENT: 19€ TTC au 8ème jour. Email de rappel 3 jours avant.\n\nDROIT DE RÉTRACTATION: 14 jours pour remboursement intégral. support@focusrun.fr\n\nRÉSILIATION: 1 clic depuis le profil. Accès maintenu jusqu'à fin de période.\n\nFACTURES: Émises automatiquement pour chaque prélèvement.` }
  };
  const c = content[page];
  return <Sheet onClose={onClose} title={c.title}><div style={{ fontSize: 13, lineHeight: 1.85, color: C.creamDim, whiteSpace: "pre-line" }}>{c.text}</div></Sheet>;
}

// ─── ONBOARDING ───────────────────────────────────────────────────────────────
function Onboarding({ onDone, prenom }) {
  const [step, setStep] = useState(0);
  const steps = [
    { icon: "📋", title: "Ton programme hebdomadaire", desc: "Chaque semaine, un programme complet personnalisé. Clique sur chaque jour pour voir le détail." },
    { icon: "✓", title: "Coche tes séances", desc: "Faite, modifiée ou ratée — ton programme suivant s'adapte automatiquement." },
    { icon: "💬", title: "Feedback de fin de semaine", desc: "Dis-nous comment ça s'est passé. Le programme évolue avec toi chaque semaine." },
  ];
  const s = steps[step];
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.85)", zIndex: 400, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <div style={{ background: C.bg, borderRadius: 24, padding: 32, maxWidth: 360, width: "100%", textAlign: "center" }}>
        <div style={{ fontSize: 52, marginBottom: 16 }}>{s.icon}</div>
        <div style={{ fontFamily: F.title, fontSize: 18, fontWeight: 700, letterSpacing: "0.04em", marginBottom: 12 }}>{s.title}</div>
        <p style={{ color: C.creamDim, fontSize: 15, lineHeight: 1.65, marginBottom: 28 }}>{s.desc}</p>
        <div style={{ display: "flex", gap: 6, justifyContent: "center", marginBottom: 24 }}>
          {steps.map((_, i) => <div key={i} style={{ width: i === step ? 24 : 8, height: 8, borderRadius: 4, background: i === step ? C.yellow : C.borderLight, transition: "all .3s" }} />)}
        </div>
        <Btn full onClick={() => step < steps.length - 1 ? setStep(step + 1) : onDone()}>
          {step < steps.length - 1 ? "Suivant →" : `C'est parti${prenom ? `, ${prenom}` : ""} ! 🚀`}
        </Btn>
      </div>
    </div>
  );
}

// ─── PROFIL COMPLÉTION ────────────────────────────────────────────────────────
const ANIMALS_TOTEM = [
  { emoji: "🐺", nom: "Loup", desc: "Tu cours en meute ou en solitaire, tu vas toujours au bout." },
  { emoji: "🦅", nom: "Aigle", desc: "Tu vois loin, tu attaques les sommets sans regarder en bas." },
  { emoji: "🦁", nom: "Lion", desc: "Tu rugis dans les montées. La douleur ne t'arrête pas." },
  { emoji: "🐯", nom: "Tigre", desc: "Explosif, instinctif. Tu chasses ton chrono comme une proie." },
  { emoji: "🦊", nom: "Renard", desc: "Rusé et économe. Tu gères ton effort mieux que les autres." },
  { emoji: "🐻", nom: "Ours", desc: "Puissant et endurant. Tu avales les km sans te plaindre." },
  { emoji: "🦌", nom: "Cerf", desc: "Léger et élégant. Tu glisses sur les sentiers comme si tu volais." },
  { emoji: "🐆", nom: "Panthère", desc: "Silencieux et redoutable. Tu accélères quand les autres lâchent." },
  { emoji: "🦬", nom: "Bison", desc: "Une force de la nature. Tu passes partout, par tous les temps." },
  { emoji: "🦉", nom: "Hibou", desc: "Stratège. Tu prépares chaque course comme une mission." },
  { emoji: "🐗", nom: "Sanglier", desc: "Inarrêtable. Les pierres, la boue, les côtes — rien ne te résiste." },
  { emoji: "🦎", nom: "Lézard", desc: "Agile et adaptable. Tu trouves toujours ton chemin." },
  { emoji: "🦈", nom: "Requin", desc: "Tu ne t'arrêtes jamais. Avancer, c'est ta nature." },
  { emoji: "🦝", nom: "Raton", desc: "Curieux et malin. Tu explores chaque nouveau sentier." },
  { emoji: "🦔", nom: "Hérisson", desc: "Petit mais costaud. Tu surprends tout le monde à l'arrivée." },
  { emoji: "🐘", nom: "Éléphant", desc: "Mémoire d'acier, endurance infinie. Tu finis toujours ce que tu commences." },
  { emoji: "🦒", nom: "Girafe", desc: "Tu vois plus loin que les autres. Chaque objectif est à ta portée." },
  { emoji: "🦓", nom: "Zèbre", desc: "Unique. Ton style de course, c'est le tien et personne d'autre." },
  { emoji: "🦘", nom: "Kangourou", desc: "Tu bondis d'obstacle en obstacle. L'énergie ne te manque jamais." },
  { emoji: "🦙", nom: "Lama", desc: "Zen et infatigable. Tu montes à toute altitude sans jamais te plaindre." },
];

function ProfilCompletion({ user, onComplete, onSkip }) {
  const [form, setForm] = useState({ ...user, blessures: user.blessures || [], joursDispo: user.joursDispo || {} });
  const [pcStep, setPcStep] = useState(0);
  const setF = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const tog = (k, v) => setForm(f => ({ ...f, [k]: (f[k] || []).includes(v) ? (f[k] || []).filter(x => x !== v) : [...(f[k] || []), v] }));
  const togDispo = (jour) => setForm(f => ({ ...f, joursDispo: { ...f.joursDispo, [jour]: !f.joursDispo?.[jour] } }));

  const steps = [
    { key: "volume",   label: "Volume",   icon: "📊", done: !!form.volume },
    { key: "jours",    label: "Jours",    icon: "📅", done: Object.values(form.joursDispo||{}).some(Boolean) },
    { key: "sante",    label: "Santé",    icon: "🏥", done: (form.blessures || []).length > 0 },
    { key: "perf",     label: "Perfs",    icon: "⚡", done: !!(form.fcMax || form.vma) },
  ];
  const pct = 40 + Math.round((steps.filter(s => s.done).length / steps.length) * 60);

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.8)", zIndex: 400, display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
      <div style={{ background: C.bg, width: "100%", maxWidth: 520, maxHeight: "92vh", overflowY: "auto", borderRadius: "24px 24px 0 0", padding: "24px 20px 40px", animation: "slideUp .35s ease" }}>
        <div style={{ marginBottom: 24 }}>
          <div style={{ fontFamily: F.title, fontSize: 18, fontWeight: 700, letterSpacing: "0.04em", marginBottom: 6, color: C.black }}>TON COACH A BESOIN D'EN SAVOIR PLUS</div>
          <p style={{ color: C.creamDim, fontSize: 14, marginBottom: 16, lineHeight: 1.6, color: "#555" }}>2 minutes pour calibrer chaque séance à la perfection.</p>
          <div style={{ height: 5, background: C.borderLight, borderRadius: 3, overflow: "hidden", marginBottom: 6 }}>
            <div style={{ height: "100%", width: `${pct}%`, background: C.yellow, borderRadius: 3, transition: "width .6s cubic-bezier(.34,1.56,.64,1)" }} />
          </div>
          <div style={{ fontSize: 12, color: C.creamDim }}>Profil complété à <strong style={{ color: C.black }}>{pct}%</strong></div>
          <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
            {steps.map((s, i) => (
              <div key={s.key} onClick={() => setPcStep(i)} style={{ flex: 1, background: s.done ? `${C.success}15` : pcStep === i ? `${C.yellow}25` : C.cardLight, border: `1.5px solid ${s.done ? C.success : pcStep === i ? C.black : C.borderLight}`, borderRadius: 12, padding: "10px 8px", textAlign: "center", cursor: "pointer", transition: "all .25s" }}>
                <div style={{ fontSize: 18, marginBottom: 3 }}>{s.done ? "✓" : s.icon}</div>
                <div style={{ fontSize: 10, color: s.done ? C.success : pcStep === i ? C.black : "#666", fontWeight: s.done || pcStep === i ? 700 : 400 }}>{s.label}</div>
              </div>
            ))}
          </div>
        </div>

        <div key={pcStep} style={{ animation: "slideIn .25s ease" }}>
          {pcStep === 0 && (
            <CL style={{ padding: 16, marginBottom: 14 }}>
              <div style={{ fontFamily: F.title, fontSize: 11, fontWeight: 700, letterSpacing: "0.1em", marginBottom: 4, color: "#555" }}>📊 VOLUME ACTUEL / SEMAINE</div>
              <p style={{ fontSize: 13, color: "#555", marginBottom: 8 }}>Combien de kilomètres tu cours actuellement par semaine ?</p>
              <div style={{ background: `${C.yellow}20`, border: `1px solid ${C.yellow}60`, borderRadius: 10, padding: "10px 14px", marginBottom: 14, fontSize: 12, color: C.black, lineHeight: 1.6 }}>💡 Ton programme démarrera en cohérence avec ce volume — renseigne-le de manière honnête et réaliste pour que la 1ère semaine soit vraiment adaptée à ton niveau actuel.</div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {["Moins de 10km", "10-20km", "20-30km", "30-40km", "40-60km", "Plus de 60km"].map(v => (
                  <Chip key={v} label={v} selected={form.volume === v} onClick={() => { setF("volume", v); setTimeout(() => setPcStep(1), 380); }} />
                ))}
              </div>
              {form.volume && <div style={{ marginTop: 10, fontSize: 13, color: C.success, animation: "fadeIn .3s ease" }}>✓ noté !</div>}
            </CL>
          )}
          {pcStep === 1 && (
            <CL style={{ padding: 16, marginBottom: 14 }}>
              <div style={{ fontFamily: F.title, fontSize: 11, fontWeight: 700, letterSpacing: "0.1em", marginBottom: 4, color: "#555" }}>📅 JOURS DISPONIBLES</div>
              <p style={{ fontSize: 13, color: "#555", marginBottom: 14 }}>Quels jours peux-tu t'entraîner ? Coche tes jours maximum — le programme n'utilisera pas forcément tous ces jours chaque semaine.</p>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {["Lundi","Mardi","Mercredi","Jeudi","Vendredi","Samedi","Dimanche"].map(j => (
                  <Chip key={j} label={j} selected={!!(form.joursDispo || {})[j]} onClick={() => togDispo(j)} />
                ))}
              </div>
              <div style={{ marginTop: 10, fontSize: 12, color: "#888" }}>{Object.values(form.joursDispo||{}).filter(Boolean).length} jour(s) sélectionné(s)</div>
            </CL>
          )}
          {pcStep === 2 && (
            <CL style={{ padding: 16, marginBottom: 14 }}>
              <div style={{ fontFamily: F.title, fontSize: 11, fontWeight: 700, letterSpacing: "0.1em", marginBottom: 4, color: "#555" }}>🐾 TON ANIMAL TOTEM</div>
              <p style={{ fontSize: 13, color: "#555", marginBottom: 16, lineHeight: 1.5 }}>Choisis l'animal qui te ressemble — il apparaîtra sur ton profil.</p>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 14 }}>
                {ANIMALS_TOTEM.map(a => (
                  <div key={a.emoji} onClick={() => setF("animalTotem", a.emoji)}
                    style={{ width: 52, height: 52, borderRadius: 14, border: `2px solid ${form.animalTotem === a.emoji ? C.black : C.borderLight}`, background: form.animalTotem === a.emoji ? C.yellow : "transparent", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 26, cursor: "pointer", transition: "all .15s" }}>
                    {a.emoji}
                  </div>
                ))}
              </div>
              {form.animalTotem && (() => {
                const a = ANIMALS_TOTEM.find(x => x.emoji === form.animalTotem);
                return a ? (
                  <div style={{ background: C.black, borderRadius: 14, padding: "12px 16px", display: "flex", gap: 12, alignItems: "center" }}>
                    <div style={{ fontSize: 32 }}>{a.emoji}</div>
                    <div>
                      <div style={{ fontFamily: F.title, fontSize: 13, fontWeight: 700, color: C.yellow, marginBottom: 3 }}>{a.nom}</div>
                      <div style={{ fontSize: 12, color: "rgba(255,255,255,0.6)", lineHeight: 1.5, fontStyle: "italic" }}>"{a.desc}"</div>
                    </div>
                  </div>
                ) : null;
              })()}
            </CL>
          )}
          {pcStep === 3 && (
            <CL style={{ padding: 16, marginBottom: 14 }}>
              <div style={{ fontFamily: F.title, fontSize: 11, fontWeight: 700, letterSpacing: "0.1em", marginBottom: 12, color: "#555" }}>⚡ DONNÉES DE PERFORMANCE</div>

              {/* Encart VMA */}
              <div style={{ background: "transparent", border: "1px solid #ddd5c0", borderRadius: 14, padding: "14px 16px", marginBottom: 12 }}>
                <div style={{ fontFamily: F.title, fontSize: 13, fontWeight: 700, color: C.black, marginBottom: 6 }}>🏃 VMA — Vitesse Maximale Aérobie</div>
                <div style={{ fontSize: 12, color: "#555", lineHeight: 1.7, marginBottom: 10 }}>
                  Utilisée pour calculer <strong>toutes tes allures d'entraînement</strong> avec précision. Si tu ne l'as pas encore, fais le test avant de générer ton programme puis reviens la renseigner dans <strong>Profil → Modifier</strong>.
                </div>
                <div style={{ background: "#f5f0e4", borderRadius: 10, padding: "10px 14px", fontSize: 12, color: "#444", lineHeight: 1.8, marginBottom: 12 }}>
                  <strong>Test Demi-Cooper (6 minutes) :</strong><br/>
                  ① Échauffement 10min · ② Course 6min à fond sur terrain plat<br/>
                  ③ Mesure la distance parcourue<br/>
                  <strong>VMA (km/h) = distance en mètres ÷ 100</strong><br/>
                  <em>Ex : 1500m en 6min → VMA = 15 km/h</em>
                </div>
                <Input label="VMA (km/h) — optionnel" type="number" value={form.vma || ""} onChange={v => setF("vma", v)} placeholder="Ex: 14.5" hint="test terrain ou labo" />
              </div>

              {/* Encart FCmax */}
              <div style={{ background: "transparent", border: "1px solid #ddd5c0", borderRadius: 14, padding: "14px 16px" }}>
                <div style={{ fontFamily: F.title, fontSize: 13, fontWeight: 700, color: C.black, marginBottom: 6 }}>❤️ FC Max — Fréquence Cardiaque Maximale</div>
                <div style={{ fontSize: 12, color: "#555", lineHeight: 1.7, marginBottom: 10 }}>
                  Indispensable pour les <strong>objectifs trail</strong> — remplace les allures en min/km par des <strong>zones FC personnalisées</strong> adaptées à ton cœur. Plus précis sur terrain varié. Rentre la valeur dans <strong>Profil → Modifier</strong> après le test.
                </div>
                <div style={{ background: "#f5f0e4", borderRadius: 10, padding: "10px 14px", fontSize: 12, color: "#444", lineHeight: 1.8, marginBottom: 12 }}>
                  <strong>2 méthodes :</strong><br/>
                  ① <strong>Ta montre GPS</strong> — FC max visible dans ton historique de course intense<br/>
                  ② <strong>Formule rapide</strong> — 220 − ton âge (approximatif)<br/>
                  <em>💡 Fais le test, rentre la valeur, ton programme trail sera calibré sur ton cœur.</em>
                </div>
                <Input label="FC Max (bpm) — optionnel" type="number" value={form.fcMax || ""} onChange={v => setF("fcMax", v)} placeholder="Ex: 185" hint="bpm — montre GPS" />
              </div>
            </CL>
          )}
        </div>

        <div style={{ display: "flex", gap: 10, marginBottom: 12 }}>
          {pcStep > 0 && <Btn variant="outline" onClick={() => setPcStep(pcStep - 1)} style={{ flex: 1 }}>← Retour</Btn>}
          {pcStep < steps.length - 1 && <Btn onClick={() => setPcStep(pcStep + 1)} style={{ flex: 1 }}>Suivant →</Btn>}
          {pcStep === steps.length - 1 && <Btn full onClick={() => onComplete(form)} style={{ minHeight: 52 }}>Enregistrer →</Btn>}
        </div>
        <button onClick={onSkip} style={{ background: "none", border: "none", color: C.creamDim, fontSize: 13, cursor: "pointer", textAlign: "center", padding: "8px 0", textDecoration: "underline", display: "block", width: "100%" }}>Compléter plus tard</button>
      </div>
    </div>
  );
}


// ─── DAY CARD ─────────────────────────────────────────────────────────────────
function DayCard({ day, onMark }) {
  const [open, setOpen] = useState(false);
  if (!day) return null;
  if (day.isRest) return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 4px", opacity: .4 }}>
      <div style={{ width: 3, height: 28, borderRadius: 2, background: "#ddd" }} />
      <div style={{ fontSize: 12, color: "#999", fontFamily: F.title, letterSpacing: ".05em" }}>{day.jour} — Repos</div>
    </div>
  );
  const isDone = day.status === "done";
  const isMiss = day.status === "missed";
  const dotColor = "#d4ff00"; // jaune fluo DA Focus Run

  return (
    <div style={{ borderRadius: 16, marginBottom: 10, overflow: "hidden", border: `1px solid ${isDone?"#22C55E30":isMiss?"#EF444415":"#ddd5c0"}`, background: isDone?"rgba(34,197,94,0.06)":isMiss?"rgba(239,68,68,0.04)":"transparent", opacity: isMiss?.75:1 }}>
      <div onClick={() => setOpen(o=>!o)} style={{ padding: "13px 16px", display: "flex", alignItems: "center", gap: 12, cursor: "pointer" }}>
        <div style={{ width: 10, height: 10, borderRadius: "50%", background: isDone?"#22C55E":isMiss?"#EF4444":"#d4ff00", flexShrink: 0 }} />
        <div style={{ flex: 1 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 2 }}>
            <span style={{ fontFamily: F.title, fontSize: 14, fontWeight: 700, color: "#1a1a1a" }}>{day.titre||day.type}</span>
            {isDone && <span style={{ fontSize: 11, color: "#22C55E", fontWeight: 700 }}>✓ Faite</span>}
            {isMiss && <span style={{ fontSize: 11, color: "#EF4444", fontWeight: 700 }}>✗ Ratée</span>}
          </div>
          <div style={{ fontSize: 12, color: "#888" }}>⏱ {day.duree} · {day.jour}</div>
        </div>
        <div style={{ fontSize: 14, color: "#aaa", transform: open?"rotate(180deg)":"rotate(0)", transition: "transform .2s" }}>▾</div>
      </div>
      {open && (
        <div style={{ borderTop: "1px solid #f0ead6", padding: "12px 16px 14px" }}>
          {day.objectif && <div style={{ fontSize: 13, color: "#555", fontStyle: "italic", marginBottom: 10, lineHeight: 1.5 }}>🎯 {day.objectif}</div>}
          {day.detail && (
            <div style={{ fontSize: 13, lineHeight: 1.8 }}>
              {day.detail.split("\n").map((line, i) => {
                if (!line.trim()) return <div key={i} style={{ height: 6 }} />;
                const isNote = line.startsWith("💡");
                const isBullet = line.startsWith("✦");
                return (
                  <div key={i} style={{
                    color: isNote ? "#888" : "#333",
                    fontSize: isNote ? 12 : 13,
                    paddingLeft: isBullet ? 10 : 0,
                    borderLeft: isBullet ? "2px solid #d4ff0060" : "none",
                    marginBottom: isBullet ? 4 : 0,
                  }}>{line}</div>
                );
              })}
            </div>
          )}
          {!isDone && !isMiss && (
            <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
              <button onClick={() => onMark("done")} style={{ flex: 1, background: "#f0faf5", color: "#22C55E", border: "1px solid #22C55E40", borderRadius: 10, padding: "9px", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>✓ Faite</button>
              <button onClick={() => onMark("missed")} style={{ flex: 1, background: "#fff8f8", color: "#EF4444", border: "1px solid #EF444430", borderRadius: 10, padding: "9px", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>✗ Ratée</button>
            </div>
          )}
          {(isDone||isMiss) && <button onClick={() => onMark(null)} style={{ marginTop: 8, background: "none", border: "none", color: "#aaa", fontSize: 12, cursor: "pointer", textDecoration: "underline" }}>Annuler</button>}
        </div>
      )}
    </div>
  );
}


function JoursDispoSelector({ value, onChange }) {
  const dispo = value || {};
  return (
    <div>
      {JOURS_SEMAINE.map(jour => (
        <div key={jour} style={{ marginBottom: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: dispo[jour] !== undefined ? 10 : 0 }}>
            <div onClick={() => { const d = { ...dispo }; if (d[jour] !== undefined) delete d[jour]; else d[jour] = "1h"; onChange(d); }}
              style={{ width: 24, height: 24, borderRadius: 6, border: `2px solid ${dispo[jour] !== undefined ? C.black : C.borderLight}`, background: dispo[jour] !== undefined ? C.yellow : "transparent", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", transition: "all .2s", cursor: "pointer" }}>
              {dispo[jour] !== undefined && <span style={{ fontSize: 13, fontWeight: 700 }}>✓</span>}
            </div>
            <div style={{ fontWeight: dispo[jour] !== undefined ? 700 : 400, fontSize: 15, flex: 1 }}>{jour}</div>
            {dispo[jour] !== undefined && <div style={{ fontSize: 13, color: C.creamDim }}>{dispo[jour]}</div>}
          </div>
          {dispo[jour] !== undefined && (
            <div style={{ display: "flex", gap: 6, paddingLeft: 34, flexWrap: "wrap" }}>
              {DUREES_DISPO.map(d => (
                <div key={d} onClick={() => { const nd = { ...dispo }; nd[jour] = d; onChange(nd); }}
                  style={{ padding: "8px 12px", borderRadius: 50, border: `1.5px solid ${dispo[jour] === d ? C.black : C.borderLight}`, background: dispo[jour] === d ? C.yellow : "transparent", fontSize: 13, cursor: "pointer", fontWeight: dispo[jour] === d ? 700 : 400, minHeight: 38, display: "flex", alignItems: "center" }}>
                  {d}{d === "2h+" ? " 🏃" : ""}
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
      <div style={{ background: C.cardLight, border: `1px solid ${C.borderLight}`, borderRadius: 10, padding: "10px 14px", fontSize: 13, color: C.creamDim, marginTop: 4, lineHeight: 1.6 }}>
        💡 Les jours et durées indiqués sont tes <strong style={{ color: C.black }}>maximums disponibles</strong>. Ton coach décide ce qui est utile. Changement durable ? Modifie ici. Changement exceptionnel ? Note-le dans ton feedback.
      </div>
    </div>
  );
}

// ─── OBJECTIF FORM ────────────────────────────────────────────────────────────
function ObjectifForm({ onSave, onCancel, showSeances = true, showParallel = false, existingObjectifs = [], initialData = null }) {
  const [obj, setObj] = useState(initialData || {
    nom: "", objectifType: "", isTrail: true, nomCourse: "", dateCourse: "", dateDebut: "",
    distanceCourseKm: "", deniveléCourse: "", distanceCourse: "",
    motivation: "", chronoCible: "", chronoActuel: "", distanceChrono: "",
    seancesObj: "", isParallel: false, joursDispo: {}
  });
  const [showAutreRoute, setShowAutreRoute] = useState(false);
  const set = (k, v) => setObj(o => ({ ...o, [k]: v }));

  return (
    <div>
      <Input label="Nom de ta course" value={obj.nom} onChange={v => set("nom", v)} placeholder="Ex: Trail des Crêtes, Marathon de Lyon, UTMB…" />

      {/* Question 1 — Type principal */}
      <div style={{ fontSize: 12, color: C.creamDim, textTransform: "uppercase", letterSpacing: "0.12em", marginBottom: 10 }}>Quel est ton objectif ?</div>
      <div style={{ display: "flex", gap: 10, marginBottom: 20 }}>
        {[["🏃 Garder la forme", "forme"], ["🎯 Préparer une course", "course"]].map(([label, val]) => (
          <div key={val} onClick={() => set("objectifType", val)}
            style={{ flex: 1, padding: "18px 14px", borderRadius: 16, border: `2px solid ${obj.objectifType === val ? C.black : C.borderLight}`, background: obj.objectifType === val ? C.yellow : "transparent", cursor: "pointer", textAlign: "center", fontFamily: F.title, fontSize: 14, fontWeight: 700, letterSpacing: "0.04em", transition: "all .15s", WebkitTapHighlightColor: "transparent" }}>
            {label}
          </div>
        ))}
      </div>

      {/* Si "Préparer une course" */}
      {obj.objectifType === "course" && (
        <div>
          {/* Trail ou Route */}
          <div style={{ fontSize: 12, color: C.creamDim, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 10 }}>Type de course</div>
          <div style={{ display: "flex", gap: 10, marginBottom: 16 }}>
            <div onClick={() => set("isTrail", true)} style={{ flex: 1, padding: "14px", borderRadius: 14, border: `2px solid ${obj.isTrail ? C.black : C.borderLight}`, background: obj.isTrail ? C.yellow : "transparent", cursor: "pointer", textAlign: "center", fontFamily: F.title, fontSize: 14, fontWeight: 700, transition: "all .15s" }}>⛰️ Trail</div>
            <div onClick={() => set("isTrail", false)} style={{ flex: 1, padding: "14px", borderRadius: 14, border: `2px solid ${!obj.isTrail ? C.black : C.borderLight}`, background: !obj.isTrail ? C.yellow : "transparent", cursor: "pointer", textAlign: "center", fontFamily: F.title, fontSize: 14, fontWeight: 700, transition: "all .15s" }}>🛣️ Route</div>
          </div>


          <Input label="Date de la course" type="date" value={obj.dateCourse} onChange={v => set("dateCourse", v)} />

          {/* Distance */}
          {obj.isTrail ? (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 16 }}>
              <Input label="Distance exacte (km)" type="number" value={obj.distanceCourseKm} onChange={v => { set("distanceCourseKm", v); set("distanceCourse", v + "km"); }} placeholder="Ex: 47" hint="Distance précise" />
              <Input label="Dénivelé D+" value={obj.deniveléCourse} onChange={v => set("deniveléCourse", v)} placeholder="Ex: 2800m" hint="D+ total" />
            </div>
          ) : (
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 12, color: C.creamDim, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 8 }}>Distance</div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
                {DISTANCES_ROUTE_CHIPS.map(d => <Chip key={d} label={d} selected={obj.distanceCourse === d && !showAutreRoute} onClick={() => { set("distanceCourse", d); setShowAutreRoute(false); }} />)}
                <Chip label="Autre" selected={showAutreRoute} onClick={() => { setShowAutreRoute(true); set("distanceCourse", ""); }} />
              </div>
              {showAutreRoute && <Input label="Distance exacte" value={obj.autreDistanceRoute || ""} onChange={v => { set("autreDistanceRoute", v); set("distanceCourse", v); }} placeholder="Ex: 30km, 15km…" />}
              <div style={{ background: `${C.blue}12`, border: `1px solid ${C.blue}30`, borderRadius: 10, padding: "10px 14px", fontSize: 13, color: C.creamDim }}>ℹ️ Course sur route — programme calibré asphalte, sans dénivelé.</div>
            </div>
          )}

          {/* Motivation */}
          <div style={{ fontSize: 12, color: C.creamDim, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 10 }}>Ton objectif pour cette course</div>
          <div style={{ display: "flex", gap: 10, marginBottom: 16 }}>
            {[["🏁 La terminer", "finir"], ["⏱ Objectif chrono", "chrono"]].map(([label, val]) => (
              <div key={val} onClick={() => set("motivation", val)}
                style={{ flex: 1, padding: "14px", borderRadius: 14, border: `2px solid ${obj.motivation === val ? C.black : C.borderLight}`, background: obj.motivation === val ? C.yellow : "transparent", cursor: "pointer", textAlign: "center", fontFamily: F.title, fontSize: 13, fontWeight: 700, transition: "all .15s" }}>
                {label}
              </div>
            ))}
          </div>

          {/* Chrono — distance déjà connue, on demande juste les chronos */}
          {obj.motivation === "chrono" && (
            <CL style={{ marginBottom: 16, padding: 16 }}>
              <div style={{ fontFamily: F.title, fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", marginBottom: 4, color: C.creamDim }}>OBJECTIF CHRONO</div>
              <p style={{ fontSize: 13, color: C.creamDim, marginBottom: 14, lineHeight: 1.5 }}>Sur {obj.distanceCourseKm ? `${obj.distanceCourseKm}km` : obj.distanceCourse || "cette distance"}.</p>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <Input label="Chrono actuel (optionnel)" value={obj.chronoActuel} onChange={v => set("chronoActuel", v)} placeholder="Ex: 3h45, 52'30, environ 1h…" hint="Optionnel si jamais couru cette distance" />
                <Input label="Chrono visé" value={obj.chronoCible} onChange={v => set("chronoCible", v)} placeholder="Ex: 48'00" hint="Ton objectif le jour J" />
              </div>
            </CL>
          )}
        </div>
      )}

      {/* Date de début */}
      

      {showSeances && (
        <CL style={{ marginBottom: 14, padding: 16 }}>
          <div style={{ fontFamily: F.title, fontSize: 12, fontWeight: 700, letterSpacing: "0.08em", marginBottom: 8, color: C.creamDim }}>TES JOURS DISPONIBLES</div>
          <p style={{ fontSize: 12, color: C.creamDim, marginBottom: 8, lineHeight: 1.5 }}>Coche tes jours maximum — le programme n'utilisera pas forcément tous ces jours chaque semaine.</p>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {["Lundi","Mardi","Mercredi","Jeudi","Vendredi","Samedi","Dimanche"].map(j => (
              <Chip key={j} label={j} selected={!!(obj.joursDispo || {})[j]}
                onClick={() => {
                const jd = {...(obj.joursDispo||{})};
                if(jd[j]) delete jd[j]; else jd[j] = true;
                set("joursDispo", jd);
              }} />
            ))}
          </div>
          <div style={{ marginTop: 10, fontSize: 12, color: C.creamDim, lineHeight: 1.6 }}>
            Les jours et durées indiqués sont tes <strong>maximums disponibles</strong>. Ton coach décide ce qui est utile.
          </div>
        </CL>
      )}



      {/* Alerte programme court */}
      {obj.dateCourse && (() => {
        const tw = Math.ceil((new Date(obj.dateCourse + "T00:00:00") - (() => { const t = new Date(); t.setHours(0,0,0,0); return t; })()) / (7*24*60*60*1000));
        if (tw > 0 && tw < 6) return (
          <div style={{ background: "#fff8e6", border: "1px solid #f0d060", borderRadius: 12, padding: "12px 14px", marginBottom: 14, fontSize: 13, color: "#7a5c00", lineHeight: 1.6 }}>
            ⚠️ <strong>Programme court ({tw} semaine{tw > 1 ? "s" : ""})</strong><br/>
            Avec si peu de temps, la périodisation sera compressée et pas 100% optimale. Le programme fera le maximum mais nous te recommandons un minimum de 6 semaines pour un résultat vraiment adapté.
          </div>
        );
        return null;
      })()}

      {/* Alerte incohérence VMA / chrono cible */}
      {obj.motivation === "chrono" && obj.chronoCible && obj.distanceCourseKm && user.vma && (() => {
        const incoh = detectIncoh(user, obj);
        if (!incoh) return null;
        return (
          <div style={{ background: "#FF880012", border: "1.5px solid #FF880050", borderRadius: 12, padding: "12px 14px", marginBottom: 14, fontSize: 13, color: "#7a5c00", lineHeight: 1.6 }}>
            ⚠️ <strong>Chrono ambitieux</strong><br/>
            Ton chrono cible ({incoh.allureObj}/km) semble difficile à atteindre avec ta VMA actuelle de {user.vma} km/h (allure théorique ~{incoh.allureTheo}/km). Le programme s'adaptera mais pense à remettre à jour ta VMA si elle a évolué.
          </div>
        );
      })()}

      <div style={{ display: "flex", gap: 10 }}>
        <Btn full onClick={() => obj.nom && obj.objectifType && onSave(obj)} disabled={!obj.nom || !obj.objectifType}>
          {initialData ? "Enregistrer →" : "Créer cet objectif →"}
        </Btn>
        {onCancel && <Btn variant="outline" onClick={onCancel} style={{ flexShrink: 0 }}>Annuler</Btn>}
      </div>
    </div>
  );
}

// ─── HISTORIQUE RICH ──────────────────────────────────────────────────────────
function HistoriqueRich({ history }) {
  if (!history?.length) return <div style={{ textAlign: "center", padding: "32px 20px", color: C.creamDim, fontSize: 14 }}>Aucune semaine enregistrée pour le moment.</div>;
  const emojiMap = { "😊 Parfait": "😊", "😎 Trop facile": "😎", "😤 Difficile": "😤", "😵 Trop dur": "😵" };
  const colorMap = { "😊 Parfait": C.success, "😎 Trop facile": C.blue, "😤 Difficile": C.yellow, "😵 Trop dur": C.danger };
  const labelMap = { easy: "Endurance", interval: "Fractionné", tempo: "Tempo", long: "Sortie longue" };
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {history.slice().reverse().map((w, i) => (
        <div key={i} style={{ background: C.cardLight, border: `1px solid ${C.borderLight}`, borderRadius: 18, overflow: "hidden" }}>
          <div style={{ background: C.black, padding: "14px 18px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <div style={{ fontFamily: F.title, fontSize: 13, fontWeight: 700, letterSpacing: "0.06em", color: C.cream }}>SEMAINE {w.week}</div>
              {w.volume && <div style={{ fontSize: 12, color: C.creamDim, marginTop: 2 }}>~{w.volume}km estimés</div>}
            </div>
            {w.rating && (
              <div style={{ background: `${colorMap[w.rating] || C.borderLight}25`, border: `1px solid ${colorMap[w.rating] || C.borderLight}40`, borderRadius: 50, padding: "4px 12px", display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ fontSize: 16 }}>{emojiMap[w.rating] || "?"}</span>
                <span style={{ fontSize: 12, color: colorMap[w.rating] || C.creamDim, fontWeight: 700 }}>{w.rating?.split(" ").slice(1).join(" ")}</span>
              </div>
            )}
          </div>
          {w.seancesTypes?.length > 0 && <div style={{ padding: "12px 18px 0", display: "flex", gap: 8, flexWrap: "wrap" }}>{w.seancesTypes.map((type, ti) => <div key={ti} style={{ background: "#e4dcc8", borderRadius: 50, padding: "4px 12px", fontSize: 12, color: C.creamDim }}>{labelMap[type] || type}</div>)}</div>}
          {w.commentaire && <div style={{ padding: "10px 18px", margin: "10px 18px 0", background: "#e8e0cc", borderRadius: 10, fontSize: 13, color: C.creamDim, fontStyle: "italic" }}>"{w.commentaire}"</div>}
          {w.seancesModifs && <div style={{ padding: "8px 18px 0", fontSize: 12, color: C.blue }}>⚡ {w.seancesModifs}</div>}
          <div style={{ height: 14 }} />
        </div>
      ))}
    </div>
  );
}

// ─── FAQ ──────────────────────────────────────────────────────────────────────
const FAQ_DATA = [
  { cat: "🤕 Blessures & Douleurs", qs: [{ q: "J'ai une douleur pendant ma séance ?", r: "Arrête. Marche doucement. Si ça disparaît, reprends très doucement. Si ça persiste — repos 48h et note-le dans ton profil." }, { q: "Des courbatures, je cours ?", r: "Oui si c'est léger. Une sortie facile accélère même la récupération. Si douleur articulaire — attends." }, { q: "Je reviens de blessure ?", r: "Commence à 60% du volume. Rien d'intense les 2 premières semaines. Note ta blessure dans ton profil." }] },
  { cat: "📅 Organisation", qs: [
    { q: "J'ai raté une séance, je la rattrape ?", r: "Non. Note-le dans ton feedback — le programme s'adapte. Vaut mieux une semaine incomplète qu'une surcharge." },
    { q: "Vélo ou natation les jours de repos ?", r: "Oui, 30-45 min léger. Évite les efforts intenses." },
    { q: "Je suis en vacances ?", r: "Note-le dans ton feedback avec le nombre de séances possibles." },
    { q: "Je veux changer le jour d'une séance — c'est grave ?", r: "Non, pas grave du tout. L'essentiel : ne pas enchaîner deux séances intensives (seuil, fractionné, VMA) jours consécutifs, et garder les sorties longues de préférence le weekend. Le reste, adapte librement." },
    { q: "Pourquoi mon objectif dans moins de 6 semaines donne un programme différent ?", r: "Avec moins de 6-7 semaines avant ta course, une périodisation complète n'est pas possible. Le moteur passe directement en phase Spécifique ou Affûtage. L'objectif : consolider ta forme et arriver frais le jour J." },
  ] },
  { cat: "📈 Progression", qs: [{ q: "Comment je sais si je progresse ?", r: "Regarde ton historique — le volume monte, les ressentis s'améliorent. Visible sur 4-6 semaines." }, { q: "Mon programme semble trop facile ?", r: "Dis-le dans ton feedback. La progression se joue sur le moyen terme." }, { q: "Comment calculer ma VMA pour la renseigner dans mon profil ?", r: "Test demi-Cooper (6 minutes) : cours le plus vite possible pendant 6min sur terrain plat. Distance parcourue (en km) ÷ 0.1 = ta VMA en km/h. Exemple : 1400m en 6min → VMA = 14 km/h. Plus ta VMA est précise, plus tes allures de séances sont calibrées." },
    { q: "Comment calculer ma FC max ?", r: "La formule 220 - âge est approximative. Méthode terrain : après 10min d'échauffement, fais 2×3min à fond avec 3min de récup — la FC la plus haute vue est ta FCmax. Renseigne-la dans Profil → Modifier pour que tes séances incluent les zones cardiaques." },
    { q: "J'ai une course dans 3 semaines ?", r: "Si la date est dans ton objectif, le programme passe automatiquement en affûtage." },
    { q: "Pourquoi les séances changent de jour d'une semaine à l'autre ?", r: "C'est voulu. Le moteur fait tourner les séances sur tes jours disponibles pour éviter la monotonie. L'EF n'est pas toujours le lundi, le seuil pas toujours le mardi — variation intentionnelle. La sortie longue reste toujours en fin de semaine sur un jour coché, et jamais deux séances intenses ne sont placées jours consécutifs." }] },
  { cat: "🍌 Ravitaillement", qs: [{ q: "Je dois manger pendant une longue sortie ?", r: "Oui, à partir de 1h30. 30-40g de glucides/heure. Commence avant d'avoir faim." }, { q: "Comment tester mon ravitaillement ?", r: "Entraîne-toi avec exactement ce que tu mangeras en course. Tout se teste à l'entraînement." }, { q: "Combien boire ?", r: "400-600ml/heure par temps frais, 600-800ml en été. Bois avant d'avoir soif." }] },
    { cat: "⛰️ Trail & Dénivelé", qs: [
    { q: "Mon objectif trail a beaucoup de D+ — comment ça s'intègre dans mon programme ?", r: "Le dénivelé que tu renseignes influence directement ton programme : les durées des sorties longues, les types de séances et les conseils dans chaque séance. Plus ton D+ est élevé, plus les sorties longues seront longues en durée et orientées montagne." },
    { q: "100m de D+ équivaut à combien de km en termes d'effort ?", r: "La règle pratique du trail : 100m de D+ ≈ 1km supplémentaire en termes d'effort et de temps. Une sortie de 15km avec 600m D+ équivaut à environ 21km sur le plat. Tu peux donc ajuster : si ton programme dit 1h30 de sortie longue et que tu fais plus de D+, ta sortie sera naturellement plus longue en temps — c'est normal et voulu." },
    { q: "Pourquoi les séances trail n'affichent pas d'allures en min/km ?", r: "En trail, les allures en min/km n'ont aucun sens sur terrain technique et vallonné. Le programme te guide en effort perçu (tu peux parler, phrases courtes, 1 mot à la fois) et en fréquence cardiaque si tu as renseigné ta FCmax dans ton profil." },
    { q: "Le D+ de mes sorties dépasse ce qui est prévu — c'est grave ?", r: "Non, c'est même très bien. Le D+ cumulé en entraînement peut être supérieur à ce qu'indique le programme — le programme donne une indication de durée, pas de D+ précis. Si tu fais plus de dénivelé sur une sortie longue, c'est bénéfique tant que tu restes à allure facile." },
    { q: "Mes séances côtes ne ressemblent pas à de vraies montées de trail — c'est utile quand même ?", r: "Oui, totalement. Les séances côtes développent la puissance spécifique à la montée, même sur une côte de 50m. L'objectif est de renforcer les appuis, les fessiers et les mollets — exactement les muscles sollicités en montée trail." },
  ] },
  { cat: "🎽 Jour de Course", qs: [{ q: "Comment gérer mon allure au départ ?", r: "Pars 10% plus lentement les 2 premiers km. L'euphorie du départ est le piège n°1." }, { q: "Que faire la veille ?", r: "Pas de séance. Marche 15 min max. Mange tes habitudes, dors tôt, hydrate-toi." }, { q: "Comment gérer un passage difficile ?", r: "Ralentis, marche si nécessaire. Le passage difficile passe toujours." }] },
];

function CoachFAQ() {
  const [openCat, setOpenCat] = useState(null);
  const [openQ, setOpenQ] = useState(null);
  return (
    <div style={{ paddingBottom: 20 }}>
      <div style={{ marginBottom: 20 }}><h2 style={{ fontFamily: F.title, fontSize: 20, fontWeight: 700, letterSpacing: "0.04em", marginBottom: 6 }}>FAQ COACH</h2><p style={{ color: C.creamDim, fontSize: 14 }}>Les réponses aux questions que tout coureur se pose.</p></div>
      {FAQ_DATA.map((cat, ci) => (
        <CL key={cat.cat} style={{ marginBottom: 10, padding: 0, overflow: "hidden" }}>
          <div onClick={() => setOpenCat(openCat === ci ? null : ci)} style={{ padding: "16px 18px", cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center", minHeight: 56 }}>
            <div style={{ fontFamily: F.title, fontSize: 14, fontWeight: 700, letterSpacing: "0.04em" }}>{cat.cat}</div>
            <div style={{ fontSize: 24, color: C.creamDim, transition: "transform .2s", transform: openCat === ci ? "rotate(45deg)" : "none", flexShrink: 0 }}>+</div>
          </div>
          {openCat === ci && <div style={{ borderTop: `1px solid ${C.borderLight}` }}>{cat.qs.map((item, qi) => (
            <div key={qi} style={{ borderBottom: qi < cat.qs.length - 1 ? `1px solid ${C.borderLight}` : "none" }}>
              <div onClick={() => setOpenQ(openQ === `${ci}-${qi}` ? null : `${ci}-${qi}`)} style={{ padding: "14px 18px", cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 14, minHeight: 52 }}>
                <div style={{ fontSize: 14, fontWeight: 600, lineHeight: 1.4 }}>{item.q}</div>
                <div style={{ fontSize: 18, color: C.creamDim, flexShrink: 0, transition: "transform .2s", transform: openQ === `${ci}-${qi}` ? "rotate(90deg)" : "none" }}>›</div>
              </div>
              {openQ === `${ci}-${qi}` && <div style={{ padding: "0 18px 14px", fontSize: 14, color: C.creamDim, lineHeight: 1.7 }}>{item.r}</div>}
            </div>
          ))}</div>}
        </CL>
      ))}
    </div>
  );
}

// ─── SPLASH ───────────────────────────────────────────────────────────────────
function Splash({ onStart, onLogin }) {
  const [v, setV] = useState(false);
  useEffect(() => { setTimeout(() => setV(true), 80); }, []);
  return (
    <div style={{ background: C.black, minHeight: "100dvh", display: "flex", flexDirection: "column" }}>
      <div style={{ padding: "20px 24px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ fontFamily: F.title, fontSize: 17, color: C.cream, fontWeight: 700, letterSpacing: "0.12em", opacity: v ? 1 : 0, transition: "opacity .6s" }}>FOCUS <span style={{ background: C.yellow, color: C.black, padding: "1px 6px", borderRadius: 3 }}>RUN</span></div>
        <button onClick={onLogin} style={{ background: "transparent", border: "none", color: C.creamDim, fontFamily: F.body, fontSize: 14, cursor: "pointer", opacity: v ? 1 : 0, transition: "opacity .8s .2s", padding: "8px 0", minHeight: 44 }}>Se connecter →</button>
      </div>
      <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", textAlign: "center", padding: "0 24px 100px" }}>
        <div style={{ opacity: v ? 1 : 0, transform: v ? "none" : "translateY(24px)", transition: "all .7s .1s" }}>
          <h1 style={{ fontFamily: F.title, fontSize: "clamp(72px,22vw,140px)", lineHeight: .88, fontWeight: 700, color: C.cream, margin: 0, letterSpacing: "0.04em" }}>FOCUS<br /><span style={{ background: C.yellow, color: C.black, padding: "4px 14px", borderRadius: 10, display: "inline-block", lineHeight: 1.05 }}>RUN</span></h1>
        </div>
        <div style={{ opacity: v ? 1 : 0, transform: v ? "none" : "translateY(20px)", transition: "all .7s .35s", marginTop: 40 }}>
          <p style={{ fontSize: "clamp(17px,4vw,22px)", color: C.creamDim, lineHeight: 1.5, maxWidth: 360, margin: "0 auto" }}><span style={{ color: C.cream, fontWeight: 700, fontFamily: F.title, letterSpacing: "0.06em" }}>DEVIENT FINISHER.</span><br />Ton objectif, notre plan.</p>
        </div>
        <div style={{ opacity: v ? 1 : 0, transform: v ? "none" : "translateY(16px)", transition: "all .7s .55s", marginTop: 40, width: "100%", maxWidth: 320 }}>
          <Btn full onClick={onStart} style={{ fontSize: 17, padding: "17px" }}>Commencer mon plan →</Btn>
        </div>
      </div>
    </div>
  );
}

// ─── LANDING ──────────────────────────────────────────────────────────────────
function Landing({ onLogin, onRegister }) {
  const [openFaq, setOpenFaq] = useState(null);
  const [legalPage, setLegalPage] = useState(null);
  const proof = [
    { name: "Mathieu T.", race: "Ultra Trail 80km", stars: 5, quote: "En 3 mois j'ai terminé mon premier 80km. Mon plan était calibré à la perfection." },
    { name: "Sophie R.", race: "Trail 40km", stars: 5, quote: "Le programme s'adaptait chaque semaine. J'ai couru sans blessure pour la première fois." },
    { name: "Karim B.", race: "Marathon montagne", stars: 5, quote: "Finisher en 4h12. Mon plan était chirurgical. Je recommence pour un ultra 100km." },
    { name: "Laura M.", race: "Reprise post-opération", stars: 5, quote: "Opérée du genou, j'avais peur de ne jamais recourir. 6 mois plus tard j'ai fini un trail 15km." },
    { name: "Thomas D.", race: "Débutant → Trail 25km", stars: 5, quote: "Je ne courais pas du tout. 8 mois plus tard j'ai terminé mon premier trail." },
    { name: "Anaïs P.", race: "Running & Trail", stars: 5, quote: "Mes perfs stagnaient depuis 2 ans. En 6 semaines j'ai explosé mon record sur 10km." },
  ];
  const faqs = [
    { q: "C'est pour quel niveau ?", r: "Du débutant absolu au coureur expert. Le programme s'adapte à ton niveau exact, même si tu pars de zéro." },
    { q: "Trail ou running — ça fonctionne pour les deux ?", r: "Oui. Montagne, forêt, route — calibré selon ta pratique et ton dénivelé typique." },
    { q: "Et si je suis en reprise de blessure ?", r: "Tu indiques ta blessure — reprise ultra progressive et sécurisée." },
    { q: "Le programme s'adapte vraiment ?", r: "Oui. Chaque fin de semaine, ton ressenti recalibre la suivante — volume, intensité, séances." },
    { q: "Puis-je annuler à tout moment ?", r: "Oui, en un clic depuis ton profil." },
  ];
  return (
    <div style={{ fontFamily: F.body, color: C.black, overflowX: "hidden" }}>
      {legalPage && <LegalPage page={legalPage} onClose={() => setLegalPage(null)} />}
      <div style={{ background: C.cream, borderBottom: `1px solid ${C.borderLight}`, padding: "14px 20px", display: "flex", justifyContent: "space-between", alignItems: "center", position: "sticky", top: 0, zIndex: 50 }}>
        <div style={{ fontFamily: F.title, fontSize: 18, fontWeight: 700, letterSpacing: "0.1em" }}>FOCUS <span style={{ background: C.yellow, padding: "1px 6px", borderRadius: 3 }}>RUN</span></div>
        <div style={{ display: "flex", gap: 8 }}>
          <Btn variant="ghost" small onClick={onLogin} style={{ fontSize: 14 }}>Connexion</Btn>
          <Btn small onClick={onRegister} style={{ fontSize: 14, padding: "11px 20px" }}>Commencer →</Btn>
        </div>
      </div>
      <div style={{ background: `linear-gradient(150deg,${C.cream} 0%,#e8e0cc 100%)`, padding: "64px 20px 56px", textAlign: "center" }}>
        <Tag>Trail · Running · Performance</Tag>
        <h1 style={{ fontFamily: F.title, fontSize: "clamp(44px,12vw,80px)", lineHeight: .92, margin: "20px 0 16px", fontWeight: 700, letterSpacing: "0.04em" }}>DEVIENT<br /><span style={{ background: C.yellow, padding: "2px 12px", borderRadius: 8, display: "inline-block" }}>FINISHER.</span></h1>
        <p style={{ fontSize: "clamp(15px,4vw,17px)", color: C.creamDim, maxWidth: 440, margin: "0 auto 12px", lineHeight: 1.7 }}>Ton objectif, notre plan. Un programme trail & running qui s'adapte à toi, semaine après semaine.</p>
        <p style={{ fontSize: 13, color: C.creamDim, marginBottom: 28 }}>Débutant ou confirmé · Trail ou running · 7 jours d'essai gratuit</p>
        <Btn full onClick={onRegister} style={{ maxWidth: 340, margin: "0 auto", display: "block", fontSize: 16 }}>Accéder à mon programme →</Btn>
        <button onClick={onLogin} style={{ background: "none", border: "none", color: C.creamDim, fontSize: 14, marginTop: 14, cursor: "pointer", textDecoration: "underline" }}>J'ai déjà un compte</button>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", background: `${C.black}06`, borderRadius: 16, maxWidth: 480, margin: "36px auto 0", border: `1px solid ${C.black}10` }}>
          {[["+2 400", "Finishers"], ["98%", "Satisfaits"], ["7j/7", "Adaptatif"], ["< 2min", "Démarrage"]].map(([n, l], i, arr) => (
            <div key={l} style={{ textAlign: "center", padding: "16px 8px", borderRight: i < arr.length - 1 ? `1px solid ${C.black}10` : "none" }}>
              <div style={{ fontFamily: F.title, fontSize: 20, fontWeight: 700 }}>{n}</div>
              <div style={{ fontSize: 10, color: C.creamDim, letterSpacing: "0.1em", textTransform: "uppercase", marginTop: 3 }}>{l}</div>
            </div>
          ))}
        </div>
      </div>
      <div style={{ background: C.black, padding: "52px 20px" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 16, maxWidth: 480, margin: "0 auto" }}>
          <CD style={{ borderColor: "#ff444420" }}>
            <div style={{ fontSize: 12, letterSpacing: "0.15em", textTransform: "uppercase", color: "#ff6644", marginBottom: 14, fontWeight: 700, fontFamily: F.title }}>Le problème</div>
            {["Tu suis des plans génériques qui ignorent qui tu es", "Tu ne sais pas comment t'entraîner efficacement", "Tu stagnes, tu te blesses, tu doutes", "Tu arrives fatigué ou mal préparé"].map(t => (
              <div key={t} style={{ display: "flex", gap: 10, marginBottom: 10 }}><span style={{ color: "#ff4444" }}>✗</span><span style={{ color: C.creamDim, fontSize: 14, lineHeight: 1.6 }}>{t}</span></div>
            ))}
          </CD>
          <CD style={{ borderColor: `${C.yellow}30` }}>
            <div style={{ fontSize: 12, letterSpacing: "0.15em", textTransform: "uppercase", color: C.yellow, marginBottom: 14, fontWeight: 700, fontFamily: F.title }}>La solution Focus Run</div>
            {["Un programme personnalisé, clair, simple et efficace à suivre", "Adapté à ton profil, ton terrain et ton emploi du temps", "Évolue chaque semaine selon ton ressenti", "Périodisation : base, développement, affûtage"].map(t => (
              <div key={t} style={{ display: "flex", gap: 10, marginBottom: 10 }}><span style={{ color: C.yellow }}>✓</span><span style={{ color: C.creamMid, fontSize: 14, lineHeight: 1.6 }}>{t}</span></div>
            ))}
          </CD>
        </div>
      </div>
      <div style={{ background: C.cream, padding: "52px 20px" }}>
        <h2 style={{ fontFamily: F.title, fontSize: "clamp(22px,6vw,36px)", fontWeight: 700, letterSpacing: "0.04em", textAlign: "center", marginBottom: 36 }}>DE ZÉRO À FINISHER.</h2>
        <div style={{ maxWidth: 480, margin: "0 auto" }}>
          {[["01", "Tu crées ton profil", "Niveau, objectif, quelques infos clés. 2 minutes."], ["02", "Tu vois un aperçu réel", "7 jours visibles, 1 séance détaillée. Tu sais ce qui t'attend."], ["03", "Tu affines ton profil", "Après le paiement, ton coach demande les détails pour calibrer chaque séance à la perfection."], ["04", "Tu passes la ligne", "Préparé, confiant — Finisher."]].map(([n, t, d], i, arr) => (
            <div key={n} style={{ display: "flex", gap: 20, padding: "22px 0", borderBottom: i < arr.length - 1 ? `1px solid ${C.borderLight}` : "none" }}>
              <div style={{ fontFamily: F.title, fontSize: 36, fontWeight: 700, color: C.yellow, opacity: .3, lineHeight: 1, minWidth: 48 }}>{n}</div>
              <div><div style={{ fontFamily: F.title, fontSize: 15, fontWeight: 700, letterSpacing: "0.04em", marginBottom: 4 }}>{t}</div><div style={{ color: C.creamDim, fontSize: 14, lineHeight: 1.6 }}>{d}</div></div>
            </div>
          ))}
        </div>
      </div>
      <div style={{ background: C.black, padding: "52px 20px" }}>
        <h2 style={{ fontFamily: F.title, fontSize: "clamp(20px,6vw,36px)", fontWeight: 700, letterSpacing: "0.04em", color: C.cream, textAlign: "center", marginBottom: 28 }}>ILS SONT DEVENUS <span style={{ color: C.yellow }}>FINISHERS.</span></h2>
        <div style={{ display: "flex", flexDirection: "column", gap: 12, maxWidth: 480, margin: "0 auto" }}>
          {proof.map(p => (
            <CD key={p.name}>
              <div style={{ display: "flex", gap: 2, marginBottom: 10 }}>{Array(p.stars).fill(0).map((_, i) => <span key={i} style={{ color: C.yellow, fontSize: 14 }}>★</span>)}</div>
              <p style={{ color: C.creamMid, fontSize: 14, lineHeight: 1.7, marginBottom: 14, fontStyle: "italic" }}>"{p.quote}"</p>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div style={{ fontWeight: 700, fontSize: 13, color: C.cream, fontFamily: F.title }}>{p.name}</div>
                <Tag dark>{p.race}</Tag>
              </div>
            </CD>
          ))}
        </div>
      </div>
      <div style={{ background: C.bg, padding: "52px 20px" }}>
        <div style={{ maxWidth: 420, margin: "0 auto", textAlign: "center" }}>
          <h2 style={{ fontFamily: F.title, fontSize: "clamp(20px,6vw,34px)", fontWeight: 700, letterSpacing: "0.04em", marginBottom: 8 }}>UN SEUL PLAN.<br /><span style={{ background: C.yellow, padding: "1px 8px", borderRadius: 4 }}>TOUT INCLUS.</span></h2>
          <CL style={{ border: `2px solid ${C.black}`, borderRadius: 28, padding: 28, marginTop: 24 }}>
            <div style={{ background: C.black, color: C.yellow, fontSize: 11, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", padding: "4px 14px", borderRadius: 50, display: "inline-block", marginBottom: 16, fontFamily: F.title }}>Programme complet</div>
            <div style={{ fontFamily: F.title, fontSize: 52, fontWeight: 700, marginBottom: 4 }}>14,99€</div>
            <div style={{ color: C.creamDim, fontSize: 13, marginBottom: 20 }}>par mois · Sans engagement</div>
            {[["✓", "Tous niveaux, tous terrains — débutant, confirmé, reprise de blessure"], ["✓", "Programme personnalisé et adapté à ton profil, ton environnement et ton emploi du temps"], ["✓", "Ajustement des séances grâce à tes feedbacks hebdomadaires"], ["✓", "Périodisation intelligente en fonction de ton objectif"], ["✓", "Conseils de ton coach chaque semaine"], ["✓", "7 jours d'essai gratuit"]].map(([icon, text]) => (
              <div key={text} style={{ display: "flex", gap: 10, alignItems: "flex-start", textAlign: "left", fontSize: 14, marginBottom: 12 }}>
                <span style={{ color: C.success, fontWeight: 700, flexShrink: 0, marginTop: 1 }}>{icon}</span><span>{text}</span>
              </div>
            ))}
            <Btn full onClick={onRegister} style={{ marginTop: 8, fontSize: 16 }}>Commencer maintenant →</Btn>
            <div style={{ color: C.creamDim, fontSize: 12, marginTop: 10 }}>Sans engagement · Résiliation en 1 clic</div>
            <div style={{ borderTop: `1px solid ${C.borderLight}`, marginTop: 16, paddingTop: 16, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ fontSize: 13, color: C.creamDim }}>Offre annuelle</div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ background: C.yellow, color: C.black, fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 50 }}>2 mois offerts</span>
                <span style={{ fontFamily: F.title, fontSize: 16, fontWeight: 700 }}>129,99€/an</span>
              </div>
            </div>
          </CL>
        </div>
      </div>
      <div style={{ background: C.cream, padding: "48px 20px" }}>
        <div style={{ maxWidth: 480, margin: "0 auto" }}>
          <h2 style={{ fontFamily: F.title, fontSize: "clamp(18px,5vw,28px)", fontWeight: 700, letterSpacing: "0.04em", textAlign: "center", marginBottom: 28 }}>QUESTIONS FRÉQUENTES</h2>
          {faqs.map((f, i) => (
            <div key={f.q} style={{ borderBottom: `1px solid ${C.borderLight}` }}>
              <div onClick={() => setOpenFaq(openFaq === i ? null : i)} style={{ padding: "16px 0", cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 14, minHeight: 56 }}>
                <div style={{ fontFamily: F.title, fontSize: 14, fontWeight: 700, letterSpacing: "0.02em" }}>{f.q}</div>
                <div style={{ fontSize: 24, color: C.creamDim, flexShrink: 0, transition: "transform .2s", transform: openFaq === i ? "rotate(45deg)" : "none" }}>+</div>
              </div>
              {openFaq === i && <div style={{ paddingBottom: 16, color: C.creamDim, fontSize: 14, lineHeight: 1.7 }}>{f.r}</div>}
            </div>
          ))}
        </div>
      </div>
      <div style={{ background: C.black, padding: "64px 20px", textAlign: "center" }}>
        <h2 style={{ fontFamily: F.title, fontSize: "clamp(26px,8vw,52px)", fontWeight: 700, letterSpacing: "0.04em", color: C.cream, marginBottom: 14, lineHeight: 1 }}>TA PROCHAINE COURSE,<br /><span style={{ color: C.yellow }}>TU LA FINIRAS.</span></h2>
        <Btn full onClick={onRegister} style={{ maxWidth: 340, margin: "0 auto 12px", display: "block", fontSize: 16 }}>Commencer maintenant →</Btn>
        <div style={{ color: C.creamDim, fontSize: 12 }}>7 jours d'essai gratuit</div>
        <div style={{ borderTop: `1px solid ${C.border}`, marginTop: 48, paddingTop: 20, display: "flex", flexWrap: "wrap", gap: 16, justifyContent: "center" }}>
          {[["cgu", "CGU"], ["privacy", "Confidentialité"], ["legal", "Mentions légales"], ["refund", "Remboursement"]].map(([k, l]) => (
            <button key={k} onClick={() => setLegalPage(k)} style={{ background: "none", border: "none", color: C.creamDim, fontSize: 12, cursor: "pointer", textDecoration: "underline", padding: "4px 0" }}>{l}</button>
          ))}
        </div>
        <div style={{ color: C.creamDim, fontSize: 12, marginTop: 12 }}>© 2025 Focus Run · support@focusrun.fr</div>
      </div>
    </div>
  );
}

// ─── LOGIN ────────────────────────────────────────────────────────────────────
function Login({ onSuccess, onRegister, onBack }) {
  const [email, setEmail] = useState(""); const [pass, setPass] = useState("");
  const [err, setErr] = useState(""); const [loading, setLoading] = useState(false);
  const [forgotMode, setForgotMode] = useState(false); const [forgotSent, setForgotSent] = useState(false);
  const submit = () => {
    setErr(""); if (!email || !pass) { setErr("Remplis tous les champs."); return; }
    setLoading(true);
    setTimeout(() => { const u = mockDB.users[email.toLowerCase()]; if (!u || u.password !== pass) { setErr("Email ou mot de passe incorrect."); setLoading(false); return; } onSuccess(u); }, 700);
  };
  return (
    <div style={{ background: C.bg, minHeight: "100dvh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <div style={{ width: "100%", maxWidth: 400 }}>
        <div style={{ textAlign: "center", marginBottom: 28 }}>
          <div style={{ fontFamily: F.title, fontSize: 20, fontWeight: 700, letterSpacing: "0.1em", cursor: "pointer", marginBottom: 8 }} onClick={onBack}>FOCUS <span style={{ background: C.yellow, padding: "1px 6px", borderRadius: 3 }}>RUN</span></div>
          <div style={{ color: C.creamDim }}>{forgotMode ? "Réinitialisation" : "Content de te revoir 👋"}</div>
        </div>
        <CL>
          {forgotSent ? (
            <div style={{ textAlign: "center", padding: "12px 0" }}>
              <div style={{ fontSize: 40, marginBottom: 12 }}>📧</div>
              <div style={{ fontFamily: F.title, fontSize: 16, fontWeight: 700, marginBottom: 8 }}>Email envoyé !</div>
              <p style={{ color: C.creamDim, fontSize: 14, marginBottom: 20 }}>Vérifie ta boîte mail.</p>
              <Btn full onClick={() => { setForgotMode(false); setForgotSent(false); }}>Retour à la connexion</Btn>
            </div>
          ) : (
            <>
              <Input label="Email" type="email" value={email} onChange={setEmail} placeholder="ton@email.com" autoComplete="email" />
              {!forgotMode && <Input label="Mot de passe" type="password" value={pass} onChange={setPass} placeholder="••••••••" error={err} autoComplete="current-password" />}
              {forgotMode && err && <div style={{ color: C.danger, fontSize: 13, marginBottom: 12 }}>{err}</div>}
              <Btn full onClick={forgotMode ? () => { if (!email) { setErr("Entre ton email."); return; } setForgotSent(true); } : submit} disabled={loading} style={{ marginTop: 8 }}>
                {loading ? "Connexion…" : forgotMode ? "Envoyer le lien →" : "Se connecter →"}
              </Btn>
              {!forgotMode && <button onClick={() => setForgotMode(true)} style={{ background: "none", border: "none", color: C.creamDim, fontSize: 13, cursor: "pointer", marginTop: 12, display: "block", width: "100%", textAlign: "center", textDecoration: "underline", minHeight: 44 }}>Mot de passe oublié ?</button>}
            </>
          )}
        </CL>
        <div style={{ textAlign: "center", marginTop: 16, color: C.creamDim, fontSize: 14 }}>Pas de compte ? <span onClick={onRegister} style={{ color: C.black, cursor: "pointer", fontWeight: 700, textDecoration: "underline" }}>Créer mon programme</span></div>
      </div>
    </div>
  );
}



// ─── FALLBACK DAYS ────────────────────────────────────────────────────────────
const FALLBACK_DAYS = [
  { jour: "LUNDI", titre: "Endurance facile", duree: "45 min", type: "easy", isRest: false, done: null, content: "Objectif : Construire ta base aérobie en douceur.\nÉchauffement — 8 min : Trot très progressif.\nCorps — 30 min : Allure très facile, tu peux parler normalement. (65% de ton effort maximum)\nRetour au calme — 7 min : Trot léger puis marche." },
  { jour: "MARDI", titre: "Repos", duree: "", type: "rest", isRest: true, done: null, content: "", restDesc: "Une journée pour récupérer et progresser." },
  { jour: "MERCREDI", titre: "Fractionné", duree: "50 min", type: "interval", isRest: false, done: null, content: "" },
  { jour: "JEUDI", titre: "Repos", duree: "", type: "rest", isRest: true, done: null, content: "", restDesc: "Récupération — ton corps travaille pour toi." },
  { jour: "VENDREDI", titre: "Tempo", duree: "45 min", type: "tempo", isRest: false, done: null, content: "" },
  { jour: "SAMEDI", titre: "Repos", duree: "", type: "rest", isRest: true, done: null, content: "", restDesc: "Garde ton énergie pour demain." },
  { jour: "DIMANCHE", titre: "Sortie longue", duree: "1h15", type: "long", isRest: false, done: null, content: "" },
];

// ─── REGISTER — TUNNEL OPTIMISÉ ───────────────────────────────────────────────
function Register({ onSuccess, onLogin, onBack }) {
  const [step, setStep] = useState(0);
  const [form, setForm] = useState({ email: "", pass: "", passConfirm: "", prenom: "", age: "", poids: "", taille: "", type: "", niveau: "", anciennete: "", cguAccepted: false, santeConsentement: false });
  const [objectif, setObjectif] = useState(null);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);
  const [preview, setPreview] = useState(null);
  const [prevLoading, setPrevLoading] = useState(false);
  const [legalPage, setLegalPage] = useState(null);
  const [microFeedback, setMicroFeedback] = useState("");
  const [promo, setPromo] = useState("");
  const [codePromo, setCodePromo] = useState("");
  const [promoApplied, setPromoApplied] = useState(false);
  const [promoDiscount, setPromoDiscount] = useState(0);

  const setF = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const validate0 = () => {
    if (!form.email || !form.pass || !form.passConfirm) return "Remplis tous les champs.";
    if (!/\S+@\S+\.\S+/.test(form.email)) return "Email invalide.";
    if (form.pass.length < 6) return "Mot de passe trop court (6 caractères min).";
    if (form.pass !== form.passConfirm) return "Mots de passe différents.";
    if (mockDB.users[form.email.toLowerCase()]) return "Email déjà utilisé.";
    if (!form.cguAccepted) return "Tu dois accepter les CGU pour continuer.";
    if (!form.santeConsentement) return "Tu dois accepter le traitement de tes données de santé.";
    return "";
  };

  const microFeedbacks = {
    "Débutant": "Parfait — on construit depuis le début, progressivement et sans te brusquer.",
    "Intermédiaire": "Super — on s'appuie sur ta base pour progresser intelligemment.",
    "Confirmé": "Excellent — on va affiner et optimiser ta préparation.",
    "Expert": "Top — programme calibré pour aller chercher tes limites.",
    "trail": "Trail — on calibre sur ton dénivelé et ton terrain.",
    "running": "Running — programme route, allures précises et asphalte.",
    "mixte": "Trail et running — le meilleur des deux mondes.",
    "Moins de 6 mois": "On part sur des bases solides, progression douce et sécurisée.",
    "6 mois à 2 ans": "Bonne base — on construit dessus intelligemment.",
    "Plus de 2 ans": "Expérience solide — on optimise et on va chercher tes objectifs.",
  };

  const next = async () => {
    setErr("");
    if (step === 0) { const e = validate0(); if (e) { setErr(e); return; } setStep(1); return; }
    if (step === 1) { setStep(2); return; }
    if (step === 2) { setStep(3); return; }
    if (step === 3) { setStep(4); return; }
  };

  const pay = () => {
    setLoading(true);
    setTimeout(() => {
      const parsed = preview ? parseProgramme(preview) : { days: [] };
      const firstObj = objectif ? { ...objectif, programme: null, week: 0, id: Date.now(), days: [], weekHistory: [], archived: false, joursDispo: form.joursDispo || {} } : null;
      const u = { ...form, email: form.email.toLowerCase(), password: form.pass, abonnement: true, objectifs: firstObj ? [firstObj] : [], firstLogin: true, needsProfileCompletion: true };
      mockDB.users[u.email] = u; onSuccess(u);
    }, 1200);
  };

  const Opt = ({ icon, label, sub, field, value }) => {
    const sel = form[field] === value;
    return (
      <div onClick={() => { setF(field, value); setMicroFeedback(microFeedbacks[value] || ""); }}
        style={{ padding: 14, borderRadius: 14, border: `1.5px solid ${sel ? C.black : C.borderLight}`, background: sel ? C.yellow : "#e4dcc8", cursor: "pointer", transition: "all .15s", WebkitTapHighlightColor: "transparent", minHeight: 80 }}>
        <div style={{ fontSize: 20, marginBottom: 5 }}>{icon}</div>
        <div style={{ fontFamily: F.title, fontSize: 12, fontWeight: 700, letterSpacing: "0.04em" }}>{label}</div>
        {sub && <div style={{ fontSize: 10, color: C.creamDim, marginTop: 2 }}>{sub}</div>}
      </div>
    );
  };

  // FALLBACK_DAYS défini globalement


  const steps = ["Compte", "Profil essentiel", "Objectif", "Aperçu", "Accès"];
  const progPct = [10, 35, 60, 80, 100][step];

  return (
    <div style={{ background: C.bg, minHeight: "100dvh", paddingBottom: 60 }}>
      {legalPage && <LegalPage page={legalPage} onClose={() => setLegalPage(null)} />}

      {/* Header avec progression */}
      <div style={{ background: C.cream, borderBottom: `1px solid ${C.borderLight}`, padding: "14px 20px", position: "sticky", top: 0, zIndex: 10 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
          <div style={{ fontFamily: F.title, fontSize: 16, fontWeight: 700, letterSpacing: "0.1em", cursor: "pointer" }} onClick={onBack}>FOCUS <span style={{ background: C.yellow, padding: "1px 5px", borderRadius: 3 }}>RUN</span></div>
          <div style={{ fontSize: 12, color: C.creamDim }}>{steps[step]}</div>
        </div>
        <div style={{ height: 3, background: C.borderLight, borderRadius: 2, overflow: "hidden" }}>
          <div style={{ height: "100%", width: `${progPct}%`, background: C.yellow, borderRadius: 2, transition: "width .5s" }} />
        </div>
      </div>

      <div style={{ maxWidth: 520, margin: "0 auto", padding: "24px 18px 0" }}>

        {/* STEP 0 — Compte */}
        {step === 0 && <div>
          <h2 style={{ fontFamily: F.title, fontSize: 22, fontWeight: 700, letterSpacing: "0.04em", marginBottom: 6 }}>CRÉE TON COMPTE</h2>
          <p style={{ color: C.creamDim, marginBottom: 20, fontSize: 15 }}>7 jours d'essai gratuit.</p>
          <CL>
            <Input label="Email" type="email" value={form.email} onChange={v => setF("email", v)} placeholder="ton@email.com" autoComplete="email" />
            <Input label="Mot de passe" type="password" value={form.pass} onChange={v => setF("pass", v)} placeholder="6 caractères min" autoComplete="new-password" />
            <Input label="Confirmer" type="password" value={form.passConfirm} onChange={v => setF("passConfirm", v)} placeholder="••••••••" autoComplete="new-password" />
            <div onClick={() => setF("cguAccepted", !form.cguAccepted)} style={{ display: "flex", gap: 12, alignItems: "flex-start", padding: "10px 0", cursor: "pointer" }}>
              <div style={{ width: 22, height: 22, borderRadius: 6, border: `2px solid ${form.cguAccepted ? C.black : C.borderLight}`, background: form.cguAccepted ? C.yellow : "transparent", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", transition: "all .2s", marginTop: 1 }}>
                {form.cguAccepted && <span style={{ fontSize: 14, fontWeight: 700 }}>✓</span>}
              </div>
              <div style={{ fontSize: 13, color: C.creamDim, lineHeight: 1.5 }}>J'accepte les <span onClick={e => { e.stopPropagation(); setLegalPage("cgu"); }} style={{ color: C.black, fontWeight: 700, textDecoration: "underline" }}>CGU</span> et la <span onClick={e => { e.stopPropagation(); setLegalPage("privacy"); }} style={{ color: C.black, fontWeight: 700, textDecoration: "underline" }}>politique de confidentialité</span></div>
            </div>
            <div onClick={() => setF("santeConsentement", !form.santeConsentement)} style={{ display: "flex", gap: 12, alignItems: "flex-start", padding: "10px 0", cursor: "pointer" }}>
              <div style={{ width: 22, height: 22, borderRadius: 6, border: `2px solid ${form.santeConsentement ? C.black : C.borderLight}`, background: form.santeConsentement ? C.yellow : "transparent", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", transition: "all .2s", marginTop: 1 }}>
                {form.santeConsentement && <span style={{ fontSize: 14, fontWeight: 700 }}>✓</span>}
              </div>
              <div style={{ fontSize: 13, color: C.creamDim, lineHeight: 1.5 }}>J'accepte le traitement de mes <strong style={{ color: C.black }}>données de santé</strong> (blessures, état physique) pour personnaliser mon programme.</div>
            </div>
            {err && <div style={{ color: C.danger, fontSize: 13, marginBottom: 8 }}>{err}</div>}
            <Btn full onClick={next} style={{ marginTop: 8 }}>Continuer →</Btn>
          </CL>
          <div style={{ textAlign: "center", marginTop: 16, color: C.creamDim, fontSize: 14 }}>Déjà un compte ? <span onClick={onLogin} style={{ color: C.black, cursor: "pointer", fontWeight: 700, textDecoration: "underline" }}>Se connecter</span></div>
        </div>}

        {/* STEP 1 — Profil essentiel (rapide) */}
        {step === 1 && <div style={{ animation: "slideIn .25s ease" }}>
          <h2 style={{ fontFamily: F.title, fontSize: 22, fontWeight: 700, letterSpacing: "0.04em", marginBottom: 6, color: C.black }}>TON PROFIL</h2>
          <p style={{ color: "#555", marginBottom: 6, fontSize: 15 }}>Quelques infos essentielles pour démarrer.</p>
          <p style={{ color: "#888", marginBottom: 20, fontSize: 13, fontStyle: "italic" }}>Ton coach te demandera plus de détails juste après pour affiner chaque séance à la perfection.</p>

          {/* Micro-feedback animé */}
          {microFeedback && (
            <div style={{ borderRadius: 12, padding: "8px 0", marginBottom: 12, fontSize: 13, color: C.success, lineHeight: 1.5, animation: "slideIn .25s ease", fontWeight: 600 }}>
              ✓ {microFeedback}
            </div>
          )}

          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <Input label="Prénom" value={form.prenom} onChange={v => setF("prenom", v)} placeholder="Prénom" />
              <Input label="Âge" type="number" value={form.age} onChange={v => setF("age", v)} placeholder="Ex: 32" />
              <Input label="Poids (kg)" type="number" value={form.poids||""} onChange={v => setF("poids", v)} placeholder="Ex: 72" />
              <Input label="Taille (cm)" type="number" value={form.taille||""} onChange={v => setF("taille", v)} placeholder="Ex: 175" />
            </div>



            <CL style={{ padding: 16 }}>
              <div style={{ fontFamily: F.title, fontSize: 12, fontWeight: 700, letterSpacing: "0.1em", marginBottom: 14, color: C.creamDim }}>TON NIVEAU</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {[
                  { icon:"🌱", label:"Débutant",      value:"Débutant",      sub:"Je cours depuis moins d'un an ou je reprends après une longue pause" },
                  { icon:"🏃", label:"Intermédiaire", value:"Intermédiaire", sub:"Je cours régulièrement depuis 1 à 3 ans, je fais des sorties entre 3 et 4 fois par semaine" },
                  { icon:"⛰️", label:"Confirmé",      value:"Confirmé",      sub:"Je cours depuis plus de 3 ans, j'ai déjà participé à des courses et je m'entraîne sérieusement" },
                  { icon:"🔥", label:"Expert",         value:"Expert",        sub:"Coureur expérimenté, je vise la performance et je m'entraîne 5 fois par semaine ou plus" },
                ].map(({icon, label, value, sub}) => {
                  const selected = form?.niveau === value;
                  const setVal = () => setForm(f => ({...f, niveau: value}));
                  return (
                    <div key={value} onClick={setVal} style={{
                      display: "flex", alignItems: "flex-start", gap: 12,
                      background: selected ? C.yellow : C.cardLight,
                      border: `1.5px solid ${selected ? C.yellow : C.borderLight}`,
                      borderRadius: 14, padding: "13px 14px", cursor: "pointer",
                      transition: "all .2s"
                    }}>
                      <div style={{ fontSize: 22, flexShrink: 0, marginTop: 1 }}>{icon}</div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontFamily: F.title, fontSize: 14, fontWeight: 700, marginBottom: 3,
                          color: C.black }}>{label}</div>
                        <div style={{ fontSize: 12, color: selected ? "#555" : C.creamDim, lineHeight: 1.5 }}>{sub}</div>
                      </div>
                      {selected && <div style={{ color: C.yellow, fontWeight: 700, fontSize: 16, flexShrink: 0 }}>✓</div>}
                    </div>
                  );
                })}
              </div>
            </CL>



            <div style={{ background: C.cardLight, border: `1px solid ${C.borderLight}`, borderRadius: 14, padding: "14px 16px" }}>
              <p style={{ fontSize: 13, color: C.creamDim, margin: 0, lineHeight: 1.65 }}></p>
            </div>

            <Btn full onClick={next} style={{ fontSize: 16, padding: 15 }}>Continuer vers mon objectif →</Btn>
          </div>
        </div>}

        {/* STEP 2 — Objectif */}
        {step === 2 && <div style={{ animation: "slideIn .25s ease" }}>
          <h2 style={{ fontFamily: F.title, fontSize: 22, fontWeight: 700, letterSpacing: "0.04em", marginBottom: 6 }}>TON OBJECTIF</h2>
          <p style={{ color: C.creamDim, marginBottom: 20, fontSize: 15 }}>Qu'est-ce que tu veux accomplir ?</p>
          <CL><ObjectifForm onSave={obj => { setObjectif(obj); next(); }} onCancel={null} showSeances={false} showParallel={false} /></CL>
        </div>}

        {/* STEP 3 — Aperçu */}
        {step === 3 && <div style={{ animation: "slideIn .25s ease" }}>
          <div style={{ textAlign: "center", marginBottom: 18 }}>
            <div style={{ display: "inline-block", background: C.yellow, color: C.black, fontSize: 11, fontWeight: 700, letterSpacing: "0.15em", padding: "5px 14px", borderRadius: 50, marginBottom: 14, fontFamily: F.title }}>APERÇU DE TON PROGRAMME</div>
            <h2 style={{ fontFamily: F.title, fontSize: "clamp(18px,6vw,24px)", fontWeight: 700, color: C.black, margin: "0 0 6px" }}>TA SEMAINE TYPE.</h2>
          </div>

          <div style={{ background: `${C.yellow}18`, border: `1px solid ${C.yellow}40`, borderRadius: 12, padding: "10px 14px", marginBottom: 16, display: "flex", gap: 8 }}>
            <span>💡</span>
            <span style={{ fontSize: 12, color: "#555", lineHeight: 1.6 }}>Aperçu générique — ton programme réel sera calibré sur ta VMA, tes allures et tes jours disponibles.</span>
          </div>

          {/* 4 séances dans le même format que le vrai programme */}
          <div style={{ marginBottom: 16 }}>
            {[
              { emoji:"🟢", titre:"Endurance fondamentale", duree:"45 min", jour:"Mardi",
                objectif:"Développer ta base aérobie — la fondation de tout programme sérieux.",
                detail:"✦ 10min échauffement progressif\n✦ Footing régulier à 6'00/km — allure facile, conversation possible\n✦ 10min retour au calme + étirements\n\n💡 Reste dans le confort — si tu souffles trop, ralentis." },
              { emoji:"🔴", titre:"Fractionné VMA",         duree:"55 min", jour:"Jeudi",
                objectif:"Booster ta vitesse maximale — séance clé pour progresser vite.",
                detail:"✦ 15min échauffement + 4×20sec accélérations\n✦ 8×400m à 4'00/km — récupération 90sec entre chaque\n✦ 10min retour au calme\n\n💡 Chaque répétition doit être difficile mais contrôlée." },
              { emoji:"🟠", titre:"Séance au seuil",        duree:"50 min", jour:"Samedi",
                objectif:"Repousser ton seuil — tu cours plus vite sans t'essouffler.",
                detail:"✦ 15min échauffement\n✦ 2×15min à 4'45/km — récupération 3min entre les blocs\n✦ 10min retour au calme\n\n💡 Allure identique sur les deux blocs — régularité avant tout." },
              { emoji:"🔵", titre:"Sortie longue",          duree:"1h15",   jour:"Dimanche",
                objectif:"Développer l'endurance et habituer ton corps à l'effort prolongé.",
                detail:"✦ Départ progressif — 15min échauffement\n✦ Footing long à 6'00/km — allure très facile\n✦ 15min retour au calme\n\n💡 Ne t'emballe pas. Ravitaille si >1h15." },
            ].map((s, i) => {
              const dotColor = "#d4ff00"; // jaune fluo DA
              const [open, setOpen] = [false, ()=>{}]; // aperçu statique
              return (
                <div key={i} style={{ borderRadius: 16, marginBottom: 10, border: "1px solid #ddd5c0", background: "transparent", overflow: "hidden" }}>
                  <div style={{ padding: "13px 16px", display: "flex", alignItems: "center", gap: 12 }}>
                    <div style={{ width: 10, height: 10, borderRadius: "50%", background: "#d4ff00", flexShrink: 0 }} />
                    <div style={{ flex: 1 }}>
                      <div style={{ fontFamily: F.title, fontSize: 14, fontWeight: 700, color: "#1a1a1a", marginBottom: 2 }}>{s.titre}</div>
                      <div style={{ fontSize: 12, color: "#888" }}>⏱ {s.duree} · {s.jour}</div>
                    </div>
                  </div>
                  {/* Description d'une séance — montrer la structure */}
                  {i === 0 && (
                    <div style={{ borderTop: "1px solid #e8e3d8", padding: "12px 16px 14px" }}>
                      <div style={{ fontSize: 13, color: "#555", fontStyle: "italic", marginBottom: 10, lineHeight: 1.5 }}>🎯 {s.objectif}</div>
                      <div style={{ fontSize: 13, lineHeight: 1.8 }}>
                        {s.detail.split("\n").map((line, j) => {
                          if (!line.trim()) return <div key={j} style={{ height: 6 }} />;
                          const isNote = line.startsWith("💡");
                          const isBullet = line.startsWith("✦");
                          return (
                            <div key={j} style={{
                              color: isNote ? "#888" : "#333", fontSize: isNote ? 12 : 13,
                              paddingLeft: isBullet ? 10 : 0,
                              borderLeft: isBullet ? "2px solid #22C55E50" : "none",
                              marginBottom: isBullet ? 4 : 0,
                            }}>{line}</div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <Btn full onClick={next} style={{ minHeight: 54, fontSize: 16, fontWeight: 700 }}>
            Démarrer mon programme →
          </Btn>
        </div>}

        {step === 4 && <div style={{ animation: "slideIn .25s ease" }}>
          <h2 style={{ fontFamily: F.title, fontSize: 22, fontWeight: 700, letterSpacing: "0.04em", marginBottom: 6 }}>LANCE-TOI.</h2>
          <p style={{ color: C.creamDim, marginBottom: 20, fontSize: 15 }}>7 jours d'essai gratuit, puis sans engagement.</p>
          <div style={{ display: "flex", gap: 0, marginBottom: 16, background: "#e4dcc8", borderRadius: 50, padding: 4 }}>
            <div onClick={() => setPromo("")} style={{ flex: 1, textAlign: "center", padding: "10px 0", borderRadius: 50, background: promo !== "ANNUEL" ? C.black : "transparent", color: promo !== "ANNUEL" ? C.cream : C.creamDim, fontFamily: F.title, fontSize: 13, fontWeight: 700, cursor: "pointer", transition: "all .2s" }}>Mensuel · 14,99€/mois</div>
            <div onClick={() => setPromo("ANNUEL")} style={{ flex: 1, textAlign: "center", padding: "10px 0", borderRadius: 50, background: promo === "ANNUEL" ? C.black : "transparent", color: promo === "ANNUEL" ? C.yellow : C.creamDim, fontFamily: F.title, fontSize: 13, fontWeight: 700, cursor: "pointer", transition: "all .2s", position: "relative" }}>
              Annuel · 10,83€/mois
              <span style={{ position: "absolute", top: -8, right: 4, background: C.yellow, color: C.black, fontSize: 9, fontWeight: 700, padding: "2px 6px", borderRadius: 50, whiteSpace: "nowrap" }}>2 mois offerts</span>
            </div>
          </div>
          <CL style={{ border: `2px solid ${C.black}`, marginBottom: 14 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <div><div style={{ fontFamily: F.title, fontSize: 16, fontWeight: 700, letterSpacing: "0.06em" }}>FOCUS RUN</div><div style={{ color: C.creamDim, fontSize: 12 }}>Trail & Running · {promo === "ANNUEL" ? "Annuel" : "Mensuel"}</div></div>
              <div style={{ fontFamily: F.title, fontSize: 24, fontWeight: 700 }}>{promo === "ANNUEL" ? "129,99€" : "14,99€"}<span style={{ fontSize: 13, fontFamily: F.body, fontWeight: 400, color: C.creamDim }}>/{promo === "ANNUEL" ? "an" : "mois"}</span></div>
            </div>
            {["Tous niveaux, tous terrains — débutant, confirmé, reprise de blessure", "Programme personnalisé et adapté à ton profil, ton environnement et ton emploi du temps", "Ajustement des séances grâce à tes feedbacks hebdomadaires", "Périodisation intelligente en fonction de ton objectif", "Conseils de ton coach chaque semaine", "7 jours d'essai gratuit"].map(text => (
              <div key={text} style={{ display: "flex", gap: 10, alignItems: "flex-start", fontSize: 14, marginBottom: 10 }}>
                <span style={{ color: C.success, fontWeight: 700, flexShrink: 0 }}>✓</span><span>{text}</span>
              </div>
            ))}
          </CL>
          {/* Encart CODE PROMO */}
          <CL style={{ marginBottom: 14 }}>
            <div style={{ fontFamily: F.title, fontSize: 11, fontWeight: 700, letterSpacing: "0.1em", marginBottom: 10, color: C.creamDim }}>🎁 CODE PROMO</div>
            <div style={{ display: "flex", gap: 8 }}>
              <input
                value={codePromo || ""}
                onChange={e => setCodePromo(e.target.value.toUpperCase())}
                placeholder="Entre ton code..."
                style={{ flex: 1, background: C.cardLight, border: `1.5px solid ${promoApplied ? "#44CC44" : C.borderLight}`, borderRadius: 10, padding: "10px 14px", fontSize: 14, color: C.cream, outline: "none", fontFamily: F.body }}
              />
              <Btn onClick={() => {
                if (codePromo === "FINISHER10") { setPromoApplied(true); setPromoDiscount(10); }
                else if (codePromo === "TRAIL20") { setPromoApplied(true); setPromoDiscount(20); }
                else { setPromoApplied(false); }
              }} style={{ minWidth: 80, background: C.black }}>Valider</Btn>
            </div>
            {promoApplied && <div style={{ marginTop: 8, fontSize: 12, color: "#44CC44" }}>✓ Code appliqué — {promoDiscount}% de réduction</div>}
          </CL>
          <CL style={{ marginBottom: 14 }}>
            <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 16 }}>
              <span style={{ fontSize: 16 }}>💳</span>
              <div style={{ fontFamily: F.title, fontSize: 13, fontWeight: 700, letterSpacing: "0.04em" }}>PAIEMENT SÉCURISÉ</div>
              <div style={{ marginLeft: "auto", fontSize: 11, color: C.creamDim, background: "#ddd5c0", padding: "3px 10px", borderRadius: 50 }}>🔒 Stripe</div>
            </div>
            <Input label="Numéro de carte" value="" onChange={() => {}} placeholder="1234 5678 9012 3456" autoComplete="cc-number" />
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <Input label="Expiration" value="" onChange={() => {}} placeholder="MM / AA" autoComplete="cc-exp" />
              <Input label="CVC" value="" onChange={() => {}} placeholder="123" autoComplete="cc-csc" />
            </div>
            <div style={{ background: "#e0d8c4", borderRadius: 10, padding: "10px 14px", fontSize: 13, color: C.creamDim, marginTop: 8 }}>ℹ️ Démo — Stripe activé à la mise en ligne.</div>
          </CL>
          <Btn full onClick={pay} disabled={loading} style={{ fontSize: 16, padding: 17 }}>{loading ? "Activation…" : promo === "ANNUEL" ? "Commander l'offre annuelle →" : "Commander avec essai gratuit →"}</Btn>
          <p style={{ textAlign: "center", color: C.creamDim, fontSize: 12, marginTop: 10 }}>🔒 Paiement sécurisé · {promo === "ANNUEL" ? "129,99€/an · 2 mois offerts" : "7 jours gratuits · Sans engagement"}</p>
        </div>}
      </div>
    </div>
  );
}

// ─── DASHBOARD ────────────────────────────────────────────────────────────────
function Dashboard({ user: initUser, onLogout }) {
  const [user, setUser] = useState(initUser);
  const [tab, setTab] = useState("home");
  const [objectifs, setObjectifs] = useState(initUser.objectifs || []);
  const [activeIdx, setActiveIdx] = useState(0);
  const [loading, setLoading] = useState(false);
  const [fb, setFb] = useState({ rating: "", comment: "", dispoChanges: "" });
  const [fbSent, setFbSent] = useState(false);
  const [showNewObj, setShowNewObj] = useState(false);
  const [showEditObj, setShowEditObj] = useState(null);
  const [showDeleteObj, setShowDeleteObj] = useState(null);
  const [showShare, setShowShare] = useState(null);
  const [showFinisherForm, setShowFinisherForm] = useState(null);
  const [showJourJ, setShowJourJ] = useState(null);
  const [finisherData, setFinisherData] = useState({ temps: "" });
  const [showHist, setShowHist] = useState(null);
  const [editProfil, setEditProfil] = useState(false);
  const [editForm, setEditForm] = useState({ ...initUser });
  const [toast, setToast] = useState(null);
  const [showOnboarding, setShowOnboarding] = useState(!!initUser.firstLogin);
  const [showProfilCompletion, setShowProfilCompletion] = useState(!!initUser.needsProfileCompletion);
  const [legalPage, setLegalPage] = useState(null);

  const activeObj = objectifs[activeIdx];
  const typeLabel = user.type === "trail" ? "trail" : user.type === "running" ? "running" : "trail et running";
  const todaySeance = activeObj?.days ? getTodaySeance(activeObj.days) : null;
  const activeObjectifs = objectifs.filter(o => !o.archived);

  const saveObj = (updated) => { setObjectifs(updated); mockDB.users[user.email] = { ...mockDB.users[user.email], objectifs: updated }; };

  const addObjectif = (obj) => {
    const totalWeeks = obj.dateCourse ? Math.ceil((new Date(obj.dateCourse + "T00:00:00") - (() => { const t = new Date(); t.setHours(0,0,0,0); return t; })()) / (7*24*60*60*1000)) : null;
    const newObj = { ...obj, programme: null, week: 0, id: Date.now(), days: [], weekHistory: [], archived: false, totalWeeks, joursDispo: obj.joursDispo || user.joursDispo || {} }
    // Mettre à jour user.joursDispo avec les jours du nouvel objectif
    if (obj.joursDispo && Object.values(obj.joursDispo).some(Boolean)) {
      const updatedUser = { ...user, joursDispo: obj.joursDispo };
      setUser(updatedUser);
      mockDB.users[user.email] = { ...mockDB.users[user.email], joursDispo: obj.joursDispo };
    };
    const updated = [...objectifs, newObj];
    saveObj(updated); setActiveIdx(updated.length - 1); setShowNewObj(false); setTab("programme"); setFbSent(false);
    setToast({ msg: "Objectif créé 🎯", type: "success" });
  };

  const deleteObjectif = (idx) => {
    let updated = objectifs.filter((_, i) => i !== idx);
    // Si 1 seul objectif restant et qu'il était parallèle → recalibrer
    const activeRemaining = updated.filter(o => !o.archived);
    if (activeRemaining.length === 1 && activeRemaining[0].isParallel) {
      updated = updated.map(o => o.archived ? o : { ...o, isParallel: false });
      setToast({ msg: "Programme recalibré sur ton objectif principal ✓", type: "success" });
    } else {
      setToast({ msg: "Objectif supprimé", type: "success" });
    }
    saveObj(updated); setShowDeleteObj(null);
    if (activeIdx >= updated.length) setActiveIdx(Math.max(0, updated.length - 1));
  };

  const markDay = (dayIdx, status, modifDetail = "") => {
    const updated = objectifs.map((o, i) => {
      if (i !== activeIdx) return o;
      const days = (o.days || []).map((d, j) => j === dayIdx ? { ...d, status: status, modifDetail: modifDetail || d.modifDetail } : d);
      return { ...o, days };
    });
    saveObj(updated);
    if (status === "done") {
      setToast({ msg: "Séance validée ! 💪", type: "success" });
      const obj2 = updated[activeIdx];
      const total = (obj2.days || []).filter(d => !d.isRest).length;
      const done2 = (obj2.days || []).filter(d => !d.isRest && (d.status === "done" || d.status === "modified")).length;
      if (done2 === total && total > 0) setTimeout(() => setToast({ msg: "🎉 Semaine complète ! Tu assures.", type: "celebrate" }), 1500);
    }
  };

  const generateWeek = async (feedback = null, extraSeance = false) => {
    const obj = objectifs[activeIdx];
    // ── VÉRIFICATION DATES ──
    if (obj?.dateCourse) {
      const _d = getDaysToRace(obj.dateCourse);
      const _total = obj.totalWeeks || (getWeeksToRace(obj.dateCourse) + (obj.week||0));
      const _next = (obj.week||0) + 1;
      if (_d < 0) { setToast({ msg: "Ta course est passée — entre ton temps Finisher !", type: "celebrate" }); setShowJourJ(obj); return; }
      if (_d === 0) { setToast({ msg: "🏆 C'est le Jour J ! Bonne course !", type: "celebrate" }); return; }
      if (_next > _total) { setToast({ msg: "Programme complet — J-" + _d + " avant ta course !", type: "success" }); return; }
    }
    setLoading(true); setTab("programme");
    try {
      const newWeek = (obj.week || 0) + 1;
      // Génération algorithmique instantanée (moteur intégré)
      // joursDispo : priorité obj > user > défaut
      const _jd = obj.joursDispo && Object.values(obj.joursDispo).some(Boolean)
        ? obj.joursDispo
        : user.joursDispo && Object.values(user.joursDispo).some(Boolean)
          ? user.joursDispo
          : obj.joursDispo || {};
      const objWithJours = { ...obj, joursDispo: _jd };

      // Enrichir le feedback avec les Faite/Ratée cochées sur les séances
      const _days = obj.days || [];
      const _seances = _days.filter(d => !d.isRest);
      const _nTotal  = _seances.length;
      const _nDone   = _seances.filter(d => d.status === "done").length;
      const _nMissed = _seances.filter(d => d.status === "missed").length;
      const feedbackEnriched = _nTotal > 0
        ? { ...(feedback||{}), nDone: _nDone, nMissed: _nMissed, nTotal: _nTotal }
        : feedback;

      const prog = genererSemaine(user, objWithJours, newWeek, feedbackEnriched);
      if (!prog || !prog.days) throw new Error("error");
      const newEntry = {
        week: newWeek,
        rating: feedback?.rating || null,
        commentaire: feedback?.comment || null,
        volume: prog.volCible || 0,
        phase: prog.phase || "",
        seancesTypes: prog.days.filter(d => !d.isRest).map(d => d.type),
      };
      const updated = objectifs.map((o, i) => i !== activeIdx ? o : {
        ...o,
        week: newWeek,
        days: prog.days,
        phase: prog.phase,
        volCible: prog.volCible,
        totalWeeks: o.totalWeeks || prog.totalWeeks,
        weekHistory: [...(o.weekHistory || []), newEntry],
      });
      saveObj(updated); setFbSent(true); setFb({ rating: "", seances: "", corps: "", sommeil: "" });
    } catch(e) {
      setToast({ msg: "Erreur de génération. Réessaie.", type: "error" });
    }
    setLoading(false);
  };

  const saveProfil = () => {
    const updated = { ...user, ...editForm };
    setUser(updated); mockDB.users[user.email] = { ...mockDB.users[user.email], ...editForm };
    setEditProfil(false); setToast({ msg: "Profil mis à jour ✓", type: "success" });
  };

  const navItems = [{ id: "home", icon: "⌂", label: "Accueil" }, { id: "programme", icon: "📋", label: "Programme" }, { id: "coach", icon: "💬", label: "Coach" }, { id: "profil", icon: "👤", label: "Profil" }];

  return (
    <div style={{ background: C.bg, minHeight: "100dvh", fontFamily: F.body, color: C.black, paddingBottom: 80 }}>
      <style>{`
        @keyframes fadeIn{from{opacity:0}to{opacity:1}}
        @keyframes slideUp{from{transform:translateY(100%)}to{transform:translateY(0)}}
        @keyframes spin{to{transform:rotate(360deg)}}
        @keyframes shimmer{0%{background-position:200% 0}100%{background-position:-200% 0}}
        @keyframes toastIn{from{opacity:0;transform:translateX(-50%) translateY(-8px)}to{opacity:1;transform:translateX(-50%) translateY(0)}}
      `}</style>

      {legalPage && <LegalPage page={legalPage} onClose={() => setLegalPage(null)} />}
      {showOnboarding && <Onboarding prenom={user.prenom} onDone={() => { setShowOnboarding(false); const u = { ...user, firstLogin: false }; setUser(u); mockDB.users[u.email] = { ...mockDB.users[u.email], firstLogin: false }; }} />}
      {showProfilCompletion && !showOnboarding && (
        <ProfilCompletion user={user} onComplete={(updated) => {
          const u = { ...user, ...updated, needsProfileCompletion: false };
          setUser(u); mockDB.users[user.email] = { ...mockDB.users[user.email], ...updated, needsProfileCompletion: false };
          setShowProfilCompletion(false); setToast({ msg: "Profil complété ✓ Ton programme va s'affiner !", type: "success" });
        }} onSkip={() => setShowProfilCompletion(false)} />
      )}
      {toast && <Toast message={toast.msg} type={toast.type} onDone={() => setToast(null)} />}
      {showShare && <ShareCard type={showShare.type} data={showShare.data} onClose={() => setShowShare(null)} />}

      {/* TOP NAV */}
      <div style={{ position: "fixed", top: 0, left: 0, right: 0, zIndex: 100, background: "rgba(240,234,214,.97)", backdropFilter: "blur(12px)", borderBottom: `1px solid ${C.borderLight}`, height: 52, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 18px" }}>
        <div style={{ fontFamily: F.title, fontSize: 15, fontWeight: 700, letterSpacing: "0.1em" }}>FOCUS <span style={{ background: C.yellow, padding: "1px 4px", borderRadius: 3 }}>RUN</span></div>
        {activeObj && tab === "programme" && <div style={{ fontFamily: F.title, fontSize: 11, fontWeight: 700, letterSpacing: "0.06em", color: C.creamDim, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 160 }}>{(activeObj.nom||'').toUpperCase()}</div>}
        <Btn variant="ghost" small onClick={onLogout} style={{ fontSize: 13, padding: "8px 0" }}>Déco.</Btn>
      </div>

      <div style={{ maxWidth: 520, margin: "0 auto", padding: "62px 16px 20px" }}>

        {/* ── HOME ── */}
        {tab === "home" && <div style={{ animation: "fadeIn .3s ease" }}>

          {/* ── ANIMAL TOTEM GREETING ── */}
          {user.animalTotem && (
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
              <div style={{ width: 44, height: 44, background: C.black, borderRadius: 14, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24, flexShrink: 0 }}>
                {user.animalTotem}
              </div>
              <div>
                <div style={{ fontSize: 15, fontWeight: 700, color: C.black }}>Bonjour {user.prenom || "Finisher"} 👋</div>
                <div style={{ fontSize: 11, color: C.creamDim, fontStyle: "italic" }}>
                  "{ANIMALS_TOTEM.find(a=>a.emoji===user.animalTotem)?.desc || ""}"
                </div>
              </div>
            </div>
          )}

          {/* ── SÉANCE DU JOUR ── */}
          {activeObj?.days?.length > 0 && (() => {
            const jourAujourdhui = JOURS_FR[new Date().getDay()];
            const dayToday = (activeObj.days || []).find(d => d.jour === jourAujourdhui);
            const isRepos = !dayToday || dayToday.isRest;
            return (
              <div onClick={() => !isRepos && setTab("programme")}
                style={{ background: C.black, borderRadius: 22, padding: "20px 22px", marginBottom: 12, display: "flex", gap: 14, alignItems: "center", cursor: isRepos ? "default" : "pointer", position: "relative", overflow: "hidden" }}>
                <div style={{ position: "absolute", top: -40, right: -40, width: 160, height: 160, background: `radial-gradient(circle, ${C.yellow}12 0%, transparent 70%)`, pointerEvents: "none" }} />
                {!isRepos && <div style={{ width: 10, height: 10, borderRadius: "50%", background: C.yellow, flexShrink: 0 }} />}
                {isRepos && <div style={{ fontSize: 22, flexShrink: 0 }}>😴</div>}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", letterSpacing: "0.14em", fontWeight: 600, marginBottom: 4, textTransform: "uppercase" }}>Aujourd'hui</div>
                  <div style={{ fontSize: 17, fontWeight: 700, color: C.cream, marginBottom: 3, letterSpacing: "-0.01em" }}>
                    {isRepos ? "Jour de repos" : (dayToday?.titre || "Séance")}
                  </div>
                  <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)" }}>
                    {isRepos ? "Récupération — ton corps se reconstruit" : `⏱ ${dayToday?.duree}`}
                  </div>
                </div>
                {!isRepos && <div style={{ color: C.yellow, fontSize: 20, fontWeight: 700, flexShrink: 0 }}>→</div>}
              </div>
            );
          })()}

          {/* ── OBJECTIFS ACTIFS ── */}
          {objectifs.filter(o=>!o.archived).length > 0 ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 12 }}>
              {objectifs.map((obj, i) => obj.archived ? null : (() => {
                const daysToRace = obj.dateCourse ? getDaysToRace(obj.dateCourse) : null;
                const isJourJ = daysToRace === 0;
                const isCoursePassee = daysToRace !== null && daysToRace < 0;
                const pct = obj.totalWeeks > 0 ? Math.min(100, Math.round(((obj.week||0) / obj.totalWeeks) * 100)) : 0;
                // Arc SVG
                const R = 30, CIRC = 2 * Math.PI * R;
                const dashOffset = CIRC * (1 - pct / 100);
                return (
                  <div key={obj.id} onClick={() => { setActiveIdx(i); setTab("programme"); }}
                    style={{ background: C.black, border: activeIdx===i ? `1.5px solid ${C.yellow}` : "1.5px solid transparent", borderRadius: 22, padding: "20px 22px", cursor: "pointer", position: "relative", overflow: "hidden" }}>
                    <div style={{ position: "absolute", top: -60, right: -60, width: 200, height: 200, background: `radial-gradient(circle, ${C.yellow}08 0%, transparent 70%)`, pointerEvents: "none" }} />
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                      <div style={{ flex: 1, minWidth: 0, paddingRight: 12 }}>
                        <div style={{ fontSize: 16, fontWeight: 700, color: C.cream, letterSpacing: "-0.01em", marginBottom: 5, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{obj.nom || "Mon objectif"}</div>
                        <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 14 }}>
                          {obj.distanceCourseKm && <span>{obj.distanceCourseKm}km</span>}
                          {obj.isTrail && obj["deniveléCourse"] && obj["deniveléCourse"]!=="0" && <span>· D+{obj["deniveléCourse"]}m</span>}
                          {isJourJ && <span style={{ color: C.yellow, fontWeight: 700 }}>· 🏆 JOUR J</span>}
                          {isCoursePassee && <span style={{ color: "#44CC88", fontWeight: 700 }}>· 🏅 Terminé</span>}
                          {!isJourJ && !isCoursePassee && obj.week===0 && <span>· Prêt à démarrer</span>}
                        </div>
                        {/* J-X */}
                        {daysToRace !== null && daysToRace > 0 && (
                          <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
                            <div style={{ fontSize: 32, fontWeight: 700, color: C.yellow, lineHeight: 1, letterSpacing: "-0.02em" }}>{daysToRace}</div>
                            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.35)", lineHeight: 1.4 }}>jours<br/>avant le départ</div>
                          </div>
                        )}
                      </div>
                      {/* Arc de progression */}
                      {obj.week > 0 && obj.totalWeeks > 0 && (
                        <div style={{ position: "relative", width: 72, height: 72, flexShrink: 0 }}>
                          <svg width="72" height="72" viewBox="0 0 72 72" style={{ transform: "rotate(-90deg)" }}>
                            <circle cx="36" cy="36" r={R} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="5"/>
                            <circle cx="36" cy="36" r={R} fill="none" stroke={C.yellow} strokeWidth="5" strokeLinecap="round"
                              strokeDasharray={CIRC} strokeDashoffset={dashOffset}/>
                          </svg>
                          <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
                            <div style={{ fontSize: 14, fontWeight: 700, color: C.yellow, lineHeight: 1 }}>S{obj.week}</div>
                            <div style={{ fontSize: 9, color: "rgba(255,255,255,0.4)", letterSpacing: "0.04em" }}>/{obj.totalWeeks}</div>
                          </div>
                        </div>
                      )}
                    </div>
                    {/* Barre phase */}
                    {obj.week > 0 && obj.totalWeeks > 0 && (
                      <div style={{ marginTop: 12 }}>
                        <div style={{ height: 2, background: "rgba(255,255,255,0.1)", borderRadius: 1, overflow: "hidden" }}>
                          <div style={{ height: "100%", width: `${pct}%`, background: C.yellow, borderRadius: 1, transition: "width .6s" }} />
                        </div>
                        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 5 }}>
                          <span style={{ fontSize: 10, color: "rgba(255,255,255,0.25)", letterSpacing: "0.04em" }}>{obj.phase || "Construction"}</span>
                          <span style={{ fontSize: 10, color: "rgba(255,255,255,0.25)" }}>{pct}%</span>
                        </div>
                      </div>
                    )}
                    {/* Bouton supprimer — visible mais sobre */}
                    <div style={{ marginTop: 14, paddingTop: 12, borderTop: "1px solid rgba(255,255,255,0.08)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <span style={{ fontSize: 11, color: "rgba(255,255,255,0.3)" }}>Programme en cours</span>
                      <button onClick={(e) => { e.stopPropagation(); setShowDeleteObj(i); }}
                        style={{ background: "rgba(255,80,80,0.1)", border: "1px solid rgba(255,80,80,0.2)", borderRadius: 8, color: "rgba(255,120,120,0.8)", fontSize: 11, cursor: "pointer", padding: "5px 12px", fontFamily: F.body }}>
                        Abandonner →
                      </button>
                    </div>
                  </div>
                );
              })())}
            </div>
          ) : (
            <div style={{ textAlign: "center", padding: "40px 20px 20px" }}>
              <div style={{ fontSize: 40, marginBottom: 12 }}>🎯</div>
              <div style={{ fontFamily: F.title, fontSize: 16, fontWeight: 700, color: C.black, marginBottom: 8 }}>PAS ENCORE D'OBJECTIF</div>
              <p style={{ color: "#888", fontSize: 14, marginBottom: 20 }}>Définis ta course cible pour démarrer ton programme.</p>
              <Btn onClick={() => setShowNewObj(true)}>+ Ajouter un objectif</Btn>
            </div>
          )}

          {/* ── BOUTON NOUVEL OBJECTIF ── */}
          {(() => {
            const hasActif = objectifs.some(o => !o.archived && (o.week||0) > 0);
            const hasAny = objectifs.filter(o=>!o.archived).length > 0;
            if (!hasAny) return null;
            if (hasActif) return (
              <div style={{ fontSize: 12, color: C.creamDim, textAlign: "center", marginBottom: 16, padding: "8px 0", fontStyle: "italic" }}>
                Termine ton objectif en cours avant d'en créer un nouveau.
              </div>
            );
            return (
              <button onClick={() => setShowNewObj(true)}
                style={{ width: "100%", background: "transparent", border: `1.5px solid ${C.border}`, borderRadius: 14, padding: "11px", fontSize: 12, color: "#999", cursor: "pointer", marginBottom: 16, fontFamily: F.title, letterSpacing: "0.06em" }}>
                + NOUVEL OBJECTIF
              </button>
            );
          })()}

          {/* ── PHRASE DE MOTIVATION ── */}
          {activeObj && activeObj.week > 0 && (() => {
            const MOTIVATIONS = [
              "La régularité bat le talent quand le talent ne s'entraîne pas.",
              "Chaque km aujourd'hui, c'est de la confiance pour le jour J.",
              "Tu ne cours pas contre les autres. Tu cours pour devenir meilleur que toi hier.",
              "Les jambes lâchent rarement. C'est la tête qui décide.",
              "La douleur de l'entraînement est temporaire. La fierté d'avoir fini, éternelle.",
              "Un pas après l'autre. C'est comme ça qu'on finit les courses impossibles.",
              "Ton corps peut faire bien plus que ce que ton esprit croit.",
              "Ce matin, quelqu'un s'entraîne. Quand tu le croiseras, l'un de vous sera prêt.",
              "Le meilleur entraîneur c'est la constance. Pas la perfection.",
              "Les bonnes séances s'oublient. Les bonnes décisions restent.",
              "Lent, c'est régulier. Régulier, c'est rapide.",
              "Le doute est normal. Continue quand même.",
              "Ta prochaine course ne se gagne pas le jour J — elle se gagne maintenant.",
              "Chaque séance est un dépôt sur ton compte Finisher.",
              "Courir c'est simple : mets tes chaussures. Le reste vient tout seul.",
              "Le trail ne ment pas. Il révèle qui tu es vraiment.",
              "Les champions s'entraînent quand personne ne regarde.",
              "Fatigue passagère. Forme permanente.",
              "Ton corps est capable. Laisse-le prouver.",
              "Chaque jour où tu enfiles tes chaussures, tu gagnes.",
              "La course commence dans la tête.",
              "Si c'était facile, tout le monde le ferait.",
              "L'affûtage c'est aussi de l'entraînement — apprendre à se reposer.",
              "Fais confiance au programme. Il a été fait pour toi.",
              "Cette semaine compte. Même quand ça ne se voit pas encore.",
              "Le jour J, tu te souviendras de cette séance.",
            ];
            const idx = (activeObj.week - 1) % MOTIVATIONS.length;
            return (
              <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 16, marginTop: 4, marginBottom: 16 }}>
                <div style={{ fontSize: 10, color: C.creamDim, letterSpacing: "0.1em", fontWeight: 600, marginBottom: 8, textTransform: "uppercase" }}>Cette semaine</div>
                <div style={{ fontSize: 14, color: "#555", lineHeight: 1.75, fontStyle: "italic" }}>"{MOTIVATIONS[idx]}"</div>
              </div>
            );
          })()}

          {/* ── ALERTE VMA / FCmax ── */}
          {(!user.vma || !user.fcMax) && activeObj && (
            <div onClick={() => setEditProfil(true)}
              style={{ marginBottom: 14, background: `${C.yellow}12`, border: `1px solid ${C.yellow}35`, borderRadius: 14, padding: "12px 16px", cursor: "pointer", display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ fontSize: 16 }}>📏</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: "#7a5c00", marginBottom: 1 }}>
                  {!user.vma && !user.fcMax ? "VMA et FC max non renseignées" : !user.vma ? "VMA non renseignée" : "FC max non renseignée"}
                </div>
                <div style={{ fontSize: 12, color: "#888" }}>Compléter dans Profil → <strong style={{ color: "#7a5c00" }}>Modifier →</strong></div>
              </div>
            </div>
          )}

          {/* ── FINISHER CARDS ── */}
          {objectifs.filter(o => o.archived).length > 0 && (
            <div>
              <div style={{ fontSize: 10, color: C.creamDim, letterSpacing: "0.1em", fontWeight: 600, marginBottom: 10, textTransform: "uppercase" }}>Objectif réalisé</div>
              {objectifs.filter(o => o.archived).map((obj) => (
                <div key={obj.id} style={{ background: C.black, borderRadius: 18, padding: "16px 18px", marginBottom: 10, position: "relative", overflow: "hidden" }}>
                  <div style={{ position: "absolute", top: -30, right: -30, width: 130, height: 130, background: `radial-gradient(circle,${C.yellow}10 0%,transparent 70%)`, pointerEvents: "none" }} />
                  <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 10 }}>
                    <div style={{ fontSize: 24 }}>🏅</div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 14, fontWeight: 700, color: C.cream, marginBottom: 2 }}>{obj.nom}</div>
                      <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)" }}>
                        {[obj.distanceCourseKm && `${obj.distanceCourseKm}km`, obj.isTrail && obj["deniveléCourse"] && obj["deniveléCourse"]!=="0" && `D+${obj["deniveléCourse"]}m`].filter(Boolean).join(" · ")}
                      </div>
                    </div>
                    {obj.tempsFinisher && <span style={{ background: `${C.yellow}18`, color: C.yellow, fontSize: 12, fontWeight: 700, padding: "4px 12px", borderRadius: 50 }}>⏱ {obj.tempsFinisher}</span>}
                  </div>
                  <div style={{ display: "flex", gap: 8 }}>
                    <span style={{ background: "rgba(68,204,136,0.15)", color: "#44CC88", fontSize: 11, fontWeight: 600, padding: "3px 10px", borderRadius: 50 }}>✓ FINISHER</span>
                  </div>
                  <button onClick={() => setShowShare({ type: "sticker", data: { nomCourse: obj.nom, pct: 100, jours: 0 } })}
                    style={{ width: "100%", marginTop: 10, background: `${C.yellow}10`, border: `1px solid ${C.yellow}35`, borderRadius: 10, padding: "8px", color: C.yellow, fontSize: 12, cursor: "pointer", fontFamily: F.title, fontWeight: 700 }}>
                    📤 Partager ma carte
                  </button>
                </div>
              ))}
            </div>
          )}

        </div>}

        {tab === "programme" && <div style={{ animation: "fadeIn .3s ease" }}>
          {activeObjectifs.length > 1 && (
            <div style={{ display: "flex", gap: 8, marginBottom: 14, overflowX: "auto", paddingBottom: 4 }}>
              {objectifs.map((obj, i) => obj.archived ? null : (
                <div key={obj.id} onClick={() => { setActiveIdx(i); setFbSent(false); }}
                  style={{ padding: "8px 16px", borderRadius: 50, border: `1.5px solid ${activeIdx === i ? C.black : C.borderLight}`, background: activeIdx === i ? C.yellow : "transparent", fontSize: 13, cursor: "pointer", fontWeight: activeIdx === i ? 700 : 400, whiteSpace: "nowrap", flexShrink: 0, minHeight: 44, display: "flex", alignItems: "center" }}>{obj.nom}</div>
              ))}
            </div>
          )}

          {loading ? <LoadingProgramme /> : activeObjectifs.length === 0 ? (
            <div style={{ textAlign: "center", padding: "80px 20px" }}>
              <div style={{ fontSize: 48, marginBottom: 14 }}>🏃</div>
              <div style={{ fontFamily: F.title, fontSize: 16, fontWeight: 700, marginBottom: 10 }}>AUCUN OBJECTIF ACTIF</div>
              <Btn onClick={() => setTab("home")}>Retour à l'accueil</Btn>
            </div>
          ) : activeObj && !activeObj.archived ? (
            <div>
              {(() => {
                const weeksToRace = activeObj.dateCourse ? getWeeksToRace(activeObj.dateCourse) : null;
                const totalWeeks = activeObj.dateCourse ? Math.ceil((new Date(activeObj.dateCourse) - new Date()) / (7 * 24 * 60 * 60 * 1000)) + (activeObj.week || 0) : null;
                const phase = (totalWeeks && activeObj.week > 0) ? getPhase(activeObj.week || 0, totalWeeks) : null;
                const isRecovery = isRecoveryWeek(activeObj.week || 0);
                return (
                  <div style={{ marginBottom: 16 }}>
                    <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 8 }}>
                      {activeObj.week > 0 && <div style={{ fontSize: 11, fontWeight: 700, color: "#888", fontFamily: F.title, letterSpacing: "0.1em" }}>SEMAINE {activeObj.week}</div>}
                      {weeksToRace === 0 && <div style={{ fontSize: 12, fontWeight: 700, color: C.black, fontFamily: F.title }}>🏆 JOUR J</div>}
                    </div>
                    <h2 style={{ fontFamily: F.title, fontSize: 20, fontWeight: 700, letterSpacing: "0.04em", margin: "0 0 4px", color: C.black, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{activeObj.nom}</h2>

                    {phase && <div style={{ fontSize: 13, color: "#666", marginTop: 5, fontStyle: "italic" }}>{phase.desc}</div>}
                  </div>
                );
              })()}

              {!(activeObj.days && activeObj.days.filter(d=>!d.isRest).length > 0) ? (
                <div style={{ padding: "8px 0 20px" }}>
                  <p style={{ color: "#555", fontSize: 14, marginBottom: 20, lineHeight: 1.6 }}>
                    Ton programme est prêt à être généré.
                  </p>
                  <Btn full onClick={() => generateWeek(null)} style={{ minHeight: 54, fontSize: 16, fontWeight: 700 }}>Générer ma 1ère semaine →</Btn>
                </div>
              ) : (
                <div>
                  {(() => { const p = parseProgramme(activeObj.programme); return p.intro ? <div style={{ fontFamily: F.title, fontSize: 11, fontWeight: 700, letterSpacing: "0.1em", color: C.creamDim, marginBottom: 14, textTransform: "uppercase" }}>{p.intro}</div> : null; })()}

                  {/* ⚠️ Avertissement incohérence VMA/objectif */}
                  {(() => {
                    const incoh = detectIncoh(user, activeObj);
                    if (!incoh) return null;
                    return (
                      <div style={{ background: "#FF880012", border: "1.5px solid #FF880050", borderRadius: 14, padding: "12px 14px", marginBottom: 14, display: "flex", gap: 10, alignItems: "flex-start" }}>
                        <span style={{ fontSize: 18, flexShrink: 0 }}>⚠️</span>
                        <div style={{ fontSize: 12, color: C.creamDim, lineHeight: 1.7 }}>
                          <strong style={{ color: C.cream, display: "block", marginBottom: 3 }}>Objectif ambitieux par rapport à ta VMA</strong>
                          Ta VMA ({incoh.vma} km/h) permettrait théoriquement {incoh.allureTheo} — ton chrono cible demande {incoh.allureObj}.<br/>
                          Le programme utilisera <strong>ton chrono pour l'allure de course</strong> et ta <strong>VMA pour les séances d'entraînement</strong>. C'est faisable avec de la régularité.
                        </div>
                      </div>
                    );
                  })()}

                  <div style={{ marginBottom: 14 }}>
                    {(activeObj.days || []).map((day, i) => (
                      <DayCard key={i} day={day} isToday={day.jour === JOURS_FR[new Date().getDay()] && !day.isRest} locked={false} onMark={(status, modif) => markDay(i, status, modif)} />
                    ))}
                  </div>

                  

                  {/* Récap semaine */}
                  {(() => {
                    const days = activeObj.days || [];
                    const faites = days.filter(d => !d.isRest && d.status === "done").length;
                    const modifiees = days.filter(d => !d.isRest && d.status === "modified").length;
                    const ratees = days.filter(d => !d.isRest && d.status === "missed").length;
                    const total = days.filter(d => !d.isRest).length;
                    if (total === 0) return null;
                    const pct = total > 0 ? Math.round(((faites + modifiees) / total) * 100) : 0;
                    const weeksToRace = activeObj.dateCourse ? getWeeksToRace(activeObj.dateCourse) : null;
                    const totalWeeks = activeObj.dateCourse ? Math.ceil((new Date(activeObj.dateCourse) - new Date()) / (7 * 24 * 60 * 60 * 1000)) + (activeObj.week || 0) : null;
                    const phase = (totalWeeks && activeObj.week > 0) ? getPhase(activeObj.week || 0, totalWeeks) : null;
                    return (
                      <div style={{ background: C.black, borderRadius: 20, padding: "18px 20px", marginBottom: 14, position: "relative", overflow: "hidden" }}>
                        <div style={{ position: "absolute", top: -20, right: -20, width: 100, height: 100, background: `radial-gradient(circle,${C.yellow}12,transparent 70%)`, pointerEvents: "none" }} />
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 14 }}>
                          <div>
                            <div style={{ fontFamily: F.title, fontSize: 11, fontWeight: 700, letterSpacing: "0.1em", color: C.creamDim, marginBottom: 4 }}>RÉCAP SEMAINE</div>
                            <div style={{ fontFamily: F.title, fontSize: 26, fontWeight: 700, color: C.cream }}>{faites + modifiees}<span style={{ fontSize: 14, color: C.creamDim, fontFamily: F.body, fontWeight: 400 }}>/{total} séances</span></div>
                          </div>
                          <button onClick={() => setShowShare({ type: "sticker", data: { nomCourse: activeObj.nom, pct: Math.round(((activeObj.week||1) / (activeObj.totalWeeks||13)) * 100), jours: (weeksToRace || 0) * 7 } })}
                            style={{ background: `${C.yellow}20`, border: `1px solid ${C.yellow}40`, borderRadius: 12, padding: "8px 14px", color: C.yellow, fontFamily: F.body, fontWeight: 700, fontSize: 13, cursor: "pointer", flexShrink: 0 }}>📤 Partager</button>
                        </div>
                        <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
                          {faites > 0 && <div style={{ background: `${C.success}20`, border: `1px solid ${C.success}30`, borderRadius: 50, padding: "4px 12px", fontSize: 12, color: C.success, fontWeight: 700 }}>✓ {faites} faite{faites > 1 ? "s" : ""}</div>}
                          {modifiees > 0 && <div style={{ background: "rgba(138,125,101,.2)", border: "1px solid rgba(138,125,101,.3)", borderRadius: 50, padding: "4px 12px", fontSize: 12, color: "#8a7d65", fontWeight: 700 }}>⚡ {modifiees} modifiée{modifiees > 1 ? "s" : ""}</div>}
                          {ratees > 0 && <div style={{ background: `${C.danger}20`, border: `1px solid ${C.danger}30`, borderRadius: 50, padding: "4px 12px", fontSize: 12, color: C.danger, fontWeight: 700 }}>✗ {ratees} ratée{ratees > 1 ? "s" : ""}</div>}
                        </div>
                        <div style={{ height: 4, background: "rgba(255,255,255,.08)", borderRadius: 2, overflow: "hidden" }}>
                          <div style={{ height: "100%", width: `${pct}%`, background: C.yellow, borderRadius: 2, transition: "width .5s" }} />
                        </div>
                        <div style={{ fontSize: 12, color: C.creamDim, marginTop: 6 }}>{pct}% de la semaine réalisé</div>
                      </div>
                    );
                  })()}

                  {(activeObj.weekHistory || []).length > 0 && (
                    <button onClick={() => setShowHist(activeObj)} style={{ background: "none", border: `1px solid ${C.borderLight}`, borderRadius: 50, color: C.creamDim, fontSize: 13, cursor: "pointer", padding: "10px 18px", marginBottom: 14, fontFamily: F.body, minHeight: 44, display: "block" }}>📊 Voir mes semaines précédentes</button>
                  )}

                  {/* Bouton évaluer → affiche le feedback */}
                  {fbSent && activeObj?.days?.length > 0 && (() => {
                    const _tw = activeObj.totalWeeks || 0;
                    const _nw = (activeObj.week||0) + 1;
                    return _nw <= _tw && getDaysToRace(activeObj.dateCourse) > 0;
                  })() && (activeObj.week||0) < (activeObj.totalWeeks||999) && (
                    <Btn full onClick={() => { setFbSent(false); setFb({ rating: "", seances: "", corps: "", sommeil: "" }); }} style={{ marginBottom: 14, background: C.black, color: C.yellow }}>
                      Évaluer ma semaine → Générer la S{(activeObj.week||0)+1}
                    </Btn>
                  )}

                  {/* Race Week terminée → Finisher (indépendant de fbSent) */}
                  {(activeObj?.days||[]).length > 0 && (activeObj.week||0) >= (activeObj.totalWeeks||999) && (
                    <Btn full onClick={() => setShowFinisherForm(activeObj)} style={{ marginBottom: 14, background: C.yellow, color: C.black, fontSize: 17, fontWeight: 700, letterSpacing: "0.05em" }}>
                      🏅 Je suis Finisher !
                    </Btn>
                  )}

                  {!fbSent && (
                    <CL style={{ borderColor: C.black, borderWidth: 2 }}>
                      <div style={{ fontFamily: F.title, fontSize: 14, fontWeight: 700, letterSpacing: "0.04em", marginBottom: 6 }}>FIN DE SEMAINE — TON RESSENTI</div>
                      <p style={{ color: C.creamDim, fontSize: 13, marginBottom: 10 }}>Ton retour calibre précisément la semaine suivante.</p>
                      <div style={{ background: `${C.yellow}15`, border: `1px solid ${C.yellow}40`, borderRadius: 10, padding: "9px 14px", fontSize: 12, color: "#555", lineHeight: 1.6, marginBottom: 14 }}>
                        💡 <strong>Pense à cocher "Faite" ou "Ratée"</strong> sur chaque séance — le moteur s'adapte automatiquement à ton prochain programme.
                      </div>
                      {(() => {
                        const days = activeObj?.days || [];
                        const total = days.filter(d => !d.isRest).length;
                        const coched = days.filter(d => !d.isRest && d.done).length;
                        return total > 0 && coched === 0 ? (
                          <div style={{ background: `${C.blue}12`, border: `1px solid ${C.blue}25`, borderRadius: 10, padding: "10px 14px", fontSize: 13, color: C.creamDim, marginBottom: 14 }}>
                            💬 Tu n'as pas encore coché tes séances — ton coach s'adaptera quand même, mais plus tu es précis, plus le programme suivant sera juste.
                          </div>
                        ) : null;
                      })()}
                      <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
                        {["😵 Trop dur", "😤 Difficile", "😊 Parfait", "😎 Trop facile"].map(r => (
                          <div key={r} onClick={() => setFb(f => ({ ...f, rating: r }))} style={{ padding: "10px 14px", borderRadius: 50, border: `1.5px solid ${fb.rating === r ? C.black : C.borderLight}`, background: fb.rating === r ? C.yellow : "transparent", cursor: "pointer", fontSize: 14, transition: "all .15s", fontWeight: fb.rating === r ? 700 : 400, minHeight: 44, display: "flex", alignItems: "center" }}>{r}</div>
                        ))}
                      </div>

                      {/* Corps */}
                      <div style={{ marginBottom: 14 }}>
                        <div style={{ fontSize: 11, color: "#888", fontFamily: F.title, letterSpacing: "0.1em", marginBottom: 8 }}>ÉTAT DU CORPS</div>
                        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                          {["💪 Frais","😐 Normal","🥴 Fatigué"].map(v => (
                            <div key={v} onClick={() => setFb(f=>({...f,corps:v}))}
                              style={{ padding: "9px 14px", borderRadius: 50, border: `1.5px solid ${fb.corps===v?C.black:"#ccc"}`, background: fb.corps===v?C.yellow:"transparent", color: fb.corps===v?C.black:"#333", cursor: "pointer", fontSize: 13, fontWeight: fb.corps===v?700:400, transition: "all .15s", minHeight: 40, display: "flex", alignItems: "center" }}>{v}</div>
                          ))}
                        </div>
                      </div>
                      {/* Sommeil */}
                      <div style={{ marginBottom: 14 }}>
                        <div style={{ fontSize: 11, color: "#888", fontFamily: F.title, letterSpacing: "0.1em", marginBottom: 8 }}>SOMMEIL</div>
                        <div style={{ display: "flex", gap: 8 }}>
                          {["😴 Bon","😶 Moyen","😩 Mauvais"].map(v => (
                            <div key={v} onClick={() => setFb(f=>({...f,sommeil:v}))}
                              style={{ padding: "9px 14px", borderRadius: 50, border: `1.5px solid ${fb.sommeil===v?C.black:"#ccc"}`, background: fb.sommeil===v?C.yellow:"transparent", color: fb.sommeil===v?C.black:"#333", cursor: "pointer", fontSize: 13, fontWeight: fb.sommeil===v?700:400, transition: "all .15s", minHeight: 40, display: "flex", alignItems: "center" }}>{v}</div>
                          ))}
                        </div>
                      </div>
                      <Btn full onClick={() => { if (!fb.rating) return; setFbSent(true); generateWeek(fb); }} disabled={!fb.rating} style={{ minHeight: 52 }}>
                        Générer la semaine {(activeObj.week || 0) + 1} →
                      </Btn>
                    </CL>
                  )}
                </div>
              )}
            </div>
          ) : null}
        </div>}

        {/* ── COACH ── */}
        {tab === "coach" && <div style={{ animation: "fadeIn .3s ease" }}><CoachFAQ /></div>}

        {/* ── PROFIL ── */}
        {tab === "profil" && <div style={{ animation: "fadeIn .3s ease" }}>

          {/* ── HEADER ── */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "0 0 20px" }}>
            <div style={{ fontFamily: F.title, fontSize: 15, fontWeight: 700, letterSpacing: "0.08em" }}>MON PROFIL</div>
            <Btn variant="outline" small onClick={() => { setEditForm({ ...user }); setEditProfil(!editProfil); }} style={{ fontSize: 13, borderRadius: 50, padding: "7px 16px" }}>
              {editProfil ? "Annuler" : "✏️ Modifier"}
            </Btn>
          </div>

          {editProfil ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <CL>
                <div style={{ fontFamily: F.title, fontSize: 11, fontWeight: 700, letterSpacing: "0.1em", marginBottom: 14, color: C.creamDim }}>INFOS DE BASE</div>
                {/* Animal totem */}
                <div style={{ marginBottom: 14 }}>
                  <div style={{ fontSize: 11, color: C.creamDim, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 10 }}>🐾 Animal totem</div>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
                    {ANIMALS_TOTEM.map(a => (
                      <div key={a.emoji} onClick={() => setEditForm(f => ({ ...f, animalTotem: a.emoji }))}
                        style={{ width: 44, height: 44, borderRadius: 12, border: `2px solid ${editForm.animalTotem === a.emoji ? C.black : C.borderLight}`, background: editForm.animalTotem === a.emoji ? C.yellow : "transparent", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, cursor: "pointer", transition: "all .15s" }}>
                        {a.emoji}
                      </div>
                    ))}
                  </div>
                  {editForm.animalTotem && (() => {
                    const a = ANIMALS_TOTEM.find(x => x.emoji === editForm.animalTotem);
                    return a ? <div style={{ fontSize: 12, color: C.creamDim, fontStyle: "italic" }}>"{a.desc}"</div> : null;
                  })()}
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                  <Input label="Prénom" value={editForm.prenom || ""} onChange={v => setEditForm(f => ({ ...f, prenom: v }))} placeholder="Prénom" />
                  <Input label="Âge" type="number" value={editForm.age || ""} onChange={v => setEditForm(f => ({ ...f, age: v }))} placeholder="Ex: 32" />
                  <Input label="Poids (kg)" type="number" value={editForm.poids || ""} onChange={v => setEditForm(f => ({ ...f, poids: v }))} placeholder="Ex: 72" />
                  <Input label="Taille (cm)" type="number" value={editForm.taille || ""} onChange={v => setEditForm(f => ({ ...f, taille: v }))} placeholder="Ex: 175" />
                </div>
              </CL>
              <CL>
                <div style={{ fontFamily: F.title, fontSize: 11, fontWeight: 700, letterSpacing: "0.1em", marginBottom: 12, color: C.creamDim }}>PROFIL SPORTIF</div>
                {[["Niveau", ["Débutant", "Intermédiaire", "Confirmé", "Expert"], "niveau"], ["Volume actuel", ["Moins de 10km", "10-20km", "20-30km", "30-40km", "40-60km", "Plus de 60km"], "volume"]].map(([label, options, field]) => (
                  <div key={field} style={{ marginBottom: 14 }}>
                    <div style={{ fontSize: 11, color: C.creamDim, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 8 }}>{label}</div>
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      {options.map(opt => <Chip key={opt} label={opt} selected={editForm[field] === opt} onClick={() => setEditForm(f => ({ ...f, [field]: opt }))} />)}
                    </div>
                  </div>
                ))}
              </CL>
              <CL>
                <div style={{ fontFamily: F.title, fontSize: 11, fontWeight: 700, letterSpacing: "0.1em", marginBottom: 12, color: C.creamDim }}>📅 JOURS DISPONIBLES</div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {["Lundi","Mardi","Mercredi","Jeudi","Vendredi","Samedi","Dimanche"].map(j => (
                    <Chip key={j} label={j.substring(0,3)} selected={!!(editForm.joursDispo||{})[j]} onClick={() => setEditForm(f => ({ ...f, joursDispo: { ...(f.joursDispo||{}), [j]: !(f.joursDispo||{})[j] } }))} />
                  ))}
                </div>
              </CL>
              <CL style={{ borderColor: `${C.yellow}40`, borderWidth: 2 }}>
                <div style={{ fontFamily: F.title, fontSize: 11, fontWeight: 700, letterSpacing: "0.1em", marginBottom: 12, color: "#555" }}>⚡ DONNÉES DE PERFORMANCE</div>
                <div style={{ background: "transparent", border: "1px solid #ddd5c0", borderRadius: 12, padding: "12px 14px", marginBottom: 10 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: C.black, marginBottom: 4 }}>🏃 VMA (km/h)</div>
                  <div style={{ fontSize: 11, color: "#666", lineHeight: 1.6, marginBottom: 8 }}>
                    Calibre toutes tes allures.<br/>
                    <strong>Test Demi-Cooper :</strong> cours 6min à fond → VMA = distance (m) ÷ 100
                  </div>
                  <Input label="VMA (km/h)" type="number" value={editForm.vma || ""} onChange={v => setEditForm(f => ({ ...f, vma: v }))} placeholder="Ex: 15.5" hint="test terrain ou labo" />
                </div>
                <div style={{ background: "transparent", border: "1px solid #ddd5c0", borderRadius: 12, padding: "12px 14px" }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: C.black, marginBottom: 4 }}>❤️ FC Max (bpm)</div>
                  <div style={{ fontSize: 11, color: "#666", lineHeight: 1.6, marginBottom: 8 }}>
                    Indispensable en trail — zones FC selon ton cœur.<br/>
                    ① Montre GPS · ② 220 − ton âge (approx)
                  </div>
                  <Input label="FC Max (bpm)" type="number" value={editForm.fcMax || ""} onChange={v => setEditForm(f => ({ ...f, fcMax: v }))} placeholder="Ex: 185" hint="montre GPS" />
                </div>
              </CL>
              <CL>
                <div style={{ fontFamily: F.title, fontSize: 11, fontWeight: 700, letterSpacing: "0.1em", marginBottom: 12, color: C.creamDim }}>COMPTE</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
                  {[["Email", user.email], ["Abonnement", "Actif ✓"]].map(([k, v]) => (
                    <div key={k} style={{ display: "flex", justifyContent: "space-between", padding: "10px 0", borderBottom: "1px solid #e8e3d8" }}>
                      <span style={{ fontSize: 12, color: C.creamDim }}>{k}</span>
                      <span style={{ fontSize: 13, fontWeight: 600 }}>{v}</span>
                    </div>
                  ))}
                  <p style={{ color: C.creamDim, fontSize: 13, marginTop: 12, marginBottom: 6 }}>
                    <a href="https://billing.stripe.com" style={{ color: C.black, fontWeight: 700 }} target="_blank" rel="noreferrer">Gérer mon abonnement →</a>
                  </p>
                  <p style={{ color: C.creamDim, fontSize: 13, marginBottom: 14 }}>
                    Support : <a href="mailto:support@focusrun.fr" style={{ color: C.black, fontWeight: 700 }}>support@focusrun.fr</a>
                  </p>
                  <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 14 }}>
                    {[["cgu","CGU"],["privacy","Confidentialité"],["legal","Mentions légales"],["refund","Remboursement"]].map(([k,l]) => (
                      <button key={k} onClick={() => setLegalPage(k)} style={{ background: "none", border: "none", color: C.creamDim, fontSize: 12, cursor: "pointer", textDecoration: "underline", padding: "4px 0", minHeight: 44 }}>{l}</button>
                    ))}
                  </div>
                </div>
                <Btn variant="danger" small full onClick={onLogout} style={{ minHeight: 48 }}>Se déconnecter</Btn>
              </CL>
              <Btn full onClick={() => {
                setUser(u => ({ ...u, ...editForm }));
                mockDB.users[user.email] = { ...mockDB.users[user.email], ...editForm };
                setEditProfil(false);
                setToast({ msg: "Profil mis à jour ✓", type: "success" });
              }} style={{ minHeight: 52, fontSize: 15, fontWeight: 700 }}>Enregistrer</Btn>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>

              {/* ── HERO IDENTITÉ ── */}
              <div style={{ background: C.black, borderRadius: 22, padding: "22px 20px", position: "relative", overflow: "hidden" }}>
                <div style={{ position: "absolute", top: -60, right: -60, width: 200, height: 200, background: `radial-gradient(circle, ${C.yellow}10 0%, transparent 70%)`, pointerEvents: "none" }} />
                <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 18 }}>
                  <div style={{ width: 60, height: 60, background: C.yellow, borderRadius: 18, display: "flex", alignItems: "center", justifyContent: "center", fontSize: user.animalTotem ? 32 : 24, fontWeight: 700, color: C.black, flexShrink: 0 }}>
                    {user.animalTotem || (user.prenom||"?")[0].toUpperCase()}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 20, fontWeight: 700, color: C.cream, letterSpacing: "-0.02em", marginBottom: 3 }}>{user.prenom || "Mon profil"}</div>
                    <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)" }}>
                      {[user.age && `${user.age} ans`, user.poids && `${user.poids}kg`].filter(Boolean).join(" · ") || "Complète ton profil"}
                    </div>
                  </div>
                  {user.niveau && (
                    <div style={{ background: `${C.yellow}20`, color: C.yellow, fontSize: 11, fontWeight: 700, padding: "4px 12px", borderRadius: 50, letterSpacing: "0.04em", flexShrink: 0 }}>
                      {user.niveau.toUpperCase()}
                    </div>
                  )}
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                  {[
                    ["VOLUME", user.volume || "—"],
                    ["PRATIQUE", user.typeObjectif === "trail" ? "Trail" : user.typeObjectif === "route" ? "Route" : "Trail + Route"],
                    ["VMA", user.vma ? `${user.vma} km/h` : "—", !!user.vma],
                    ["FC MAX", user.fcMax ? `${user.fcMax} bpm` : "—", !!user.fcMax],
                  ].map(([label, value, highlight]) => (
                    <div key={label} style={{ background: "rgba(255,255,255,0.05)", borderRadius: 12, padding: "10px 12px" }}>
                      <div style={{ fontSize: 10, color: "rgba(255,255,255,0.35)", letterSpacing: "0.1em", fontWeight: 600, marginBottom: 4, textTransform: "uppercase" }}>{label}</div>
                      <div style={{ fontSize: 15, fontWeight: 700, color: highlight ? C.yellow : C.cream, letterSpacing: "-0.01em" }}>{value}</div>
                    </div>
                  ))}
                </div>
              </div>

              {/* ── JOURS DISPO ── */}
              <div>
                <div style={{ fontSize: 10, color: C.creamDim, letterSpacing: "0.1em", fontWeight: 600, marginBottom: 10, textTransform: "uppercase" }}>Jours disponibles</div>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {["Lundi","Mardi","Mercredi","Jeudi","Vendredi","Samedi","Dimanche"].map(j => {
                    const actif = !!(user.joursDispo||{})[j];
                    return (
                      <div key={j} style={{ padding: "6px 12px", borderRadius: 50, fontSize: 12, fontWeight: 600, background: actif ? C.black : "transparent", color: actif ? C.yellow : C.creamDim, border: `1.5px solid ${actif ? C.black : C.border}` }}>
                        {j.substring(0,3)}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* ── OBJECTIF EN COURS ── */}
              {objectifs.filter(o=>!o.archived).length > 0 && (
                <div>
                  <div style={{ fontSize: 10, color: C.creamDim, letterSpacing: "0.1em", fontWeight: 600, marginBottom: 10, textTransform: "uppercase" }}>Objectif en cours</div>
                  {objectifs.filter(o=>!o.archived).map((obj,i) => (
                    <div key={obj.id} onClick={() => { setActiveIdx(i); setTab("programme"); }}
                      style={{ background: "transparent", border: `1.5px solid ${C.border}`, borderRadius: 16, padding: "14px 16px", display: "flex", alignItems: "center", gap: 12, cursor: "pointer", marginBottom: 8 }}>
                      <div style={{ width: 8, height: 8, borderRadius: "50%", background: C.yellow, flexShrink: 0 }} />
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 14, fontWeight: 700, color: C.black, marginBottom: 2 }}>{obj.nom || "Mon objectif"}</div>
                        <div style={{ fontSize: 11, color: C.creamDim }}>
                          {[obj.distanceCourseKm && `${obj.distanceCourseKm}km`, obj.isTrail && obj["deniveléCourse"] && obj["deniveléCourse"]!=="0" && `D+${obj["deniveléCourse"]}m`, obj.dateCourse && `J-${getDaysToRace(obj.dateCourse)}`].filter(Boolean).join(" · ")}
                        </div>
                      </div>
                      {obj.week > 0 && obj.totalWeeks > 0 && (
                        <div style={{ fontSize: 12, fontWeight: 700, color: C.black }}>S{obj.week}/{obj.totalWeeks}</div>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* ── DONNÉES DE PERF ── */}
              <div>
                <div style={{ fontSize: 10, color: C.creamDim, letterSpacing: "0.1em", fontWeight: 600, marginBottom: 10, textTransform: "uppercase" }}>Données de performance</div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                  {[
                    { icon: "🏃", label: "VMA", value: user.vma, unit: "km/h" },
                    { icon: "❤️", label: "FC Max", value: user.fcMax, unit: "bpm" },
                  ].map(({ icon, label, value, unit }) => (
                    <div key={label} style={{ background: C.black, borderRadius: 16, padding: "14px 16px", position: "relative", overflow: "hidden" }}
                      onClick={() => { setEditForm({ ...user }); setEditProfil(true); }}>
                      <div style={{ position: "absolute", bottom: -20, right: -20, width: 80, height: 80, background: `radial-gradient(circle, ${C.yellow}08 0%, transparent 70%)` }} />
                      <div style={{ fontSize: 18, marginBottom: 8 }}>{icon}</div>
                      <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", letterSpacing: "0.08em", marginBottom: 4, textTransform: "uppercase" }}>{label}</div>
                      {value
                        ? <><div style={{ fontSize: 22, fontWeight: 700, color: C.yellow, letterSpacing: "-0.02em", lineHeight: 1 }}>{value}</div>
                            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", marginTop: 2 }}>{unit}</div></>
                        : <div style={{ fontSize: 13, color: "rgba(255,255,255,0.25)", fontStyle: "italic", marginTop: 4 }}>Non renseigné →</div>
                      }
                    </div>
                  ))}
                </div>
              </div>

              {/* ── FINISHER CARDS ── */}
              {objectifs.filter(o=>o.archived).length > 0 && (
                <div>
                  <div style={{ fontSize: 10, color: C.creamDim, letterSpacing: "0.1em", fontWeight: 600, marginBottom: 10, textTransform: "uppercase" }}>Mes Finisher</div>
                  {objectifs.filter(o=>o.archived).map(obj => (
                    <div key={obj.id} style={{ background: C.black, borderRadius: 16, padding: "14px 16px", display: "flex", alignItems: "center", gap: 12, marginBottom: 8 }}>
                      <div style={{ fontSize: 24, flexShrink: 0 }}>🏅</div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 13, fontWeight: 700, color: C.cream, marginBottom: 2 }}>{obj.nom}</div>
                        <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)" }}>
                          {[obj.distanceCourseKm && `${obj.distanceCourseKm}km`, obj.isTrail && obj["deniveléCourse"] && obj["deniveléCourse"]!=="0" && `D+${obj["deniveléCourse"]}m`].filter(Boolean).join(" · ")}
                        </div>
                      </div>
                      {obj.tempsFinisher && (
                        <div style={{ fontSize: 12, fontWeight: 700, color: C.yellow, background: `${C.yellow}15`, padding: "4px 10px", borderRadius: 50, flexShrink: 0 }}>{obj.tempsFinisher}</div>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* ── COMPTE ── */}
              <div>
                <div style={{ fontSize: 10, color: C.creamDim, letterSpacing: "0.1em", fontWeight: 600, marginBottom: 10, textTransform: "uppercase" }}>Compte</div>
                <div style={{ border: `1.5px solid ${C.border}`, borderRadius: 16, padding: "4px 16px", marginBottom: 10 }}>
                  {[["Email", user.email], ["Abonnement", "Actif ✓"]].map(([k,v],i,arr) => (
                    <div key={k} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 0", borderBottom: i<arr.length-1?`1px solid ${C.border}`:"none" }}>
                      <span style={{ fontSize: 12, color: C.creamDim }}>{k}</span>
                      <span style={{ fontSize: 13, fontWeight: 600, color: k==="Abonnement"?"#44CC88":C.black }}>{v}</span>
                    </div>
                  ))}
                </div>
                <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 10 }}>
                  <a href="https://billing.stripe.com" style={{ fontSize: 13, color: C.black, fontWeight: 700, textDecoration: "none" }} target="_blank" rel="noreferrer">Gérer mon abonnement →</a>
                </div>
                <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 14 }}>
                  {[["cgu","CGU"],["privacy","Confidentialité"],["legal","Mentions légales"],["refund","Remboursement"]].map(([k,l]) => (
                    <button key={k} onClick={() => setLegalPage(k)} style={{ background: "none", border: "none", color: C.creamDim, fontSize: 12, cursor: "pointer", textDecoration: "underline", padding: "4px 0", minHeight: 44 }}>{l}</button>
                  ))}
                </div>
                <Btn variant="danger" small full onClick={onLogout} style={{ minHeight: 48 }}>Se déconnecter</Btn>
              </div>

            </div>

          )}

        </div>}

      </div>

      {/* BOTTOM TAB BAR */}
      <div style={{ position: "fixed", bottom: 0, left: 0, right: 0, background: "rgba(240,234,214,.97)", backdropFilter: "blur(12px)", borderTop: `1px solid ${C.borderLight}`, display: "flex", zIndex: 100 }}>
        {navItems.map(n => (
          <button key={n.id} onClick={() => setTab(n.id)} style={{ flex: 1, background: "transparent", border: "none", cursor: "pointer", padding: "10px 0 8px", display: "flex", flexDirection: "column", alignItems: "center", gap: 3, WebkitTapHighlightColor: "transparent", minHeight: 60 }}>
            <div style={{ fontSize: 20, lineHeight: 1 }}>{n.icon}</div>
            <div style={{ fontSize: 10, fontFamily: F.body, fontWeight: tab === n.id ? 700 : 400, color: tab === n.id ? C.black : C.creamDim, letterSpacing: "0.04em" }}>{n.label}</div>
            {tab === n.id && <div style={{ width: 20, height: 2, background: C.yellow, borderRadius: 1 }} />}
          </button>
        ))}
      </div>

      {/* MODALS */}
      {showNewObj && <Sheet title="NOUVEL OBJECTIF" onClose={() => setShowNewObj(false)}><ObjectifForm onSave={addObjectif} onCancel={() => setShowNewObj(false)} showSeances={true} showParallel={activeObjectifs.length > 0} existingObjectifs={activeObjectifs} /></Sheet>}

      {showEditObj !== null && <Sheet title="MODIFIER L'OBJECTIF" onClose={() => setShowEditObj(null)}><ObjectifForm initialData={objectifs[showEditObj]} onSave={(updated) => { const newObjs = objectifs.map((o, i) => i === showEditObj ? { ...o, ...updated } : o); saveObj(newObjs); setShowEditObj(null); setToast({ msg: "Objectif mis à jour ✓", type: "success" }); }} onCancel={() => setShowEditObj(null)} showSeances={true} showParallel={activeObjectifs.length > 1} existingObjectifs={activeObjectifs} /></Sheet>}

      {showDeleteObj !== null && (
        <Sheet title="Supprimer l'objectif" onClose={() => setShowDeleteObj(null)}>
          <p style={{ color: C.creamDim, fontSize: 15, marginBottom: 20, lineHeight: 1.6 }}>Es-tu sûr de vouloir supprimer <strong style={{ color: C.black }}>"{objectifs[showDeleteObj]?.nom}"</strong> ?</p>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <Btn variant="danger" full onClick={() => deleteObjectif(showDeleteObj)} style={{ minHeight: 52 }}>Supprimer définitivement</Btn>
            <Btn variant="outline" full onClick={() => setShowDeleteObj(null)} style={{ minHeight: 52 }}>Annuler</Btn>
          </div>
        </Sheet>
      )}

      {/* JOUR J — Enregistrer le temps */}
      {showJourJ && (
        <Sheet title="🏆 JOUR J — TON TEMPS" onClose={() => setShowJourJ(null)}>
          <p style={{ color: C.creamDim, fontSize: 14, marginBottom: 20, lineHeight: 1.6 }}>Tu l'as fait ! Entre ton temps pour créer ta card Finisher.</p>
          <Input label="Ton temps de course" value={finisherData.temps} onChange={v => setFinisherData(d => ({ ...d, temps: v }))} placeholder="Ex: 4h32'15" />
          <Btn full onClick={() => {
            const idx = objectifs.findIndex(o => o.id === showJourJ.id);
            if (idx >= 0) { saveObj(objectifs.map((o, i) => i === idx ? { ...o, archived: true, tempsFinisher: finisherData.temps } : o)); }
            setShowShare({ type: "finisher", data: { nomCourse: showJourJ.nom, distance: showJourJ.distanceCourseKm ? `${showJourJ.distanceCourseKm}km` : showJourJ.distanceCourse || "", denivele: showJourJ["deniveléCourse"] && showJourJ["deniveléCourse"] !== "0" ? `D+${showJourJ["deniveléCourse"]}m` : null, temps: finisherData.temps, semaines: showJourJ.week || 0 } });
            setShowJourJ(null); setToast({ msg: "🏅 Tu es Finisher !", type: "celebrate" });
          }} style={{ minHeight: 52 }}>Créer ma card Finisher →</Btn>
        </Sheet>
      )}

      {showFinisherForm && (
        <Sheet title="🏅 OBJECTIF TERMINÉ" onClose={() => setShowFinisherForm(null)}>
          <Input label="Ton temps de course (optionnel)" value={finisherData.temps} onChange={v => setFinisherData(d => ({ ...d, temps: v }))} placeholder="Ex: 4h32'15" />
          <Btn full onClick={() => {
            const idx = objectifs.findIndex(o => o.id === showFinisherForm.id);
            if (idx >= 0) { saveObj(objectifs.map((o, i) => i === idx ? { ...o, archived: true, tempsFinisher: finisherData.temps } : o)); }
            setShowShare({ type: "finisher", data: { nomCourse: showFinisherForm.nom, distance: showFinisherForm.distanceCourseKm ? `${showFinisherForm.distanceCourseKm}km` : showFinisherForm.distanceCourse || "", denivele: showFinisherForm["deniveléCourse"] && showFinisherForm["deniveléCourse"] !== "0" ? `D+${showFinisherForm["deniveléCourse"]}m` : null, temps: finisherData.temps, semaines: showFinisherForm.week || 0 } });
            setShowFinisherForm(null); setToast({ msg: "🏅 Tu es Finisher !", type: "celebrate" });
          }} style={{ minHeight: 52 }}>Créer ma card Finisher →</Btn>
        </Sheet>
      )}

      {showHist && <Sheet title="MES SEMAINES" onClose={() => setShowHist(null)}><HistoriqueRich history={showHist.weekHistory || []} /></Sheet>}
    </div>
  );
}

// ─── ROOT ─────────────────────────────────────────────────────────────────────
export default function App() {
  const [screen, setScreen] = useState("splash");
  const [user, setUser] = useState(null);
  return (
    <>
      <style>{`*{box-sizing:border-box;-webkit-font-smoothing:antialiased;}body{margin:0;overscroll-behavior:none;}input,textarea,button{font-family:inherit;}::-webkit-scrollbar{width:0;height:0;}@keyframes fadeIn{from{opacity:0}to{opacity:1}}@keyframes slideUp{from{transform:translateY(100%)}to{transform:translateY(0)}}@keyframes slideIn{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:translateY(0)}}@keyframes popIn{from{opacity:0;transform:scale(.94)}to{opacity:1;transform:scale(1)}}`}</style>
      {screen === "splash" && <Splash onStart={() => setScreen("landing")} onLogin={() => setScreen("login")} />}
      {screen === "landing" && <Landing onLogin={() => setScreen("login")} onRegister={() => setScreen("register")} />}
      {screen === "login" && <Login onSuccess={u => { setUser(u); setScreen("dashboard"); }} onRegister={() => setScreen("register")} onBack={() => setScreen("splash")} />}
      {screen === "register" && <Register onSuccess={u => { setUser(u); setScreen("dashboard"); }} onLogin={() => setScreen("login")} onBack={() => setScreen("splash")} />}
      {screen === "dashboard" && user && <Dashboard user={user} onLogout={() => { setUser(null); setScreen("splash"); }} />}
    </>
  );
}
// ─── ENGINE ─────────────────────────────────────────────────────────────────

// ═══════════════════════════════════════════════════════════════════════
// FOCUS RUN — MOTEUR FINAL
// Coach running/trail — 100% code, adapté et personnalisé
// ═══════════════════════════════════════════════════════════════════════

const JOURS = ["Lundi","Mardi","Mercredi","Jeudi","Vendredi","Samedi","Dimanche"];
const VOL_MAP = {
  "Moins de 10km":8,"10-20km":14,"20-30km":24,
  "30-40km":34,"40-60km":50,"Plus de 60km":65
};

// ─── DATES ──────────────────────────────────────────────────────────────────
function getPhaseInfo(weekNum, totalWeeks) {
  if (!totalWeeks || totalWeeks <= 0 || weekNum <= 0) return null;
  const period = getPeriodisation(totalWeeks);
  if (!period || weekNum > period.length) return null;
  const p = period[weekNum - 1];
  const colors = {
    "Race Week":"#FF5722","Affûtage final":"#FF9800","Affûtage":"#FFC107",
    "Spécifique":"#8BC34A","Développement":"#4CAF50","Construction":"#2196F3"
  };
  return {
    phase: p.phase,
    color: colors[p.phase] || "#2196F3",
    pct: Math.round(weekNum/totalWeeks*100),
    isRecup: p.isRecup || false
  };
}

function getJourCourseIndex(dc) {
  if (!dc) return null;
  const day = new Date(dc+"T00:00:00").getDay(); // 0=dim
  return day === 0 ? 6 : day - 1; // convertir en index JOURS
}

// ─── VMA & ALLURES ──────────────────────────────────────────────────────────
function parseChrono(str) {
  if (!str) return null;
  const p = String(str).trim().split(":").map(Number);
  if (p.some(isNaN)) return null;
  if (p.length===2) return p[0] + p[1]/60;
  if (p.length===3) return p[0]*60 + p[1] + p[2]/60;
  return null;
}
function formatAllure(secKm) {
  if (!secKm||secKm<=0||!isFinite(secKm)) return null;
  const m=Math.floor(secKm/60), s=Math.round(secKm%60);
  return `${m}'${s.toString().padStart(2,"0")}/km`;
}
function calcVMA(user) {
  // Calculer depuis les chronos d'abord
  const refs = [
    {v:user.bestPerf10k,     dist:10,   coef:0.88},
    {v:user.chronoSemi,      dist:21.1, coef:0.82},
    {v:user.bestPerfRoute,   dist:42.2, coef:0.75}, // supposé marathon
    {v:user.chronoMarathon,  dist:42.2, coef:0.75},
    {v:user.bestPerfTrail,   dist:20,   coef:0.75},
  ];
  const vmas = refs.map(r => {
    const mins = parseChrono(r.v);
    if (!mins||mins<=0) return null;
    const spd = r.dist/(mins/60);
    const vma = spd/r.coef;
    return (vma>8&&vma<28) ? vma : null;
  }).filter(Boolean);
  const vmaFromChrono = vmas.length ? vmas.reduce((a,b)=>a+b)/vmas.length : null;
  const vmaManuelle = user.vma ? parseFloat(user.vma) : null;
  const vmaValide = vmaManuelle && vmaManuelle > 8 && vmaManuelle < 28;
  if (!vmaValide) return vmaFromChrono;
  if (!vmaFromChrono) return vmaManuelle;
  // Écart > 15% → chrono prime (plus fiable que VMA déclarée)
  const ecart = Math.abs(vmaManuelle - vmaFromChrono) / vmaFromChrono;
  return ecart > 0.15 ? vmaFromChrono : (vmaManuelle + vmaFromChrono) / 2;
}
function calcAllures(user, obj) {
  const vma = calcVMA(user);
  let courseSec = null;
  if (obj?.chronoCible && obj?.distanceCourseKm) {
    const mins = parseChrono(obj.chronoCible);
    const dist = parseFloat(obj.distanceCourseKm);
    if (mins&&dist>0) courseSec = (mins*60)/dist;
  }
  // Zones FC calculables même sans VMA
  const _fcMaxOnly = user.fcMax ? parseInt(user.fcMax) : null;
  const _fcZonesOnly = (_fcMaxOnly && _fcMaxOnly > 100 && _fcMaxOnly < 250) ? {
    ef:    `${Math.round(_fcMaxOnly*0.65)}-${Math.round(_fcMaxOnly*0.75)} bpm`,
    seuil: `${Math.round(_fcMaxOnly*0.80)}-${Math.round(_fcMaxOnly*0.87)} bpm`,
    vma:   `${Math.round(_fcMaxOnly*0.90)}-${Math.round(_fcMaxOnly*0.95)} bpm`,
  } : null;
  if (!vma) return {
    hasData:false, vma:null,
    ef:null,seuil:null,specif:null,vma100:null,
    fcZones: _fcZonesOnly,
    efLabel:"très facile (parle normalement)",
    seuilLabel:"soutenu (phrases courtes)",
    specifLabel: courseSec ? formatAllure(courseSec) : "allure objectif",
    vmaLabel:"intense (1 mot possible)"
  };
  const vmaS = 3600/vma;
  const ef    = formatAllure(vmaS/0.62);
  const seuil = formatAllure(vmaS/0.82);
  // Trail sans chrono → pas d'allure spécifique (VMA×0.85 irréaliste sur longue distance)
  const _isTrailObj = obj && (obj.isTrail === true);
  const specif = courseSec
    ? formatAllure(courseSec)
    : _isTrailObj ? null : formatAllure(vmaS/0.85);
  const vma100 = formatAllure(vmaS);
  // Zones FC si FCmax renseignée
  let fcZones = null;
  const fcMax = user.fcMax ? parseInt(user.fcMax) : null;
  if (fcMax && fcMax > 100 && fcMax < 250) {
    fcZones = {
      ef:    `${Math.round(fcMax*0.65)}-${Math.round(fcMax*0.75)} bpm`,
      seuil: `${Math.round(fcMax*0.80)}-${Math.round(fcMax*0.87)} bpm`,
      vma:   `${Math.round(fcMax*0.90)}-${Math.round(fcMax*0.95)} bpm`,
    };
  }

  return {hasData:true,vma:Math.round(vma*10)/10,ef,seuil,specif,vma100,
    efLabel:ef,seuilLabel:seuil,specifLabel:specif,vmaLabel:vma100,fcZones};
}

// ─── PÉRIODISATION ───────────────────────────────────────────────────────────
function getPeriodisation(totalWeeks) {
  if (totalWeeks<=0) return [];
  if (totalWeeks===1) return [{phase:"Race Week",volPct:0.40}];
  if (totalWeeks===2) return [
    {phase:"Affûtage final",volPct:0.65},
    {phase:"Race Week",volPct:0.40}];
  if (totalWeeks===3) return [
    {phase:"Affûtage",volPct:0.80},
    {phase:"Affûtage final",volPct:0.65},
    {phase:"Race Week",volPct:0.40}];
  if (totalWeeks<=6) {
    const p=[];
    for(let i=0;i<totalWeeks-2;i++) p.push({phase:"Spécifique",volPct:0.95+i*0.02});
    p.push({phase:"Affûtage final",volPct:0.65});
    p.push({phase:"Race Week",volPct:0.40});
    return p;
  }
  // Construction du plan sur toute la durée
  const nRW=1, nAffF=1, nAff=totalWeeks>=8?1:0;
  const nSpecif = Math.min(5, Math.round(totalWeeks*0.22));
  const nDevel  = Math.min(8, Math.round(totalWeeks*0.36));
  const nConst  = Math.max(0, totalWeeks-nRW-nAffF-nAff-nSpecif-nDevel);
  const p=[];
  // Construction: volume progressif
  for(let i=0;i<nConst;i++)
    p.push({phase:"Construction",volPct:Math.min(0.75+i*0.04,0.95)});
  // Développement: volume + intensité progressifs
  for(let i=0;i<nDevel;i++)
    p.push({phase:"Développement",volPct:Math.min(0.90+i*0.03,1.10)});
  // Spécifique: maintien volume, séances ciblées
  for(let i=0;i<nSpecif;i++)
    p.push({phase:"Spécifique",volPct:1.00});
  if(nAff) p.push({phase:"Affûtage",volPct:0.80});
  p.push({phase:"Affûtage final",volPct:0.65});
  p.push({phase:"Race Week",volPct:0.40});
  // Semaines de récup toutes les 4 semaines (hors affûtage/Race Week)
  return p.map((s,i) => {
    const weekNum = i+1;
    const isRecup = weekNum%4===0 && !["Affûtage","Affûtage final","Race Week"].includes(s.phase);
    return isRecup ? {...s, volPct: s.volPct*0.75, isRecup:true} : s;
  });
}

// ─── SÉANCES ────────────────────────────────────────────────────────────────
const INTENSIFS = new Set(["fractionne","seuil","specif","tempo","cotes"]);
const LONGUES   = new Set(["long_route","long_trail","long_ultra","long_court"]);

function getTypes(phase, nJ, vol, isRoute, isUltra, isDebutant, {red=false,boost=false,weekNum=1}={}) {
  const wMod3 = ((weekNum-1) % 3); // 0,1,2 pour varier
  const wMod4 = ((weekNum-1) % 4); // 0,1,2,3

  // Séance EF de remplissage — varie selon la semaine
  const efFill  = wMod3===0 ? "ef_soutenu" : "ef";
  const ef2Fill = wMod3===1 ? "ef_soutenu" : wMod3===2 ? "recup" : "ef";

  // Type de longue
  const longType = isUltra ? "long_ultra" : isRoute ? "long_route" : "long_trail";

  // ─ Race Week ─
  if(phase==="Race Week") {
    const t=["ef_leger"];
    if(nJ>=2)t.push("ef_leger");
    if(nJ>=3)t.push("activation");
    return t.slice(0,nJ);
  }

  // ─ Affûtage final ─
  if(phase==="Affûtage final") {
    const t=["ef"];
    if(nJ>=2)t.push("activation");
    if(nJ>=3)t.push("ef_soutenu");
    return t.slice(0,nJ);
  }

  // ─ Affûtage ─
  if(phase==="Affûtage") {
    const t=["ef"];
    if(nJ>=2)t.push("long_court");
    if(nJ>=3&&!red)t.push(wMod3===0?"vma_courte":"seuil");
    if(nJ>=4)t.push("ef_soutenu");
    if(nJ>=5)t.push("recup");
    return t.slice(0,nJ);
  }

  // ─ Spécifique ─
  if(phase==="Spécifique") {
    // Intensif qui varie : specif → seuil_long → fractionne_mixte → specif...
    const intensifs = isRoute
      ? ["specif","seuil_long","fractionne_mixte","specif"]
      : isUltra
      ? ["long_ultra","cotes_mixte","tempo","seuil"]
      : ["tempo","cotes_mixte","seuil","fractionne_mixte"];
    const intensif = red ? "recup" : boost ? "seuil_long" : intensifs[wMod4];
    const t=[longType, intensif, "ef"];
    if(nJ>=4)t.splice(2,0,"ef_soutenu"); // position 3 = ef_soutenu pour varier
    if(nJ>=5)t.push(ef2Fill);
    if(nJ>=6)t.push("recup");
    return t.slice(0,nJ);
  }

  // ─ Développement ─
  if(phase==="Développement") {
    // Intensif qui tourne chaque semaine : 4 types différents
    const intensifs = isRoute
      ? ["fractionne","fractionne_mixte","seuil","vma_courte"]
      : isUltra
      ? ["cotes","cotes_mixte","ef_trail","seuil"]
      : ["fractionne","cotes","seuil","cotes_mixte"];
    const intensif = red ? null : boost ? "seuil_long" : intensifs[wMod4];
    const t=[longType, "ef"];
    if(!red && intensif) t.push(intensif);
    if(nJ>=4)t.splice(2,0,"ef_soutenu"); // toujours ef_soutenu pour varier avec ef
    if(nJ>=5)t.push(ef2Fill);
    if(nJ>=6)t.push("recup");
    if(red) { return [longType,"ef","recup"].slice(0,nJ); } // longue toujours présente
    return t.slice(0,nJ);
  }

  // ─ Construction ─
  // En Construction : alternance EF/EF_SOUTENU + côtes si route avancé
  const t=[longType, "ef", "ef_soutenu"];
  if(nJ>=4) t.push(!isDebutant&&isRoute?(wMod3===0?"cotes":wMod3===1?"recup":"ef_leger"):"recup");
  if(nJ>=5)t.push("recup");
  if(nJ>=6)t.push("ef_leger");
  if(red){ return [longType,"ef","recup"].slice(0,nJ); } // longue toujours présente
  return t.slice(0,nJ);
}


function getDuree(type, vol, volMult, distKm, denivKm, wkInPhase) {
  distKm  = distKm  || 10;
  denivKm = denivKm || 0;
  const B = {
    ef:              { min: 45, max: 60 },
    ef_leger:        { min: 25, max: 35 },
    ef_soutenu:      { min: 50, max: 65 },
    long_route:      { min: 60, max: 105 },
    long_trail:      { min: 70, max: 120 },
    long_ultra:      { min: 90, max: 180 },
    long_court:      { min: 45, max: 60 },
    fractionne:      { min: 50, max: 60 },
    fractionne_mixte:{ min: 55, max: 65 },
    seuil:           { min: 50, max: 60 },
    seuil_long:      { min: 55, max: 70 },
    specif:          { min: 50, max: 65 },
    tempo:           { min: 50, max: 65 },
    cotes:           { min: 45, max: 55 },
    cotes_mixte:     { min: 50, max: 60 },
    vma_courte:      { min: 45, max: 55 },
    activation:      { min: 25, max: 35 },
    recup:           { min: 25, max: 35 },
  };
  const b = Object.assign({}, B[type] || { min: 45, max: 60 });
  // Sortie longue — ajustée selon distance objectif et D+
  if (type === "long_route" || type === "long_trail" || type === "long_ultra") {
    const distFactor = distKm<=12?0.75:distKm<=22?0.90:distKm<=43?1.00:distKm<=65?1.20:1.40;
    const denivFactor = denivKm<500?1.00:denivKm<1500?1.10:denivKm<3000?1.20:1.30;
    const longFactor = (type==="long_route") ? distFactor : distFactor*denivFactor;
    b.min = Math.round(b.min*longFactor);
    b.max = Math.round(b.max*longFactor);
    const wk = Math.max(1, wkInPhase||1);
    const progFactor = Math.min(1+(wk-1)*0.06, 1.30);
    b.min = Math.round(b.min*progFactor);
    b.max = Math.round(b.max*progFactor);
  }
  const vf = vol<=15?0.80:vol<=25?0.90:vol>=55?1.10:1.0;
  const pf = Math.min(Math.max(volMult,0.75),1.2);
  const snap = (v) => {
    const steps = [20,25,30,35,40,45,50,55,60,70,75,90,105,120,150,180,210,240,270,300,360];
    return steps.reduce((a,b)=>Math.abs(b-v)<Math.abs(a-v)?b:a);
  };
  const avg = (b.min*vf*pf + b.max*vf*pf)/2;
  const d = snap(Math.round(avg));
  const fmt = (v) => v<60?`${v}min`:v===60?"1h":v%60===0?`${v/60}h`:`${Math.floor(v/60)}h${String(v%60).padStart(2,"0")}`;
  return { min: snap(Math.round(b.min*vf*pf)), max: snap(Math.round(b.max*vf*pf)), label: fmt(d) };
}

function getContenu(type, isRoute, isUltra, al, isDebutant, weekInPhase, niveau, denivKm, wkGlobal, totalWeeks) {
  const _isExpert = !isDebutant && (["Confirmé","Expert"].includes(niveau||""));
  const _wk = weekInPhase || 1;
  const _wkGlobal = wkGlobal || _wk;
  const _tw = totalWeeks || 12;

  const ef_z  = "allure très facile — tu dois pouvoir parler normalement";
  const ef_a  = al.hasData ? `${al.ef} — allure facile, conversation possible` : ef_z;
  const se_z  = "allure soutenue — phrases courtes, tu ressens l'effort";
  const se_a  = al.hasData ? `${al.seuil} — allure soutenue` : se_z;
  const sp_z  = "allure objectif course — tu tiens la cadence";
  const sp_a  = (!al.hasData || !al.specif) ? sp_z : `${al.specif} — ton allure de course`;
  const vm_z  = "allure difficile — 1 mot à la fois";
  const vm_a  = al.hasData ? `${al.vma100} — allure vive` : vm_z;

  const ef_trail  = al.fcZones ? `FC zone 2 (${al.fcZones.ef}) — allure très facile, conversation possible, marche les montées` : "effort très facile — tu peux parler normalement, marche les montées raides";
  const se_trail  = al.fcZones ? `FC zone 3 (${al.fcZones.seuil}) — effort soutenu, phrases courtes possibles` : "effort soutenu — phrases courtes, tu ressens le travail mais restes contrôlé";
  const vm_trail  = al.fcZones ? `FC zone 4 (${al.fcZones.vma}) — effort intense, 1 mot à la fois` : "effort intense — 1 mot à la fois, montées attaquées";

  const ef_t  = isRoute ? ef_a : ef_trail;
  const se_t  = isRoute ? se_a : se_trail;

  const reps400  = Math.min(6 + (_wk-1), 10);
  const reps3030 = Math.min(8 + (_wk-1)*2, 16);
  // repsCote calibré par VMA : VMA faible → moins de reps, VMA haute → plus
  const _vmaBase = al.vma && al.vma > 0
    ? (al.vma < 12 ? 6 : al.vma < 15 ? 8 : al.vma < 18 ? 10 : 12)
    : 8; // défaut sans VMA
  const repsCote = Math.min(_vmaBase + (_wk-1)*2, al.vma && al.vma >= 18 ? 18 : 14);
  const minseuil = Math.min(12 + (_wk-1)*2, 20);

  const M = {
    ef: {
      titre: "Endurance fondamentale", emoji: "🟢",
      objectif: "Développer ta base aérobie sans fatigue — c'est ici que tu progresses vraiment.",
      detail: `✦ Échauffement 10min progressif
✦ Footing régulier à ${ef_t}
✦ Retour au calme 10min + étirements doux

💡 Reste dans le confort — si tu souffles trop, ralentis.`,
    },
    ef_leger: {
      titre: "Footing léger", emoji: "🟢",
      objectif: "Maintenir les jambes en mouvement, récupérer activement.",
      detail: `✦ 5min de marche active
✦ Footing très léger à ${ef_t}
✦ 5min de marche + étirements

💡 Semaine de course — priorité à la fraîcheur.`,
    },
    ef_soutenu: {
      titre: "Endurance progressive", emoji: "🟡",
      objectif: "Habituer ton organisme à passer de facile à modéré dans la même sortie.",
      detail: `✦ Échauffement 10min
✦ 20min à ${ef_t}
✦ 15min en accélérant progressivement vers ${se_t}
✦ Retour au calme 10min

💡 L'accélération doit être douce et progressive.`,
    },
    long_route: {
      titre: !isDebutant && _wkGlobal >= 7
        ? "Sortie longue spécifique"
        : !isDebutant && _wkGlobal >= 4
        ? "Sortie longue progressive"
        : "Sortie longue",
      emoji: "🔵",
      objectif: !isDebutant && _wkGlobal >= 7
        ? "Simuler les conditions de course — tenir l'allure sur jambes fatiguées."
        : !isDebutant && _wkGlobal >= 4
        ? "Développer l'endurance en introduisant une portion à allure soutenue."
        : "Développer l'endurance et habituer ton corps à l'effort prolongé.",
      detail: !isDebutant && _wkGlobal >= 10 && _isExpert
        ? `✦ Échauffement 20min progressif
✦ 30-40min à ${ef_a} — mise en route aérobie
✦ Bloc allure course : 20-25min à ${sp_a} — ton allure marathon exacte
✦ Finition à ${ef_a} — récupération active en courant
✦ Retour au calme 10min

💡 Simule la fatigue des km 30-35 du marathon — séance clé de ta préparation.`
        : !isDebutant && _wkGlobal >= 7
        ? `✦ Échauffement 15min progressif
✦ Footing long à ${ef_a} — les 3/4 de la sortie, reste confortable
✦ Dernier quart à ${sp_a} — ton allure course cible
✦ Retour au calme 10min

💡 La fin à allure course grave la sensation dans tes jambes — séance clé de la semaine.`
        : !isDebutant && _wkGlobal >= 4
        ? `✦ Échauffement 15min progressif
✦ Footing long à ${ef_a} — les 2/3 de la sortie
✦ Dernier tiers : accélère progressivement vers ${se_a}
✦ Retour au calme 10min

💡 Progresser en fin de sortie longue renforce ta résistance à la fatigue.`
        : !isDebutant && _wkGlobal >= 2
        ? `✦ Départ progressif — 10min d'échauffement très léger
✦ Footing long à ${ef_a}
✦ Option : 4-6 accélérations de 20sec en fin de sortie (strides) — jambes légères
✦ Retour au calme 10min

💡 Les strides en fin de sortie réveillent les fibres rapides sans fatiguer.`
        : `✦ Départ progressif — 15min d'échauffement
✦ Footing long à ${ef_a}
✦ Retour au calme 15min

💡 Ne t'emballe pas même si tu te sens bien. Ravitaille si >1h15.`,
    },
    long_trail: {
      titre: _wkGlobal >= 9
        ? "Sortie longue trail spécifique"
        : _wkGlobal >= 5
        ? "Sortie longue trail progressive"
        : "Sortie longue trail",
      emoji: "🔵",
      objectif: _wkGlobal >= 9
        ? "Simuler les conditions de course — dénivelé, durée, gestion de l'effort."
        : _wkGlobal >= 5
        ? "Développer l'endurance trail en introduisant des portions plus intenses."
        : "Développer l'endurance et la résistance musculaire sur terrain varié.",
      detail: (() => {
        // D+ cible selon la semaine et le D+ total de la course
        const _dp = denivKm && denivKm > 0
          ? Math.round((_wkGlobal >= 9 ? 0.50 : _wkGlobal >= 5 ? 0.35 : 0.22) * denivKm / 50) * 50
          : 0;
        const _dpLine = denivKm >= 800 && _dp > 0
          ? `\n✦ Objectif D+ : ~${_dp}m de dénivelé positif`
          : denivKm > 0 && denivKm < 800
          ? `\n✦ Terrain varié avec du relief — cherche les montées`
          : "";
        if (_wkGlobal >= 9) return `✦ Échauffement 20min progressif
✦ Sortie trail à ${ef_trail}${_dpLine}
✦ Partie médiane : accélère sur les replats — ${se_trail}
✦ Dernier tiers : retour à ${ef_trail}
✦ Retour au calme 10min

💡 Simule les conditions du jour J — montées marchées, descentes courues.`;
        if (_wkGlobal >= 5) return `✦ Départ progressif — 15min d'échauffement
✦ Sortie trail à ${ef_trail} — 2/3 de la sortie${_dpLine}
✦ Dernier tiers : accélère progressivement sur les replats
✦ Retour au calme 10min

💡 L'accélération en fin de sortie renforce ta résistance à la fatigue.`;
        return `✦ Départ progressif — 15min d'échauffement
✦ Sortie trail à ${ef_trail} — marche les montées raides${_dpLine}
✦ Retour au calme 15min

💡 Marcher les montées est une vraie technique, pas une faiblesse.`;
      })(),
    },
    long_ultra: {
      titre: "Sortie longue trail D+", emoji: "🔵",
      objectif: "Préparer l'ultra — durée, dénivelé, gestion de l'effort sur la longueur.",
      detail: (() => {
        const _dp = denivKm && denivKm > 0
          ? Math.round((_wkGlobal >= 9 ? 0.50 : _wkGlobal >= 5 ? 0.35 : 0.22) * denivKm / 50) * 50
          : 0;
        const _dpLine = denivKm >= 800 && _dp > 0
          ? `\n✦ Objectif D+ : ~${_dp}m de dénivelé positif`
          : denivKm > 0 && denivKm < 800
          ? `\n✦ Terrain varié avec du relief — cherche les montées`
          : "";
        return `✦ Sortie en terrain montagneux à ${ef_trail}${_dpLine}
✦ Marche systématique en montée
✦ Ravitaillement toutes les 45min

💡 L'objectif c'est finir frais — pas d'ego sur la vitesse.`;
      })(),
    },
    long_court: {
      titre: "Sortie longue réduite", emoji: "🟡",
      objectif: "Maintenir l'endurance en volume réduit — tu entres en affûtage.",
      detail: `✦ Footing à ${ef_t} sur terrain facile
✦ Volume volontairement réduit

💡 Priorité à la fraîcheur — la forme arrive dans les jours qui suivent.`,
    },
    fractionne: {
      titre: "Fractionné VMA", emoji: "🔴",
      objectif: "Développer ta vitesse maximale aérobie — séance clé pour progresser vite.",
      detail: isRoute
        ? `✦ Échauffement 15min + 4×20sec d'accélérations
✦ ${reps400}×400m à ${vm_a} — récupération 90sec entre chaque (marche/trot)
✦ Retour au calme 10min

💡 Chaque répétition doit se sentir difficile mais contrôlé.`
        : `✦ Échauffement 15min
✦ ${repsCote}×45sec en côte à effort fort — redescente en trottinant
✦ Retour au calme 10min

💡 La montée est ton moteur, la descente est ta récup.`,
    },
    fractionne_mixte: {
      titre: "Séance mixte seuil / VMA", emoji: "🔴",
      objectif: "Combiner deux intensités dans la même séance — variété et progression.",
      detail: isRoute
        ? `✦ Échauffement 15min
✦ ${minseuil}min à ${se_a} (effort soutenu mais contrôlé)
✦ 3min de récupération
✦ ${Math.min(4+_wk,8)}×200m à ${vm_a} — récup 45sec
✦ Retour au calme 10min

💡 Commence contrôlé — la fin doit rester vive mais gérable.`
        : `✦ Échauffement 15min
✦ ${minseuil}min à ${se_trail} (effort soutenu mais contrôlé)
✦ 3min de récupération
✦ ${repsCote}×30sec en côte${al.fcZones ? ` — FC zone 4 (${al.fcZones.vma}), effort maximal` : ` — effort maximal, 1 mot à la fois`} — redescente récup
✦ Retour au calme 10min

💡 Commence contrôlé — la fin doit rester explosive mais gérée.`,
    },
    seuil: {
      titre: "Séance au seuil", emoji: "🟠",
      objectif: "Repousser ton seuil — tu cours plus vite sans t'essouffler.",
      detail: `✦ Échauffement 15min
✦ 2×${minseuil}min à ${se_t} — récupération 3min entre les blocs
✦ Retour au calme 10min

💡 L'allure doit être identique sur les deux blocs — régularité avant tout.`,
    },
    seuil_long: {
      titre: "Seuil développé", emoji: "🟠",
      objectif: "Tenir l'allure soutenue plus longtemps — endurance à haute intensité.",
      detail: `✦ Échauffement 15min
✦ ${_wk<=2?2:3}×${Math.min(12+(_wk-1)*3,20)}min à ${se_t} — récup 2min
✦ Retour au calme 10min

💡 Même sensation sur chaque bloc — si le 3e est trop dur, tu es parti trop vite.`,
    },
    specif: {
      titre: "Allure course", emoji: "🟠",
      objectif: "Graver dans les jambes l'allure exacte à tenir le jour J.",
      detail: `✦ Échauffement 15min
✦ 3×10min à ${sp_a} — récupération 3min
✦ Retour au calme 10min

💡 Ferme les yeux, mémorise cette sensation — c'est ton rythme de course.`,
    },
    tempo: {
      titre: "Tempo trail", emoji: "🟠",
      objectif: "Développer la résistance à l'effort soutenu sur terrain trail.",
      detail: `✦ Échauffement 15min
✦ 2×15min sur terrain trail à ${se_trail} — récup 3min
✦ Retour au calme 10min

💡 Terrain varié, allure constante — adapte à la pente.`,
    },
    cotes: {
      titre: "Séance côtes", emoji: "🟠",
      objectif: "Développer la force musculaire et la puissance en montée.",
      detail: `✦ Échauffement 15min
✦ ${repsCote}×30sec en côte (pente 8-12%)${al.fcZones ? ` — FC zone 4 (${al.fcZones.vma}), effort maximal, 1 mot à la fois` : ` — effort maximal, tu ne peux plus parler`} — redescente en trottinant
✦ Retour au calme 10min

💡 Pousse sur les bras, attaque les appuis — c'est du renfo déguisé.`,
    },
    cotes_mixte: {
      titre: "Côtes mixtes", emoji: "🟠",
      objectif: "Développer vitesse ET puissance en montée dans la même séance.",
      detail: `✦ Échauffement 15min
✦ ${Math.min(6+_wk,10)}×25sec en côte (sprint)${al.fcZones ? ` — FC zone 4 (${al.fcZones.vma}), effort max` : ` — effort maximal, 1 mot à la fois`} — redescente récup
✦ 3min de récupération
✦ ${Math.min(3+_wk-1,6)}×1min en côte${al.fcZones ? ` — FC zone 3 (${al.fcZones.seuil}), effort soutenu` : ` — effort soutenu, phrases courtes`} — redescente récup
✦ Retour au calme 10min

💡 Les courtes = vitesse, les longues = puissance.`,
    },
    vma_courte: {
      titre: "30/30 VMA", emoji: "🔴",
      objectif: "Séance VMA courte et intense — booster de vitesse efficace.",
      detail: isRoute
        ? `✦ Échauffement 15min + 4×20sec vives
✦ ${reps3030}×30sec à ${vm_a} / 30sec récup trotinée
✦ Retour au calme 10min

💡 Effort maximal sur les 30sec — récup totale entre chaque.`
        : `✦ Échauffement 15min
✦ ${reps3030}×30sec en côte à fond / 30sec descente récup
✦ Retour au calme 10min

💡 La montée est ton intervalle, la descente est ta récup.`,
    },
    activation: {
      titre: "Séance d'activation", emoji: "🟡",
      objectif: "Maintenir les sensations sans fatiguer — avant-dernière semaine.",
      detail: `✦ 10min de footing léger
✦ 4×20sec d'accélérations progressives
✦ 10min de footing + étirements

💡 Tu dois ressortir frais. Légèreté avant tout.`,
    },
    recup: {
      titre: "Récupération active", emoji: "🟢",
      objectif: "Accélérer la récupération musculaire tout en maintenant le rythme.",
      detail: `✦ Footing ultra-léger — allure très facile, on respire bien
✦ Marche si tu en as envie

💡 Pas de chrono, pas de pression. L'objectif c'est bouger, pas performer.`,
    },
  };
  return M[type] || M.ef;
}


function distribuer(types, joursDispos, dc, weekNum, totalWeeks) {
  const isRaceWeek = weekNum===totalWeeks;
  const jourCourseIdx = getJourCourseIndex(dc);
  const veilleIdx = jourCourseIdx!==null?(jourCourseIdx-1+7)%7:null;
  // En Race Week: exclure jour J, veille ET jours après la course
  const joursUtil = isRaceWeek && dc
    ? joursDispos.filter(j=>{
        const i=JOURS.indexOf(j);
        if(i===jourCourseIdx)return false; // jour de course
        if(i===veilleIdx)return false;     // veille
        // Exclure les jours après la course dans la même semaine
        if(jourCourseIdx!==null && i>jourCourseIdx)return false;
        return true;
      })
    : [...joursDispos];
  const prog = JOURS.map((j,idx)=>({
    jour:j,
    isRest:!joursDispos.includes(j),
    seanceType:null,
    isRaceDay:isRaceWeek&&jourCourseIdx!==null&&idx===jourCourseIdx
  }));
  const longues = types.filter(t=>LONGUES.has(t));
  const autres  = types.filter(t=>!LONGUES.has(t));
  const jr = [...joursUtil];
  if(longues.length>0&&jr.length>0){
    // Priorité week-end pour la sortie longue
    const weekend = ["Samedi","Dimanche"];
    const jourLongue = jr.findLast(j=>weekend.includes(j)) || jr[jr.length-1];
    const e=prog.find(d=>d.jour===jourLongue);
    if(e)e.seanceType=longues[0];
    jr.splice(jr.indexOf(jourLongue),1);
  }
  // Rotation : décaler le point de départ selon weekNum
  const offset = (weekNum-1) % Math.max(1, jr.length);
  const jrRotated = [...jr.slice(offset), ...jr.slice(0, offset)];
  let prevInt=false, ji=0;
  for(let i=0;i<autres.length&&ji<jrRotated.length;i++){
    const t=autres[i];
    const isInt=INTENSIFS.has(t);
    if(isInt&&prevInt&&ji+1<jrRotated.length)ji++;
    const e=prog.find(d=>d.jour===jrRotated[ji]);
    if(e)e.seanceType=t;
    ji++;
    prevInt=isInt;
  }
  return prog;
}

// ─── FEEDBACK ────────────────────────────────────────────────────────────────
function calcAdj(fb) {
  const out={red:false,boost:false,mult:1.0};
  if(!fb)return out;
  let m=1.0;

  // Ressenti global (chips avec emojis)
  const r = fb.ressenti||fb.rating||"";
  if(r.includes("Trop dur"))    {m*=0.88; out.red=true;}
  if(r.includes("Difficile"))   {m*=0.90; out.red=true;}
  if(r.includes("Trop facile")) {m*=1.12; out.boost=true;}

  // Séances Faite/Ratée (comptage depuis les jours)
  const nDone   = fb.nDone   || 0;
  const nMissed = fb.nMissed || 0;
  const nTotal  = fb.nTotal  || 0;
  if(nMissed >= 2)                    {m*=0.88; out.red=true;}
  else if(nMissed === 1)              {m*=0.93;}
  if(nTotal > 0 && nDone === nTotal)  {m*=1.05; out.boost=true;} // tout fait → léger boost

  // Corps
  const corps = fb.corps||"";
  if(corps.includes("Blessé"))   {m*=0.75; out.red=true;}
  if(corps.includes("Fatigué"))  {m*=0.93;}

  // Sommeil
  const som = fb.sommeil||"";
  if(som.includes("Mauvais"))    {m*=0.96;}

  out.mult=Math.max(0.70,Math.min(1.20,m));
  return out;
}

// ─── CONSEILS ────────────────────────────────────────────────────────────────
function getConseils(phase,isRoute,dc,weekNum,totalWeeks,fb) {
  const d=getDaysToRace(dc);
  const dt=dc||"ta course";
  const M={
    "Race Week":[
      "J-2 : prépare ton sac — dossard, chaussures rodées, ravitaillement. Rien de nouveau.",
      "Nutrition : repas habituels et connus. Évite les fibres et les nouveautés alimentaires.",
      `Le ${dt} : pars très prudemment les 1ers km — la course se gagne dans la 2ème moitié.`
    ],
    "Affûtage final":[
      "Volume réduit cette semaine : c'est voulu. Résiste à l'envie d'en faire plus.",
      "Priorité sommeil — 8h/nuit. C'est là que le corps finalise sa préparation.",
      `${d} jours avant le ${dt}. Visualise ton départ, ton allure, tes points clés.`
    ],
    "Affûtage":[
      "Les jambes peuvent sembler lourdes — c'est la fatigue accumulée qui se libère. Bon signe.",
      "Protéines à chaque repas post-séance pour optimiser la récupération musculaire.",
      `${d} jours avant le ${dt}. Le travail est fait, tu affines maintenant.`
    ],
    "Spécifique":[
      isRoute?"Entraîne-toi dans les conditions de la course (même heure, même terrain si possible)."
             :"Valide ton matériel trail (sac, bâtons, chaussures) sur les longues sorties.",
      "Teste ta nutrition de course maintenant — gels, barres, boisson. Rien de nouveau le jour J.",
      `${d} jours avant le ${dt}. Les séances spécifiques construisent ta confiance.`
    ],
    "Développement":[
      fb&&fb.ressenti==="Trop dur"
        ?"Semaine difficile — réduis l'intensité et priorise la récupération."
        :"La progression n'est pas linéaire — une semaine difficile précède souvent un saut de forme.",
      "Mange davantage les jours de longues séances : glucides avant, protéines après.",
      `${d} jours avant le ${dt}. Chaque séance est une brique vers ton objectif.`
    ],
    "Construction":[
      weekNum<=2?"Démarre prudemment — le corps a besoin de 3-4 semaines pour s'adapter."
               :"Régularité avant tout. Respecte les allures faciles — ne pas aller trop vite.",
      "7-9h de sommeil par nuit — c'est là que le corps s'adapte et progresse.",
      `${totalWeeks-weekNum} semaines de programme devant toi — fais confiance au plan.`
    ]
  };
  return M[phase]||M["Construction"];
}

// ─── GÉNÉRATEUR PRINCIPAL ────────────────────────────────────────────────────
function genererSemaine(user, obj, weekNum, feedback) {
  const vol       = VOL_MAP[user.volume]||25;
  const isRoute   = _isRoute(obj);
  const isUltra   = parseInt(obj.distanceCourseKm||0)>=80;
  const isDebutant= user.niveau==="Débutant";
  const al        = calcAllures(user, obj);

  // ── VOLUME DE RÉFÉRENCE CALIBRÉ ───────────────────────────────────────────
  const _vmaVal   = parseFloat(user.vma||0);
  const _distKm   = parseFloat(obj.distanceCourseKm||10);
  const _denivKm  = parseFloat(obj.deniveléCourse||0);
  const _fNiveau  = isDebutant ? 0.80
    : user.niveau==="Intermédiaire" ? 1.00
    : user.niveau==="Confirmé" ? 1.15
    : user.niveau==="Expert"   ? 1.30 : 1.00;
  const _fObj     = _distKm<=6  ? 0.80 : _distKm<=12 ? 0.90 : _distKm<=22 ? 1.00
    : _distKm<=43 ? 1.15 : _distKm<=65 ? 1.25 : 1.35;
  const _fVma     = _vmaVal<=0  ? 1.00 : _vmaVal<12 ? 0.85 : _vmaVal<15 ? 0.95
    : _vmaVal<18 ? 1.05 : 1.15;
  const _fDenivRaw= !isRoute && _denivKm>0
    ? (_denivKm<500?1.00:_denivKm<1500?1.05:_denivKm<3000?1.10:1.20) : 1.00;
  const _fDeniv   = _fDenivRaw;
  const _fObjEff  = !isRoute && _denivKm>500
    ? Math.max(_fObj,_fDenivRaw)/_fObj*1.0 : _fObj;
  const volRef    = Math.min(
    Math.max(Math.round(vol*_fNiveau*_fObjEff*_fVma*_fDeniv), Math.round(vol*0.8)),
    Math.round(vol*1.60)
  );
  // ─────────────────────────────────────────────────────────────────────────
  // Jours disponibles — si aucun coché, fallback selon le volume
  let joursDispos = JOURS.filter(j=>obj.joursDispo&&obj.joursDispo[j]);
  if (joursDispos.length === 0) {
    // Fallback: jours par défaut selon le volume
    const nJoursDefaut = volRef <= 14 ? 2 : volRef <= 25 ? 3 : volRef <= 35 ? 4 : 5;
    const defauts = ["Mardi","Jeudi","Samedi","Lundi","Vendredi","Mercredi"];
    joursDispos = defauts.slice(0, nJoursDefaut);
  }
  const nJoursMax = joursDispos.length;
  // nJoursBase calculé après period (voir ci-dessous)
  const daysLeft  = getDaysToRace(obj.dateCourse);
  const totalWeeks= obj.totalWeeks||(daysLeft!==null?Math.max(1,Math.ceil(daysLeft/7)):8);
  if(weekNum>totalWeeks)return null;
  const period    = getPeriodisation(totalWeeks);
  const {phase,volPct} = period[weekNum-1];
  // Calculer nJoursBase depuis la vraie phase + volRef
  const nJoursBase = (() => {
    const v = volRef;
    if (phase === "Race Week" || phase === "Affûtage final") return Math.min(3, nJoursMax);
    if (phase === "Affûtage") return Math.min(3, nJoursMax);
    if (phase === "Récupération" || (weekNum > 0 && weekNum % 4 === 0)) return Math.min(3, nJoursMax);
    if (phase === "Construction") {
      if (v <= 20) return Math.min(2, nJoursMax);
      if (v <= 30) return Math.min(3, nJoursMax);
      if (v <= 45) return Math.min(4, nJoursMax);
      return Math.min(4, nJoursMax);
    }
    if (phase === "Développement") {
      if (v <= 20) return Math.min(3, nJoursMax);
      if (v <= 35) return Math.min(4, nJoursMax);
      if (v <= 55) return Math.min(5, nJoursMax);
      return Math.min(5, nJoursMax);
    }
    if (phase === "Spécifique") {
      if (v <= 25) return Math.min(3, nJoursMax);
      if (v <= 40) return Math.min(4, nJoursMax);
      if (v <= 55) return Math.min(5, nJoursMax);
      return Math.min(6, nJoursMax);
    }
    return Math.min(3, nJoursMax);
  })();
  // Appliquer la limite — les jours cochés = maximum, pas l'obligation
  // Mais préserver un jour weekend si disponible (pour la sortie longue)
  const _weekend = ["Samedi","Dimanche"];
  const _weekendDispo = joursDispos.find(j=>_weekend.includes(j));
  const _joursSliced = joursDispos.slice(0, nJoursBase);
  // Si le weekend a été coupé par le slice, l'ajouter en remplacement du dernier jour
  if (_weekendDispo && !_joursSliced.includes(_weekendDispo)) {
    // Remplacer le dernier jour non-weekend par le jour weekend
    const lastNonWeekend = [..._joursSliced].reverse().findIndex(j=>!_weekend.includes(j));
    if (lastNonWeekend >= 0) {
      const replaceIdx = _joursSliced.length - 1 - lastNonWeekend;
      _joursSliced[replaceIdx] = _weekendDispo;
      // Retrier dans l'ordre de la semaine
      _joursSliced.sort((a,b)=>JOURS.indexOf(a)-JOURS.indexOf(b));
    }
  }
  joursDispos = _joursSliced;
  const adj       = calcAdj(feedback);
  const volMult   = volPct*adj.mult;
  const volCible  = Math.round(volRef*volMult); // volRef calibré niveau+objectif+VMA+D+
  // Semaine dans la phase courante (pour progression intra-phase)
  let _wkInPhase = 1;
  for (let i = weekNum - 2; i >= 0; i--) {
    if (period[i] && period[i].phase === phase) _wkInPhase++;
    else break;
  }
  const types     = getTypes(phase,joursDispos.length,volRef,isRoute,isUltra,isDebutant,{red:adj.red,boost:adj.boost,weekNum});
  const prog      = distribuer(types,joursDispos,obj.dateCourse,weekNum,totalWeeks);
  const _weekInPhase = _wkInPhase;
  const _niveau = user.niveau || "";
  const days = prog.map(d=>{
    if(d.isRaceDay)return{jour:d.jour,isRest:true,isRaceDay:true,
      titre:"🏁 Jour de course !",duree:"",
      content:"Aujourd'hui c'est le grand jour ! Bonne course !",done:false};
    if(!d.seanceType)return{jour:d.jour,isRest:true,titre:"Repos",duree:"",
      content:"Récupération — ton corps s'adapte et progresse pendant le repos.",done:false};
    const dur=getDuree(d.seanceType,volRef,volMult,_distKm,_denivKm,_wkInPhase);
    const ct=getContenu(d.seanceType,isRoute,isUltra,al,isDebutant,_weekInPhase,_niveau,_denivKm,weekNum,totalWeeks);
    return{jour:d.jour,isRest:false,type:d.seanceType,
      titre:ct.titre,emoji:ct.emoji,duree:dur.label||`${dur.min}-${dur.max}min`,
      objectif:ct.objectif,detail:ct.detail,
      content:`${ct.objectif}\n\n${ct.detail}`,done:false};
  });
  const conseils=getConseils(phase,isRoute,obj.dateCourse,weekNum,totalWeeks,feedback);
  const INTROS={
    "Race Week":"Semaine de course — le travail est fait, arrivons frais.",
    "Affûtage final":"Dernière ligne droite — légèreté et confiance.",
    "Affûtage":"On affûte — moins mais mieux, c'est le moment de briller.",
    "Spécifique":"Séances ciblées sur ton objectif — on entre dans le vif.",
    "Développement":"On monte en puissance — volume et intensité en progression.",
    "Construction":weekNum<=2?"On pose les bases — régularité avant tout.":`Semaine ${weekNum} — la base se consolide, continue.`
  };
  const progText=[INTROS[phase],
    ...days.map(d=>d.isRest?`${d.jour.toUpperCase()} — ${d.titre}`
      :`${d.jour.toUpperCase()} — ${d.titre} — ${d.duree}\n${d.content}`),
    "\nCONSEILS DE LA SEMAINE",
    ...conseils.map((c,i)=>`${i+1}. ${c}`)
  ].join("\n\n");
  return{weekNum,phase,volCible,allures:al,joursDispos,days,conseils,
    totalWeeks,daysLeft,intro:INTROS[phase]||`Semaine ${weekNum}`,
    seancesTypes:days.filter(d=>!d.isRest).map(d=>d.type),programme:progText};
}

// Détecte si VMA et chrono cible sont incohérents
function detectIncoh(user, obj) {
  if (!user.vma || !obj.chronoCible || !obj.distanceCourseKm) return null;
  const vma = parseFloat(user.vma);
  if (!vma || vma <= 0) return null;
  const mins = parseChrono(obj.chronoCible);
  const dist = parseFloat(obj.distanceCourseKm);
  if (!mins || !dist) return null;
  const allureObjSec = (mins * 60) / dist;      // sec/km objectif
  const vmaSecKm     = 3600 / vma;              // sec/km à VMA 100%
  // Allure marathon théorique ≈ VMA × 75%, 10km ≈ VMA × 85%, semi ≈ VMA × 80%
  const facteur = dist <= 12 ? 0.87 : dist <= 22 ? 0.84 : 0.82;
  const allureTheoSec = vmaSecKm / facteur;
  // Incohérent si objectif > 5% plus rapide que ce que la VMA permet
  if (allureObjSec < allureTheoSec * 0.85) {
    const fmt = s => `${Math.floor(s/60)}'${String(Math.round(s%60)).padStart(2,'0')}/km`;
    return {
      vma: vma,
      allureObj: fmt(allureObjSec),
      allureTheo: fmt(allureTheoSec),
    };
  }
  return null;
}

function _isRoute(obj) {
  if(!obj)return false;
  // Source de vérité unique : ce que l'utilisateur a coché dans le toggle
  // isTrail===false → route | isTrail===true → trail | undefined → route par défaut
  return obj.isTrail === false || obj.isTrail === undefined ? true : false;
}


// ─── UTILITAIRES ─────────────────────────────────────────────────────────────


