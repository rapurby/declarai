import { useState, useEffect, useRef, Fragment } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { CheckCircle, AlertTriangle, Send, Edit3, Save, X, ArrowLeft, Clock, FileText, Package, ShieldCheck, XCircle, ChevronLeft, ChevronRight, Table2, List, Download } from 'lucide-react'
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

// Subset of ALL_FIELDS shown by default in the hero's field grid (Excel view
// is now the primary Overview surface, so this stays compact). Edit mode
// still exposes every field from ALL_FIELDS so nothing becomes uneditable.
const HERO_FIELDS = {
  consignee: 'Consignee',
  shipper: 'Shipper',
  invoice_number: 'Invoice Number',
  cif_value: 'CIF Value',
  country_of_origin: 'Country of Origin',
  package_quantity: 'Package Quantity',
}

const MANDATORY = ['consignee','declared_value','currency']
const TABS = ['Overview', 'Insight', 'Audit Trail', 'CEISA Response']
const ITEMS_PER_PAGE = 5

// Excel-cell fields that hold numbers — parsed before being sent to the API
// (mirrors the parsing already done for line-item edits in handleSaveItem).
const NUMERIC_DECL_FIELDS = new Set([
  'insurance_value', 'declared_value', 'freight_value', 'fob_value',
  'cif_value', 'exchange_rate', 'gross_weight', 'net_weight',
  'package_quantity',
])
const NUMERIC_ITEM_FIELDS = new Set(['quantity', 'unit_price', 'total_value'])

const parseCellNumber = (raw) => {
  const n = parseFloat(String(raw).replace(/,/g, ''))
  return isNaN(n) ? null : n
}

// Click-to-edit table cell shared by every sheet in the Excel preview.
// Non-editable cells (system-fixed codes) render as plain text.
function EditableCell({ display, raw, editable, onSave, className }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')

  if (!editable) return <span className={className}>{display}</span>

  if (editing) {
    return (
      <input
        autoFocus
        className={styles.xlsCellInput}
        value={draft}
        onChange={e => setDraft(e.target.value)}
        onBlur={() => {
          setEditing(false)
          if (String(draft) !== String(raw ?? '')) onSave(draft)
        }}
        onKeyDown={e => {
          if (e.key === 'Enter') e.currentTarget.blur()
          if (e.key === 'Escape') setEditing(false)
        }}
      />
    )
  }

  return (
    <span
      className={styles.xlsEditable + (className ? ' ' + className : '')}
      onClick={() => { setDraft(raw ?? ''); setEditing(true) }}
      title="Klik untuk edit"
    >
      {display}
    </span>
  )
}

// Sheets written by CDP/backend/app/ceisa/excel_exporter.py::build_aju_excel
// (order matches SHEET_ORDER there for the sheets we actually populate).
const EXCEL_SHEETS = ['HEADER', 'ENTITAS', 'DOKUMEN', 'PENGANGKUT', 'KEMASAN', 'BARANG']
// HEADER_COLUMNS in excel_exporter.py has 107 columns total; only a subset
// carries real data today (see headerRows below) — the rest are written
// blank, same as an out-of-the-box PIB with no bonded/excise/FTZ sections.
const HEADER_TOTAL_COLS = 107

const confDot = (confidence) => {
  if (confidence === undefined || confidence === null) return null
  if (confidence >= 0.85) return 'hi'
  if (confidence >= 0.60) return 'med'
  return 'low'
}
const fmtNum = (n) => (n === undefined || n === null ? '—' : n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }))

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
  const [excelView, setExcelView] = useState(true)
  const [activeSheet, setActiveSheet] = useState('HEADER')
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

  const handleDownloadExcel = async () => {
    try {
      const res = await declarationAPI.exportAjuExcel(decl.id)
      const url = window.URL.createObjectURL(new Blob([res.data]))
      const a = document.createElement('a')
      a.href = url
      a.download = `AJU_${String(decl.id).slice(0, 8)}.xlsx`
      document.body.appendChild(a)
      a.click()
      a.remove()
      window.URL.revokeObjectURL(url)
    } catch {
      toast.error('Failed to download Excel file')
    }
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

  // Inline Excel-cell edit for header-level declaration fields (HEADER,
  // ENTITAS, DOKUMEN, PENGANGKUT, KEMASAN sheets) — same PATCH endpoint as
  // the Edit Fields panel.
  const handleCellSave = async (field, rawValue) => {
    const value = NUMERIC_DECL_FIELDS.has(field) ? parseCellNumber(rawValue) : rawValue
    try {
      await declarationAPI.update(id, { [field]: value })
      await load()
      toast.success('Saved')
    } catch { toast.error('Failed to save') }
  }

  // Inline Excel-cell edit for a single BARANG-sheet field — updates just
  // that item, then resends the whole line_items array (same pattern as
  // handleSaveItem below).
  const handleBarangCellSave = async (itemIndex, field, rawValue) => {
    const items = [...lineItems]
    const value = NUMERIC_ITEM_FIELDS.has(field) ? (parseCellNumber(rawValue) ?? 0) : rawValue
    items[itemIndex] = { ...items[itemIndex], [field]: value }
    try {
      await declarationAPI.update(id, { line_items: items })
      await load()
      toast.success('Item saved')
    } catch { toast.error('Failed to save item') }
  }

  // Lets an operator key in goods the extraction missed entirely — without
  // this, a document where the AI found no line items is a dead end.
  const handleAddItem = async () => {
    const items = [...lineItems, {
      no: lineItems.length + 1,
      hs_code: '', description: '', quantity: null,
      unit: '', unit_price: null, total_value: null,
      country_of_origin: '', confidence: null,
    }]
    try {
      await declarationAPI.update(id, { line_items: items })
      await load()
      toast.success('Baris barang ditambahkan')
    } catch { toast.error('Gagal menambah baris') }
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

  // Excel-preview cells are editable under the same rule as Edit Fields /
  // line-item edits: needs submit permission, and a document already
  // 'accepted' is locked.
  const isCellEditable = canEdit && decl.status !== 'accepted'

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

  // --- Excel AJU preview (mirrors CDP/backend/app/ceisa/excel_exporter.py::
  // build_aju_excel — same fields, same sheets, same fallback logic) ---
  const insuranceVal = decl.insurance_value ?? (
    decl.fob_value != null && decl.freight_value != null && decl.cif_value != null
      ? Math.round((decl.cif_value - decl.fob_value - decl.freight_value) * 100) / 100
      : null
  )
  // field: null marks a system-fixed value (not editable, per CDP spec).
  const headerRows = [
    { label: 'KODE DOKUMEN', value: '20', field: null },
    { label: 'KODE KANTOR', value: '051000', field: null },
    { label: 'KODE PELABUHAN BONGKAR', value: 'IDJBK', field: null },
    { label: 'KODE PELABUHAN MUAT', field: 'port_of_loading', raw: decl.port_of_loading, value: decl.port_of_loading || '—', conf: confDot(ext.port_of_loading?.confidence) },
    { label: 'KODE PELABUHAN TRANSIT', field: 'port_of_transit', raw: decl.port_of_transit, value: decl.port_of_transit || '—', conf: confDot(ext.port_of_transit?.confidence) },
    { label: 'NOMOR BC11', field: 'bc11_number', raw: decl.bc11_number, value: decl.bc11_number || '—', conf: confDot(ext.bc11_number?.confidence) },
    { label: 'ASURANSI', field: 'insurance_value', raw: insuranceVal, value: fmtNum(insuranceVal) },
    { label: 'NILAI BARANG', field: 'declared_value', raw: decl.declared_value, value: fmtNum(decl.declared_value), conf: confDot(ext.declared_value?.confidence) },
    { label: 'FREIGHT', field: 'freight_value', raw: decl.freight_value, value: fmtNum(decl.freight_value), conf: confDot(ext.freight_value?.confidence) },
    { label: 'FOB', field: 'fob_value', raw: decl.fob_value, value: fmtNum(decl.fob_value), conf: confDot(ext.fob_value?.confidence) },
    { label: 'CIF', field: 'cif_value', raw: decl.cif_value, value: fmtNum(decl.cif_value), conf: confDot(ext.cif_value?.confidence) },
    { label: 'NDPBM', field: 'exchange_rate', raw: decl.exchange_rate, value: fmtNum(decl.exchange_rate) },
    { label: 'BRUTO', field: 'gross_weight', raw: decl.gross_weight, value: fmtNum(decl.gross_weight), conf: confDot(ext.gross_weight?.confidence) },
    { label: 'NETTO', field: 'net_weight', raw: decl.net_weight, value: fmtNum(decl.net_weight), conf: confDot(ext.net_weight?.confidence) },
    { label: 'KODE VALUTA', field: 'currency', raw: decl.currency, value: decl.currency || '—', conf: confDot(ext.currency?.confidence) },
  ]
  const headerRemaining = HEADER_TOTAL_COLS - headerRows.length

  const entitasRows = [
    {
      seri: 1, kode: '1 (Importir)',
      nomor: decl.npwp_consignee || '—', nomorRaw: decl.npwp_consignee, nomorField: 'npwp_consignee',
      nama: decl.consignee || '—', namaRaw: decl.consignee, namaField: 'consignee',
      // CDP's importer is always Indonesian — a fixed value, like KODE KANTOR.
      negara: 'ID', negaraField: null,
    },
    {
      seri: 2, kode: '9 (Shipper)',
      nomor: decl.shipper_identity || '—', nomorRaw: decl.shipper_identity, nomorField: 'shipper_identity',
      nama: decl.shipper || '—', namaRaw: decl.shipper, namaField: 'shipper',
      negara: decl.country_of_origin || '—', negaraRaw: decl.country_of_origin, negaraField: 'country_of_origin',
      negaraConf: confDot(ext.country_of_origin?.confidence),
    },
  ]

  // Rows are always rendered, even when the extraction found nothing — an
  // empty row with editable cells is what lets an operator key in a value
  // the AI missed. Hiding the row (the old behaviour) made those sheets
  // look read-only and left no way to correct a miss.
  const dokumenRows = [
    {
      seri: 1, kode: '380 (Invoice)',
      nomor: decl.invoice_number || '—', nomorRaw: decl.invoice_number, nomorField: 'invoice_number',
      tanggal: decl.invoice_date || '—', tanggalRaw: decl.invoice_date, tanggalField: 'invoice_date',
    },
    {
      seri: 2, kode: '705 (B/L)',
      nomor: decl.bl_number || '—', nomorRaw: decl.bl_number, nomorField: 'bl_number',
      tanggal: '—', tanggalField: null,
    },
  ]

  const pengangkutRows = [{
    seri: 1, kode: '1 (Laut)',
    nama: decl.vessel_name || '—', namaRaw: decl.vessel_name, namaField: 'vessel_name',
    nomor: decl.voyage_number || '—', nomorRaw: decl.voyage_number, nomorField: 'voyage_number',
  }]

  const kemasanRows = [{
    seri: 1,
    kode: decl.package_type || '—', kodeRaw: decl.package_type, kodeField: 'package_type',
    jumlah: decl.package_quantity ?? '—', jumlahRaw: decl.package_quantity, jumlahField: 'package_quantity',
  }]

  const barangRows = lineItems.map((item, i) => ({
    i,
    seri: item.no ?? item.item_no ?? i + 1,
    hs: item.hs_code || '—', hsRaw: item.hs_code,
    uraian: item.description || '—', uraianRaw: item.description,
    satuan: item.unit || '—', satuanRaw: item.unit,
    jumlah: item.quantity ?? '—', jumlahRaw: item.quantity,
    harga: item.unit_price != null ? item.unit_price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—', hargaRaw: item.unit_price,
    nilai: item.total_value != null ? item.total_value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—', nilaiRaw: item.total_value,
    asal: item.country_of_origin || '—', asalRaw: item.country_of_origin,
    conf: confDot(item.confidence),
  }))

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
                  {decl.doc_code && <span className={styles.docCodeBadge}>{decl.doc_code}</span>}
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
                  <button
                    className={styles.excelToggleBtn + (excelView ? ' ' + styles.excelToggleBtnActive : '')}
                    onClick={() => setExcelView(v => !v)}
                    title={excelView ? 'Beralih ke tampilan daftar (Rincian Barang & Validasi Dokumen)' : 'Lihat data hasil ekstraksi sebagai pratinjau Excel AJU'}
                  >
                    {excelView ? <><List size={12} /> Lihat sebagai List</> : <><Table2 size={12} /> Lihat sebagai Excel</>}
                  </button>
                </div>
              </div>
            </div>

            <div className={styles.fieldsGrid}>
              {Object.entries(editing ? ALL_FIELDS : HERO_FIELDS).map(([key, label]) => {
                const displayValue = (key === 'cif_value' && !editing && decl.cif_value != null)
                  ? `${decl.currency || ''} ${Number(decl.cif_value).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`.trim()
                  : decl[key]
                return (
                  <ConfidenceField key={key} label={label} fieldKey={key}
                    value={displayValue} confidence={ext[key]?.confidence}
                    editing={editing} editValue={editData[key]}
                    onChange={handleFieldChange} corrected={!!corrected[key]}
                    required={MANDATORY.includes(key)} />
                )
              })}
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
            {!excelView && (
            <>
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
            </>
            )}

            {excelView && (
              <div className={styles.excelPanel} style={{ gridColumn: '1 / -1' }}>
                <div className={styles.excelHead}>
                  <div className={styles.panelTitle} style={{ marginBottom: 0 }}>Excel AJU Preview</div>
                  <button className={styles.downloadXlsBtn} onClick={handleDownloadExcel} title="Unduh file .xlsx yang sama persis dengan pratinjau ini">
                    <Download size={13} /> Download Excel (.xlsx)
                  </button>
                </div>
                <div className={styles.excelHint}>
                  Ini persis struktur &amp; kolom yang akan ditulis ke file <b>AJU_{String(decl.id).slice(0, 8).toUpperCase()}.xlsx</b> saat submit ke CEISA — bukan file terpisah, cukup pratinjau di halaman ini.
                </div>

                <div className={styles.sheetTabsRow}>
                  {EXCEL_SHEETS.map(s => (
                    <div key={s}
                      className={styles.sheetTab + (activeSheet === s ? ' ' + styles.sheetTabActive : '')}
                      onClick={() => setActiveSheet(s)}>{s}</div>
                  ))}
                </div>

                {activeSheet === 'HEADER' && (
                  <div className={styles.xlsWrap + ' ' + styles.fvSheet}>
                    <table className={styles.xlsTable}>
                      <thead><tr><th className={styles.rownum}>#</th><th>Field</th><th>Nilai</th></tr></thead>
                      <tbody>
                        {headerRows.map((r, i) => (
                          <tr key={r.label}>
                            <td className={styles.rownum}>{i + 1}</td>
                            <td className={styles.xlsFieldCell}>
                              {r.label}
                              {r.conf && <span className={styles.confDot + ' ' + styles['confDot_' + r.conf]} />}
                            </td>
                            <td>
                              <EditableCell display={r.value} raw={r.raw} editable={isCellEditable && !!r.field}
                                onSave={val => handleCellSave(r.field, val)} />
                            </td>
                          </tr>
                        ))}
                        <tr>
                          <td className={styles.rownum}>…</td>
                          <td className={styles.xlsMuted}>+{headerRemaining} kolom lain</td>
                          <td className={styles.xlsMuted}>—</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                )}

                {activeSheet === 'ENTITAS' && (
                  <div className={styles.xlsWrap}>
                    <table className={styles.xlsTable}>
                      <thead><tr><th className={styles.rownum}>#</th><th>SERI</th><th>KODE ENTITAS</th><th>NOMOR IDENTITAS</th><th>NAMA ENTITAS</th><th>KODE NEGARA</th></tr></thead>
                      <tbody>
                        {entitasRows.map((r, i) => (
                          <tr key={i}>
                            <td className={styles.rownum}>{i + 1}</td>
                            <td className={styles.xlsReadonly}>{r.seri}</td>
                            <td className={styles.xlsReadonly}>{r.kode}</td>
                            <td>
                              <EditableCell display={r.nomor} raw={r.nomorRaw} editable={isCellEditable && !!r.nomorField}
                                onSave={val => handleCellSave(r.nomorField, val)} />
                            </td>
                            <td>
                              <EditableCell display={r.nama} raw={r.namaRaw} editable={isCellEditable && !!r.namaField}
                                onSave={val => handleCellSave(r.namaField, val)} />
                            </td>
                            <td className={styles.xlsCellRel}>
                              <EditableCell display={r.negara} raw={r.negaraRaw} editable={isCellEditable && !!r.negaraField}
                                onSave={val => handleCellSave(r.negaraField, val)} />
                              {r.negaraConf && <span className={styles.confDot + ' ' + styles['confDot_' + r.negaraConf]} />}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {activeSheet === 'DOKUMEN' && (
                  dokumenRows.length > 0 ? (
                    <div className={styles.xlsWrap}>
                      <table className={styles.xlsTable}>
                        <thead><tr><th className={styles.rownum}>#</th><th>SERI</th><th>KODE DOKUMEN</th><th>NOMOR DOKUMEN</th><th>TANGGAL DOKUMEN</th></tr></thead>
                        <tbody>
                          {dokumenRows.map((r, i) => (
                            <tr key={i}>
                              <td className={styles.rownum}>{i + 1}</td>
                              <td className={styles.xlsReadonly}>{r.seri}</td>
                              <td className={styles.xlsReadonly}>{r.kode}</td>
                              <td>
                                <EditableCell display={r.nomor} raw={r.nomor} editable={isCellEditable && !!r.nomorField}
                                  onSave={val => handleCellSave(r.nomorField, val)} />
                              </td>
                              <td>
                                <EditableCell display={r.tanggal} raw={r.tanggalRaw} editable={isCellEditable && !!r.tanggalField}
                                  onSave={val => handleCellSave(r.tanggalField, val)} />
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : <div className={styles.empty}>Tidak ada dokumen referensi (invoice/B-L) yang terekstrak.</div>
                )}

                {activeSheet === 'PENGANGKUT' && (
                  pengangkutRows.length > 0 ? (
                    <div className={styles.xlsWrap}>
                      <table className={styles.xlsTable}>
                        <thead><tr><th className={styles.rownum}>#</th><th>SERI</th><th>KODE CARA ANGKUT</th><th>NAMA PENGANGKUT</th><th>NOMOR PENGANGKUT</th></tr></thead>
                        <tbody>
                          {pengangkutRows.map((r, i) => (
                            <tr key={i}>
                              <td className={styles.rownum}>{i + 1}</td>
                              <td className={styles.xlsReadonly}>{r.seri}</td>
                              <td className={styles.xlsCellRel + ' ' + styles.xlsReadonly}>{r.kode}<span className={styles.confDot + ' ' + styles.confDot_med} /></td>
                              <td>
                                <EditableCell display={r.nama} raw={r.nama} editable={isCellEditable && !!r.namaField}
                                  onSave={val => handleCellSave(r.namaField, val)} />
                              </td>
                              <td>
                                <EditableCell display={r.nomor} raw={r.nomorRaw} editable={isCellEditable && !!r.nomorField}
                                  onSave={val => handleCellSave(r.nomorField, val)} />
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : <div className={styles.empty}>Tidak ada data pengangkut (nama kapal) yang terekstrak.</div>
                )}

                {activeSheet === 'KEMASAN' && (
                  kemasanRows.length > 0 ? (
                    <div className={styles.xlsWrap}>
                      <table className={styles.xlsTable}>
                        <thead><tr><th className={styles.rownum}>#</th><th>SERI</th><th>KODE KEMASAN</th><th>JUMLAH KEMASAN</th></tr></thead>
                        <tbody>
                          {kemasanRows.map((r, i) => (
                            <tr key={i}>
                              <td className={styles.rownum}>{i + 1}</td>
                              <td className={styles.xlsReadonly}>{r.seri}</td>
                              <td className={styles.xlsCellRel}>
                                <EditableCell display={r.kode} raw={r.kodeRaw} editable={isCellEditable && !!r.kodeField}
                                  onSave={val => handleCellSave(r.kodeField, val)} />
                                <span className={styles.confDot + ' ' + styles.confDot_med} />
                              </td>
                              <td>
                                <EditableCell display={r.jumlah} raw={r.jumlah} editable={isCellEditable && !!r.jumlahField}
                                  onSave={val => handleCellSave(r.jumlahField, val)} />
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : <div className={styles.empty}>Tidak ada data kemasan yang terekstrak.</div>
                )}

                {activeSheet === 'BARANG' && (
                  barangRows.length > 0 ? (
                    <div className={styles.xlsWrap}>
                      <table className={styles.xlsTable}>
                        <thead><tr><th className={styles.rownum}>#</th><th>SERI</th><th>HS</th><th>URAIAN</th><th>SATUAN</th><th>JML</th><th>HARGA SATUAN</th><th>NILAI BARANG</th><th>ASAL</th></tr></thead>
                        <tbody>
                          {barangRows.map((r, i) => (
                            <tr key={i}>
                              <td className={styles.rownum}>{i + 1}</td>
                              <td className={styles.xlsReadonly}>{r.seri}</td>
                              <td className={styles.xlsCellRel}>
                                <EditableCell display={r.hs} raw={r.hsRaw} editable={isCellEditable}
                                  onSave={val => handleBarangCellSave(r.i, 'hs_code', val)} />
                                {r.conf && <span className={styles.confDot + ' ' + styles['confDot_' + r.conf]} />}
                              </td>
                              <td>
                                <EditableCell display={r.uraian} raw={r.uraianRaw} editable={isCellEditable}
                                  onSave={val => handleBarangCellSave(r.i, 'description', val)} />
                              </td>
                              <td>
                                <EditableCell display={r.satuan} raw={r.satuanRaw} editable={isCellEditable}
                                  onSave={val => handleBarangCellSave(r.i, 'unit', val)} />
                              </td>
                              <td>
                                <EditableCell display={r.jumlah} raw={r.jumlahRaw} editable={isCellEditable}
                                  onSave={val => handleBarangCellSave(r.i, 'quantity', val)} />
                              </td>
                              <td>
                                <EditableCell display={r.harga} raw={r.hargaRaw} editable={isCellEditable}
                                  onSave={val => handleBarangCellSave(r.i, 'unit_price', val)} />
                              </td>
                              <td>
                                <EditableCell display={r.nilai} raw={r.nilaiRaw} editable={isCellEditable}
                                  onSave={val => handleBarangCellSave(r.i, 'total_value', val)} />
                              </td>
                              <td>
                                <EditableCell display={r.asal} raw={r.asalRaw} editable={isCellEditable}
                                  onSave={val => handleBarangCellSave(r.i, 'country_of_origin', val)} />
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <div className={styles.empty}>
                      AI tidak menemukan satu pun barang di dokumen ini.
                      {isCellEditable && ' Tambahkan baris untuk mengisinya manual.'}
                    </div>
                  )
                )}

                {activeSheet === 'BARANG' && isCellEditable && (
                  <button className={styles.addItemBtn} onClick={handleAddItem}>
                    + Tambah baris barang
                  </button>
                )}

                <div className={styles.excelFooter}>
                  <span>🟢 dot = confidence tinggi &nbsp; 🟠 = perlu dicek &nbsp; 🔴 = rendah/perlu mapping kode &nbsp; — = kosong, klik untuk isi manual</span>
                  <span><b>{val.score ?? 0}%</b> skor kesiapan Excel</span>
                </div>
              </div>
            )}
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
