export const normalizePhone = (input) => {
  if (input === null || input === undefined) return '';

  let raw = String(input).trim();
  if (!raw) return '';

  raw = raw.replace(/[\s().-]/g, '');
  if (raw.startsWith('00')) {
    raw = `+${raw.slice(2)}`;
  }

  if (raw.startsWith('+')) {
    raw = `+${raw.slice(1).replace(/\D/g, '')}`;
  } else {
    raw = `+${raw.replace(/\D/g, '')}`;
  }

  if (!/^\+[1-9]\d{7,14}$/.test(raw)) {
    return '';
  }

  return raw;
};

export const getPhoneLookupCandidates = (input) => {
  const normalized = normalizePhone(input);
  if (!normalized) return [];

  const digits = normalized.replace(/\D/g, '');
  const candidates = [normalized];

  // Legacy compatibility: older registrations stored local numbers as `+<local digits>`
  // without a country code. Keep exact match first, then try likely stripped variants.
  for (let stripLength = 1; stripLength <= 3; stripLength += 1) {
    const candidateDigits = digits.slice(stripLength);
    if (candidateDigits.length < 8) continue;
    candidates.push(`+${candidateDigits}`);
  }

  if (digits.length > 10) {
    candidates.push(`+${digits.slice(-10)}`);
  }

  return [...new Set(candidates)];
};

export const formatPhoneForDisplay = (phone) => {
  const normalized = normalizePhone(phone);
  return normalized || '';
};
