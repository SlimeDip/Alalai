import React, { useState } from 'react';
import { ChevronDown, HelpCircle } from 'lucide-react';

export default function LandingPage({ onStartAssessment, onOpenLogin, t }) {
  const [openFaqIndex, setOpenFaqIndex] = useState(null);

  const faqs = [
    { q: t('faq1Q'), a: t('faq1A') },
    { q: t('faq2Q'), a: t('faq2A') },
    { q: t('faq3Q'), a: t('faq3A') },
    { q: t('faq4Q'), a: t('faq4A') },
    { q: t('faq5Q'), a: t('faq5A') },
    { q: t('faq6Q'), a: t('faq6A') }
  ];

  const toggleFaq = (index) => {
    setOpenFaqIndex(openFaqIndex === index ? null : index);
  };

  return (
    <div className="landing-simple">
      <section className="landing-hero-simple">
        <h1 className="landing-title">
          {t('landingHeroTitle1')}
          <br />
          {t('landingHeroTitle2')}
          <br />
          <span className="landing-title-accent">{t('landingHeroTitle3')}</span>
        </h1>
        <p className="landing-lead">{t('landingSubtitle')}</p>
        <div className="landing-cta-row">
          <button type="button" className="btn btn-primary btn-lg" onClick={onStartAssessment}>
            {t('startNewCase')}
          </button>
          <button type="button" className="btn btn-secondary btn-lg" onClick={onOpenLogin}>
            {t('login')}
          </button>
        </div>
      </section>

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