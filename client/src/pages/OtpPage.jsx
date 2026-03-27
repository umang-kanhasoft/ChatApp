import { useMutation } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { verifyEmailOtpByPhoneApi, verifyOtpApi } from '../services/authApi.js';
import { useAuthStore } from '../store/authStore.js';

export default function OtpPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const setAuth = useAuthStore((state) => state.setAuth);
  const phoneFromQuery = searchParams.get('phone') || '';
  const mode = searchParams.get('mode') || 'phone';
  const emailHint = searchParams.get('hint') || '';
  const [code, setCode] = useState('');
  const [phone] = useState(phoneFromQuery);

  useEffect(() => {
    if (!phoneFromQuery) {
      navigate('/login', { replace: true });
    }
  }, [navigate, phoneFromQuery]);

  const codeSlots = useMemo(() => Array.from({ length: 6 }, (_, i) => code[i] || ''), [code]);
  const isEmailOtpFlow = mode === 'email-phone';

  const verifyMutation = useMutation({
    mutationFn: isEmailOtpFlow ? verifyEmailOtpByPhoneApi : verifyOtpApi,
    onSuccess: (data) => {
      setAuth(data);
      navigate('/chat', { replace: true });
    },
  });

  const handleSubmit = (event) => {
    event.preventDefault();
    if (!phone) return;
    if (code.length < 6) return;
    verifyMutation.mutate({ phone, code });
  };

  return (
    <div className="otp-page">
      <form className="otp-card" onSubmit={handleSubmit}>
        <button
          type="button"
          className="otp-back"
          onClick={() => navigate('/login', { replace: true, state: { phone } })}
        >
          ← Edit {phone ? `number (${phone})` : 'info'}
        </button>
        <h1>Enter 6-digit code</h1>
        <p>
          {isEmailOtpFlow
            ? `We’ve sent a verification code to ${emailHint || 'your registered email'}.`
            : 'We’ve sent an SMS with a code to the number above.'}
        </p>

        <div className="otp-inputs" onClick={() => document.getElementById('otp-hidden')?.focus()}>
          {codeSlots.map((slot, index) => (
            <span key={index} className="otp-box">
              {slot}
            </span>
          ))}
        </div>
        <input
          id="otp-hidden"
          className="otp-hidden"
          inputMode="numeric"
          pattern="[0-9]*"
          maxLength={6}
          value={code}
          onChange={(event) => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))}
          autoFocus
        />

        {verifyMutation.error ? (
          <p className="error-text">
            {verifyMutation.error.response?.data?.error?.message || 'Invalid or expired code'}
          </p>
        ) : null}

        <button type="submit" disabled={verifyMutation.isPending || code.length < 6}>
          {verifyMutation.isPending ? 'Verifying…' : 'Next'}
        </button>

        <p className="otp-help-link" onClick={() => navigate('/login', { replace: true })}>
          {isEmailOtpFlow ? 'Didn&apos;t receive the email code?' : 'Didn&apos;t receive a verification code?'}
        </p>
      </form>
    </div>
  );
}
