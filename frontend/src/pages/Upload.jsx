import { useState, useCallback, useRef } from 'react'
import { useDropzone } from 'react-dropzone'
import { useNavigate } from 'react-router-dom'
import { UploadCloud, FileText, FileImage, AlertCircle, Loader, Zap, Shield, Camera, QrCode, X } from 'lucide-react'
import { declarationAPI, scanAPI, getWsUrl } from '../services/api.js'
import { getUser, hasPermission } from '../utils/auth.js'
import toast from 'react-hot-toast'
import styles from './Upload.module.css'

function formatFileSize(bytes) {
  if (!bytes && bytes !== 0) return '—'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
}

function fileTypeMeta(file) {
  if (file?.type === 'application/pdf') return { Icon: FileText, label: 'PDF document' }
  if (file?.type?.startsWith('image/')) return { Icon: FileImage, label: 'Image' }
  return { Icon: FileText, label: 'Document' }
}

export default function Upload() {
  const [files, setFiles]                 = useState([])
  // Positional custom names — docNames[i] belongs to files[i]. Empty string
  // means "keep the original filename", matching what the backend expects.
  const [docNames, setDocNames]           = useState([])
  const [uploading, setUploading]         = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [error, setError]                 = useState(null)
  const [mode, setMode]                   = useState(null)
  const [qrSession, setQrSession]         = useState(null)
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

  const onDrop = useCallback(accepted => {
    if (!accepted.length) return
    setFiles(prev => [...prev, ...accepted])
    setDocNames(prev => [...prev, ...accepted.map(() => '')])
  }, [])
  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop, accept: { 'image/*': [], 'application/pdf': [] }, maxSize: 10 * 1024 * 1024, multiple: true,
  })

  // Both lists are positional, so they have to be spliced together —
  // otherwise a rename would end up attached to the wrong file.
  const removeFile = (index) => {
    setFiles(prev => prev.filter((_, i) => i !== index))
    setDocNames(prev => prev.filter((_, i) => i !== index))
  }

  const renameFile = (index, value) =>
    setDocNames(prev => prev.map((n, i) => (i === index ? value : n)))

  const handleUpload = async () => {
    if (files.length === 0) return
    setUploading(true)
    setError(null)
    setUploadProgress(0)

    try {
      const res = await declarationAPI.uploadBatch(files, pct => setUploadProgress(pct), docNames)
      const count = res.data?.count ?? res.data?.declarations?.length ?? files.length
      toast.success(`${count} document${count === 1 ? '' : 's'} queued for processing`)
      navigate('/declarations')
    } catch (e) {
      // A bare "Upload failed" told nobody anything. FastAPI only sends a
      // `detail` for errors it raises deliberately (wrong type, too large);
      // an unhandled crash or a dropped connection arrives with nothing
      // usable, so those cases need their own wording.
      const status = e.response?.status
      const detail = e.response?.data?.detail
      let msg
      if (detail) {
        msg = detail
      } else if (!e.response) {
        msg = 'Tidak bisa menghubungi server. Backend mungkin sedang restart — coba lagi sebentar lagi.'
      } else if (status === 413) {
        msg = 'File terlalu besar. Maksimal 10MB per file.'
      } else if (status === 401 || status === 403) {
        msg = 'Sesi kamu tidak berlaku lagi atau peranmu tidak punya izin upload. Coba login ulang.'
      } else if (status >= 500) {
        msg = `Server gagal memproses upload (error ${status}). Ini bukan soal dokumenmu — laporkan ke tim teknis.`
      } else {
        msg = `Upload gagal (error ${status}).`
      }
      toast.error(msg)
      setError(msg)
      setUploading(false)
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

  return (
    <div className={styles.page}>
     <div className={styles.container}>
      <div className={styles.header}>
        <h1 className={styles.title}>Upload CIPL Document</h1>
        <p className={styles.subtitle}>Commercial Invoice, Packing List, or Bill of Lading — JPG, PNG, or PDF up to 10MB each. You can select multiple files.</p>
      </div>

      {!mode && (
        <div className={styles.modeGrid}>
          <button className={styles.modeCard} onClick={() => setMode('qr')}>
            <div className={styles.modeIconWrap}><Camera size={26} className={styles.modeIcon} /></div>
            <div className={styles.modeTitle}>Scan via Phone</div>
            <div className={styles.modeSub}>Generate a QR code, scan with your phone, capture multi-page documents.</div>
          </button>
          <button className={styles.modeCard} onClick={() => setMode('file')}>
            <div className={styles.modeIconWrap}><UploadCloud size={26} className={styles.modeIcon} /></div>
            <div className={styles.modeTitle}>Upload File</div>
            <div className={styles.modeSub}>Upload one or more PDF or image files directly from this device.</div>
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
          <div {...getRootProps()} className={styles.dropzone + (isDragActive ? ' ' + styles.active : '') + (files.length ? ' ' + styles.hasFile : '')}>
            <input {...getInputProps()} />
            <div className={styles.dropContent}>
              <div className={styles.dropIconWrap}><UploadCloud size={30} className={styles.dropIcon}/></div>
              <div className={styles.dropTitle}>{isDragActive ? 'Drop them right here' : 'Drag your documents here'}</div>
              <div className={styles.dropSub}>or <span className={styles.browseLink}>click to browse</span> — multiple files allowed</div>
            </div>
          </div>

          {files.length > 0 && (
            <div className={styles.fileList}>
              {files.map((f, i) => {
                const { Icon, label } = fileTypeMeta(f)
                return (
                  <div key={`${f.name}-${f.size}-${i}`} className={styles.fileListItem}>
                    <div className={styles.fileIconWrap}><Icon size={20} className={styles.fileIcon}/></div>
                    <div className={styles.fileMeta}>
                      <input
                        className={styles.fileNameInput}
                        value={docNames[i] ?? ''}
                        placeholder={f.name}
                        disabled={uploading}
                        onChange={e => renameFile(i, e.target.value)}
                        title="Beri nama dokumen — kosongkan untuk memakai nama file asli"
                      />
                      <div className={styles.fileSub}>{label} · {formatFileSize(f.size)}</div>
                    </div>
                    {uploading ? (
                      <div className={styles.fileProgress}>{uploadProgress}%</div>
                    ) : (
                      <button className={styles.fileRemoveBtn} onClick={() => removeFile(i)} title="Remove file">
                        <X size={14}/>
                      </button>
                    )}
                  </div>
                )
              })}
            </div>
          )}

          {uploading && (
            <div className={styles.progressTrack} style={{ marginTop: 14 }}>
              <div className={styles.progressFill} style={{ width: `${uploadProgress}%` }} />
            </div>
          )}

          {error && <div className={styles.errorBox}><AlertCircle size={14}/> {error}</div>}

          {files.length > 0 && !uploading && (
            <button className={styles.submitBtn2} onClick={handleUpload}>
              <Zap size={15}/> Process {files.length} Document{files.length === 1 ? '' : 's'} with AI
            </button>
          )}
        </div>
      )}
     </div>
    </div>
  )
}
