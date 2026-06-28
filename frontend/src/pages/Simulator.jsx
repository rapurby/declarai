import { useState, useEffect } from 'react'
import { FlaskConical, Send, CheckCircle, XCircle, RefreshCw, Info } from 'lucide-react'
import { simulatorAPI } from '../services/api.js'
import toast from 'react-hot-toast'
import styles from './Simulator.module.css'

const DEFAULT_PAYLOAD = {
  header: { declaration_id: "TEST-001", declaration_type: "PIB", submission_date: new Date().toISOString() },
  importer: { consignee_name: "PT CIKARANG DRY PORT" },
  exporter: { shipper_name: "SHENZHEN TECH CO LTD", country_of_origin: "China", port_of_loading: "Shenzhen" },
  transport: { bl_number: "COSCO2026051234", port_of_discharge: "Tanjung Priok" },
  invoice: { invoice_number: "INV-2026-00123", invoice_date: "2026-05-15", declared_value: 15000, currency: "USD" },
  goods: [{ sequence: 1, hs_code: "8471300000", description: "Laptop Computer", quantity: 50, unit: "PCS", gross_weight: 125.5, net_weight: 110 }]
}

export default function Simulator() {
  const [payload, setPayload] = useState(JSON.stringify(DEFAULT_PAYLOAD, null, 2))
  const [response, setResponse] = useState(null)
  const [loading, setLoading] = useState(false)
  const [schema, setSchema] = useState(null)
  const [jsonError, setJsonError] = useState(null)
  const [history, setHistory] = useState([])

  useEffect(() => {
    simulatorAPI.schema().then(r => setSchema(r.data)).catch(() => {})
  }, [])

  const validateJson = (val) => {
    try { JSON.parse(val); setJsonError(null); return true }
    catch (e) { setJsonError(e.message); return false }
  }

  const handleSubmit = async () => {
    if (!validateJson(payload)) return toast.error('Fix JSON syntax first')
    setLoading(true)
    try {
      const parsed = JSON.parse(payload)
      const res = await simulatorAPI.submit(parsed)
      setResponse(res.data)
      setHistory(prev => [{ payload: parsed, response: res.data, time: new Date().toLocaleTimeString() }, ...prev.slice(0, 4)])
      if (res.data.status === 'ACCEPTED') toast.success('CEISA accepted the declaration')
      else toast.error('CEISA rejected — check error details')
    } catch (e) {
      toast.error('Simulator request failed')
    } finally { setLoading(false) }
  }

  const reset = () => {
    setPayload(JSON.stringify(DEFAULT_PAYLOAD, null, 2))
    setResponse(null)
    setJsonError(null)
  }

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <div className={styles.headerIcon}><FlaskConical size={18} /></div>
          <div>
            <h1 className={styles.title}>CEISA Simulator</h1>
            <p className={styles.subtitle}>Test declarations without touching the live CEISA system</p>
          </div>
        </div>
        <button className={styles.resetBtn} onClick={reset}><RefreshCw size={13} /> Reset</button>
      </div>

      <div className={styles.main}>
        <div className={styles.leftPanel}>
          <div className={styles.editorCard}>
            <div className={styles.editorHeader}>
              <span className={styles.editorTitle}>Declaration Payload (JSON)</span>
              {jsonError && <span className={styles.jsonError}>{jsonError}</span>}
            </div>
            <textarea
              className={`${styles.editor} ${jsonError ? styles.editorError : ''}`}
              value={payload}
              onChange={e => { setPayload(e.target.value); validateJson(e.target.value) }}
              spellCheck={false}
            />
            <div className={styles.editorFooter}>
              <button className={styles.submitBtn} onClick={handleSubmit} disabled={loading || !!jsonError}>
                <Send size={13} />
                {loading ? 'Submitting...' : 'Submit to Simulator'}
              </button>
            </div>
          </div>
        </div>

        <div className={styles.rightPanel}>
          {response ? (
            <div className={styles.responseCard}>
              <div className={`${styles.responseStatus} ${response.status === 'ACCEPTED' ? styles.accepted : styles.rejected}`}>
                {response.status === 'ACCEPTED'
                  ? <><CheckCircle size={20} /> Declaration Accepted</>
                  : <><XCircle size={20} /> Declaration Rejected</>}
              </div>
              <div className={styles.responseBody}>
                {response.registration_number && (
                  <div className={styles.regBlock}>
                    <span className={styles.regLabel}>Registration Number</span>
                    <span className={styles.regValue}>{response.registration_number}</span>
                  </div>
                )}
                {response.error_code && (
                  <div className={styles.errorBlock}>
                    <span className={styles.regLabel}>Error Code</span>
                    <span className={styles.errorCode}>{response.error_code}</span>
                  </div>
                )}
                <div className={styles.responseMsg}>{response.message}</div>
                <div className={styles.responseJson}>
                  <div className={styles.jsonLabel}>Raw Response</div>
                  <pre className={styles.pre}>{JSON.stringify(response, null, 2)}</pre>
                </div>
              </div>
            </div>
          ) : (
            <div className={styles.emptyResponse}>
              <FlaskConical size={36} className={styles.emptyIcon} />
              <div className={styles.emptyTitle}>Ready to simulate</div>
              <div className={styles.emptySub}>Edit the payload and click Submit</div>
            </div>
          )}

          {schema && (
            <div className={styles.schemaCard}>
              <div className={styles.schemaHeader}><Info size={13} /> CEISA Field Reference</div>
              <div className={styles.schemaList}>
                <div className={styles.schemaItem}>
                  <span className={styles.schemaLabel}>Mandatory fields</span>
                  <div className={styles.schemaTags}>
                    {schema.mandatory_fields?.map(f => <span key={f} className={styles.schemaTag}>{f}</span>)}
                  </div>
                </div>
                <div className={styles.schemaItem}>
                  <span className={styles.schemaLabel}>HS Code format</span>
                  <span className={styles.schemaValue}>{schema.hs_code_format}</span>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {history.length > 0 && (
        <div className={styles.historyCard}>
          <div className={styles.historyHeader}>Submission History (this session)</div>
          <div className={styles.historyList}>
            {history.map((h, i) => (
              <div key={i} className={styles.historyItem} onClick={() => setResponse(h.response)}>
                <span className={`${styles.historyStatus} ${h.response.status === 'ACCEPTED' ? styles.hAccepted : styles.hRejected}`}>
                  {h.response.status === 'ACCEPTED' ? <CheckCircle size={12} /> : <XCircle size={12} />}
                  {h.response.status}
                </span>
                <span className={styles.historyReg}>{h.response.registration_number || h.response.error_code || '—'}</span>
                <span className={styles.historyTime}>{h.time}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
