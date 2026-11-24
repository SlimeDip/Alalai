import React, { useState } from 'react';
import {
  ArrowRight,
  ChevronDown,
  ClipboardList,
  FileCheck2,
  HelpCircle,
  Printer,
  ShieldCheck
} from 'lucide-react';

export default function LandingPage({ onStartAssessment, onOpenLogin }) {
  const [openFaqIndex, setOpenFaqIndex] = useState(null);

  const faqs = [
    { q: "Is this an official government website?", a: "No. We are an independent, free public-service aid navigator. We are NOT affiliated with any government agency. We help you calculate your damages and prepare a neat, printable intake application form that you can take to your local Barangay or relief desk." },
    { q: "Do I have to pay or create an account to use this?", a: "No. The service is 100% free. You can continue as a Guest without creating any account or password." },
    { q: "Will the printed form fit on standard A4 paper?", a: "Yes. Our intake slip is strictly calibrated to fit squarely on 1 single sheet of A4 paper (210mm x 297mm) without spilling over onto a second page." },
    { q: "How does the damage assessment work?", a: "You can choose between the AI Smart Assistant (just type in your own words what got damaged) or the Manual Damage Checklist (simply check the boxes for what happened)." },
    { q: "Can I do this on my smartphone or tablet?", a: "Yes. The portal is designed with large text and big buttons so you can easily fill it out on any smartphone, tablet, or desktop computer." },
    { q: "Where do I bring the printed form?", a: "Bring it to your local Barangay disaster desk or community relief office, along with your valid ID. Programs and requirements vary by area." }
  ];

  const highlights = [
    {
      icon: ClipboardList,
      step: "Step 1",
      title: "Assess Damage Quickly",
      description: "Use the AI Smart Assistant or manual checklist to log household, structural, or livelihood losses."
    },
    {
      icon: FileCheck2,
      step: "Step 2",
      title: "Match Available Aid",
      description: "Browse relevant emergency relief and subsidy programs suited to your reported disaster impact."
    },
    {
      icon: Printer,
      step: "Step 3",
      title: "Print 1-Page A4 Form",
      description: "Generate a clean, ready-to-submit intake form to bring directly to your local Barangay or relief desk."
    }
  ];

  const toggleFaq = (index) => {
    setOpenFaqIndex(openFaqIndex === index ? null : index);
  };

  return (
    <div className="landing-simple">
      <section
        className="landing-hero-simple modern-card"
        style={{
          width: '100%',
          maxWidth: '100%',
          padding: 'clamp(28px, 4.5vw, 52px)',
          borderRadius: 20
        }}
      >
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            padding: '6px 14px',
            borderRadius: 999,
            background: 'rgba(59, 130, 246, 0.14)',
            color: 'var(--primary)',
            fontSize: 13,
            fontWeight: 700,
            letterSpacing: '0.02em',
            marginBottom: 18
          }}
        >
          <ShieldCheck size={16} aria-hidden />
          <span>{"Free & Independent Public-Service Aid Navigator"}</span>
        </div>

        <h1
          className="landing-title"
          style={{
            maxWidth: 920,
            margin: '0 auto 16px',
            lineHeight: 1.08
          }}
        >
          {"DISASTER RELIEF"}
          <br />
          {"ASSISTANCE & AID"}
          <br />
          <span className="landing-title-accent">{"FOR EVERY FAMILY"}</span>
        </h1>

        <p
          className="landing-lead"
          style={{
            maxWidth: 700,
            margin: '0 auto 28px',
            fontSize: 'clamp(15px, 1.8vw, 18px)',
            lineHeight: 1.6
          }}
        >
          {"Assess your disaster damage, find available emergency aid, and prepare a printable application form in minutes. Fast, simple, and free—no account required to start."}
        </p>

        <div className="landing-cta-row" style={{ marginBottom: 36 }}>
          <button type="button" className="btn btn-primary btn-lg" onClick={onStartAssessment}>
            {"Start New Case"} <ArrowRight size={18} aria-hidden />
          </button>
          <button type="button" className="btn btn-secondary btn-lg" onClick={onOpenLogin}>
            {"Sign In"}
          </button>
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
            gap: 16,
            paddingTop: 28,
            borderTop: '1px solid rgba(148, 163, 184, 0.25)',
            textAlign: 'left'
          }}
        >
          {highlights.map((item) => {
            const Icon = item.icon;
            return (
              <div
                key={item.step}
                style={{
                  background: 'rgba(148, 163, 184, 0.08)',
                  border: '1px solid rgba(148, 163, 184, 0.22)',
                  borderRadius: 14,
                  padding: '18px 20px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 8
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span
                    style={{
                      fontSize: 12,
                      fontWeight: 700,
                      textTransform: 'uppercase',
                      letterSpacing: '0.06em',
                      color: 'var(--primary)'
                    }}
                  >
                    {item.step}
                  </span>
                  <Icon size={18} color="var(--primary)" aria-hidden />
                </div>
                <h2 style={{ fontSize: 16, fontWeight: 700, margin: 0, color: 'inherit' }}>
                  {item.title}
                </h2>
                <p style={{ fontSize: 14, lineHeight: 1.5, margin: 0, color: 'inherit', opacity: 0.78 }}>
                  {item.description}
                </p>
              </div>
            );
          })}
        </div>
      </section>

      <section className="landing-faq">
        <div className="landing-faq-header">
          <HelpCircle size={22} color="var(--primary)" aria-hidden />
          <div>
            <h2>{"Frequently Asked Questions"}</h2>
            <p>{"Simple answers to help older adults and affected families"}</p>
          </div>
        </div>

        <div className="landing-faq-list">
          {faqs.map((item, idx) => {
            const isOpen = openFaqIndex === idx;
            const panelId = `faq-panel-${idx}`;

            return (
              <article key={idx} className={`faq-item ${isOpen ? 'open' : ''}`}>
                <button
                  type="button"
                  className="faq-question"
                  onClick={() => toggleFaq(idx)}
                  aria-expanded={isOpen}
                  aria-controls={panelId}
                >
                  <span className="faq-question-text">{item.q}</span>
                  <ChevronDown className="faq-chevron" size={18} aria-hidden />
                </button>

                <div id={panelId} className="faq-answer" aria-hidden={!isOpen} style={{ display: isOpen ? 'block' : 'none' }}>
                  <div className="faq-answer-inner">
                    <p>{item.a}</p>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      </section>
    </div>
  );
}