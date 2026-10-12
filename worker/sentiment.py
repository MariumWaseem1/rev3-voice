"""Local, English text sentiment. No network calls or audio emotion inference."""
from functools import lru_cache

@lru_cache(maxsize=1)
def analyzer():
    from vaderSentiment.vaderSentiment import SentimentIntensityAnalyzer
    return SentimentIntensityAnalyzer()

def score_text(text: str) -> dict | None:
    if not text.strip():
        return None
    score = analyzer().polarity_scores(text)["compound"]
    label = "positive" if score >= 0.05 else "negative" if score <= -0.05 else "neutral"
    return {"model": "vader-3.3.2", "compound": score, "label": label}
