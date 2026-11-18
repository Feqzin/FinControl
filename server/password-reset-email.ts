export function passwordResetEmailConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY?.trim() && process.env.PASSWORD_RESET_FROM_EMAIL?.trim() && process.env.PASSWORD_RESET_BASE_URL?.trim());
}

export function createPasswordResetUrl(token: string): string {
  const base = new URL(process.env.PASSWORD_RESET_BASE_URL!);
  if (process.env.NODE_ENV === "production" && base.protocol !== "https:") {
    throw new Error("PASSWORD_RESET_BASE_URL must use HTTPS in production");
  }
  const url = new URL("/redefinir-senha", base);
  url.searchParams.set("token", token);
  return url.toString();
}

export async function sendPasswordResetEmail(to: string, url: string): Promise<void> {
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: process.env.PASSWORD_RESET_FROM_EMAIL,
      to: [to],
      subject: "Redefinir sua senha no FinControl",
      text: `Recebemos uma solicitação para redefinir sua senha. Acesse o link em até 1 hora:\n${url}\n\nSe você não fez esta solicitação, ignore esta mensagem.`,
    }),
    signal: AbortSignal.timeout(8000),
  });
  if (!response.ok) throw new Error(`Password reset email provider returned ${response.status}`);
}
