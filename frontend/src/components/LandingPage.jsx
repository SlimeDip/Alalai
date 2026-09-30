import React from 'react';
import {
  ShieldAlert,
  FileSearch,
  Layers,
  Printer,
  ArrowRight,
  PhoneCall,
  CheckCircle2,
  Users,
  Building2,
  HelpCircle,
  FileText
} from 'lucide-react';

export default function LandingPage({
  user,
  onStartAssessment,
  onOpenLogin,
  onExploreSubsidies
}) {
  return (
    <div>
      {/* HERO SECTION */}
      <section className="hero-section">
        <div className="hero-pill">
          <ShieldAlert size={14} />
          <span>Opisyal na Portal sa Pagtugon sa Kalamidad • Republika ng Pilipinas</span>
        </div>

        <h1 className="hero-title">
          Mabilis na Pagtataya ng Pinsala at Pagkuha ng Ayuda sa Kalamidad
        </h1>

        <p className="hero-desc">
          Isang simple at modernong plataporma para sa pamilyang Pilipino. Ilarawan ang nasirang bahay, pananim, o kabuhayan upang matukoy ang angkop na subsidiya ng gobyerno at direktang i-print ang opisyal na intake form.
        </p>

        <div className="hero-actions">
          <button
            type="button"
            className="btn btn-primary btn-lg"
            onClick={onStartAssessment}
          >
            <FileSearch size={18} />
            Magsimula ng Pagsusuri (Start Assessment)
          </button>

          {!user || user.isGuest ? (
            <button
              type="button"
              className="btn btn-secondary btn-lg"
              onClick={onOpenLogin}
            >
              <Users size={18} />
              Mag-login bilang Residente (Resident Login)
            </button>
          ) : (
            <button
              type="button"
              className="btn btn-secondary btn-lg"
              onClick={onExploreSubsidies}
            >
              <Layers size={18} />
              Direktoryo ng Ayuda (Explore Subsidies)
            </button>
          )}
        </div>
      </section>

      {/* QUICK STATUS BAR */}
      <section className="status-bar">
        <div className="status-item">
          <div className="status-icon-box">
            <PhoneCall size={20} />
          </div>
          <div>
            <h4>Emergency Hotlines</h4>
            <p>NDRRMC: 911 • DSWD: (02) 8931-8101</p>
          </div>
        </div>

        <div className="status-item">
          <div className="status-icon-box">
            <CheckCircle2 size={20} />
          </div>
          <div>
            <h4>100% Libre at Walang Bayad</h4>
            <p>Serbisyo publiko para sa mamamayan</p>
          </div>
        </div>

        <div className="status-item">
          <div className="status-icon-box">
            <Building2 size={20} />
          </div>
          <div>
            <h4>Tugma sa Lahat ng LGU</h4>
            <p>Tinatanggap sa Barangay at Munisipyo</p>
          </div>
        </div>
      </section>

      {/* THREE CORE SERVICES */}
      <section style={{ marginBottom: 48 }}>
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <h2 style={{ fontSize: 24, fontWeight: 800, color: 'var(--slate-900)' }}>
            Tatlong Madaling Hakbang Para sa Ayuda
          </h2>
          <p style={{ fontSize: 15, color: 'var(--slate-600)', marginTop: 4 }}>
            Idinisenyo upang maging mabilis, malinaw, at hindi nakakalito para sa bawat mamamayan.
          </p>
        </div>

        <div className="feature-grid">
          {/* Card 1 */}
          <div className="feature-tile">
            <div>
              <div className="tile-icon-box">
                <FileSearch size={24} />
              </div>
              <h3>1. Pagsusuri ng Pinsala</h3>
              <p>
                I-type o piliin ang paglalarawan ng pinsala sa inyong tahanan o pananim. Susuriin ito ng aming AI Engine upang kwentahin ang antas ng pinsala at tinatayang halaga sa Philippine Pesos (₱).
              </p>
            </div>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={onStartAssessment}
            >
              Simulan ang Pagsusuri
              <ArrowRight size={14} />
            </button>
          </div>

          {/* Card 2 */}
          <div className="feature-tile">
            <div>
              <div className="tile-icon-box">
                <Layers size={24} />
              </div>
              <h3>2. Pagtutugma ng Ayuda</h3>
              <p>
                Awtomatikong itutugma ang inyong sitwasyon sa mga opisyal na programa ng gobyerno tulad ng DSWD Emergency Shelter Assistance, DA SURE Calamity Loan, Pag-IBIG, SSS, at LGU Relief.
              </p>
            </div>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={onExploreSubsidies}
            >
              Tingnan ang mga Subsidiya
              <ArrowRight size={14} />
            </button>
          </div>

          {/* Card 3 */}
          <div className="feature-tile">
            <div>
              <div className="tile-icon-box">
                <Printer size={24} />
              </div>
              <h3>3. Aplikasyon at Direktang Pag-print</h3>
              <p>
                Awtomatikong bubuo ng opisyal na Disaster Assistance Family Intake Sheet na maaari mong baguhin o i-edit anumang oras, at direktang i-print para sa lagda ng inyong Punong Barangay.
              </p>
            </div>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={onStartAssessment}
            >
              Subukan ang Intake Slip
              <ArrowRight size={14} />
            </button>
          </div>
        </div>
      </section>

      {/* FREQUENTLY ASKED QUESTIONS (FAQ) */}
      <section className="modern-card">
        <div className="modern-card-header">
          <div>
            <h3 className="card-heading">
              <HelpCircle size={20} color="var(--primary)" />
              Mga Madalas Itanong ng mga Mamamayan (FAQ)
            </h3>
            <p className="card-subheading">Pangunahing impormasyon ukol sa pagkuha ng ayuda sa panahon ng sakuna</p>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 20 }}>
          <div style={{ borderLeft: '3px solid var(--primary)', paddingLeft: 14 }}>
            <h4 style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>
              Kailangan ba ng internet para mag-print ng intake slip?
            </h4>
            <p style={{ fontSize: 13, color: 'var(--slate-600)' }}>
              Maaaring gamitin ang portal sa cellphone o computer. Kapag napunan na ang form, maaari itong i-print sa pinakamalapit na computer shop o dalhin ang kopya sa Barangay Disaster Desk.
            </p>
          </div>

          <div style={{ borderLeft: '3px solid var(--primary)', paddingLeft: 14 }}>
            <h4 style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>
              Paano kung wala pa akong PhilSys National ID?
            </h4>
            <p style={{ fontSize: 13, color: 'var(--slate-600)' }}>
              Tinatanggap din ng mga ahensya ang Senior Citizen ID, Voter's Certification, Barangay Certificate of Indigency, Postal ID, o Driver's License.
            </p>
          </div>

          <div style={{ borderLeft: '3px solid var(--primary)', paddingLeft: 14 }}>
            <h4 style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>
              Maaari ba akong mag-apply bilang bisita (Guest)?
            </h4>
            <p style={{ fontSize: 13, color: 'var(--slate-600)' }}>
              Opo. Hindi sapilitan ang pag-login. Maaari kang magpatuloy bilang bisita at mabubuo pa rin nang kumpleto ang iyong printable intake slip.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
