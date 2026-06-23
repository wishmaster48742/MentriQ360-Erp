import hashlib
import secrets
from dataclasses import dataclass
from datetime import timedelta

from django.conf import settings
from django.core import signing
from django.utils import timezone


CAPTCHA_MAX_AGE_SECONDS = 5 * 60
CAPTCHA_SALT = "mentriq360-login-captcha-v2"
_USED_PREFIX = "cap_used:"


@dataclass(frozen=True)
class CaptchaChallenge:
    challenge_id: str
    question: str   # arithmetic question shown to the user, e.g. "23 + 47 = ?"
    expires_in: int
    expires_at: str


def _normalize_answer(value: str) -> str:
    return "".join(str(value or "").strip().split())


def _hash_answer(answer: str, nonce: str) -> str:
    material = f"{_normalize_answer(answer)}:{nonce}:{settings.SECRET_KEY}"
    return hashlib.sha256(material.encode("utf-8")).hexdigest()


def make_captcha_token(answer: str, *, nonce: str | None = None) -> str:
    """
    Create a signed, time-limited token that encodes the HASH of the answer,
    not the answer itself.  Safe to include in API responses.
    """
    token_nonce = nonce or secrets.token_urlsafe(12)
    payload = {
        "nonce": token_nonce,
        "answer_hash": _hash_answer(answer, token_nonce),
    }
    return signing.dumps(payload, salt=CAPTCHA_SALT, compress=True)


def _generate_math_problem() -> tuple[str, str]:
    """Return (question_string, numeric_answer_string) for a simple arithmetic challenge."""
    op = secrets.choice(("+", "-"))
    if op == "+":
        a = secrets.randbelow(90) + 10      # 10–99
        b = secrets.randbelow(90) + 10      # 10–99
        return f"{a} + {b} = ?", str(a + b)
    # subtraction: ensure positive result ≥ 1
    a = secrets.randbelow(80) + 20          # 20–99
    b = secrets.randbelow(a - 10) + 10      # 10 … a−1
    return f"{a} - {b} = ?", str(a - b)


def generate_captcha_challenge() -> CaptchaChallenge:
    question, answer = _generate_math_problem()
    expires_at = timezone.now() + timedelta(seconds=CAPTCHA_MAX_AGE_SECONDS)
    return CaptchaChallenge(
        challenge_id=make_captcha_token(answer),
        question=question,
        expires_in=CAPTCHA_MAX_AGE_SECONDS,
        expires_at=expires_at.isoformat(),
    )


def _used_cache_key(challenge_id: str) -> str:
    return f"{_USED_PREFIX}{hashlib.sha256(challenge_id.encode()).hexdigest()[:32]}"


def validate_captcha_response(challenge_id: str, answer: str) -> bool:
    """
    Return True iff the answer matches the signed challenge AND the token has
    not been used before.  Marks the token as consumed on success so it cannot
    be replayed.
    """
    if not challenge_id or not answer:
        return False

    from django.core.cache import cache

    # Replay-attack guard: each challenge may be used at most once.
    used_key = _used_cache_key(challenge_id)
    if cache.get(used_key):
        return False

    try:
        payload = signing.loads(challenge_id, salt=CAPTCHA_SALT, max_age=CAPTCHA_MAX_AGE_SECONDS)
    except signing.BadSignature:
        return False

    nonce = payload.get("nonce")
    expected_hash = payload.get("answer_hash")
    if not nonce or not expected_hash:
        return False

    valid = secrets.compare_digest(_hash_answer(answer, nonce), expected_hash)
    if valid:
        # Consume the token so it cannot be submitted again.
        cache.set(used_key, True, timeout=CAPTCHA_MAX_AGE_SECONDS)
    return valid
