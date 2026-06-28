import { CheckCircle, AlertTriangle, XCircle, Lightbulb, FileText, AlertCircle } from 'lucide-react'
import styles from './InsightPanel.module.css'

const ACTION_CONFIG = {
  auto_approve:    { icon: CheckCircle,    color: 'var(--success)', label: 'Auto-Approve',    bg: 'rgba(13,159,110,0.08)' },
  needs_review:    { icon: AlertTriangle,  color: 'var(--warning)', label: 'Needs Review',    bg: 'rgba(245,158,11,0.08)' },
  cannot_submit:   { icon: XCircle,        color: 'var(--danger)',  label: 'Cannot Submit',   bg: 'rgba(220,38,38,0.08)' },
}

const CONF_LEVEL_CONFIG = {
  high:   { color: 'var(--success)', label: 'High Confidence' },
  medium: { color: 'var(--warning)', label: 'Medium Confidence' },
  low:    { color: 'var(--danger)',  label: 'Low Confidence' },
}

export default function InsightPanel({ insight }) {
  if (!insight) return null

  const action = ACTION_CONFIG[insight.suggested_action] || ACTION_CONFIG.needs_review
  const confLevel = CONF_LEVEL_CONFIG[insight.confidence_level] || CONF_LEVEL_CONFIG.medium
  const ActionIcon = action.icon
  const confPct = insight.overall_confidence ? Math.round(insight.overall_confidence * 100) : null

  return (
    <div className={styles.panel}>
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <FileText size={15} />
          <span className={styles.headerTitle}>AI Document Insight</span>
        </div>
        <span className={styles.docType}>{insight.document_type?.replace(/_/g, ' ').toUpperCase() || 'UNKNOWN'}</span>
      </div>

      {/* Confidence bar */}
      <div className={styles.confidenceRow}>
        <span className={styles.confLabel}>Overall Confidence</span>
        <div className={styles.confBar}>
          <div className={styles.confFill} style={{ width: `${confPct || 0}%`, background: confLevel.color }} />
        </div>
        <span className={styles.confPct} style={{ color: confLevel.color }}>{confPct ?? '—'}%</span>
        <span className={styles.confLevelLabel} style={{ color: confLevel.color }}>{confLevel.label}</span>
      </div>

      {/* Anomalies */}
      {insight.anomalies?.length > 0 && (
        <div className={styles.section}>
          <div className={styles.sectionTitle}>Anomalies Detected</div>
          {insight.anomalies.map((a, i) => (
            <div key={i} className={`${styles.anomalyRow} ${a.severity === 'error' ? styles.anomalyError : styles.anomalyWarn}`}>
              {a.severity === 'error' ? <XCircle size={12}/> : <AlertTriangle size={12}/>}
              <span>{a.description}</span>
            </div>
          ))}
        </div>
      )}

      {/* Low confidence fields */}
      {insight.low_confidence_fields?.length > 0 && (
        <div className={styles.section}>
          <div className={styles.sectionTitle}>Fields Needing Review</div>
          {insight.low_confidence_fields.map((f, i) => (
            <div key={i} className={styles.lowConfRow}>
              <span className={styles.lowConfField}>{f.field?.replace(/_/g, ' ')}</span>
              <span className={styles.lowConfPct} style={{ color: f.confidence < 0.6 ? 'var(--danger)' : 'var(--warning)' }}>
                {Math.round((f.confidence || 0) * 100)}%
              </span>
              <span className={styles.lowConfReason}>{f.reason}</span>
            </div>
          ))}
        </div>
      )}

      {/* Cross-doc warnings */}
      {insight.cross_doc_warnings?.length > 0 && (
        <div className={styles.section}>
          <div className={styles.sectionTitle}>Cross-Document Warnings</div>
          {insight.cross_doc_warnings.map((w, i) => (
            <div key={i} className={styles.crossDocRow}>
              <AlertCircle size={12}/>
              <span>{w}</span>
            </div>
          ))}
        </div>
      )}

      {/* Suggested action */}
      <div className={styles.actionRow} style={{ background: action.bg, borderColor: action.color + '30' }}>
        <ActionIcon size={14} style={{ color: action.color, flexShrink: 0 }} />
        <div>
          <div className={styles.actionLabel} style={{ color: action.color }}>{action.label}</div>
          <div className={styles.actionReason}>{insight.suggested_action_reason}</div>
        </div>
      </div>
    </div>
  )
}
