import { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { Camera, CheckCircle, AlertCircle, Loader, Upload } from 'lucide-react'
import { scanAPI } from '../services/api.js'
import styles from './Scan.module.css'

export default function Scan() {
  const { token } = useParams()
  const [session, setSession] = useState(null)
  const [error, setError] = useState(null)
  const [file, setFile] = useState(null)
  const [previewUrl, setPreviewUrl] = useState(null)
  const [uploading, setUploading] = useState(false)
  const [done, setDone] = useState(false)

  useEffect(() => {
    scanAPI.getSession(token)
      .then(r => setSession(r.data))
      .catch(e => setError(e.response?.data?.detail || 'Session invalid or expired'))
  }, [token])

  const handleCapture = (e) => {
    const f = e.target.files?.[0]
    if (f) {
      if (previewUrl) URL.revokeObjectURL(previewUrl)
      setFile(f)
      setPreviewUrl(URL.createObjectURL(f))
    }
  }

  const handleUpload = async () => {
    if (!file) return
    setUploading(true)
    try {
      await scanAPI.uploadScan(token, file)
      setDone(true)
    } catch (e) {
      setError(e.response?.data?.detail || 'Upload failed')
    } finally { setUploading(false) }
  }

  if (error) return (
    <div className={styles.page}>
      <div className={styles.card}>
        <AlertCircle size={40} className={styles.errorIcon} />
        <h2>Session Error</h2>
        <p>{error}</p>
      </div>
    </div>
  )

  if (!session) return (
    <div className={styles.page}>
      <div className={styles.card}><Loader size={32} className={styles.spin} /><p>Loading session...</p></div>
    </div>
  )

  if (done) return (
    <div className={styles.page}>
      <div className={styles.card}>
        <CheckCircle size={40} className={styles.successIcon} />
        <h2>Document Sent!</h2>
        <p>Your photo has been received. Check the desktop to see the AI processing result.</p>
      </div>
    </div>
  )

  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <div className={styles.brand}>DeclarAI — Mobile Scan</div>
        <h2 className={styles.title}>Scan Document</h2>
        <p className={styles.sub}>Take a clear photo of the customs document (Invoice, Packing List, or B/L)</p>

        {!file ? (
          <label className={styles.captureBtn}>
            <Camera size={22} />
            <span>Open Camera</span>
            <input type="file" accept="image/*" capture="environment" onChange={handleCapture} style={{ display: 'none' }} />
          </label>
        ) : (
          <div className={styles.preview}>
            <img src={previewUrl} alt="preview" className={styles.previewImg} />
            <p className={styles.fileName}>{file.name}</p>
            <div className={styles.previewActions}>
              <label className={styles.retakeBtn}>
                Retake
                <input type="file" accept="image/*" capture="environment" onChange={handleCapture} style={{ display: 'none' }} />
              </label>
              <button className={styles.sendBtn} onClick={handleUpload} disabled={uploading}>
                {uploading ? <><Loader size={16} className={styles.spin}/> Sending...</> : <><Upload size={16}/> Send to Desktop</>}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
