type Score = {
  model: string;
  compound: number;
  label: "positive" | "neutral" | "negative";
};
export function SentimentReport({
  turns,
}: {
  turns: { id: string; role: string; sentiment?: Score | null }[];
}) {
  const caller = turns.filter((t) => t.role === "user"),
    scored = caller.filter((t) => t.sentiment);
  const counts = { positive: 0, neutral: 0, negative: 0 };
  scored.forEach((t) => counts[t.sentiment!.label]++);
  const total = scored.length,
    positive = total ? (counts.positive / total) * 100 : 0,
    neutral = total ? (counts.neutral / total) * 100 : 0;
  return (
    <section className="sentiment-report">
      <div>
        <p className="eyebrow">THE FEEL OF THE CALL</p>
        <h2>Customer sentiment</h2>
        <p>
          Estimated from the caller’s words, using a local English-language
          model.
        </p>
      </div>
      {!total ? (
        <p>
          No sentiment report is available for this call. New calls are analysed
          when local scoring is running.
        </p>
      ) : (
        <>
          <div className="sentiment-layout">
            <div
              className="sentiment-donut"
              role="img"
              aria-label={`Positive ${counts.positive}, neutral ${counts.neutral}, negative ${counts.negative} caller turns`}
              style={{
                background: `conic-gradient(#91B7AD 0 ${positive}%, #9b9b9b ${positive}% ${positive + neutral}%, #FF441C ${positive + neutral}% 100%)`,
              }}
            >
              <span>
                {total}
                <small>caller turns</small>
              </span>
            </div>
            <ul>
              {(["positive", "neutral", "negative"] as const).map((label) => (
                <li key={label}>
                  <strong>{label}</strong>
                  <span>
                    {Math.round((counts[label] / total) * 100)}% ·{" "}
                    {counts[label]} turns
                  </span>
                </li>
              ))}
            </ul>
          </div>
          <h3>How the conversation changed</h3>
          <div className="sentiment-timeline">
            {scored.map((turn, i) => (
              <span
                key={turn.id}
                className={turn.sentiment!.label}
                title={`Turn ${i + 1}: ${turn.sentiment!.label}, score ${turn.sentiment!.compound}`}
                aria-label={`Turn ${i + 1}: ${turn.sentiment!.label}`}
              >
                {i + 1}
              </span>
            ))}
          </div>
          <p className="small">
            {total} of {caller.length} caller turns analysed. Percentages count
            turns, not time or certainty. Neutral can mean there was no clear
            sentiment signal. Sarcasm and transcription errors may affect the
            result.
          </p>
        </>
      )}
    </section>
  );
}
