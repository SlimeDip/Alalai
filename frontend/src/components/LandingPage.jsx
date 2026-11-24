import React, { useState } from 'react';
import { ChevronDown, HelpCircle, ClipboardList, HandCoins, Printer } from 'lucide-react';

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

  const steps = [
    { icon: ClipboardList, title: "Describe the damage", text: "Type what happened in your own words, or tick a simple checklist." },
    { icon: HandCoins, title: "See possible aid", text: "Get a preliminary list of relief programs that may fit your situation." },
    { icon: Printer, title: "Print your form", text: "Download a one-page A4 intake slip ready for your Barangay desk." }
  ];

  const toggleFaq = (index) => {
    setOpenFaqIndex(openFaqIndex === index ? null : index);
  };

  return (
    <div className="landing-simple">
      <section className="landing-hero-simple">
        <h1 className="landing-title">
          {"DISASTER RELIEF"}
          <br />
          {"ASSISTANCE & AID"}
          <br />
          <span className="landing-title-accent">{"FOR EVERY FAMILY"}</span>
        </h1>
        <p className="landing-lead">{"Assess your disaster damage, find available emergency aid, and prepare a printable application form in minutes. Fast, simple, and free."}</p>
        <div className="landing-cta-row">
          <button type="button" className="btn btn-primary btn-lg" onClick={onStartAssessment}>
            {"Start New Case"}
          </button>
          <button type="button" className="btn btn-secondary btn-lg" onClick={onOpenLogin}>
            {"Sign In"}
          </button>
        </div>
      </section>

      <section className="landing-section" aria-labelledby="how-it-works">
        <h2 id="how-it-works" className="landing-section-title">{"How it works"}</h2>
        <div className="landing-steps">
          {steps.map(({ icon: Icon, title, text }, i) => (
            <article className="landing-step" key={title}>
              <span className="landing-step-num">{i + 1}</span>
              <Icon size={22} color="var(--primary)" aria-hidden />
              <h3>{title}</h3>
              <p>{text}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="landing-faq">
        <div className="landing-faq-header">
          <HelpCircle size={22} color="var(--primary)" aria-hidden />
          <h2>{"Frequently Asked Questions"}</h2>
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