// analytics.js — PostHog initialisation
// The API key is injected by the server into the <script> tag's data-posthog-key
// attribute at request time (from the POSTHOG_KEY environment variable).
// All other scripts access PostHog through window.posthog as usual.

(function () {
  // Read the key that the server stamped onto this script tag.
  var scriptTag = document.currentScript;
  var apiKey = scriptTag && scriptTag.getAttribute('data-posthog-key');

  if (!apiKey) {
    console.warn('[analytics] PostHog key not configured — analytics disabled.');
    return;
  }

  // Standard PostHog snippet (loads array.js from CDN asynchronously).
  !function(t,e){var o,n,p,r;e.__SV||(window.posthog=e,e._i=[],e.init=function(i,s,a){function g(t,e){var o=e.split(".");2==o.length&&(t=t[o[0]],e=o[1]),t[e]=function(){t.push([e].concat(Array.prototype.slice.call(arguments,0)))}}(p=t.createElement("script")).type="text/javascript",p.async=!0,p.src=s.api_host.replace(".i.posthog.com","-assets.i.posthog.com")+"/static/array.js",(r=t.getElementsByTagName("script")[0]).parentNode.insertBefore(p,r);var u=e;for(void 0!==a?u=e[a]=[]:a="posthog",u.people=u.people||[],u.toString=function(t){var e="posthog";return"posthog"!==a&&(e+="."+a),t||(e+=" (stub)"),e},u.people.toString=function(){return u.toString(1)+".people (stub)"},o="init capture register register_once register_for_session unregister opt_out_capturing has_opted_out_capturing opt_in_capturing reset isFeatureEnabled getFeatureFlag getFeatureFlagPayload reloadFeatureFlags group identify setPersonProperties setPersonPropertiesForFlags resetPersonPropertiesForFlags setGroupPropertiesForFlags resetGroupPropertiesForFlags resetGroups onFeatureFlags addFeatureFlagsHandler onSessionId getSurveys getActiveMatchingSurveys renderSurvey canRenderSurvey getNextSurveyStep".split(" "),n=0;n<o.length;n++)g(u,o[n]);e._i.push([i,s,a])},e.__SV=1)}(document,window.posthog||[]);

  posthog.init(apiKey, {
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
}());
