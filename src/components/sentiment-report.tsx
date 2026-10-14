type Score = {
  model: string;
  compound: number;
  label: "positive" | "neutral" | "negative";
};
const labels = {
  positive: "Positive wording",
  neutral: "No clear emotional wording",
  negative: "Negative wording",
};
export function SentimentReport({
  turns,
}: {
  turns: { id: string; role: string; text: string; sentiment?: Score | null }[];
}) {
  const caller = turns.filter((t) => t.role === "user");
  // Short confirmations and spelled contact details do not establish customer satisfaction.
  const conversational = caller.filter(
    (t) =>
      !/^\s*(yes|yeah|yep|no|nope|okay|ok|sure|thanks|thank you|what)[.!?\s]*$/i.test(
        t.text,
      ) && !/^\s*(?:[a-z]\s+){2,}[a-z][.!?\s]*$/i.test(t.text),
  );
  const scored = conversational.filter((t) => t.sentiment);
  const count = { positive: 0, neutral: 0, negative: 0 };
  scored.forEach((t) => count[t.sentiment!.label]++);
  const total = scored.length;
  const positive = total ? (count.positive / total) * 100 : 0,
    neutral = total ? (count.neutral / total) * 100 : 0;
  return (
    <section className="sentiment-report">
      <p className="eyebrow">WHAT THE CALLER’S WORDS SUGGEST</p>
      <h2>Language signals</h2>
      <p>
        This is a wording check, not a rating of how happy the customer was. A
        positive phrase can appear in an unhappy conversation.
      </p>
      {!total ? (
        <p>
          There isn’t enough scored language to show a breakdown for this call.
        </p>
      ) : (
        <>
          <div className="sentiment-layout">
            <div
              className="sentiment-donut"
              role="img"
              aria-label={`${count.positive} positive, ${count.neutral} without a clear signal, ${count.negative} negative statements`}
              style={{
                background: `conic-gradient(#91B7AD 0 ${positive}%,#9b9b9b ${positive}% ${positive + neutral}%,#FF441C ${positive + neutral}% 100%)`,
              }}
            >
              <span>
                {total}
                <small>
                  statements
                  <br />
                  checked
                </small>
              </span>
            </div>
            <ul>
              {(["positive", "neutral", "negative"] as const).map((label) => (
                <li key={label}>
                  <strong>{labels[label]}</strong>
                  <span>
                    {count[label]}{" "}
                    {count[label] === 1 ? "statement" : "statements"} ·{" "}
                    {Math.round((count[label] / total) * 100)}%
                  </span>
                </li>
              ))}
            </ul>
          </div>
          <p>
            {count.negative > 0
              ? "Some wording may need attention. Read the negative statements below in context."
              : "No negative wording was detected in the scored statements. This does not prove the caller was satisfied."}
          </p>
          <div className="sentiment-evidence">
            {(["negative", "positive", "neutral"] as const).map((label) => (
              <details
                key={label}
                open={label === "negative" && count.negative > 0}
              >
                <summary>
                  {labels[label]} ({count[label]})
                </summary>
                <ul>
                  {scored
                    .filter((t) => t.sentiment!.label === label)
                    .map((t) => (
                      <li key={t.id}>
                        <blockquote>“{t.text}”</blockquote>
                        <p>
                          {label === "neutral"
                            ? "The word-based score did not pass either threshold. This can simply be a factual question or request."
                            : `The model’s combined word score passed the ${label} threshold. Read the full statement: politeness, negation and transcription can change its meaning.`}
                        </p>
                      </li>
                    ))}
                </ul>
              </details>
            ))}
          </div>
        </>
      )}
      <details>
        <summary>How is this worked out?</summary>
        <p>
          The local VADER English model uses a dictionary of words and rules for
          emphasis and negation. A score of 0.05 or above is labelled positive;
          −0.05 or below is negative. Values between are labelled no clear
          emotional wording. These are word scores, not confidence percentages.
        </p>
        <p>
          You spoke {caller.length} times. The chart counts {total} scored
          statements after leaving out simple yes/no replies, short
          acknowledgements and clearly spelled-out details. Each statement
          counts equally, regardless of length. Context and sarcasm can be
          missed.
        </p>
        <p>
          The original scores stay saved with your conversation. Open each
          category above to see exactly which statements it includes.
        </p>
      </details>
    </section>
  );
}
