import { useState, useCallback, useRef } from 'react'
import { useDropzone } from 'react-dropzone'
import { useNavigate } from 'react-router-dom'
import { Upload as UploadIcon, File, CheckCircle, AlertCircle, Loader, Zap, Shield, Camera, QrCode, X } from 'lucide-react'
import { declarationAPI, scanAPI, getWsUrl } from '../services/api.js'
import { getUser, hasPermission } from '../utils/auth.js'
import toast from 'react-hot-toast'
import styles from './Upload.module.css'

const PIPELINE_STAGES = [
  { key: 'upload',   label: 'Document received' },
  { key: 'ocr',      label: 'Processing OCR' },
  { key: 'llm',      label: 'Extracting document information' },
  { key: 'validate', label: 'Validating extracted data' },
  { key: 'done',     label: 'Processing complete' },
]

const STAGE_ORDER = ['upload', 'ocr', 'llm', 'validate', 'done']

export default function Upload() {
  const [file, setFile]           = useState(null)
  const [uploading, setUploading] = useState(false)
  const [currentStage, setCurrentStage] = useState(null)
  const [stageLabel, setStageLabel]     = useState('')
  const [result, setResult]       = useState(null)
  const [error, setError]         = useState(null)
  const [mode, setMode]           = useState(null)
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

  const connectWs = (declarationId) => {
    const wsUrl = getWsUrl('/ws/declaration/' + declarationId)
    try {
      const ws = new WebSocket(wsUrl)
      ws.onmessage = (e) => {
        try {
          const data = JSON.parse(e.data)
          if (data.type === 'stage') {
            setCurrentStage(data.stage)
            setStageLabel(data.label || data.stage)
          } else if (data.type === 'complete') {
            setCurrentStage('done')
            setStageLabel('Processing complete')
            ws.close()
            // Load full declaration result
            declarationAPI.get(declarationId).then(r => {
              setResult(r.data)
              setUploading(false)
              toast.success('Document processed successfully!')
            })
          } else if (data.type === 'error') {
            setError(data.message || 'Processing failed')
            setUploading(false)
            ws.close()
            toast.error('Processing failed')
          }
        } catch {}
      }
      ws.onerror = () => {}
      wsRef.current = ws
    } catch {}
  }

  const handleUpload = async () => {
    if (!file) return
    setUploading(true)
    setError(null)
    setCurrentStage('upload')
    setStageLabel('Document received')

    try {
      const res = await declarationAPI.upload(file)
      const { declaration_id } = res.data
      connectWs(declaration_id)
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Upload failed')
      setUploading(false)
      setCurrentStage(null)
    }
  }

  const startQrSession = async () => {
    try {
      const res = await scanAPI.createSession()
      setQrSession(res.data)
      const wsUrl = getWsUrl('/ws/scan/' + res.data.token)
      const ws = new WebSocket(wsUrl)
      ws.onmessage = (e) => {
        try {
          const data = JSON.parse(e.data)
          if (data.type === 'scan_complete') {
            ws.close()
            toast.success('Document received from phone!')
            navigate('/declarations/' + data.declaration_id)
          }
        } catch {}
      }
      wsRef.current = ws
    } catch { toast.error('Could not create scan session') }
  }

  const cancelQr = () => { wsRef.current?.close(); setQrSession(null); setMode(null) }

  const qrUrl = qrSession ? window.location.origin + '/scan/' + qrSession.token : null

  const stageIndex = STAGE_ORDER.indexOf(currentStage)

  if (result) {
    const val = result.validation_result || {}
    return (
      <div className={styles.page}>
        <div className={styles.resultCard}>
          <div className={styles.resultIcon + ' ' + (val.valid ? styles.success : styles.warning)}>
            {val.valid ? <CheckCircle size={28}/> : <AlertCircle size={28}/>}
          </div>
          <h2 className={styles.resultTitle}>{val.valid ? 'Ready to Submit' : 'Manual Review Required'}</h2>
          <p className={styles.resultSub}>{val.valid ? 'All fields extracted and validated.' : `${val.flagged_fields?.length || 0} field(s) require review.`}</p>
          <div className={styles.resultMeta}>
            <div className={styles.metaItem}><span className={styles.metaLabel}>Score</span><span className={styles.metaValue}>{val.score ?? '—'}/100</span></div>
            <div className={styles.metaItem}><span className={styles.metaLabel}>Time</span><span className={styles.metaValue}>{result.processing_time_ms ? (result.processing_time_ms/1000).toFixed(1)+'s' : '—'}</span></div>
            <div className={styles.metaItem}><span className={styles.metaLabel}>Items</span><span className={styles.metaValue}>{result.line_items?.length ?? 1}</span></div>
            <div className={styles.metaItem}><span className={styles.metaLabel}>Status</span><span className={'badge badge-' + result.status}>{result.status}</span></div>
          </div>
          <div className={styles.resultActions}>
            <button className={styles.secondaryBtn} onClick={() => { setFile(null); setResult(null); setCurrentStage(null); setMode(null) }}>Upload Another</button>
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
            <div className={styles.modeSub}>Generate a QR code, scan with your phone, capture multi-page documents.</div>
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
              <QrCode size={18} /><span>Mobile Scan Session</span>
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
                  <img src={'https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=' + encodeURIComponent(qrUrl)} alt="QR Code" width={200} height={200} />
                </div>
                <div className={styles.qrInstructions}>
                  <p>1. Open your phone camera and scan this QR code</p>
                  <p>2. Take photos of each document page</p>
                  <p>3. Add a document name, then send</p>
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
              <div className={styles.pipelineTitle}>Processing your document...</div>
              <div className={styles.stages}>
                {PIPELINE_STAGES.map((s, i) => {
                  const idx = STAGE_ORDER.indexOf(s.key)
                  const isDone   = stageIndex > idx
                  const isActive = stageIndex === idx
                  return (
                    <div key={s.key} className={styles.stage + (isDone ? ' ' + styles.done : '') + (isActive ? ' ' + styles.active : '')}>
                      <div className={styles.stageDot}>
                        {isDone ? <CheckCircle size={14}/> : isActive ? <Loader size={14} className={styles.spin}/> : <div className={styles.stageDotEmpty}/>}
                      </div>
                      <span>{isActive ? stageLabel : s.label}</span>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {error && <div className={styles.errorBox}><AlertCircle size={14}/> {error}</div>}

          {file && !uploading && (
            <button className={styles.submitBtn2} onClick={handleUpload}><Zap size={15}/> Process with AI</button>
          )}
        </div>
      )}
    </div>
  )
}
