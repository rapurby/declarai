import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { CheckCircle, AlertTriangle, Send, Edit3, Save, X, ArrowLeft, Clock } from 'lucide-react'
import { declarationAPI, getWsUrl } from '../services/api.js'
import { getUser, hasPermission } from '../utils/auth.js'
import InsightPanel from '../components/InsightPanel.jsx'
import ConfidenceField from '../components/ConfidenceField.jsx'
import toast from 'react-hot-toast'
import styles from './DeclarationDetail.module.css'

const ALL_FIELDS = {
  hs_code: 'HS Code', consignee: 'Consignee', npwp_consignee: 'NPWP Consignee',
  declared_value: 'Declared Value', currency: 'Currency', quantity: 'Quantity', unit: 'Unit',
  description: 'Description', country_of_origin: 'Country of Origin',
  gross_weight: 'Gross Weight (kg)', net_weight: 'Net Weight (kg)',
  shipper: 'Shipper', bl_number: 'B/L Number', invoice_number: 'Invoice Number',
  invoice_date: 'Invoice Date', port_of_loading: 'Port of Loading',
  port_of_discharge: 'Port of Discharge', port_of_transit: 'Port of Transit',
  vessel_name: 'Vessel Name', voyage_number: 'Voyage Number',
  fob_value: 'FOB Value', freight_value: 'Freight Value',
  cif_value: 'CIF Value', cif_idr: 'CIF (IDR)',
  package_quantity: 'Package Quantity', package_type: 'Package Type',
  container_marks: 'Container Marks', bc11_number: 'BC 1.1 Number',
}

const MANDATORY = ['hs_code','consignee','declared_value','currency','quantity','unit','description','country_of_origin']
const TABS = ['Fields', 'Line Items', 'Insight', 'Audit Trail', 'CEISA Response']

export default function DeclarationDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [decl, setDecl] = useState(null)
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(false)
  const [editData, setEditData] = useState({})
  const [corrected, setCorrected] = useState({})
  const [submitting, setSubmitting] = useState(false)
  const [activeTab, setActiveTab] = useState(0)
  const [auditLog, setAuditLog] = useState([])
  const wsRef = useRef(null)

  const user = getUser()
  const canEdit = hasPermission(user?.role, 'submit')
  const canSubmit = hasPermission(user?.role, 'submit')

  const load = async () => {
    try {
      const res = await declarationAPI.get(id)
      setDecl(res.data)
      const init = {}
      Object.keys(ALL_FIELDS).forEach(k => { init[k] = res.data[k] ?? '' })
      setEditData(init)
    } catch { toast.error('Declaration not found') }
    finally { setLoading(false) }
  }

  const loadAudit = async () => {
    try { const res = await declarationAPI.audit(id); setAuditLog(res.data) } catch {}
  }

  useEffect(() => {
    load()
    const wsUrl = getWsUrl('/ws/declaration/' + id)
    try {
      const ws = new WebSocket(wsUrl)
      ws.onmessage = (e) => { try { const d = JSON.parse(e.data); if (d.type !== 'ping') load() } catch {} }
      wsRef.current = ws
      return () => ws.close()
    } catch {}
  }, [id])

  useEffect(() => { if (activeTab === 3) loadAudit() }, [activeTab])

  const handleFieldChange = (key, val) => {
    setEditData(p => ({ ...p, [key]: val }))
    if (val !== String(decl?.[key] ?? '')) setCorrected(p => ({ ...p, [key]: true }))
  }

  const handleSave = async () => {
    const payload = {}
    Object.entries(editData).forEach(([k, v]) => { if (v !== '' && v !== null && v !== undefined) payload[k] = v })
    try { await declarationAPI.update(id, payload); await load(); setEditing(false); toast.success('Fields saved') }
    catch { toast.error('Update failed') }
  }

  const handleSubmit = async () => {
    if (!window.confirm('Submit to CEISA? This cannot be undone.')) return
    setSubmitting(true)
    try {
      const res = await declarationAPI.submit(id)
      setDecl(res.data)
      const reg = res.data.ceisa_response?.registration_number
      toast.success(reg ? 'Accepted: ' + reg : 'Submitted to CEISA')
      setActiveTab(3)
    } catch (e) { toast.error(e.response?.data?.detail || 'Submission failed') }
    finally { setSubmitting(false) }
  }

  if (loading) return <div className={styles.loading}><div className={styles.spinner} /><span>Loading...</span></div>
  if (!decl) return null

  const val = decl.validation_result || {}
  const ext = decl.llm_extracted || {}
  const unreviewedRed = MANDATORY.filter(k => {
    const conf = ext[k]?.confidence
    return conf !== undefined && conf < 0.60 && !corrected[k]
  })
  const canSubmitNow = decl.status === 'validated' && canSubmit && unreviewedRed.length === 0
  const scoreColor = val.score >= 80 ? 'var(--success)' : val.score >= 60 ? 'var(--warning)' : 'var(--danger)'

  return (
    <div className={styles.page}>
      <div className={styles.topBar}>
        <button className={styles.backBtn} onClick={() => navigate('/declarations')}><ArrowLeft size={14} /> Back</button>
        <div className={styles.topActions}>
          {canEdit && !editing && decl.status !== 'accepted' && (
            <button className={styles.editBtn} onClick={() => setEditing(true)}><Edit3 size={13} /> Edit Fields</button>
          )}
          {editing && (<>
            <button className={styles.cancelBtn} onClick={() => setEditing(false)}><X size={13} /> Cancel</button>
            <button className={styles.saveBtn} onClick={handleSave}><Save size={13} /> Save</button>
          </>)}
          {canSubmitNow && !editing && (
            <button className={styles.submitBtn} onClick={handleSubmit} disabled={submitting}>
              <Send size={13} /> {submitting ? 'Submitting...' : 'Submit to CEISA'}
            </button>
          )}
          {decl.status === 'validated' && unreviewedRed.length > 0 && !editing && (
            <div className={styles.blockNotice}>Review {unreviewedRed.length} red field(s) first</div>
          )}
        </div>
      </div>

      <div className={styles.hero}>
        <div className={styles.heroLeft}>
          <span className={'badge badge-' + decl.status}>{decl.status}</span>
          {decl.document_type && decl.document_type !== 'unknown' && (
            <span className={styles.docTypePill}>{decl.document_type.replace(/_/g, ' ')}</span>
          )}
          <div className={styles.filename}>{decl.filename}</div>
          <div className={styles.heroMeta}>
            {decl.processing_time_ms && <span><Clock size={11} /> {(decl.processing_time_ms / 1000).toFixed(2)}s</span>}
            {decl.created_at && <span>{new Date(decl.created_at).toLocaleString()}</span>}
          </div>
        </div>
        <div className={styles.scoreBox}>
          <div className={styles.scoreNum} style={{ color: scoreColor }}>{val.score ?? '—'}</div>
          <div className={styles.scoreLabel}>Validation Score</div>
        </div>
      </div>

      {(val.errors?.length > 0 || val.warnings?.length > 0) && (
        <div className={styles.alerts}>
          {val.errors?.map((e, i) => <div key={i} className={styles.alertError}><AlertTriangle size={12} />{e}</div>)}
          {val.warnings?.map((w, i) => <div key={i} className={styles.alertWarn}><AlertTriangle size={12} />{w}</div>)}
        </div>
      )}

      <div className={styles.tabs}>
        {TABS.map((t, i) => (
          <button key={t} onClick={() => setActiveTab(i)}
            className={styles.tab + (activeTab === i ? ' ' + styles.tabActive : '')}>{t}</button>
        ))}
      </div>

      {activeTab === 0 && (
        <div className={styles.fieldsGrid}>
          {Object.entries(ALL_FIELDS).map(([key, label]) => (
            <ConfidenceField key={key} label={label} fieldKey={key}
              value={decl[key]} confidence={ext[key]?.confidence}
              editing={editing} editValue={editData[key]}
              onChange={handleFieldChange} corrected={!!corrected[key]}
              required={MANDATORY.includes(key)} />
          ))}
        </div>
      )}

      {activeTab === 1 && (
        <div className={styles.lineItemsWrap}>
          {decl.line_items?.length > 0 ? (
            <>
              <div className={styles.lineItemsSummary}>
                {decl.line_items.length} line item(s) &nbsp;·&nbsp;
                Total value: <strong>{decl.currency} {decl.line_items.reduce((s, i) => s + (i.total_value || 0), 0).toLocaleString()}</strong>
              </div>
              <table className={styles.lineTable}>
                <thead>
                  <tr>
                    <th>#</th><th>HS Code</th><th>Description</th><th>Qty</th><th>Unit</th>
                    <th>Unit Price</th><th>Total Value</th><th>Origin</th><th>Conf.</th>
                  </tr>
                </thead>
                <tbody>
                  {decl.line_items.map((item, i) => (
                    <tr key={i} className={styles.lineRow}>
                      <td className={styles.lineNo}>{item.no ?? i+1}</td>
                      <td className={styles.lineHs}>{item.hs_code || '—'}</td>
                      <td className={styles.lineDesc}>{item.description || '—'}</td>
                      <td className={styles.lineMono}>{item.quantity ?? '—'}</td>
                      <td className={styles.lineMono}>{item.unit || '—'}</td>
                      <td className={styles.lineMono}>{item.unit_price != null ? item.unit_price.toLocaleString() : '—'}</td>
                      <td className={styles.lineMono}>{item.total_value != null ? item.total_value.toLocaleString() : '—'}</td>
                      <td>{item.country_of_origin || '—'}</td>
                      <td>
                        <span className={styles.lineConf + ' ' + (item.confidence >= 0.85 ? styles.confHigh : item.confidence >= 0.6 ? styles.confMed : styles.confLow)}>
                          {item.confidence != null ? `${Math.round(item.confidence * 100)}%` : '—'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          ) : (
            <div className={styles.empty}>No line items extracted. Document may be a single-item type.</div>
          )}
        </div>
      )}

      {activeTab === 2 && (
        <div className={styles.insightWrap}>
          {decl.ai_insight ? <InsightPanel insight={decl.ai_insight} /> : <div className={styles.empty}>No AI insight available.</div>}
        </div>
      )}

      {activeTab === 3 && (
        <div className={styles.auditWrap}>
          {auditLog.length === 0 ? <div className={styles.empty}>No manual edits recorded.</div> : (
            <table className={styles.auditTable}>
              <thead><tr><th>Field</th><th>Before</th><th>After</th><th>Time</th></tr></thead>
              <tbody>
                {auditLog.map(log => (
                  <tr key={log.id}>
                    <td className={styles.auditField}>{log.field_name?.replace(/_/g, ' ')}</td>
                    <td className={styles.auditOld}>{log.old_value ?? '—'}</td>
                    <td className={styles.auditNew}>{log.new_value ?? '—'}</td>
                    <td className={styles.auditTime}>{new Date(log.created_at).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {activeTab === 4 && (
        <div className={styles.ceisaWrap}>
          {decl.ceisa_response ? (
            <div className={styles.ceisaCard}>
              <div className={styles.ceisaStatus + ' ' + (decl.ceisa_response.status === 'ACCEPTED' ? styles.accepted : styles.rejected)}>
                {decl.ceisa_response.status === 'ACCEPTED' ? <CheckCircle size={18} /> : <AlertTriangle size={18} />}
                {decl.ceisa_response.status}
              </div>
              {decl.ceisa_response.registration_number && (
                <div className={styles.regBlock}>
                  <div className={styles.regLabel}>Registration Number</div>
                  <div className={styles.regNumber}>{decl.ceisa_response.registration_number}</div>
                </div>
              )}
              {decl.ceisa_response.message && <p className={styles.ceisaMsg}>{decl.ceisa_response.message}</p>}
              {decl.ceisa_response.simulator && <div className={styles.simNote}>Simulator Mode</div>}
            </div>
          ) : (
            <div className={styles.empty}>Declaration has not been submitted yet.</div>
          )}
        </div>
      )}
    </div>
  )
}
