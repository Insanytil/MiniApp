# app/core/email.py
import asyncio
import smtplib
from email.message import EmailMessage
from html import escape


class SmtpEmailSender:
    def __init__(
        self,
        *,
        host: str,
        port: int,
        sender_email: str,
        frontend_base_url: str,
    ):
        self.host = host
        self.port = port
        self.sender_email = sender_email
        self.frontend_base_url = frontend_base_url.rstrip("/")

    async def send_account_invitation(
        self,
        *,
        recipient_email: str,
        token: str,
    ) -> None:
        activation_url = (
            f"{self.frontend_base_url}/activate?token={token}"
        )
        message = EmailMessage()
        message["Subject"] = "Activez votre compte MiniApp"
        message["From"] = self.sender_email
        message["To"] = recipient_email
        message.set_content(
            "Votre compte MiniApp a été créé. "
            f"Définissez votre mot de passe ici : {activation_url}"
        )
        message.add_alternative(
            f"""
            <h1>Bienvenue sur MiniApp</h1>
            <p>Un compte a été créé pour <strong>{escape(recipient_email)}</strong>.</p>
            <p>Utilisez le lien ci-dessous pour vérifier votre adresse et définir votre mot de passe.</p>
            <p><a href="{escape(activation_url)}">Activer mon compte</a></p>
            <p>Ce lien est personnel et temporaire.</p>
            """,
            subtype="html",
        )

        await asyncio.to_thread(self._send, message)

    async def send_password_reset(
        self,
        *,
        recipient_email: str,
        token: str,
    ) -> None:
        reset_url = f"{self.frontend_base_url}/reset-password?token={token}"
        message = EmailMessage()
        message["Subject"] = "Réinitialisez votre mot de passe MiniApp"
        message["From"] = self.sender_email
        message["To"] = recipient_email
        message.set_content(
            "Une réinitialisation de votre mot de passe MiniApp a été demandée. "
            f"Définissez un nouveau mot de passe ici : {reset_url}"
        )
        message.add_alternative(
            f"""
            <h1>Réinitialisation du mot de passe</h1>
            <p>Une réinitialisation a été demandée pour <strong>{escape(recipient_email)}</strong>.</p>
            <p><a href="{escape(reset_url)}">Définir un nouveau mot de passe</a></p>
            <p>Ce lien est personnel, temporaire et utilisable une seule fois.</p>
            """,
            subtype="html",
        )

        await asyncio.to_thread(self._send, message)

    def _send(self, message: EmailMessage) -> None:
        with smtplib.SMTP(self.host, self.port, timeout=10) as smtp:
            smtp.send_message(message)