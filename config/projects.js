module.exports = Object.freeze({
  "pjmcveyroutalk/routalk-pilot": Object.freeze({
    role: "control",
  }),
  "pjmcveyroutalk/sport-my-fitness": Object.freeze({
    role: "target",
  }),
  "pjmcveyroutalk/Personal-website-": Object.freeze({
    role: "target",
    production_verifier: Object.freeze({
      url: "https://pj-routalk.vercel.app/api/pilot-verify-production",
      auth: "vercel_oidc",
    }),
  }),
  "pjmcveyroutalk/flock-tuah": Object.freeze({
    role: "target",
    production_verifier: Object.freeze({
      url: "https://www.flocktuah.com/api/pilot-verify-production",
      auth: "vercel_oidc",
    }),
  }),
  "pjmcveyroutalk/wisconsin-vehicle-recovery": Object.freeze({
    role: "target",
  }),
});
