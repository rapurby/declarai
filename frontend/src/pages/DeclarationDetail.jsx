import { useState, useEffect, useRef, Fragment } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { CheckCircle, AlertTriangle, Send, Edit3, Save, X, ArrowLeft, Clock, FileText, Package, ShieldCheck, XCircle, ChevronLeft, ChevronRight } from 'lucide-react'
import { declarationAPI, getWsUrl } from '../services/api.js'
import { getUser, hasPermission } from '../utils/auth.js'
import InsightPanel from '../components/InsightPanel.jsx'
import ConfidenceField from '../components/ConfidenceField.jsx'
import toast from 'react-hot-toast'
import styles from './DeclarationDetail.module.css'

// Header-level fields shown in the document overview. hs_code / quantity /
// unit / description are intentionally NOT here — those are per-item values
// (a document can have several items, each with its own HS code), so they
// live exclusively in the Line Items table below instead of being shown as
// one ambiguous "summary" field that only reflected the first item.
const ALL_FIELDS = {
  consignee: 'Consignee', npwp_consignee: 'NPWP Consignee',
  declared_value: 'Declared Value', currency: 'Currency',
  country_of_origin: 'Country of Origin',
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

const MANDATORY = ['consignee','declared_value','currency']
const TABS = ['Overview', 'Insight', 'Audit Trail', 'CEISA Response']
const ITEMS_PER_PAGE = 5

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
  const [expandedItem, setExpandedItem] = useState(null)
  const [editingItem, setEditingItem] = useState(null)   // index of item being edited
  const [itemEditData, setItemEditData] = useState({})   // draft fields for that item
  // Presentational-only — paginates the already-loaded line items, no new fetches.
  const [itemsPage, setItemsPage] = useState(1)
  const [showAllItems, setShowAllItems] = useState(false)
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

  useEffect(() => { if (activeTab === 2) loadAudit() }, [activeTab])

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

  const handleViewDoc = () => {
    const url = declarationAPI.getFileUrl(decl.id)
    window.open(url, '_blank')
  }

  const startEditItem = (i, item) => {
    setEditingItem(i)
    setItemEditData({
      hs_code: item.hs_code || '',
      description: item.description || '',
      quantity: item.quantity ?? '',
      unit: item.unit || '',
      unit_price: item.unit_price ?? '',
      total_value: item.total_value ?? '',
      country_of_origin: item.country_of_origin || '',
    })
  }

  const handleSaveItem = async (i) => {
    const items = [...lineItems]
    const draft = { ...itemEditData }
    if (draft.quantity !== '') draft.quantity = parseFloat(draft.quantity) || 0
    if (draft.unit_price !== '') draft.unit_price = parseFloat(String(draft.unit_price).replace(/,/g, '')) || 0
    if (draft.total_value !== '') draft.total_value = parseFloat(String(draft.total_value).replace(/,/g, '')) || 0
    items[i] = { ...items[i], ...draft }
    try {
      await declarationAPI.update(id, { line_items: items })
      await load()
      setEditingItem(null)
      toast.success('Item saved')
    } catch { toast.error('Failed to save item') }
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
  const ext = decl.llm_extracted?.header || {}
  // Items: pakai JSON line_items, fallback ke relasi tabel declaration_item
  // (API mengirim keduanya — mana pun yang terisi tetap tampil)
  const lineItems = (decl.line_items?.length ? decl.line_items : decl.items) || []
  const unreviewedRed = MANDATORY.filter(k => {
    const conf = ext[k]?.confidence
    return conf !== undefined && conf < 0.60 && !corrected[k]
  })
  const canSubmitNow = decl.status === 'validated' && canSubmit && unreviewedRed.length === 0
  // The submit action no longer applies once a document has left the
  // pre-submission pipeline — otherwise keep the button visible (disabled +
  // labelled with why) rather than disappearing, so it's always discoverable.
  const TERMINAL_STATUSES = ['submitted', 'accepted', 'rejected']
  const showSubmitButton = canSubmit && !TERMINAL_STATUSES.includes(decl.status)
  const submitBlockedReason = !canSubmitNow
    ? (decl.status !== 'validated' ? 'Document must pass validation before it can be submitted' : `Review ${unreviewedRed.length} red field(s) first`)
    : null
  const scoreColor = val.score >= 80 ? 'var(--success)' : val.score >= 60 ? 'var(--warning)' : 'var(--danger)'
  const scoreStatus = val.score >= 80 ? 'Good' : val.score >= 60 ? 'Needs Attention' : 'Poor'
  const fileExt = (decl.filename?.split('.').pop() || 'FILE').toUpperCase().slice(0, 4)

  // --- Stats row: derived purely from already-loaded decl/lineItems/val, no new fetches ---
  const totalValue = lineItems.reduce((s, i) => s + (i.total_value || 0), 0) || decl.declared_value || 0
  const verifiedCount  = lineItems.filter(i => i.confidence >= 0.85).length
  const reviewCount    = lineItems.filter(i => i.confidence >= 0.60 && i.confidence < 0.85).length
  const mismatchCount  = lineItems.filter(i => i.confidence == null || i.confidence < 0.60).length
  const pct = (n) => lineItems.length ? Math.round((n / lineItems.length) * 100) : 0

  const STATS = [
    { label: 'Total Document Value', value: `${decl.currency || ''} ${totalValue.toLocaleString()}`, sub: 'Overall document value',     icon: FileText, tone: 'blue' },
    { label: 'Total Items',          value: lineItems.length,                                          sub: 'items extracted',            icon: Package, tone: 'green' },
    { label: 'Avg. Validation',      value: `${val.score ?? 0}%`,                                     sub: 'Overall validation score',   icon: ShieldCheck, tone: 'purple' },
    { label: 'Verified',             value: verifiedCount,                                             sub: `${pct(verifiedCount)}% of total`, icon: CheckCircle, tone: 'green' },
    { label: 'Needs Review',         value: reviewCount,                                               sub: `${pct(reviewCount)}% of total`,   icon: Clock, tone: 'orange' },
    { label: 'Mismatched',           value: mismatchCount,                                             sub: `${pct(mismatchCount)}% of total`, icon: XCircle, tone: 'red' },
  ]

  // --- Line items pagination (presentational only — preserves original index
  // for expandedItem/editingItem/handleSaveItem, which all key off it) ---
  const indexedItems = lineItems.map((item, i) => ({ item, i }))
  const itemsPageCount = Math.max(1, Math.ceil(lineItems.length / ITEMS_PER_PAGE))
  const safeItemsPage = Math.min(itemsPage, itemsPageCount)
  const visibleItems = showAllItems ? indexedItems : indexedItems.slice((safeItemsPage - 1) * ITEMS_PER_PAGE, safeItemsPage * ITEMS_PER_PAGE)

  return (
    <div className={styles.page}>
      <div className={styles.container}>
        <div className={styles.topBar}>
          <button className={styles.backBtn} onClick={() => navigate('/declarations')}><ArrowLeft size={14} /> Back to List</button>
        </div>

        <div className={styles.hero}>
          <div className={styles.heroLeft}>
            <div className={styles.docHeadRow}>
              <div className={styles.docIconBox}>
                <FileText size={22} />
                <span className={styles.docIconExt}>{fileExt}</span>
              </div>
              <div className={styles.docHeadInfo}>
                <div className={styles.badgeRow}>
                  <span className={'badge badge-' + decl.status}>{decl.status}</span>
                  {decl.document_type && decl.document_type !== 'unknown' && (
                    <span className={styles.docTypePill}>{decl.document_type.replace(/_/g, ' ')}</span>
                  )}
                </div>
                <div className={styles.filename}>{decl.filename}</div>
                <div className={styles.heroMeta}>
                  {decl.processing_time_ms && <span><Clock size={11} /> {(decl.processing_time_ms / 1000).toFixed(2)}s</span>}
                  {decl.created_at && <span>{new Date(decl.created_at).toLocaleString()}</span>}
                  <button className={styles.viewDocBtn} onClick={handleViewDoc} title="View original uploaded file">
                    <FileText size={12} /> View Document
                  </button>
                </div>
              </div>
            </div>

            <div className={styles.fieldsGrid}>
              {Object.entries(ALL_FIELDS).map(([key, label]) => (
                <ConfidenceField key={key} label={label} fieldKey={key}
                  value={decl[key]} confidence={ext[key]?.confidence}
                  editing={editing} editValue={editData[key]}
                  onChange={handleFieldChange} corrected={!!corrected[key]}
                  required={MANDATORY.includes(key)} />
              ))}
            </div>
          </div>

          <div className={styles.scorePanel}>
            <div className={styles.scorePanelTitle}>Validation Score</div>
            <div className={styles.gaugeWrap}>
              <svg width="148" height="148" viewBox="0 0 148 148" className={styles.gaugeSvg}>
                <circle cx="74" cy="74" r="60" fill="none" stroke="var(--border-light)" strokeWidth="13" />
                <circle cx="74" cy="74" r="60" fill="none" stroke={scoreColor} strokeWidth="13"
                  strokeDasharray={2 * Math.PI * 60}
                  strokeDashoffset={2 * Math.PI * 60 * (1 - (val.score ?? 0) / 100)}
                  strokeLinecap="round" transform="rotate(-90 74 74)" className={styles.gaugeFill} />
              </svg>
              <div className={styles.gaugeCenter}>
                <div className={styles.gaugeScore} style={{ color: scoreColor }}>{val.score ?? '—'}</div>
                <div className={styles.gaugeMax}>/100</div>
              </div>
            </div>
            <div className={styles.scoreStatusPill} style={{ color: scoreColor }}>
              <span className={styles.scoreDot} style={{ background: scoreColor }} /> {scoreStatus}
            </div>
            <p className={styles.scoreDesc}>Validation score is calculated based on how well the extracted data matches CEISA requirements.</p>

            <div className={styles.scoreActions}>
              {canEdit && !editing && decl.status !== 'accepted' && (
                <button className={styles.editBtn} onClick={() => setEditing(true)}><Edit3 size={13} /> Edit Fields</button>
              )}
              {editing && (<>
                <button className={styles.cancelBtn} onClick={() => setEditing(false)}><X size={13} /> Cancel</button>
                <button className={styles.saveBtn} onClick={handleSave}><Save size={13} /> Save</button>
              </>)}
              {showSubmitButton && !editing && (
                <button className={styles.submitBtn} onClick={handleSubmit} disabled={submitting || !canSubmitNow}>
                  <Send size={13} /> {submitting ? 'Submitting...' : 'Submit to CEISA →'}
                </button>
              )}
            </div>
            {showSubmitButton && submitBlockedReason && !editing && (
              <div className={styles.blockNotice}>{submitBlockedReason}</div>
            )}
          </div>
        </div>

        <div className={styles.statsRow}>
          {STATS.map(s => (
            <div key={s.label} className={styles.statTile}>
              <div className={styles.statIcon + ' ' + styles['tone_' + s.tone]}><s.icon size={16} /></div>
              <div className={styles.statBody}>
                <div className={styles.statLabel}>{s.label}</div>
                <div className={styles.statValue}>{s.value}</div>
                <div className={styles.statSub}>{s.sub}</div>
              </div>
            </div>
          ))}
        </div>

        {(val.errors?.length > 0 || val.warnings?.length > 0) && (
          <div className={styles.alerts}>
            {val.errors?.map((e, i) => <div key={'e' + i} className={styles.alertChip + ' ' + styles.alertChipError}><AlertTriangle size={12} />{e}</div>)}
            {val.warnings?.map((w, i) => <div key={'w' + i} className={styles.alertChip + ' ' + styles.alertChipWarn}><AlertTriangle size={12} />{w}</div>)}
          </div>
        )}

        <div className={styles.tabs}>
          <div className={styles.tabIndicator} style={{ left: `${(100 / TABS.length) * activeTab}%`, width: `${100 / TABS.length}%` }} />
          {TABS.map((t, i) => (
            <button key={t} onClick={() => setActiveTab(i)}
              className={styles.tab + (activeTab === i ? ' ' + styles.tabActive : '')}>{t}</button>
          ))}
        </div>

        {activeTab === 0 && (
          <div className={styles.overviewGrid}>
            <div className={styles.itemsPanel}>
              <div className={styles.panelTitle}>Rincian Barang {lineItems.length > 0 && `(${lineItems.length} item)`}</div>
              {lineItems.length > 0 ? (
                <>
                  <div className={styles.lineItemsWrap}>
                    <table className={styles.lineTable}>
                      <thead>
                        <tr>
                          <th>#</th><th>HS Code</th><th>Description</th><th>Qty</th><th>Unit</th>
                          <th>Unit Price</th><th>Total Value</th><th>Origin</th><th>Conf.</th>
                        </tr>
                      </thead>
                      <tbody>
                        {visibleItems.map(({ item, i }) => (
                          <Fragment key={i}>
                            <tr className={styles.lineRow} onClick={() => setExpandedItem(expandedItem === i ? null : i)} style={{ cursor: 'pointer' }}>
                              <td className={styles.lineNo}>{item.no ?? item.item_no ?? i + 1}</td>
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
                            {expandedItem === i && (
                              <tr className={styles.lineDetailRow}>
                                <td colSpan={9}>
                                  {editingItem === i ? (
                                    <div className={styles.lineEditWrap}>
                                      <div className={styles.lineEditGrid}>
                                        {[
                                          ['hs_code','HS Code','text'],
                                          ['description','Description','text'],
                                          ['quantity','Quantity','number'],
                                          ['unit','Unit','text'],
                                          ['unit_price','Unit Price','number'],
                                          ['total_value','Total Value','number'],
                                          ['country_of_origin','Country of Origin','text'],
                                        ].map(([key, label, type]) => (
                                          <div key={key} className={styles.lineEditField}>
                                            <span className={styles.lineDetailLabel}>{label}</span>
                                            <input
                                              className={styles.lineEditInput}
                                              type={type}
                                              value={itemEditData[key]}
                                              onChange={e => setItemEditData(p => ({ ...p, [key]: e.target.value }))}
                                            />
                                          </div>
                                        ))}
                                      </div>
                                      <div className={styles.lineEditActions}>
                                        <button className={styles.lineEditCancel} onClick={() => setEditingItem(null)}><X size={12}/> Cancel</button>
                                        <button className={styles.lineEditSave} onClick={() => handleSaveItem(i)}><Save size={12}/> Save Item</button>
                                      </div>
                                    </div>
                                  ) : (
                                    <div className={styles.lineDetailGrid}>
                                      <div><span className={styles.lineDetailLabel}>HS Code</span><span className={styles.lineDetailValue}>{item.hs_code || '—'}</span></div>
                                      <div><span className={styles.lineDetailLabel}>Description</span><span className={styles.lineDetailValue}>{item.description || '—'}</span></div>
                                      <div><span className={styles.lineDetailLabel}>Quantity</span><span className={styles.lineDetailValue}>{item.quantity ?? '—'} {item.unit || ''}</span></div>
                                      <div><span className={styles.lineDetailLabel}>Unit Price</span><span className={styles.lineDetailValue}>{decl.currency} {item.unit_price != null ? item.unit_price.toLocaleString() : '—'}</span></div>
                                      <div><span className={styles.lineDetailLabel}>Total Value</span><span className={styles.lineDetailValue}>{decl.currency} {item.total_value != null ? item.total_value.toLocaleString() : '—'}</span></div>
                                      <div><span className={styles.lineDetailLabel}>Country of Origin</span><span className={styles.lineDetailValue}>{item.country_of_origin || '—'}</span></div>
                                      <div><span className={styles.lineDetailLabel}>Extraction Confidence</span><span className={styles.lineDetailValue}>{item.confidence != null ? `${Math.round(item.confidence * 100)}%` : '—'}</span></div>
                                      {canEdit && decl.status !== 'accepted' && (
                                        <div>
                                          <button className={styles.lineEditBtn} onClick={e => { e.stopPropagation(); startEditItem(i, item) }}>
                                            <Edit3 size={12}/> Edit Item
                                          </button>
                                        </div>
                                      )}
                                    </div>
                                  )}
                                </td>
                              </tr>
                            )}
                          </Fragment>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <div className={styles.itemsFooter}>
                    <button className={styles.showAllBtn} onClick={() => setShowAllItems(s => !s)}>
                      {showAllItems ? 'Show Paginated' : `Lihat Semua (${lineItems.length})`}
                    </button>
                    {!showAllItems && itemsPageCount > 1 && (
                      <div className={styles.pager}>
                        <button className={styles.pageBtn} disabled={safeItemsPage === 1}
                          onClick={() => setItemsPage(p => Math.max(1, p - 1))}><ChevronLeft size={14}/></button>
                        <span className={styles.pageIndicator}>{safeItemsPage} / {itemsPageCount}</span>
                        <button className={styles.pageBtn} disabled={safeItemsPage === itemsPageCount}
                          onClick={() => setItemsPage(p => Math.min(itemsPageCount, p + 1))}><ChevronRight size={14}/></button>
                      </div>
                    )}
                  </div>
                </>
              ) : (
                <div className={styles.empty}>No items extracted from this document.</div>
              )}
            </div>

            <div className={styles.validationPanel}>
              <div className={styles.panelTitle}>Validasi Dokumen</div>
              {(val.warnings?.length > 0 || val.errors?.length > 0) ? (
                <div className={styles.validationList}>
                  {val.warnings?.map((w, i) => (
                    <div key={'w' + i} className={styles.validationItem}>
                      <AlertTriangle size={14} className={styles.vWarnIcon} />
                      <span>{w}</span>
                    </div>
                  ))}
                  {val.errors?.map((e, i) => (
                    <div key={'e' + i} className={styles.validationItem + ' ' + styles.validationItemError}>
                      <AlertTriangle size={14} className={styles.vErrIcon} />
                      <span>{e}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className={styles.validationEmpty}><CheckCircle size={20} /> No validation issues found.</div>
              )}
            </div>
          </div>
        )}

        {activeTab === 1 && (
          <div className={styles.tabPanel}>
            {decl.ai_insight ? <InsightPanel insight={decl.ai_insight} /> : <div className={styles.empty}>No AI insight available.</div>}
          </div>
        )}

        {activeTab === 2 && (
          <div className={styles.tabPanel + ' ' + styles.auditWrap}>
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

        {activeTab === 3 && (
          <div className={styles.tabPanel}>
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
            {decl.notes && (
              <div style={{
                marginTop: 16,
                background: decl.status === 'rejected' ? 'rgba(198,40,40,0.06)' : decl.status === 'accepted' ? 'rgba(13,159,110,0.06)' : 'var(--bg)',
                border: `1px solid ${decl.status === 'rejected' ? 'rgba(198,40,40,0.25)' : decl.status === 'accepted' ? 'rgba(13,159,110,0.25)' : 'var(--border)'}`,
                borderRadius: 10, padding: '14px 16px',
              }}>
                <div style={{ fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6,
                  color: decl.status === 'rejected' ? '#c62828' : decl.status === 'accepted' ? '#0d9f6e' : 'var(--text-muted)' }}>
                  Notes from CEISA Officer
                </div>
                <div style={{ fontSize: 13.5, color: 'var(--text-primary)', lineHeight: 1.55 }}>{decl.notes}</div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
