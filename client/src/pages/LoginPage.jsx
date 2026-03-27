import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link, useNavigate } from 'react-router-dom';
import { requestEmailOtpByPhoneApi } from '../services/authApi.js';
import { loginSchema } from '../utils/formSchemas.js';

const COUNTRY_LIST = [
  { code: 'US', name: 'United States', dial: '+1', flag: '🇺🇸' },
  { code: 'IN', name: 'India', dial: '+91', flag: '🇮🇳' },
  { code: 'DE', name: 'Germany', dial: '+49', flag: '🇩🇪' },
  { code: 'GB', name: 'United Kingdom', dial: '+44', flag: '🇬🇧' },
  { code: 'CA', name: 'Canada', dial: '+1', flag: '🇨🇦' },
];

const buildPhonePayload = (rawInput, dialCode) => {
  const input = String(rawInput || '').trim();
  if (!input) return '';

  const normalizedDial = String(dialCode || '').replace(/\D/g, '');
  const compact = input.replace(/[\s().-]/g, '');

  if (compact.startsWith('+')) {
    return `+${compact.slice(1).replace(/\D/g, '')}`;
  }

  if (compact.startsWith('00')) {
    return `+${compact.slice(2).replace(/\D/g, '')}`;
  }

  const digits = compact.replace(/\D/g, '');
  if (!digits) return '';
  return `+${normalizedDial}${digits}`;
};

export default function LoginPage() {
  const navigate = useNavigate();
  const [selectedCountry, setSelectedCountry] = useState(COUNTRY_LIST[1]);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      phone: '',
    },
  });

  const [emailWarning, setEmailWarning] = useState('');

  const otpRequestMutation = useMutation({
    mutationFn: requestEmailOtpByPhoneApi,
    onSuccess: (data, phone) => {
      if (data?.emailFailed) {
        setEmailWarning(
          'We could not send the verification email right now. Please try again in a moment, or contact support if this keeps happening.',
        );
        return;
      }

      setEmailWarning('');
      const searchParams = new URLSearchParams({
        phone,
        mode: 'email-phone',
      });

      if (data?.emailHint) {
        searchParams.set('hint', data.emailHint);
      }

      navigate(`/otp?${searchParams.toString()}`);
    },
  });


  const dialPlaceholder = useMemo(() => selectedCountry.dial, [selectedCountry]);

  return (
    <div className="phone-login">
      <form
        className="phone-card"
        data-testid="login-form"
        onSubmit={handleSubmit((values) => {
          const phoneWithDial = buildPhonePayload(values.phone, dialPlaceholder);
          if (!phoneWithDial) return;
          otpRequestMutation.mutate(phoneWithDial);
        })}
      >
        <h1>Enter Your Phone Number</h1>
        <p className="phone-sub">We will email a verification code to the address linked with this account.</p>

        <div className="country-select">
          <select
            value={selectedCountry.code}
            data-testid="login-country-select"
            onChange={(event) => {
              const next = COUNTRY_LIST.find((c) => c.code === event.target.value);
              if (next) setSelectedCountry(next);
            }}
            aria-label="Choose country"
          >
            {COUNTRY_LIST.map((country) => (
              <option key={country.code} value={country.code}>
                {country.flag} {country.name}
              </option>
            ))}
          </select>
          <span className="country-flag" aria-hidden="true">{selectedCountry.flag}</span>
          <span className="country-name">{selectedCountry.name}</span>
        </div>

        <label className="phone-row">
          <span className="dial-code">{dialPlaceholder}</span>
          <input
            type="tel"
            className="phone-input"
            placeholder="your phone number"
            data-testid="login-phone-input"
            {...register('phone')}
          />
        </label>
        {errors.phone ? <span className="error-text">{errors.phone.message}</span> : null}

        <button type="submit" data-testid="login-submit" disabled={otpRequestMutation.isPending}>
          {otpRequestMutation.isPending ? 'Sending…' : 'Next'}
        </button>

        {emailWarning ? (
          <p className="error-text" data-testid="login-warning">{emailWarning}</p>
        ) : null}

        {otpRequestMutation.error ? (
          <p className="error-text" data-testid="login-error">
            {otpRequestMutation.error.response?.data?.error?.message || 'Login failed'}
          </p>
        ) : null}


        <p className="otp-help">Use the same phone number you registered with.</p>
        <p className="auth-footnote">
          Need an account? <Link to="/register">Create one</Link>
        </p>
      </form>
    </div>
  );
}
