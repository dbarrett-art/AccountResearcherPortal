import { useState } from 'react';

interface SectionFeedbackProps {
  sectionKey: string;
  feedback: { score: number; comment: string } | undefined;
  onChange: (key: string, score: number, comment: string) => void;
}

const FONTS = {
  sans: "'DM Sans', system-ui, sans-serif",
};

export default function SectionFeedback({ sectionKey, feedback, onChange }: SectionFeedbackProps) {
  const [showComment, setShowComment] = useState(false);
  const score = feedback?.score ?? 0;
  const comment = feedback?.comment ?? '';

  const handleThumb = (val: 1 | -1) => {
    // Clicking same thumb again deselects
    const newScore = score === val ? 0 : val;
    if (newScore === -1) {
      setShowComment(true);
    } else {
      setShowComment(false);
    }
    onChange(sectionKey, newScore, newScore === 0 ? '' : comment);
  };

  const handleComment = (text: string) => {
    onChange(sectionKey, score, text);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      <div
        style={{ display: 'flex', gap: 4, alignItems: 'center' }}
        onClick={e => e.stopPropagation()}
      >
        <button
          onClick={e => { e.stopPropagation(); handleThumb(1); }}
          title="Useful"
          style={{
            background: 'none', border: 'none', cursor: 'pointer',
            padding: '2px 4px', fontSize: 15, lineHeight: 1,
            color: score === 1 ? '#059669' : '#a8a29e',
            opacity: score === 1 ? 1 : 0.6,
            transition: 'color 0.15s, opacity 0.15s',
          }}
        >
          {score === 1 ? '👍' : '👍'}
        </button>
        <button
          onClick={e => { e.stopPropagation(); handleThumb(-1); }}
          title="Needs improvement"
          style={{
            background: 'none', border: 'none', cursor: 'pointer',
            padding: '2px 4px', fontSize: 15, lineHeight: 1,
            color: score === -1 ? '#dc2626' : '#a8a29e',
            opacity: score === -1 ? 1 : 0.6,
            transition: 'color 0.15s, opacity 0.15s',
          }}
        >
          {score === -1 ? '👎' : '👎'}
        </button>
      </div>
      {(score === -1 && showComment) && (
        <div
          onClick={e => e.stopPropagation()}
          style={{ marginTop: 6 }}
        >
          <textarea
            value={comment}
            onChange={e => handleComment(e.target.value)}
            maxLength={280}
            placeholder="What could be better?"
            style={{
              width: 220, minHeight: 48, padding: '6px 8px',
              fontSize: 12, fontFamily: FONTS.sans,
              border: '1px solid #e5e3de', borderRadius: 6,
              background: '#fafaf8', color: '#44403c',
              resize: 'vertical', outline: 'none',
            }}
            onFocus={e => { e.currentTarget.style.borderColor = '#7c3aed'; }}
            onBlur={e => { e.currentTarget.style.borderColor = '#e5e3de'; }}
          />
          <div style={{ fontSize: 10, color: '#a8a29e', textAlign: 'right', marginTop: 2 }}>
            {comment.length}/280
          </div>
        </div>
      )}
    </div>
  );
}
