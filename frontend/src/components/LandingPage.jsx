import React, { useState } from 'react';
import { ChevronDown, HelpCircle, CheckCircle2 } from 'lucide-react';
import RecoveryDashboard from './RecoveryDashboard';

export default function LandingPage({ onStartAssessment, t, lang = 'en' }) {
  const [openItems, setOpenItems] = useState([]);

  const faqs = [
    { q: t('faq1Q'), a: t('faq1A') },
    { q: t('faq2Q'), a: t('faq2A') },
    { q: t('faq3Q'), a: t('faq3A') },
    { q: t('faq4Q'), a: t('faq4A') },
    { q: t('faq5Q'), a: t('faq5A') },
    { q: t('faq6Q'), a: t('faq6A') }
  ];

  const toggleItem = (idx) => {
    setOpenItems((current) =>
      current.includes(idx)
        ? current.filter((item) => item !== idx)
        : [...current, idx]
    );
  };

  const highlights = lang === 'tl'
    ? [
        'Libre at Gabay para sa Mamamayan',
        'AI at Checklist Damage Assessment',
        'Wikang English at Tagalog'
      ]
    : [
        'Free & Citizen-Centered Guide',
        'AI & Checklist Damage Assessment',
        'Available in English & Tagalog'
      ];

  return (
    <div className="landing-simple">
      <section
        className="landing-hero-simple"
        style={{
          maxWidth: '100%',
          padding: '12px 0 0',
          marginBottom: 20
        }}
      >
        <h1
          className="landing-title"
          style={{
            maxWidth: '100%',
            margin: '0 0 14px',
            lineHeight: 1.15
          }}
        >
          {t('landingHeroTitle1')} {t('landingHeroTitle2')}
          <br />
          <span className="landing-title-accent">{t('landingHeroTitle3')}</span>
        </h1>

        <p
          className="landing-lead"
          style={{
            maxWidth: '68ch',
            margin: 0
          }}
        >
          {t('landingSubtitle')}
        </p>

        <div
          style={{
            marginTop: 20,
            paddingTop: 14,
            borderTop: '1px solid rgba(148, 163, 184, 0.22)',
            display: 'flex',
            flexWrap: 'wrap',
            gap: '10px 28px',
            fontSize: 13.5,
            fontWeight: 500,
            color: 'var(--slate-600)'
          }}
        >
          {highlights.map((item) => (
            <span key={item} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <CheckCircle2 size={15} color="var(--primary)" />
              {item}
            </span>
          ))}
        </div>
      </section>

      <RecoveryDashboard onStartCase={onStartAssessment} t={t} />

      <section className="landing-faq">
        <div className="landing-faq-header">
          <HelpCircle size={22} color="var(--primary)" aria-hidden />
          <div>
            <h2>{t('faqTitle')}</h2>
            <p>{t('faqSubtitle')}</p>
          </div>
        </div>
        <div className="landing-faq-list">
          {faqs.map((item, idx) => {
            const isOpen = openItems.includes(idx);
            const panelId = `faq-panel-${idx}`;

            return (
              <article key={idx} className={`faq-item ${isOpen ? 'open' : ''}`}>
                <button
                  type="button"
                  className="faq-question"
                  onClick={() => toggleItem(idx)}
                  aria-expanded={isOpen}
                  aria-controls={panelId}
                >
                  <span className="faq-question-text">{item.q}</span>
                  <ChevronDown className="faq-chevron" size={18} aria-hidden />
                </button>

                <div id={panelId} className="faq-answer" aria-hidden={!isOpen}>
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