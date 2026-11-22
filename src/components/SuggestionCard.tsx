import type { Suggestion } from '../lib/weightAnalysis';
import { Button } from './Button';
import { Card } from './Card';

export interface SuggestionCardProps {
  suggestion: Suggestion;
  onAccept?: () => void;
  onSnooze: () => void;
  busy?: boolean;
}

export function SuggestionCard({ suggestion, onAccept, onSnooze, busy }: SuggestionCardProps) {
  return (
    <Card title="Suggestion" className="suggestion">
      <p className="suggestion__title">
        <strong>{suggestion.title}</strong>
      </p>
      <details className="suggestion__reason">
        <summary>Why</summary>
        <p className="muted">{suggestion.reason}</p>
      </details>
      <div className="suggestion__actions">
        {suggestion.kind === 'calorie' && onAccept && (
          <Button disabled={busy} onClick={onAccept}>
            Accept
          </Button>
        )}
        <Button variant="secondary" disabled={busy} onClick={onSnooze}>
          Not now
        </Button>
      </div>
    </Card>
  );
}
