import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link, useNavigate } from 'react-router-dom';
import { registerApi } from '../services/authApi.js';
import { useAuthStore } from '../store/authStore.js';
import { registerSchema } from '../utils/formSchemas.js';

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

export default function RegisterPage() {
  const navigate = useNavigate();
  const setAuth = useAuthStore((state) => state.setAuth);
  const [selectedCountry, setSelectedCountry] = useState(COUNTRY_LIST[1]);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      displayName: '',
      phone: '',
      username: '',
      email: '',
      password: '',
    },
  });

  const registerMutation = useMutation({
    mutationFn: registerApi,
    onSuccess: (data) => {
      setAuth(data);
      navigate('/chat', { replace: true });
    },
  });

  const onSubmit = (values) =>
    registerMutation.mutate({
      ...values,
      phone: buildPhonePayload(values.phone, selectedCountry.dial),
    });

  return (
    <div className="phone-login">
      <form className="phone-card" onSubmit={handleSubmit(onSubmit)}>
        <h1>Create your account</h1>
        <p className="phone-sub">We’ll verify your phone to get started.</p>

        <div className="country-select">
          <select
            value={selectedCountry.code}
            onChange={(event) => {
              const next = COUNTRY_LIST.find((country) => country.code === event.target.value);
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
          <span className="dial-code">👤</span>
          <input
            type="text"
            className="phone-input"
            placeholder="Display name"
            {...register('displayName')}
            autoComplete="name"
          />
        </label>
        {errors.displayName ? <span className="error-text">{errors.displayName.message}</span> : null}

        <label className="phone-row">
          <span className="dial-code">{selectedCountry.dial}</span>
          <input
            type="tel"
            className="phone-input"
            placeholder="Phone number"
            {...register('phone')}
            autoComplete="tel"
          />
        </label>
        {errors.phone ? <span className="error-text">{errors.phone.message}</span> : null}

        <label className="phone-row">
          <span className="dial-code">@</span>
          <input type="text" className="phone-input" placeholder="Username" {...register('username')} />
        </label>
        {errors.username ? <span className="error-text">{errors.username.message}</span> : null}

        <label className="phone-row">
          <span className="dial-code">✉</span>
          <input type="email" className="phone-input" placeholder="Email" {...register('email')} />
        </label>
        {errors.email ? <span className="error-text">{errors.email.message}</span> : null}

        <label className="phone-row">
          <span className="dial-code">🔒</span>
          <input
            type="password"
            className="phone-input"
            placeholder="Password"
            {...register('password')}
            autoComplete="new-password"
          />
        </label>
        {errors.password ? <span className="error-text">{errors.password.message}</span> : null}

        <button type="submit" disabled={registerMutation.isPending}>
          {registerMutation.isPending ? 'Creating…' : 'Create account'}
        </button>

        {registerMutation.error ? (
          <p className="error-text">
            {registerMutation.error.response?.data?.error?.message || 'Registration failed'}
          </p>
        ) : null}

        <p className="auth-footnote">
          Already have an account? <Link to="/login">Sign in</Link>
        </p>
      </form>
    </div>
  );
}
