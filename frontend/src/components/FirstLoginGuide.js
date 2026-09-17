import React, { useCallback, useEffect, useState } from "react";

const SLIDES = [
  { code: "01 / COMMAND", title: "Meet your command center", body: "Your home screen combines open work, active sprints, blockers, GitHub activity, and resource capacity into one live operational summary.", visual: "command" },
  { code: "02 / PLAN", title: "Shape the workspace", body: "Create boards, design custom sprints, add planning widgets, and move or resize the tools that matter to the way you work.", visual: "workspace" },
  { code: "03 / INTELLIGENCE", title: "Ask, act, and stay ahead", body: "Open the universal command palette with Control K. Karmex Intelligence surfaces overdue work, blockers, and delivery risks as they develop.", visual: "intelligence" },
  { code: "04 / SYSTEMS", title: "Connect your operating system", body: "Settings connects GitHub and Google. Files stay private in S3, credentials live in the vault, and your preferred operating mode follows your account.", visual: "systems" },
];

export default function FirstLoginGuide({ user, onComplete }) {
  const [started, setStarted] = useState(false);
  const [index, setIndex] = useState(0);
  const [muted, setMuted] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const slide = SLIDES[index];

  const finish = useCallback(async () => {
    window.speechSynthesis?.cancel();
    setFinishing(true);
    await onComplete();
  }, [onComplete]);

  useEffect(() => {
    if (!started || muted || !window.speechSynthesis) return undefined;
    window.speechSynthesis.cancel();
    const speech = new SpeechSynthesisUtterance(`${slide.title}. ${slide.body}`);
    speech.rate = 0.94;
    speech.pitch = 0.9;
    window.speechSynthesis.speak(speech);
    return () => window.speechSynthesis.cancel();
  }, [index, muted, slide, started]);

  if (!started) return <div className="onboarding-stage"><div className="onboarding-welcome"><div className="onboarding-mark"><i /><i /><i /></div><span className="eyebrow">FIRST LOGIN SEQUENCE</span><h1>Welcome to Karmex LTS, {user?.name?.split(" ")[0] || "Operator"}</h1><p>A short visual and spoken walkthrough will configure your personal command environment.</p><button type="button" className="accent-btn" onClick={() => setStarted(true)}>Start guided tour</button><button type="button" className="briefing-skip" onClick={finish} disabled={finishing}>{finishing ? "Preparing workspace..." : "Skip introduction"}</button></div></div>;

  return <div className="onboarding-stage active"><header><span>KARMEX ORIENTATION</span><div><button type="button" onClick={() => setMuted((value) => !value)}>{muted ? "Enable voice" : "Mute voice"}</button><button type="button" onClick={finish} disabled={finishing}>Skip</button></div></header><main><section className={`onboarding-visual visual-${slide.visual}`} aria-hidden="true"><div className="guide-core"><span /><span /><strong>K</strong></div><div className="guide-lines"><i /><i /><i /><i /></div></section><section className="onboarding-copy"><span>{slide.code}</span><h1>{slide.title}</h1><p>{slide.body}</p><div className="onboarding-dots">{SLIDES.map((item, itemIndex) => <i key={item.code} className={itemIndex === index ? "active" : itemIndex < index ? "done" : ""} />)}</div></section></main><footer><button type="button" onClick={() => setIndex((value) => Math.max(0, value - 1))} disabled={index === 0}>Back</button>{index < SLIDES.length - 1 ? <button type="button" className="accent-btn" onClick={() => setIndex((value) => value + 1)}>Next</button> : <button type="button" className="accent-btn" onClick={finish} disabled={finishing}>{finishing ? "Saving..." : "Enter command center"}</button>}</footer></div>;
}
