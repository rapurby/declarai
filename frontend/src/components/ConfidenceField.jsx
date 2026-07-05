import styles from './ConfidenceField.module.css'

function getConfColor(confidence) {
  if (confidence === undefined || confidence === null) return 'neutral'
  if (confidence >= 0.85) return 'high'
  if (confidence >= 0.60) return 'medium'
  return 'low'
}

function ConfBadge({ confidence }) {
  if (confidence === undefined || confidence === null) return null
  const level = getConfColor(confidence)
  // Only flag fields that actually need a second look — a badge on every
  // high-confidence field is just noise.
  if (level === 'high') return null
  const pct = Math.round(confidence * 100)
  return (
    <span className={`${styles.badge} ${styles['badge_' + level]}`}>
      <span className={styles.badgeDot} /> {pct}%
    </span>
  )
}

export default function ConfidenceField({
  label, fieldKey, value, confidence, editing, editValue,
  onChange, corrected, required,
}) {
  const level = getConfColor(confidence)
  const isEmpty = value === null || value === undefined || value === ''

  return (
    <div className={`${styles.field} ${styles['field_' + level]} ${corrected ? styles.corrected : ''}`}>
      <div className={styles.labelRow}>
        <span className={styles.label}>{label}</span>
        <div className={styles.badges}>
          <ConfBadge confidence={confidence} />
          {corrected && <span className={styles.correctedBadge}>✏ Corrected</span>}
          {required && level === 'low' && <span className={styles.requiredBadge}>Must review</span>}
        </div>
      </div>

      {editing ? (
        <input
          className={`${styles.input} ${level === 'low' ? styles.inputLow : ''}`}
          value={editValue ?? ''}
          onChange={e => onChange(fieldKey, e.target.value)}
          placeholder={isEmpty ? 'Not found — enter manually' : undefined}
        />
      ) : (
        <div className={`${styles.value} ${isEmpty ? styles.empty : ''}`}>
          {isEmpty ? 'Not found' : String(value)}
        </div>
      )}
    </div>
  )
}
