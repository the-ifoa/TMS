// Shared helpers for rendering a graded exam answer (used by the staff result
// view and the candidate's post-exam review).

export function correctAnswerText(q) {
  switch (q.type) {
    case 'mcq':
    case 'true_false':
    case 'select_list':
      return (q.options || []).filter((o) => o.is_correct).map((o) => o.text).join(', ') || '—';
    case 'multi_response':
      return (q.options || []).filter((o) => o.is_correct).map((o) => o.text).join(', ') || '—';
    case 'numeric':
      return q.numeric_answer != null ? String(q.numeric_answer) : '—';
    case 'sequence':
      return (q.sequence_items || []).map((s) => s.text).join(' → ');
    case 'matching':
      return (q.matching_pairs || []).map((p) => `${p.left} ↔ ${p.right}`).join('; ');
    case 'fill_blank':
      return (q.blanks_answers || []).map((a) => (a || [])[0]).join(', ');
    case 'drag_words':
      return (q.drag_words_answers || []).join(', ');
    case 'drag_drop':
      return (q.dragdrop_items || [])
        .map((i) => {
          const targetName =
            q.dragdrop_targets?.[i.correct_target_index]?.label ||
            `Zone ${(i.correct_target_index ?? 0) + 1}`;
          return `${i.label} → ${targetName}`;
        })
        .join('; ');
    default:
      return null;
  }
}

export const TYPE_LABELS = {
  mcq: 'Multiple Choice', multi_response: 'Multi-Select', true_false: 'True / False',
  short_answer: 'Short Answer', numeric: 'Numeric', sequence: 'Sequencing',
  matching: 'Matching', fill_blank: 'Fill in the Blank', select_list: 'Select List',
  drag_words: 'Drag Words', hotspot: 'Hotspot', drag_drop: 'Drag & Drop', essay: 'Essay',
};

export function responseText(q, response) {
  if (response == null || response === '') return null;

  if (['mcq', 'true_false', 'select_list'].includes(q.type)) {
    return (q.options || []).find((o) => String(o._id) === String(response))?.text || String(response);
  }

  if (q.type === 'multi_response') {
    const ids = Array.isArray(response) ? response.map(String) : [];
    const matched = (q.options || []).filter((o) => ids.includes(String(o._id))).map((o) => o.text);
    return matched.length > 0 ? matched.join(', ') : null;
  }

  if (q.type === 'drag_drop') {
    if (Array.isArray(response)) {
      const items = response.map((item) => {
        if (typeof item === 'object' && item !== null) {
          const label = item.item_label || item.label || '';
          const targetIdx = item.target_Index ?? item.target_index;
          const target =
            item.target_label ||
            q.dragdrop_targets?.[targetIdx]?.label ||
            `Zone ${targetIdx !== undefined ? targetIdx + 1 : ''}`;
          return `${label} → ${target}`;
        }
        return String(item);
      });
      return items.join('; ');
    }
  }

  if (q.type === 'matching') {
    if (Array.isArray(response)) {
      const pairs = q.matching_pairs || [];
      return response
        .map((p, idx) => {
          if (typeof p === 'object' && p !== null) return `${p.left || ''} ↔ ${p.right || ''}`;
          const left = pairs[idx]?.left || `#${idx + 1}`;
          return p ? `${left} ↔ ${p}` : null;
        })
        .filter(Boolean)
        .join('; ') || null;
    }
  }

  if (q.type === 'sequence') {
    if (Array.isArray(response)) {
      const items = q.sequence_items || [];
      return response
        .map((item) => {
          if (typeof item === 'object' && item !== null) return item.text || item.label || String(item);
          return items[Number(item)]?.text ?? String(item);
        })
        .join(' → ');
    }
  }

  if (q.type === 'fill_blank' || q.type === 'drag_words') {
    if (Array.isArray(response)) {
      return response.join(', ');
    }
  }

  if (typeof response === 'object' && response !== null) {
    try {
      if (Array.isArray(response)) {
        return response.map((r) => (typeof r === 'object' ? JSON.stringify(r) : String(r))).join(', ');
      }
      return Object.entries(response)
        .map(([k, v]) => `${k}: ${v}`)
        .join(', ');
    } catch {
      return JSON.stringify(response);
    }
  }

  return String(response);
}
