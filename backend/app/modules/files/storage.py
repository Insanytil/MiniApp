from functools import lru_cache
from urllib.parse import quote
import boto3
from botocore.config import Config
from app.core.config import settings


class S3Storage:
    def __init__(self):
        options = dict(
            region_name=settings.s3_region,
            aws_access_key_id=settings.s3_access_key,
            aws_secret_access_key=settings.s3_secret_key.get_secret_value(),
            config=Config(signature_version="s3v4", s3={"addressing_style": "path"},
                          connect_timeout=5, read_timeout=30, retries={"max_attempts": 2}),
        )
        self.client = boto3.client("s3", endpoint_url=settings.s3_endpoint_url, **options)
        self.signer = boto3.client("s3", endpoint_url=settings.s3_public_endpoint_url, **options)

    def upload(self, key: str, content_type: str, size: int):
        return self.signer.generate_presigned_post(
            Bucket=settings.s3_bucket, Key="pending/" + key,
            Fields={"Content-Type": content_type},
            Conditions=[{"Content-Type": content_type}, ["content-length-range", size, size]],
            ExpiresIn=min(settings.s3_url_lifetime_seconds, 3600),
        )

    def finalize(self, key: str, content_type: str, size: int):
        source = "pending/" + key
        head = self.client.head_object(Bucket=settings.s3_bucket, Key=source)
        if head["ContentLength"] != size or head.get("ContentType") != content_type:
            raise ValueError("Uploaded file does not match declared metadata")
        # Conditional copy freezes the verified object even if the POST is replayed.
        self.client.copy_object(
            Bucket=settings.s3_bucket, Key=key,
            CopySource={"Bucket": settings.s3_bucket, "Key": source},
            CopySourceIfMatch=head["ETag"], MetadataDirective="REPLACE",
            ContentType=content_type, ContentDisposition="attachment",
        )

    def download(self, key: str, filename: str, inline: bool = False):
        return self.signer.generate_presigned_url(
            "get_object", Params={"Bucket": settings.s3_bucket, "Key": key,
            "ResponseContentDisposition": ("inline" if inline else "attachment") + "; filename*=UTF-8''" + quote(filename, safe="")},
            ExpiresIn=min(settings.s3_url_lifetime_seconds, 3600),
        )

    def delete(self, key: str):
        self.client.delete_object(Bucket=settings.s3_bucket, Key=key)
        self.client.delete_object(Bucket=settings.s3_bucket, Key="pending/" + key)


@lru_cache
def get_storage():
    return S3Storage()
