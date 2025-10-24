import type { NextApiRequest, NextApiResponse } from 'next';
import nodemailer, { Transporter } from 'nodemailer';
import {
  createVerificationCode,
  getVerificationEntry,
} from '../../lib/server/verification-store';

type ResponseData =
  | { ok: true; previewUrl?: string; message?: string }
  | { message: string };

type TransporterBundle = {
  transporter: Transporter;
  from: string;
  usesEthereal: boolean;
};

let cachedTransporter: TransporterBundle | null = null;

function hasSmtpConfig() {
  return Boolean(process.env.EMAIL_HOST && process.env.EMAIL_USER && process.env.EMAIL_PASS);
}

async function buildTransporter(): Promise<TransporterBundle> {
  if (cachedTransporter) return cachedTransporter;

  if (hasSmtpConfig()) {
    const transporter = nodemailer.createTransport({
      host: process.env.EMAIL_HOST,
      port: Number(process.env.EMAIL_PORT || 587),
      secure: process.env.EMAIL_SECURE === 'true',
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
      },
    });

    cachedTransporter = {
      transporter,
      from: process.env.EMAIL_FROM || process.env.EMAIL_USER || 'no-reply@example.com',
      usesEthereal: false,
    };
    return cachedTransporter;
  }

  // fallback to Ethereal test account for local/testing environments
  const testAccount = await nodemailer.createTestAccount();
  const transporter = nodemailer.createTransport({
    host: testAccount.smtp.host,
    port: testAccount.smtp.port,
    secure: testAccount.smtp.secure,
    auth: {
      user: testAccount.user,
      pass: testAccount.pass,
    },
  });

  cachedTransporter = {
    transporter,
    from: testAccount.user,
    usesEthereal: true,
  };
  return cachedTransporter;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ResponseData>
) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ message: 'Метод не поддерживается' });
  }

  const { email, name } = req.body ?? {};
  if (typeof email !== 'string' || !email.trim()) {
    return res.status(400).json({ message: 'Укажите корректный email' });
  }

  try {
    const code = createVerificationCode(email);
    const { transporter, from, usesEthereal } = await buildTransporter();

    const displayName = typeof name === 'string' && name.trim() ? name.trim() : 'друг InNet';
    const text = [
      `Здравствуйте, ${displayName}!`,
      '',
      'Вы запросили регистрацию в InNet.',
      `Ваш код подтверждения: ${code}`,
      '',
      'Введите его в приложении, чтобы завершить создание аккаунта.',
      '',
      'Если вы не инициировали этот запрос, просто проигнорируйте письмо.',
    ].join('\n');

    const html = `
      <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #111827;">
        <h2 style="color:#0d9488;">Здравствуйте, ${displayName}!</h2>
        <p>Спасибо, что регистрируетесь в <strong>InNet</strong>.</p>
        <p>Ваш код для подтверждения аккаунта:</p>
        <p style="font-size: 28px; font-weight: 700; letter-spacing: 6px; color:#0d9488;">${code}</p>
        <p>Введите его в приложении, чтобы завершить регистрацию.</p>
        <p style="font-size: 12px; color:#6b7280; margin-top:24px;">
          Если вы не инициировали регистрацию, просто проигнорируйте это письмо.
        </p>
      </div>
    `;

    const info = await transporter.sendMail({
      from,
      to: email,
      subject: 'Ваш код подтверждения InNet',
      text,
      html,
    });

    const previewCandidate = usesEthereal ? nodemailer.getTestMessageUrl(info) : undefined;
    const previewUrl = typeof previewCandidate === 'string' ? previewCandidate : undefined;
    return res.status(200).json({
      ok: true,
      previewUrl,
      message: previewUrl
        ? 'Письмо отправлено (используется тестовый SMTP Ethereal).'
        : 'Письмо отправлено.',
    });
  } catch (error) {
    console.error('[send-confirmation] Ошибка отправки письма', error);
    return res.status(500).json({
      message: 'Не удалось отправить письмо. Проверьте настройки или попробуйте позже.',
    });
  }
}
