import React from 'react';
import { HelpCircle, CheckCircle2, FileText, CloudRain } from 'lucide-react';

export default function LandingPage({ onStartAssessment, t }) {
  const faqs = [
    { q: t('faq1Q'), a: t('faq1A') },
    { q: t('faq2Q'), a: t('faq2A') },
    { q: t('faq3Q'), a: t('faq3A') },
    { q: t('faq4Q'), a: t('faq4A') },
    { q: t('faq5Q'), a: t('faq5A') },
    { q: t('faq6Q'), a: t('faq6A') }
  ];

  return (
    <div className="landing-simple">
      <section className="landing-hero-simple">
        <p className="landing-disclaimer">{t('notAffiliated')}</p>

        <h1 className="landing-title">
          {t('landingHeroTitle1')}
          <br />
          {t('landingHeroTitle2')}
          <br />
          <span className="landing-title-accent">{t('landingHeroTitle3')}</span>
        </h1>

        <p className="landing-lead">{t('landingSubtitle')}</p>

        <div className="landing-cta-row">
          <button type="button" className="btn-pill-primary btn-lg-senior" onClick={onStartAssessment}>
            {t('startAssessment')}
          </button>
        </div>
      </section>

      <section className="landing-trust-row">
        <div className="trust-card">
          <CheckCircle2 size={22} color="var(--emerald-700)" aria-hidden />
          <div>
            <strong>{t('statFreeTitle')}</strong>
            <p>{t('statFreeDesc')}</p>
          </div>
        </div>
        <div className="trust-card">
          <FileText size={22} color="var(--primary)" aria-hidden />
          <div>
            <strong>{t('statPrintTitle')}</strong>
            <p>{t('statPrintDesc')}</p>
          </div>
        </div>
        <div className="trust-card">
          <CloudRain size={22} color="var(--slate-900)" aria-hidden />
          <div>
            <strong>{t('statDisasterTitle')}</strong>
            <p>{t('statDisasterDesc')}</p>
          </div>
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
        <div className="landing-faq-grid">
          {faqs.map((item, idx) => (
            <article key={idx} className="faq-item">
              <h3>{item.q}</h3>
              <p>{item.a}</p>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
