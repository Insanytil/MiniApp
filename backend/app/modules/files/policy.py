"""Storage rules shared by uploads, image fields and previews."""
IMAGE_CONTENT_TYPES = frozenset({
    "image/png", "image/jpeg", "image/gif", "image/webp", "image/avif",
})
MAX_SIGNED_URL_LIFETIME_SECONDS = 3600


def signed_url_lifetime(seconds: int) -> int:
    return min(seconds, MAX_SIGNED_URL_LIFETIME_SECONDS)
