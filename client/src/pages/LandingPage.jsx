import { useNavigate } from 'react-router-dom';

export default function LandingPage() {
  const navigate = useNavigate();

  return (
    <div className="landing-wrap">
      <div className="landing-card">
        <div className="landing-hero" aria-hidden="true" />
        <h1>Welcome to WhatsApp Clone</h1>
        <p>Fast, simple, and secure messaging — now on the web.</p>
        <button type="button" className="landing-cta" onClick={() => navigate('/login')}>Agree &amp; Continue</button>
      </div>
    </div>
  );
}
