import { useState, useCallback, useEffect, useRef } from 'react'
import { useDropzone } from 'react-dropzone'
import { useNavigate } from 'react-router-dom'
import { Upload as UploadIcon, File, CheckCircle, AlertCircle, Loader, FileText, Zap, Shield, Camera, QrCode, X } from 'lucide-react'
import { declarationAPI, scanAPI, getWsUrl } from '../services/api.js'
import { getUser, hasPermission } from '../utils/auth.js'
import InsightPanel from '../components/InsightPanel.jsx'
import toast from 'react-hot-toast'
import styles from './Upload.module.css'

const STAGES = [
  { key: 'upload',   label: 'Uploading document' },
  { key: 'ocr',      label: 'OCR text extraction' },
  { key: 'llm',      label: 'AI field extraction' },
  { key: 'validate', label: 'CEISA compliance check' },
  { key: 'insight',  label: 'Generating AI insight' },
  { key: 'done',     label: 'Processing complete' },
]

export default function Upload() {
  const [file, setFile] = useState(null)
  const [uploading, setUploading] = useState(false)
  const [stage, setStage] = useState(-1)
  const [progress, setProgress] = useState(0)
  const [result, setResult] = useState(null)
  const [mode, setMode] = useState(null) // null | 'file' | 'qr'
  const [qrSession, setQrSession] = useState(null)
  const wsRef = useRef(null)
  const navigate = useNavigate()

  const user = getUser()
  if (!hasPermission(user?.role, 'upload')) {
    return (
      <div className={styles.forbidden}>
        <Shield size={40} strokeWidth={1.5} />
        <div className={styles.forbiddenTitle}>Access Restricted</div>
        <div className={styles.forbiddenSub}>Only operators and admins can upload documents.</div>
      </div>
    )
  }

  const onDrop = useCallback(accepted => { if (accepted[0]) setFile(accepted[0]) }, [])
  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop, accept: { 'image/*': [], 'application/pdf': [] }, maxSize: 10 * 1024 * 1024, multiple: false,
  })

  const handleUpload = async () => {
    if (!file) return
    setUploading(true); setStage(0)
    setTimeout(() => setStage(1), 800)
    setTimeout(() => setStage(2), 2200)
    setTimeout(() => setStage(3), 3600)
    setTimeout(() => setStage(4), 4800)
    try {
      const res = await declarationAPI.upload(file, setProgress)
      setStage(5); setResult(res.data)
      toast.success('Document processed successfully!')
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Upload failed')
      setStage(-1)
    } finally { setUploading(false) }
  }

  const startQrSession = async () => {
    try {
      const res = await scanAPI.createSession()
      setQrSession(res.data)
      // Open WebSocket waiting for scan completion
      const wsUrl = getWsUrl('/ws/scan/' + res.data.token)
      const ws = new WebSocket(wsUrl)
      ws.onmessage = (e) => {
        try {
          const data = JSON.parse(e.data)
          if (data.type === 'scan_complete') {
            ws.close()
            navigate('/declarations/' + data.declaration_id)
            toast.success('Phone scan received!')
          }
        } catch {}
      }
      wsRef.current = ws
    } catch { toast.error('Could not create scan session') }
  }

  const cancelQr = () => {
    wsRef.current?.close()
    setQrSession(null)
    setMode(null)
  }

  // QR code URL for display (link to mobile scan page)
  const qrUrl = qrSession ? window.location.origin + '/scan/' + qrSession.token : null

  if (result) {
    const val = result.validation_result || {}
    return (
      <div className={styles.page}>
        <div className={styles.resultCard}>
          <div className={styles.resultIcon + ' ' + (val.valid ? styles.success : styles.warning)}>
            {val.valid ? <CheckCircle size={28}/> : <AlertCircle size={28}/>}
          </div>
          <h2 className={styles.resultTitle}>{val.valid ? 'Ready to Submit to CEISA' : 'Manual Review Required'}</h2>
          <p className={styles.resultSub}>
            {val.valid ? 'All fields extracted and validated.' : val.flagged_fields?.length + ' field(s) require review.'}
          </p>
          <div className={styles.resultMeta}>
            <div className={styles.metaItem}><span className={styles.metaLabel}>Score</span><span className={styles.metaValue}>{val.score ?? '—'}/100</span></div>
            <div className={styles.metaItem}><span className={styles.metaLabel}>Time</span><span className={styles.metaValue}>{result.processing_time_ms ? (result.processing_time_ms/1000).toFixed(2)+'s' : '—'}</span></div>
            <div className={styles.metaItem}><span className={styles.metaLabel}>Status</span><span className={'badge badge-' + result.status}>{result.status}</span></div>
          </div>
          {result.ai_insight && <InsightPanel insight={result.ai_insight} />}
          <div className={styles.resultActions}>
            <button className={styles.secondaryBtn} onClick={() => { setFile(null); setResult(null); setStage(-1); setMode(null) }}>Upload Another</button>
            <button className={styles.primaryBtn} onClick={() => navigate('/declarations/' + result.id)}>View & Submit →</button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <h1 className={styles.title}>Upload CIPL Document</h1>
        <p className={styles.subtitle}>Commercial Invoice, Packing List, or Bill of Lading — JPG, PNG, or PDF up to 10MB</p>
      </div>

      {!mode && (
        <div className={styles.modeGrid}>
          <button className={styles.modeCard} onClick={() => setMode('qr')}>
            <Camera size={32} className={styles.modeIcon} />
            <div className={styles.modeTitle}>Scan via Phone</div>
            <div className={styles.modeSub}>Generate a QR code, scan with your phone camera, and the result appears here automatically.</div>
          </button>
          <button className={styles.modeCard} onClick={() => setMode('file')}>
            <UploadIcon size={32} className={styles.modeIcon} />
            <div className={styles.modeTitle}>Upload File</div>
            <div className={styles.modeSub}>Upload a PDF or image file directly from this device.</div>
          </button>
        </div>
      )}

      {mode === 'qr' && (
        <div className={styles.qrSection}>
          <div className={styles.qrCard}>
            <div className={styles.qrHeader}>
              <QrCode size={18} />
              <span>Mobile Scan Session</span>
              <button className={styles.qrClose} onClick={cancelQr}><X size={14}/></button>
            </div>
            {!qrSession ? (
              <div className={styles.qrInit}>
                <p>Generate a QR code for your phone to scan the document.</p>
                <button className={styles.primaryBtn} onClick={startQrSession}><QrCode size={14}/> Generate QR Code</button>
              </div>
            ) : (
              <div className={styles.qrDisplay}>
                <div className={styles.qrCode}>
                  <img
                    src={'https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=' + encodeURIComponent(qrUrl)}
                    alt="QR Code"
                    width={200} height={200}
                  />
                </div>
                <div className={styles.qrInstructions}>
                  <p>1. Open your phone camera and scan this QR code</p>
                  <p>2. The scan page will open on your phone</p>
                  <p>3. Capture the document with your camera</p>
                  <p>4. This page will update automatically</p>
                  <div className={styles.qrWaiting}><Loader size={14} className={styles.spin}/> Waiting for phone...</div>
                  <div className={styles.qrExpiry}>Session expires in 10 minutes</div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {mode === 'file' && (
        <div className={styles.uploadArea}>
          <div {...getRootProps()} className={styles.dropzone + (isDragActive ? ' ' + styles.active : '') + (file ? ' ' + styles.hasFile : '')}>
            <input {...getInputProps()} />
            {file ? (
              <div className={styles.filePreview}>
                <div className={styles.fileIconWrap}><File size={28} className={styles.fileIcon}/></div>
                <div className={styles.fileName}>{file.name}</div>
                <div className={styles.fileSize}>{(file.size/1024).toFixed(1)} KB</div>
              </div>
            ) : (
              <div className={styles.dropContent}>
                <div className={styles.dropIconWrap}><UploadIcon size={28} className={styles.dropIcon}/></div>
                <div className={styles.dropTitle}>{isDragActive ? 'Release to upload' : 'Drag & drop here'}</div>
                <div className={styles.dropSub}>or <span className={styles.browseLink}>click to browse</span></div>
              </div>
            )}
          </div>

          {uploading && (
            <div className={styles.pipeline}>
              <div className={styles.progressBar}><div className={styles.progressFill} style={{ width: progress + '%' }}/></div>
              <div className={styles.stages}>
                {STAGES.map((s, i) => (
                  <div key={s.key} className={styles.stage + (i < stage ? ' ' + styles.done : '') + (i === stage ? ' ' + styles.active : '')}>
                    <div className={styles.stageDot}>
                      {i < stage ? <CheckCircle size={14}/> : i === stage ? <Loader size={14} className={styles.spin}/> : <div className={styles.stageDotEmpty}/>}
                    </div>
                    <span>{s.label}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {file && !uploading && (
            <button className={styles.submitBtn2} onClick={handleUpload}><Zap size={15}/> Process with AI</button>
          )}
        </div>
      )}
    </div>
  )
}
