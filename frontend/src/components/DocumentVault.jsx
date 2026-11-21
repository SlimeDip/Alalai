import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { FileText, RefreshCw, Trash2, Download, Save } from 'lucide-react';
import { fetchAccountApplications } from '../utils/applicationStorage';
import { fetchOwnedRecoveryCases } from '../utils/trackerApi';
import {
  deleteDocument,
  documentPreviewUrl,
  downloadDocument,
  fetchCaseDocuments,
  updateDocumentMetadata,
  uploadCaseDocument
} from '../utils/documentApi';
import { generateAndDownloadPacket } from '../utils/packetApi';

const CATEGORIES = ['DAMAGE_PHOTO', 'IDENTITY', 'RECEIPT', 'SUPPORTING', 'OTHER'];
const CATEGORY_LABELS = {
  DAMAGE_PHOTO: 'Damage photo',
  IDENTITY: 'Identity document',
  RECEIPT: 'Receipt',
  SUPPORTING: 'Supporting document',
  OTHER: 'Other'
};
const MAX_FILE_SIZE = 10 * 1024 * 1024;
const allowedExtensions = /\.(jpe?g|png|webp|pdf)$/i;

function readableSize(bytes) {
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export default function DocumentVault({ user, csrfToken, initialCaseId = '', onOpenLogin}) {
  const [cases, setCases] = useState([]);
  const [applications, setApplications] = useState([]);
  const [selectedCase, setSelectedCase] = useState('');
  const [documents, setDocuments] = useState([]);
  const [selectedDocuments, setSelectedDocuments] = useState([]);
  const [category, setCategory] = useState('OTHER');
  const [applicationId, setApplicationId] = useState('');
  const [packetApplicationId, setPacketApplicationId] = useState('');
  const [description, setDescription] = useState('');
  const [file, setFile] = useState(null);
  const [progress, setProgress] = useState(0);
  const [metadataDrafts, setMetadataDrafts] = useState({});
  const [previewErrors, setPreviewErrors] = useState({});
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [generatingPacket, setGeneratingPacket] = useState(false);
  const [error, setError] = useState('');
  const isAccountUser = Boolean(user && !user.isGuest);

  const caseApplications = useMemo(
    () => applications.filter((application) => application.case_id === selectedCase),
    [applications, selectedCase]
  );
  useEffect(() => {
    if (!caseApplications.some((application) => application.id === packetApplicationId)) {
      setPacketApplicationId(caseApplications[0]?.id || '');
    }
  }, [caseApplications, packetApplicationId]);
  const refreshDocuments = useCallback(async () => {
    if (!selectedCase) {
      setDocuments([]);
      return;
    }
    setLoading(true);
    setError('');
    try {
      setDocuments(await fetchCaseDocuments(selectedCase));
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setLoading(false);
    }
  }, [selectedCase]);

  useEffect(() => {
    if (!isAccountUser) {
      setCases([]);
      setApplications([]);
      setDocuments([]);
      setSelectedCase('');
      return;
    }
    let active = true;
    setLoading(true);
    setError('');
    Promise.all([fetchOwnedRecoveryCases(), fetchAccountApplications()])
      .then(([recoveryCases, savedApplications]) => {
        if (!active) return;
        setCases(recoveryCases);
        setApplications(savedApplications);
        const preferredCase = recoveryCases.find((item) => (
          item.case_id === initialCaseId || item.id === initialCaseId
        ));
        setSelectedCase((current) => (
          recoveryCases.some((item) => item.case_id === current || item.id === current)
            ? current
            : preferredCase?.case_id || preferredCase?.id || recoveryCases[0]?.case_id || recoveryCases[0]?.id || ''
        ));
      })
      .catch((requestError) => {
        if (active) setError(requestError.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, [initialCaseId, isAccountUser]);

  useEffect(() => {
    refreshDocuments();
  }, [refreshDocuments]);

  const handleUpload = async (event) => {
    event.preventDefault();
    const fileInput = event.currentTarget.querySelector('input[type="file"]');
    if (!file) {
      setError("Choose a file to upload.");
      return;
    }
    if (!allowedExtensions.test(file.name)) {
      setError("Choose a JPG, PNG, WebP, or PDF file.");
      return;
    }
    if (file.size > MAX_FILE_SIZE) {
      setError("The file must be no larger than 10 MB.");
      return;
    }
    setUploading(true);
    setProgress(0);
    setError('');
    try {
      const created = await uploadCaseDocument({
        caseId: selectedCase,
        applicationId,
        category,
        description,
        file,
        csrfToken,
        onProgress: setProgress
      });
      setDocuments((previous) => [created, ...previous]);
      setFile(null);
      setApplicationId('');
      setDescription('');
      setCategory('OTHER');
      setProgress(100);
      if (fileInput) fileInput.value = '';
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setUploading(false);
    }
  };

  const handleDownload = async (documentRecord) => {
    setError('');
    try {
      await downloadDocument(documentRecord.document_id, documentRecord.original_filename);
    } catch (requestError) {
      setError(requestError.message);
    }
  };

  const handleMetadataSave = async (documentRecord) => {
    const draft = metadataDrafts[documentRecord.document_id] || {};
    setError('');
    try {
      const updated = await updateDocumentMetadata(documentRecord.document_id, {
        category: draft.category ?? documentRecord.category,
        description: draft.description ?? documentRecord.description,
        application_id: draft.application_id ?? documentRecord.application_id
      }, csrfToken);
      setDocuments((previous) => previous.map((item) => (
        item.document_id === updated.document_id ? updated : item
      )));
    } catch (requestError) {
      setError(requestError.message);
    }
  };

  const handleDelete = async (documentRecord) => {
    if (!window.confirm(`${"Delete this stored document?"} ${documentRecord.original_filename}?`)) return;
    setError('');
    try {
      await deleteDocument(documentRecord.document_id, csrfToken);
      setDocuments((previous) => previous.filter((item) => item.document_id !== documentRecord.document_id));
      setSelectedDocuments((previous) => previous.filter((id) => id !== documentRecord.document_id));
      setPreviewErrors((previous) => {
        const next = { ...previous };
        delete next[documentRecord.document_id];
        return next;
      });
    } catch (requestError) {
      setError(requestError.message);
    }
  };

  const handleGeneratePacket = async () => {
    if (!packetApplicationId) {
      setError("Select a saved application before generating a packet.");
      return;
    }
    setGeneratingPacket(true);
    setError('');
    try {
      await generateAndDownloadPacket(packetApplicationId, selectedDocuments, csrfToken);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setGeneratingPacket(false);
    }
  };

  const setDraft = (id, field, value) => {
    setMetadataDrafts((previous) => ({
      ...previous,
      [id]: { ...previous[id], [field]: value }
    }));
  };

  if (!isAccountUser) {
    return (
      <div className="modern-card">
        <h1 className="card-heading">{"Private Document Vault"}</h1>
        <p className="card-subheading">{"Sign in to privately store and access case documents."}</p>
        <button type="button" className="btn btn-primary" onClick={onOpenLogin}>{"Sign In"}</button>
      </div>
    );
  }

  return (
    <div className="modern-card">
      <div className="modern-card-header">
        <div>
          <h1 className="card-heading"><FileText size={21} color="var(--primary)" /> {"Private Document Vault"}</h1>
          <p className="card-subheading">{"Store recovery photos and supporting files securely with a recovery case."}</p>
          <p role="note" style={{ color: 'var(--slate-600)', marginTop: 8 }}>{"Files are stored privately on the application server, protected by your account, and are not exposed as public links. Keep originals and remove files you no longer need."}</p>
        </div>
        <button type="button" className="btn btn-secondary btn-sm" onClick={refreshDocuments} disabled={loading || !selectedCase}>
          <RefreshCw size={14} /> {loading ? "Loading…" : "Refresh"}
        </button>
      </div>

      {error && (
        <div role="alert" style={{ backgroundColor: '#fff1f2', border: '1px solid #fecdd3', color: '#9f1239', padding: '10px 14px', borderRadius: 10, marginBottom: 16 }}>
          {error}
        </div>
      )}

      <label className="form-group" style={{ maxWidth: 560, margin: '18px 0' }}>
        <span className="form-label">{"Recovery case"} *</span>
        <select className="form-select" value={selectedCase} onChange={(event) => {
          setSelectedCase(event.target.value);
          setSelectedDocuments([]);
          setApplicationId('');
        }}>
          <option value="">{"Select a saved recovery case"}</option>
          {cases.map((item) => <option key={item.id} value={item.id}>{item.disaster_type} — {item.barangay}, {item.city_municipality}</option>)}
        </select>
      </label>

      <form className="flow-card" onSubmit={handleUpload} style={{ marginBottom: 24 }}>
        <h2 className="application-section-heading">{"Upload document"}</h2>
        <div className="form-grid">
          <label className="form-group">
            <span className="form-label">{"Photo or document"} *</span>
            <input type="file" className="form-input" accept=".jpg,.jpeg,.png,.webp,.pdf" required disabled={uploading || !selectedCase} onChange={(event) => setFile(event.target.files?.[0] || null)} />
            <small>{"JPG, PNG, WebP, or PDF · maximum 10 MB per file"}</small>
          </label>
          <label className="form-group">
            <span className="form-label">{"Category"}</span>
            <select className="form-select" value={category} onChange={(event) => setCategory(event.target.value)}>
              {CATEGORIES.map((item) => <option key={item} value={item}>{CATEGORY_LABELS[item]}</option>)}
            </select>
          </label>
          <label className="form-group">
            <span className="form-label">{"Related saved application (optional)"}</span>
            <select className="form-select" value={applicationId} onChange={(event) => setApplicationId(event.target.value)}>
              <option value="">{"None"}</option>
              {caseApplications.map((item) => <option key={item.id} value={item.id}>{item.reference_number}</option>)}
            </select>
          </label>
          <label className="form-group">
            <span className="form-label">{"Description (optional)"}</span>
            <input className="form-input" maxLength={1000} value={description} onChange={(event) => setDescription(event.target.value)} />
          </label>
        </div>
        <button type="submit" className="btn btn-primary" disabled={uploading || !selectedCase || !file}>
          {uploading ? `${"Uploading"} ${progress}%` : "Upload document"}
        </button>
        {uploading && (
          <progress aria-label={"Document upload progress"} value={progress} max="100" style={{ display: 'block', width: '100%', marginTop: 12 }} />
        )}
      </form>

      <section>
        <h2 className="application-section-heading">{"Documents for this case"}</h2>
        <div className="flow-card" style={{ margin: '14px 0 18px' }}>
          <h3 className="application-section-heading">{"Combined PDF packet"}</h3>
          <p role="note">{"USER-PREPARED DOCUMENT PACKET — NOT PROOF OF OFFICIAL SUBMISSION OR APPROVAL."}</p>
          <div className="form-grid">
            <label className="form-group">
              <span className="form-label">{"Saved application"} *</span>
              <select
                className="form-select"
                required
                value={packetApplicationId}
                onChange={(event) => setPacketApplicationId(event.target.value)}
              >
                <option value="">{"Select a saved application for this case"}</option>
                {caseApplications.map((item) => (
                  <option key={item.id} value={item.id}>{item.reference_number} — {item.applicant_name}</option>
                ))}
              </select>
            </label>
            <div className="form-group">
              <span className="form-label">{"Selected supporting files"}</span>
              <p>{selectedDocuments.length}</p>
            </div>
          </div>
          <button
            type="button"
            className="btn btn-primary"
            disabled={generatingPacket || !packetApplicationId}
            onClick={handleGeneratePacket}
          >
            {generatingPacket ? "Generating packet…" : "Generate and download PDF packet"}
          </button>
          {caseApplications.length === 0 && <p className="card-subheading">{"Save an application linked to this recovery case before generating a packet."}</p>}
        </div>
        {documents.length === 0 && !loading ? (
          <div style={{ textAlign: 'center', padding: '30px 0', color: 'var(--slate-500)' }}>{"No documents are stored for this recovery case yet."}</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {documents.map((item) => {
              const draft = metadataDrafts[item.document_id] || {};
              const categoryValue = draft.category ?? item.category;
              const descriptionValue = draft.description ?? item.description ?? '';
              const applicationValue = draft.application_id ?? item.application_id ?? '';
              const isImage = item.media_type.startsWith('image/');
              return (
                <article key={item.document_id} className="flow-card">
                  <div className="form-grid">
                    <div>
                      {isImage && !previewErrors[item.document_id] ? (
                        <img
                          src={documentPreviewUrl(item.document_id)}
                          alt={item.description || item.original_filename}
                          style={{ maxWidth: '100%', maxHeight: 240, objectFit: 'contain', borderRadius: 8 }}
                          onError={() => setPreviewErrors((previous) => ({ ...previous, [item.document_id]: true }))}
                        />
                      ) : isImage ? (
                        <p role="status">{"Image preview is unavailable. Try downloading the original file."}</p>
                      ) : (
                        <FileText size={40} color="var(--primary)" aria-label={"Photo or document"} />
                      )}
                    </div>
                    <div>
                      <strong>{item.original_filename}</strong>
                      <p className="card-subheading">{item.media_type} · {readableSize(item.file_size)}</p>
                      <p className="card-subheading">{"Uploaded"}: {item.uploaded_at}</p>
                      <label className="form-group">
                        <span className="form-label">{"Category"}</span>
                        <select className="form-select" value={categoryValue} onChange={(event) => setDraft(item.document_id, 'category', event.target.value)}>
                          {CATEGORIES.map((value) => <option key={value} value={value}>{CATEGORY_LABELS[value]}</option>)}
                        </select>
                      </label>
                      <label className="form-group">
                        <span className="form-label">{"Description (optional)"}</span>
                        <input className="form-input" maxLength={1000} value={descriptionValue} onChange={(event) => setDraft(item.document_id, 'description', event.target.value)} />
                      </label>
                      <label className="form-group">
                        <span className="form-label">{"Related saved application (optional)"}</span>
                        <select className="form-select" value={applicationValue} onChange={(event) => setDraft(item.document_id, 'application_id', event.target.value)}>
                          <option value="">{"None"}</option>
                          {caseApplications.map((application) => <option key={application.id} value={application.id}>{application.reference_number}</option>)}
                        </select>
                      </label>
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
                        <button type="button" className="btn btn-secondary btn-sm" onClick={() => handleMetadataSave(item)}><Save size={14} /> {"Save details"}</button>
                        <button type="button" className="btn btn-secondary btn-sm" onClick={() => handleDownload(item)}><Download size={14} /> {"Download"}</button>
                        <button type="button" className="btn btn-secondary btn-sm" onClick={() => handleDelete(item)}><Trash2 size={14} /> {"Delete"}</button>
                      </div>
                    </div>
                  </div>
                  <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, marginTop: 12 }}>
                    <input
                      type="checkbox"
                      checked={selectedDocuments.includes(item.document_id)}
                      onChange={(event) => setSelectedDocuments((previous) => (
                        event.target.checked
                          ? [...previous, item.document_id]
                          : previous.filter((id) => id !== item.document_id)
                      ))}
                    />
                    {"Select for packet download"}
                    {!['image/jpeg', 'image/png', 'application/pdf'].includes(item.media_type) && (
                      <span className="card-subheading">({"This format cannot be included in a PDF packet"})</span>
                    )}
                  </label>
                </article>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
