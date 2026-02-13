// PostHog initialization for client-side analytics
// This module initializes PostHog and exposes it globally for use in other scripts

import posthog from 'posthog-js';

posthog.init('phc_REDACTED', {
  api_host: 'https://us.i.posthog.com',
  person_profiles: 'always',
  autocapture: false,
  capture_pageview: true,
  capture_pageleave: true,
  session_recording: {
    maskAllInputs: true,
    maskAllText: true,
  },
});

// Expose globally for use in non-module scripts
window.posthog = posthog;

export default posthog;
