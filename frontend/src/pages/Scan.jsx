import { useState, useRef, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Camera, Plus, Trash2, RotateCw, CheckCircle, Send, Loader, AlertCircle, ArrowLeft, RefreshCw } from 'lucide-react'
import toast from 'react-hot-toast'
import styles from './Scan.module.css'

const BASE_URL = import.meta.env.VITE_API_URL || ''

function compressImage(file, maxWidth = 1200) {
  return new Promise(resolve => {
    const img = new Image()
    const url = URL.createObjectURL(file)
    img.onload = () => {
      const scale = Math.min(1, maxWidth / img.width)
      const canvas = document.createElement('canvas')
      canvas.width = img.width * scale
      canvas.height = img.height * scale
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height)
      URL.revokeObjectURL(url)
      canvas.toBlob(resolve, 'image/jpeg', 0.88)
    }
    img.src = url
  })
}

export default function Scan() {
  const { token } = useParams()
  const navigate = useNavigate()
  const [pages, setPages]         = useState([])        // [{file, previewUrl, rotation}]
  const [docName, setDocName]     = useState('')
  const [uploading, setUploading] = useState(false)
  const [done, setDone]           = useState(false)
  const [error, setError]         = useState(null)
  const fileInputRef = useRef(null)

  const addPages = useCallback(async (fileList) => {
    const incoming = []
    for (const f of fileList) {
      const blob = await compressImage(f)
      const compressed = new File([blob], f.name, { type: 'image/jpeg' })
      incoming.push({ file: compressed, previewUrl: URL.createObjectURL(blob), rotation: 0 })
    }
    setPages(prev => [...prev, ...incoming])
  }, [])

  const handleCapture = (e) => {
    if (e.target.files?.length) addPages(Array.from(e.target.files))
    e.target.value = ''
  }

  const rotatePage = (idx) => {
    setPages(prev => prev.map((p, i) =>
      i === idx ? { ...p, rotation: (p.rotation + 90) % 360 } : p
    ))
  }

  const deletePage = (idx) => {
    setPages(prev => {
      URL.revokeObjectURL(prev[idx].previewUrl)
      return prev.filter((_, i) => i !== idx)
    })
  }

  const retakePage = async (idx, file) => {
    const blob = await compressImage(file)
    const compressed = new File([blob], file.name, { type: 'image/jpeg' })
    setPages(prev => {
      URL.revokeObjectURL(prev[idx].previewUrl)
      return prev.map((p, i) => i === idx ? { file: compressed, previewUrl: URL.createObjectURL(blob), rotation: 0 } : p)
    })
  }

  const handleSend = async () => {
    if (pages.length === 0) { toast.error('Add at least one page'); return }
    setUploading(true)
    setError(null)
    try {
      const fd = new FormData()
      pages.forEach(p => fd.append('files', p.file))
      if (docName.trim()) fd.append('doc_name', docName.trim())

      const res = await fetch(`${BASE_URL}/api/v1/scan/upload/${token}`, {
        method: 'POST', body: fd,
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: 'Upload failed' }))
        throw new Error(err.detail || 'Upload failed')
      }
      setDone(true)
    } catch (e) {
      setError(e.message)
      toast.error(e.message)
    } finally {
      setUploading(false)
    }
  }

  if (done) return (
    <div className={styles.donePage}>
      <div className={styles.doneIcon}><CheckCircle size={48} strokeWidth={1.5} /></div>
      <div className={styles.doneTitle}>Document Sent!</div>
      <div className={styles.doneSub}>Your {pages.length} page(s) are being processed on the desktop. You can close this page.</div>
    </div>
  )

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div className={styles.logo}>DeclarAI Scanner</div>
        <div className={styles.headerSub}>{token ? `Session: ${token.slice(0,8)}...` : 'Mobile Scan'}</div>
      </div>

      {/* Document Name */}
      <div className={styles.section}>
        <label className={styles.fieldLabel}>Document Name (optional)</label>
        <input
          className={styles.nameInput}
          placeholder="e.g. INV-2026-001 or leave blank for auto"
          value={docName}
          onChange={e => setDocName(e.target.value)}
          maxLength={80}
        />
      </div>

      {/* Pages */}
      <div className={styles.section}>
        <div className={styles.sectionHeader}>
          <label className={styles.fieldLabel}>Pages ({pages.length})</label>
          <button className={styles.addBtn} onClick={() => fileInputRef.current?.click()}>
            <Plus size={14} /> Add Page
          </button>
        </div>

        {pages.length === 0 ? (
          <button className={styles.cameraTrigger} onClick={() => fileInputRef.current?.click()}>
            <Camera size={40} strokeWidth={1.5} className={styles.cameraIcon} />
            <span>Tap to capture or select a photo</span>
          </button>
        ) : (
          <div className={styles.pageGrid}>
            {pages.map((p, i) => (
              <div key={i} className={styles.pageCard}>
                <div className={styles.pageImgWrap}>
                  <img
                    src={p.previewUrl}
                    alt={`Page ${i + 1}`}
                    className={styles.pageImg}
                    style={{ transform: `rotate(${p.rotation}deg)` }}
                  />
                  <div className={styles.pageNum}>Pg {i + 1}</div>
                </div>
                <div className={styles.pageActions}>
                  <button className={styles.pageBtn} title="Rotate" onClick={() => rotatePage(i)}>
                    <RotateCw size={14} />
                  </button>
                  <label className={styles.pageBtn} title="Retake">
                    <RefreshCw size={14} />
                    <input type="file" accept="image/*" capture="environment" className={styles.hiddenInput}
                      onChange={e => { if (e.target.files?.[0]) retakePage(i, e.target.files[0]); e.target.value = '' }} />
                  </label>
                  <button className={styles.pageBtnDanger} title="Delete" onClick={() => deletePage(i)}>
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          multiple
          className={styles.hiddenInput}
          onChange={handleCapture}
        />
      </div>

      {error && <div className={styles.errorBox}><AlertCircle size={14} /> {error}</div>}

      {pages.length > 0 && (
        <button
          className={styles.sendBtn}
          onClick={handleSend}
          disabled={uploading}
        >
          {uploading
            ? <><Loader size={15} className={styles.spin} /> Sending...</>
            : <><Send size={15} /> Send {pages.length} Page{pages.length !== 1 ? 's' : ''}</>
          }
        </button>
      )}
    </div>
  )
}
